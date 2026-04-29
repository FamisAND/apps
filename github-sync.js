/* ════════════════════════════════════════════════════════════════════
   GITHUB SYNC — Sincronización de localStorage con un repo de GitHub
   ════════════════════════════════════════════════════════════════════
   Cómo funciona:
   - El index.html hace LOGIN (PIN + token) y descarga data.json a localStorage
   - Cada dashboard (options, patrimonio...) carga este script y llama
     GitHubSync.attach({ section, keys }) para activar el auto-push
   - Cuando el código del dashboard llama localStorage.setItem(...) en una
     clave sincronizada, este módulo intercepta el cambio y sube data.json
     a GitHub tras un pequeño delay (para agrupar varios cambios seguidos)

   Las funciones se exponen en window.GitHubSync.
   ════════════════════════════════════════════════════════════════════ */

(function(){
'use strict';

// ── Claves internas en localStorage (no se sincronizan) ──
const TOKEN_KEY  = '__gh_sync_token';
const REPO_KEY   = '__gh_sync_repo';     // formato "owner/repo"
const BRANCH_KEY = '__gh_sync_branch';
const CACHE_SHA  = '__gh_sync_sha';
const PIN_HASH   = '__gh_sync_pin_hash';

const FILE_NAME    = 'data.json';
const PUSH_DELAY   = 2500;      // ms tras último cambio antes de subir
const CONFLICT_RETRIES = 3;     // reintentos si el SHA está desfasado

// Guardar funciones nativas ANTES de cualquier intercepción
const _origSetItem    = Storage.prototype.setItem;
const _origRemoveItem = Storage.prototype.removeItem;
const _origGetItem    = Storage.prototype.getItem;

// ────────────────────────────────────────────────────────────────────
// HELPERS BÁSICOS
// ────────────────────────────────────────────────────────────────────

function getToken(){ return _origGetItem.call(localStorage, TOKEN_KEY); }
function getRepo(){ return _origGetItem.call(localStorage, REPO_KEY); }
function getBranch(){ return _origGetItem.call(localStorage, BRANCH_KEY) || 'main'; }
function getCachedSha(){ return _origGetItem.call(localStorage, CACHE_SHA); }
function setCachedSha(s){ _origSetItem.call(localStorage, CACHE_SHA, s||''); }

// btoa/atob unicode-safe
function b64encode(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(str){
  return decodeURIComponent(escape(atob(str.replace(/\s/g,''))));
}

// Hash sencillo del PIN (NO criptográfico — solo para no guardar el PIN
// en claro y porque es protección "casera": el repo privado ya es la
// barrera real)
async function hashPin(pin){
  const enc = new TextEncoder().encode('dashboards_pin_'+pin);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ────────────────────────────────────────────────────────────────────
// API DE GITHUB
// ────────────────────────────────────────────────────────────────────

async function ghFetch(path, opts){
  const token = getToken();
  if(!token) throw new Error('No hay token de GitHub configurado');
  const repo = getRepo();
  if(!repo) throw new Error('No hay repositorio configurado');
  const url = `https://api.github.com/repos/${repo}/${path}`;
  const headers = Object.assign({
    'Authorization': 'token '+token,
    'Accept':        'application/vnd.github.v3+json',
  }, (opts && opts.headers) || {});
  const res = await fetch(url, Object.assign({}, opts, { headers }));
  return res;
}

// Descarga data.json. Devuelve { content, sha } o { content:null, sha:null }
// si el archivo aún no existe (primera vez).
async function pullRaw(){
  const branch = getBranch();
  const res = await ghFetch(`contents/${FILE_NAME}?ref=${encodeURIComponent(branch)}`);
  if(res.status === 404){
    return { content: null, sha: null };
  }
  if(res.status === 401 || res.status === 403){
    const e = new Error('Token inválido o sin permisos');
    e.status = res.status;
    throw e;
  }
  if(!res.ok){
    const e = new Error('Error de GitHub: '+res.status);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  let content = null;
  if(data.content){
    try {
      content = JSON.parse(b64decode(data.content));
    } catch(err){
      const e = new Error('data.json en remoto está corrupto');
      e.cause = err;
      throw e;
    }
  }
  return { content, sha: data.sha };
}

// Sube data.json. Si hay conflicto de SHA, reintenta unas veces.
async function pushRaw(payload, attempt){
  attempt = attempt || 0;
  const branch = getBranch();
  const sha = getCachedSha();
  const body = {
    message: 'sync: '+(payload.lastUpdate || new Date().toISOString()),
    content: b64encode(JSON.stringify(payload, null, 2)),
    branch:  branch,
  };
  if(sha) body.sha = sha;

  const res = await ghFetch(`contents/${FILE_NAME}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if(res.status === 409 || (res.status === 422 && attempt < CONFLICT_RETRIES)){
    // SHA desfasado: alguien (otra pestaña, otro dispositivo) actualizó.
    // Bajamos lo último, mergeamos nuestra sección, y reintentamos.
    const remote = await pullRaw();
    setCachedSha(remote.sha || '');
    const merged = mergeSections(remote.content || {}, payload);
    return pushRaw(merged, attempt + 1);
  }

  if(!res.ok){
    const text = await res.text();
    const e = new Error('Error subiendo a GitHub: '+res.status+' '+text);
    e.status = res.status;
    throw e;
  }

  const data = await res.json();
  if(data && data.content && data.content.sha){
    setCachedSha(data.content.sha);
  }
  return data;
}

// Conserva las secciones del remoto excepto las que estamos actualizando
function mergeSections(remote, local){
  const out = Object.assign({}, remote);
  Object.keys(local).forEach(k => {
    out[k] = local[k];
  });
  out.version    = 1;
  out.lastUpdate = new Date().toISOString();
  return out;
}

// ────────────────────────────────────────────────────────────────────
// LOGIN / SETUP (lo usa index.html)
// ────────────────────────────────────────────────────────────────────

async function setupCredentials(opts){
  // opts: { repo, branch, token, pin }
  if(opts.repo)   _origSetItem.call(localStorage, REPO_KEY, opts.repo);
  if(opts.branch) _origSetItem.call(localStorage, BRANCH_KEY, opts.branch);
  if(opts.token)  _origSetItem.call(localStorage, TOKEN_KEY, opts.token);
  if(opts.pin){
    const h = await hashPin(opts.pin);
    _origSetItem.call(localStorage, PIN_HASH, h);
  }
}

async function checkPin(pin){
  const stored = _origGetItem.call(localStorage, PIN_HASH);
  if(!stored) return true; // no hay pin configurado todavía
  const h = await hashPin(pin);
  return h === stored;
}

function hasPin(){
  return !!_origGetItem.call(localStorage, PIN_HASH);
}

function isLoggedIn(){
  return !!getToken() && !!getRepo();
}

function clearCredentials(){
  _origRemoveItem.call(localStorage, TOKEN_KEY);
  _origRemoveItem.call(localStorage, REPO_KEY);
  _origRemoveItem.call(localStorage, BRANCH_KEY);
  _origRemoveItem.call(localStorage, CACHE_SHA);
  _origRemoveItem.call(localStorage, PIN_HASH);
}

// Descarga data.json y vuelca cada sección/clave en localStorage.
// Lo usa index.html después del login para "hidratar" el navegador.
async function pullAndApplyAll(){
  const remote = await pullRaw();
  setCachedSha(remote.sha || '');
  if(!remote.content) return { fresh: true };

  // El JSON es { version, lastUpdate, options:{ot_hist:..., ot_cfg:...},
  //              patrimonio:{pat_v5:...}, ... }
  // Cada sección es un objeto donde las claves son las claves de
  // localStorage. Aplicamos una a una usando _origSetItem (sin disparar
  // ningún interceptor que pudiera estar instalado).
  Object.keys(remote.content).forEach(section => {
    if(section === 'version' || section === 'lastUpdate') return;
    const sec = remote.content[section];
    if(!sec || typeof sec !== 'object') return;
    Object.keys(sec).forEach(key => {
      const val = sec[key];
      const str = (typeof val === 'string') ? val : JSON.stringify(val);
      _origSetItem.call(localStorage, key, str);
    });
  });

  return { fresh: false, lastUpdate: remote.content.lastUpdate };
}

// ────────────────────────────────────────────────────────────────────
// INTERCEPTOR (lo usan options.html y patrimonio.html)
// ────────────────────────────────────────────────────────────────────

let _section = null;
let _watchedKeys = [];
let _pushTimer = null;
let _statusEl = null;
let _attached = false;
let _pushInFlight = false;
let _pendingPush = false;

function attach(opts){
  // opts: { section: 'options', keys: ['ot_hist', 'ot_cfg', ...] }
  if(_attached) return;
  if(!isLoggedIn()){
    // Si entras directo a un dashboard sin haber pasado por el index,
    // te mando al index para que hagas login.
    window.location.href = 'index.html';
    return;
  }
  _section     = opts.section;
  _watchedKeys = opts.keys || [];
  _attached    = true;

  Storage.prototype.setItem = function(key, value){
    _origSetItem.call(this, key, value);
    if(this === window.localStorage && _watchedKeys.indexOf(key) >= 0){
      schedulePush();
    }
  };
  Storage.prototype.removeItem = function(key){
    _origRemoveItem.call(this, key);
    if(this === window.localStorage && _watchedKeys.indexOf(key) >= 0){
      schedulePush();
    }
  };

  // Aviso visual al cerrar la pestaña si hay cambios sin subir
  window.addEventListener('beforeunload', function(e){
    if(_pushTimer || _pushInFlight){
      e.preventDefault();
      e.returnValue = 'Hay cambios sin guardar en GitHub. ¿Salir igualmente?';
      return e.returnValue;
    }
  });
}

function setStatusElement(el){ _statusEl = el; }

function showStatus(msg, kind){
  if(_statusEl){
    _statusEl.textContent = msg;
    _statusEl.style.color = kind === 'error' ? '#f87171'
                          : kind === 'ok'    ? '#4ade80'
                          : kind === 'work'  ? '#fbbf24'
                                             : '';
  }
  if(window.console){
    console.log('[GitHubSync] '+msg);
  }
}

function schedulePush(){
  clearTimeout(_pushTimer);
  showStatus('● cambios pendientes', 'work');
  _pushTimer = setTimeout(doPush, PUSH_DELAY);
}

async function doPush(){
  _pushTimer = null;
  if(_pushInFlight){
    _pendingPush = true;
    return;
  }
  _pushInFlight = true;
  showStatus('subiendo a GitHub…', 'work');

  try {
    // Construir payload solo con NUESTRA sección
    const sectionData = {};
    _watchedKeys.forEach(k => {
      const v = _origGetItem.call(localStorage, k);
      if(v === null || v === undefined) return;
      try { sectionData[k] = JSON.parse(v); }
      catch(e){ sectionData[k] = v; }
    });

    // Bajar lo último para no pisar otras secciones
    const remote = await pullRaw();
    setCachedSha(remote.sha || '');
    const merged = mergeSections(remote.content || {}, { [_section]: sectionData });

    await pushRaw(merged);

    showStatus('✓ guardado en GitHub '+new Date().toLocaleTimeString('es-ES'), 'ok');
  } catch(err){
    console.error('[GitHubSync] error:', err);
    if(err.status === 401 || err.status === 403){
      showStatus('⚠ token inválido — vuelve al inicio', 'error');
      // No borro credenciales automáticamente, dejo que el usuario decida
    } else {
      showStatus('⚠ error al guardar — reintentaré: '+(err.message||''), 'error');
      // Reintento en 10s
      setTimeout(schedulePush, 10000);
    }
  } finally {
    _pushInFlight = false;
    if(_pendingPush){
      _pendingPush = false;
      schedulePush();
    }
  }
}

// Forzar push manual (útil para botones tipo "guardar ahora")
function flush(){
  clearTimeout(_pushTimer);
  return doPush();
}

// ────────────────────────────────────────────────────────────────────
// API PÚBLICA
// ────────────────────────────────────────────────────────────────────

window.GitHubSync = {
  // login flow (index.html)
  setupCredentials,
  checkPin,
  hasPin,
  isLoggedIn,
  clearCredentials,
  pullAndApplyAll,

  // dashboards (options.html, patrimonio.html)
  attach,
  setStatusElement,
  flush,

  // utilidades
  getRepo,
  getBranch,
  hasToken: () => !!getToken(),
};

})();
