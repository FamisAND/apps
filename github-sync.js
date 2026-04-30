/* ════════════════════════════════════════════════════════════════════
   GITHUB SYNC v2 — Sincronización con un repo de GitHub
   ════════════════════════════════════════════════════════════════════
   - El index.html hace LOGIN (solo token) y descarga data.json a localStorage
   - Cada dashboard llama GitHubSync.attach({ section, keys }) para
     activar el auto-push de cambios a GitHub
   - Los PINs por dashboard los gestiona dashboard-auth.js, que se apoya
     en este módulo para leer/escribir la sección __security de data.json
   ════════════════════════════════════════════════════════════════════ */

(function(){
'use strict';

// ── Claves internas en localStorage (no se sincronizan) ──
const TOKEN_KEY  = '__gh_sync_token';
const REPO_KEY   = '__gh_sync_repo';
const BRANCH_KEY = '__gh_sync_branch';
const CACHE_SHA  = '__gh_sync_sha';

const FILE_NAME    = 'data.json';
const PUSH_DELAY   = 2500;
const CONFLICT_RETRIES = 3;

// Funciones nativas, antes de cualquier intercepción
const _origSetItem    = Storage.prototype.setItem;
const _origRemoveItem = Storage.prototype.removeItem;
const _origGetItem    = Storage.prototype.getItem;

// ────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────

function getToken(){ return _origGetItem.call(localStorage, TOKEN_KEY); }
function getRepo(){ return _origGetItem.call(localStorage, REPO_KEY); }
function getBranch(){ return _origGetItem.call(localStorage, BRANCH_KEY) || 'main'; }
function getCachedSha(){ return _origGetItem.call(localStorage, CACHE_SHA); }
function setCachedSha(s){ _origSetItem.call(localStorage, CACHE_SHA, s||''); }

function b64encode(str){ return btoa(unescape(encodeURIComponent(str))); }
function b64decode(str){
  // Limpiar whitespace (la API de GitHub a veces inserta saltos de línea)
  const clean = str.replace(/\s+/g, '');
  // Decodificar base64 → bytes → UTF-8
  const binary = atob(clean);
  // Convertir a UTF-8 correctamente (importante para caracteres no-ASCII)
  try {
    return decodeURIComponent(escape(binary));
  } catch(e){
    // Fallback: si escape() falla con ciertos chars, devolver binario tal cual
    return binary;
  }
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
  return fetch(url, Object.assign({}, opts, { headers }));
}

async function pullRaw(){
  const branch = getBranch();
  const res = await ghFetch(`contents/${FILE_NAME}?ref=${encodeURIComponent(branch)}&_=${Date.now()}`,
                            { cache: 'no-store' });
  if(res.status === 404) return { content: null, sha: null };
  if(res.status === 401 || res.status === 403){
    const e = new Error('Token inválido o sin permisos');
    e.status = res.status; throw e;
  }
  if(!res.ok){
    const e = new Error('Error de GitHub: '+res.status);
    e.status = res.status; throw e;
  }
  const data = await res.json();
  let content = null;

  // Helper para parsear contenido base64
  const tryParse = (b64, label) => {
    if(!b64) return null;
    try {
      const decoded = b64decode(b64);
      return JSON.parse(decoded);
    } catch(err){
      console.warn('[GitHubSync] parseando '+label+':', err.message);
      return null;
    }
  };

  // Estrategia 1: el endpoint contents/ devuelve el content directamente
  // (solo para archivos <1 MB)
  if(data.content){
    content = tryParse(data.content, 'contents endpoint');
  }

  // Estrategia 2: si el archivo es grande (>1 MB), pedir el blob por su sha
  if(!content && data.sha){
    try {
      const blobRes = await ghFetch(`git/blobs/${data.sha}?_=${Date.now()}`,
                                    { cache: 'no-store' });
      if(blobRes.ok){
        const blobData = await blobRes.json();
        console.log('[GitHubSync] blob recibido, tamaño:', blobData.size, 'encoding:', blobData.encoding);
        if(blobData.encoding === 'base64' && blobData.content){
          content = tryParse(blobData.content, 'blob endpoint');
        }
      } else {
        console.warn('[GitHubSync] blob endpoint falló:', blobRes.status);
      }
    } catch(err){
      console.warn('[GitHubSync] error blob:', err.message);
    }
  }

  // Estrategia 3 (fallback): descargar directamente desde download_url
  // Bypassea la API de GitHub y va al raw del archivo
  if(!content && data.download_url){
    try {
      console.log('[GitHubSync] usando fallback download_url');
      const dlRes = await fetch(data.download_url + '?_='+Date.now(), {
        cache: 'no-store',
        headers: { 'Authorization': 'token '+getToken() }
      });
      if(dlRes.ok){
        const text = await dlRes.text();
        try { content = JSON.parse(text); }
        catch(err){ console.warn('[GitHubSync] download_url parse:', err.message); }
      } else {
        console.warn('[GitHubSync] download_url falló:', dlRes.status);
      }
    } catch(err){
      console.warn('[GitHubSync] error download_url:', err.message);
    }
  }

  // Si NO conseguimos contenido pero el archivo existe, esto es grave:
  // mejor lanzar error para que el doPush lo detecte y no sobrescriba.
  if(!content && data.sha){
    const e = new Error('No pude leer data.json (todas las estrategias fallaron)');
    e.status = 0;
    throw e;
  }

  return { content, sha: data.sha };
}

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

  if((res.status === 409 || res.status === 422) && attempt < CONFLICT_RETRIES){
    const remote = await pullRaw();
    setCachedSha(remote.sha || '');
    const merged = mergeSections(remote.content || {}, payload);
    return pushRaw(merged, attempt + 1);
  }

  if(!res.ok){
    const text = await res.text();
    const e = new Error('Error subiendo a GitHub: '+res.status+' '+text);
    e.status = res.status; throw e;
  }

  const data = await res.json();
  if(data && data.content && data.content.sha){
    setCachedSha(data.content.sha);
  }
  return data;
}

function mergeSections(remote, local){
  const out = Object.assign({}, remote);
  Object.keys(local).forEach(k => { out[k] = local[k]; });
  out.version    = 1;
  out.lastUpdate = new Date().toISOString();
  return out;
}

// ────────────────────────────────────────────────────────────────────
// CREDENCIALES
// ────────────────────────────────────────────────────────────────────

function setupCredentials(opts){
  if(opts.repo)   _origSetItem.call(localStorage, REPO_KEY, opts.repo);
  if(opts.branch) _origSetItem.call(localStorage, BRANCH_KEY, opts.branch);
  if(opts.token)  _origSetItem.call(localStorage, TOKEN_KEY, opts.token);
}

function isLoggedIn(){ return !!getToken() && !!getRepo(); }

function clearCredentials(){
  _origRemoveItem.call(localStorage, TOKEN_KEY);
  _origRemoveItem.call(localStorage, REPO_KEY);
  _origRemoveItem.call(localStorage, BRANCH_KEY);
  _origRemoveItem.call(localStorage, CACHE_SHA);
}

// Descarga data.json y vuelca cada sección/clave en localStorage.
async function pullAndApplyAll(){
  const remote = await pullRaw();
  setCachedSha(remote.sha || '');
  if(!remote.content) return { fresh: true };

  Object.keys(remote.content).forEach(section => {
    if(section === 'version' || section === 'lastUpdate' || section === '__security') return;
    const sec = remote.content[section];
    if(!sec || typeof sec !== 'object') return;
    Object.keys(sec).forEach(key => {
      const val = sec[key];
      const str = (typeof val === 'string') ? val : JSON.stringify(val);
      _origSetItem.call(localStorage, key, str);
    });
  });

  return { fresh: false, lastUpdate: remote.content.lastUpdate, security: remote.content.__security || null };
}

// ────────────────────────────────────────────────────────────────────
// API SECCIÓN __security (la usa dashboard-auth.js)
// ────────────────────────────────────────────────────────────────────

let _securityCache = null;

async function fetchSecuritySection(){
  const remote = await pullRaw();
  setCachedSha(remote.sha || '');
  _securityCache = (remote.content && remote.content.__security) || {};
  return _securityCache;
}

async function updateSecuritySection(updater){
  const remote = await pullRaw();
  setCachedSha(remote.sha || '');
  // Protección: si hay sha pero no content, no podemos leer el archivo grande
  if(remote.sha && !remote.content){
    throw new Error('No pude leer data.json remoto. Recarga la app.');
  }
  const current = (remote.content && remote.content.__security) || {};
  const updated = updater(Object.assign({}, current));
  const payload = mergeSections(remote.content || {}, { __security: updated });
  await pushRaw(payload);
  _securityCache = updated;
  return updated;
}

function getCachedSecurity(){ return _securityCache; }

// ────────────────────────────────────────────────────────────────────
// INTERCEPTOR PARA AUTO-PUSH
// ────────────────────────────────────────────────────────────────────

let _section = null;
let _watchedKeys = [];
let _pushTimer = null;
let _statusEl = null;
let _attached = false;
let _pushInFlight = false;
let _pendingPush = false;
let _enabled = false;  // se activa cuando el usuario pasa el gate de PIN

function attach(opts){
  if(_attached) return;
  if(!isLoggedIn()){
    window.location.href = 'index.html';
    return;
  }
  _section     = opts.section;
  _watchedKeys = opts.keys || [];
  _attached    = true;

  Storage.prototype.setItem = function(key, value){
    _origSetItem.call(this, key, value);
    if(_enabled && this === window.localStorage && _watchedKeys.indexOf(key) >= 0){
      schedulePush();
    }
  };
  Storage.prototype.removeItem = function(key){
    _origRemoveItem.call(this, key);
    if(_enabled && this === window.localStorage && _watchedKeys.indexOf(key) >= 0){
      schedulePush();
    }
  };

  window.addEventListener('beforeunload', function(e){
    if(_pushTimer || _pushInFlight){
      e.preventDefault();
      e.returnValue = 'Hay cambios sin guardar en GitHub. ¿Salir?';
      return e.returnValue;
    }
  });
}

// Lo llama dashboard-auth.js tras pasar el gate. Hasta ese momento,
// los cambios a localStorage NO se suben (porque podrían ser cambios
// del propio bootstrap antes de que el usuario haya entrado).
function enableAutoPush(){ _enabled = true; }

function setStatusElement(el){ _statusEl = el; }

function showStatus(msg, kind){
  if(_statusEl){
    _statusEl.textContent = msg;
    _statusEl.style.color = kind === 'error' ? '#f87171'
                          : kind === 'ok'    ? '#4ade80'
                          : kind === 'work'  ? '#fbbf24' : '';
  }
  if(window.console) console.log('[GitHubSync] '+msg);
}

function schedulePush(){
  clearTimeout(_pushTimer);
  showStatus('● cambios pendientes', 'work');
  _pushTimer = setTimeout(doPush, PUSH_DELAY);
}

async function doPush(){
  _pushTimer = null;
  if(_pushInFlight){ _pendingPush = true; return; }
  _pushInFlight = true;
  showStatus('subiendo a GitHub…', 'work');

  try {
    const sectionData = {};
    _watchedKeys.forEach(k => {
      const v = _origGetItem.call(localStorage, k);
      if(v === null || v === undefined) return;
      try { sectionData[k] = JSON.parse(v); }
      catch(e){ sectionData[k] = v; }
    });

    const remote = await pullRaw();
    setCachedSha(remote.sha || '');

    // ── Protección anti-pérdida de datos ─────────────────────────
    // Si el remoto tiene contenido pero NO pudimos leerlo (content null),
    // NO subimos. Mejor un error temporal que machacar todo el data.json.
    if(remote.sha && !remote.content){
      throw new Error('No pude leer data.json remoto. Cancelo subida para evitar pérdida de datos. Recarga la app.');
    }

    const merged = mergeSections(remote.content || {}, { [_section]: sectionData });

    // Última red de seguridad: si el remoto tenía __security y el merge
    // la perdió por algún motivo, abortamos.
    if(remote.content && remote.content.__security && !merged.__security){
      throw new Error('Sección de seguridad perdida en merge. Cancelo subida.');
    }

    await pushRaw(merged);

    showStatus('✓ guardado '+new Date().toLocaleTimeString('es-ES'), 'ok');
  } catch(err){
    console.error('[GitHubSync] error:', err);
    if(err.status === 401 || err.status === 403){
      showStatus('⚠ token inválido — vuelve al inicio', 'error');
    } else {
      showStatus('⚠ error — reintentaré: '+(err.message||''), 'error');
      setTimeout(schedulePush, 10000);
    }
  } finally {
    _pushInFlight = false;
    if(_pendingPush){ _pendingPush = false; schedulePush(); }
  }
}

function flush(){ clearTimeout(_pushTimer); return doPush(); }

// ────────────────────────────────────────────────────────────────────
// API PÚBLICA
// ────────────────────────────────────────────────────────────────────

window.GitHubSync = {
  setupCredentials, isLoggedIn, clearCredentials, pullAndApplyAll,
  attach, enableAutoPush, setStatusElement, flush,
  fetchSecuritySection, updateSecuritySection, getCachedSecurity,
  getRepo, getBranch,
  hasToken: () => !!getToken(),
};

})();
