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

function b64encode(str){
  // Codificar UTF-8 → bytes → base64 con TextEncoder (no rompe con emojis,
  // CJK ni surrogate pairs — `unescape` está deprecado y los corrompe).
  try {
    const bytes = new TextEncoder().encode(str);
    // btoa requiere binary string; chunk para no romper el call stack con
    // strings muy grandes.
    let bin = '';
    const CHUNK = 0x8000;
    for(let i = 0; i < bytes.length; i += CHUNK){
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i+CHUNK));
    }
    return btoa(bin);
  } catch(e){
    console.warn('[GitHubSync] b64encode TextEncoder falló, fallback:', e);
    return btoa(unescape(encodeURIComponent(str)));
  }
}

function b64decode(str){
  // Limpiar whitespace (la API de GitHub inserta saltos de línea cada 60 chars)
  const clean = str.replace(/\s+/g, '');
  // Decodificar base64 → string binario
  const binary = atob(clean);
  // Convertir bytes binarios → UTF-8 usando TextDecoder (mucho más robusto
  // que decodeURIComponent(escape()) para archivos grandes)
  try {
    const bytes = new Uint8Array(binary.length);
    for(let i = 0; i < binary.length; i++){
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch(e){
    console.error('[GitHubSync] b64decode TextDecoder falló:', e);
    // Fallback: método antiguo
    try { return decodeURIComponent(escape(binary)); }
    catch(e2){
      console.error('[GitHubSync] b64decode fallback falló:', e2);
      return binary;
    }
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
      console.error('[GitHubSync] '+label+' FALLÓ:', err.message);
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

// Push con retry de conflictos.
//
// `payload` es el contenido inicial (merge ya hecho contra el remote que
// vio el caller). En caso de 409/422 (sha desfasado porque otra pestaña
// pushó), re-pulleamos el remoto y:
//   - Si `rebuild` está presente, lo llamamos pasándole el remoto fresco
//     para que el caller pueda reconstruir el payload desde el ESTADO ACTUAL
//     de localStorage (no del snapshot inicial). Esto evita perder cambios
//     locales hechos entre el primer intento y el retry.
//   - Si no hay `rebuild` (callers legacy), simplemente hacemos merge del
//     payload original con el remoto fresco (comportamiento previo).
async function pushRaw(payload, rebuild, attempt){
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
    const nextPayload = rebuild
      ? rebuild(remote.content || {})
      : mergeSections(remote.content || {}, payload);
    return pushRaw(nextPayload, rebuild, attempt + 1);
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

// Seccions que NO s'han de bolcar a localStorage perquè:
//   · viuen al seu propi store (IndexedDB) — tob_menus_catalog és el cas
//     paradigmàtic: pot tenir centenars de receptes amb ingredients que
//     sumen MB i peten la quota de localStorage (~5 MB).
//   · o són metadades de config que es gestionen amb fetchSection/updateSection.
const NO_LOCAL_STORAGE_SECTIONS = new Set([
  'tob_menus_catalog',   // consulta (abans training_online): viu a IndexedDB amb tobKvPut
  '__fin',               // APIs financeres (es llegeixen via fetchSection)
  '__notif',             // config Telegram
  '__ia_config',         // config IA (clau API, model)
]);

// Neteja retroactiva: si versions antigues de pullAndApplyAll van bolcar
// continguts gegants a localStorage (recetas, ingredientes, menus...), els
// eliminem en arrencar perquè la app pugui carregar. Només toquem keys que
// són clarament restes del bolcat erroni (mida >100 KB).
function _cleanupLegacyOversize(){
  const CANDIDATES = ['recetas','ingredientes','menus','_v','_syncTs'];
  let limpiado = 0, bytes = 0;
  CANDIDATES.forEach(k => {
    try {
      const v = _origGetItem.call(localStorage, k);
      if(v && v.length > 100000){       // > 100 KB → casi seguro basura del bolcat
        _origRemoveItem.call(localStorage, k);
        limpiado++; bytes += v.length;
      } else if(v && (k === '_v' || k === '_syncTs')){
        // Aquests són del tob_menus_catalog — sempre fora del localStorage
        _origRemoveItem.call(localStorage, k);
        limpiado++;
      }
    } catch(e){ /* ignorar si no es pot */ }
  });
  if(limpiado > 0){
    console.warn('[GitHubSync] Netejat localStorage de restes del bolcat antic: '
      + limpiado + ' keys, ~' + Math.round(bytes/1024) + ' KB. Aquesta neteja és puntual.');
  }
}
_cleanupLegacyOversize();

// Descarga data.json y vuelca cada sección/clave en localStorage.
// Avisa via showStatus para que el badge (con glow CSS) refleje el estado real.
// Al acabar OK marca la sesión como sincronizada (sessionStorage), de modo que
// si el usuario navega entre dashboards de la misma pestaña no se vuelve a
// re-sincronizar innecesariamente.
async function pullAndApplyAll(){
  showStatus('⟳ sincronizando…', 'work');
  try {
    const remote = await pullRaw();
    setCachedSha(remote.sha || '');
    if(!remote.content){
      try { sessionStorage.setItem('__gh_synced_session', '1'); } catch(_e){}
      showStatus('✓ sin datos remotos', 'ok');
      return { fresh: true };
    }

    Object.keys(remote.content).forEach(section => {
      if(section === 'version' || section === 'lastUpdate') return;
      if(section.startsWith('__')) return;                      // privades / config
      if(NO_LOCAL_STORAGE_SECTIONS.has(section)) return;        // gestionades en altres stores
      const sec = remote.content[section];
      if(!sec || typeof sec !== 'object') return;
      Object.keys(sec).forEach(key => {
        const val = sec[key];
        const str = (typeof val === 'string') ? val : JSON.stringify(val);
        try {
          _origSetItem.call(localStorage, key, str);
        } catch(e){
          // Si una key concreta peta per quota, no aborti tot el bolcat — només
          // logueja i continua amb la resta. Així la app pot arrencar encara
          // que algun blob excepcional sigui gegantí.
          console.warn('[GitHubSync] No s\'ha pogut guardar "' + key + '" a localStorage ('
            + (str ? str.length : 0) + ' bytes): ' + e.message);
        }
      });
    });

    const syncedAt = new Date().toLocaleTimeString('es-ES');
    try {
      sessionStorage.setItem('__gh_synced_session', '1');
      sessionStorage.setItem('__gh_synced_at', syncedAt);
    } catch(_e){}
    showStatus('✓ sincronizado '+syncedAt, 'ok');
    return { fresh: false, lastUpdate: remote.content.lastUpdate, security: remote.content.__security || null };
  } catch(err){
    showStatus('⚠ error sync: '+(err.message||''), 'error');
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────
// API SECCIÓN __security (la usa dashboard-auth.js)
// ────────────────────────────────────────────────────────────────────

let _securityCache = null;

// Devuelve TODO el contenido del data.json (no solo __security).
// Se usa principalmente desde dashboard-auth.js para detectar inconsistencias.
async function fetchFullData(){
  const remote = await pullRaw();
  setCachedSha(remote.sha || '');
  const content = remote.content || {};
  _securityCache = content.__security || {};
  return content;
}

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

// Updater genérico para CUALQUIER sección de data.json (ej. __notif, __ia_config, etc).
// El updater recibe la sección actual (objeto) y debe devolver la nueva (objeto entero).
// En caso de conflicto (otra pestaña/dashboard pushó entremedias) se re-ejecuta el
// updater contra el remoto FRESCO, de modo que nunca se revierten secciones ajenas.
async function updateSection(sectionName, updater){
  if(!sectionName || typeof sectionName !== 'string') throw new Error('sectionName requerido');
  const remote = await pullRaw();
  setCachedSha(remote.sha || '');
  if(remote.sha && !remote.content){
    throw new Error('No pude leer data.json remoto. Recarga la app.');
  }
  let lastUpdated = null;
  const build = (remoteContent) => {
    const current = (remoteContent && remoteContent[sectionName]) || {};
    lastUpdated = updater(Object.assign({}, current));
    return mergeSections(remoteContent || {}, { [sectionName]: lastUpdated });
  };
  const payload = build(remote.content);
  await pushRaw(payload, build);
  return lastUpdated;
}

// Lectura de una sección arbitraria (ej. __notif).
async function fetchSection(sectionName){
  const remote = await pullRaw();
  setCachedSha(remote.sha || '');
  return (remote.content && remote.content[sectionName]) || null;
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

// Timer del modo "compacto": tras 3s en verde estable el badge se encoge a
// un punto pequeño para no estorbar. Hover lo expande, cualquier cambio de
// estado (work/error) lo expande también de inmediato.
let _compactTimer = null;
const COMPACT_DELAY = 3000;
function _canHover(){
  try { return window.matchMedia && window.matchMedia('(hover: hover)').matches; }
  catch(_e){ return true; }
}

function showStatus(msg, kind){
  if(_statusEl){
    _statusEl.textContent = msg;
    _statusEl.style.color = kind === 'error' ? '#f87171'
                          : kind === 'ok'    ? '#4ade80'
                          : kind === 'work'  ? '#fbbf24' : '';
    // data-kind permite que el CSS (design-system.css) aplique glow:
    //   ok → verde estable; work → amarillo pulsante; error/pending → rojo pulsante
    _statusEl.dataset.kind = kind || '';

    // Cualquier cambio de estado cancela el timer y expande.
    if(_compactTimer){ clearTimeout(_compactTimer); _compactTimer = null; }
    _statusEl.classList.remove('gh-compact');
    // Solo encoge si entra en "ok" Y el dispositivo soporta hover (PC/laptop).
    // En táctiles, sin hover no podrías reexpandir sin disparar el click de
    // resync, así que dejamos el badge a tamaño completo.
    if(kind === 'ok' && _canHover()){
      _compactTimer = setTimeout(() => {
        if(_statusEl && _statusEl.dataset.kind === 'ok'){
          _statusEl.classList.add('gh-compact');
        }
        _compactTimer = null;
      }, COMPACT_DELAY);
    }
  }
  if(window.console) console.log('[GitHubSync] '+msg);
}

// El badge global que cualquier dashboard puede registrar via setStatusElement.
// Como showStatus solo escribe en _statusEl si está fijado, podemos también
// dejar que pullAndApplyAll busque el badge por id sin requerir que el caller
// llame setStatusElement antes (útil para el bootstrap).
function _findBadge(){
  return document.getElementById('ghSyncBadge');
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
    // Helper: lee TODAS las keys observadas desde localStorage al momento de
    // llamarse. Se usa para construir el payload inicial Y para reconstruirlo
    // en cada retry de pushRaw (si el usuario sigue editando mientras el push
    // está en vuelo, los cambios nuevos se incluyen al reintentar).
    const readSectionData = () => {
      const out = {};
      _watchedKeys.forEach(k => {
        const v = _origGetItem.call(localStorage, k);
        if(v === null || v === undefined) return;
        try { out[k] = JSON.parse(v); }
        catch(e){ out[k] = v; }
      });
      return out;
    };
    const sectionData = readSectionData();

    const remote = await pullRaw();
    setCachedSha(remote.sha || '');

    // ── Protección 1: si el remoto tiene contenido pero NO pudimos leerlo,
    // NO subimos. Mejor un error temporal que machacar todo.
    if(remote.sha && !remote.content){
      throw new Error('No pude leer data.json remoto. Cancelo subida.');
    }

    const merged = mergeSections(remote.content || {}, { [_section]: sectionData });

    // ── Protección 2: si el remoto tenía __security y el merge la pierde, abortar.
    if(remote.content && remote.content.__security && !merged.__security){
      throw new Error('Sección de seguridad perdida en merge. Cancelo subida.');
    }

    // ── Protección 3: si el remoto tenía OTRAS secciones de dashboards
    // (training, options, patrimonio) y el merge las pierde, abortar.
    if(remote.content){
      const KNOWN_SECTIONS = ['training','options','patrimonio','facturas'];
      const lostSections = KNOWN_SECTIONS.filter(s =>
        remote.content[s] && !merged[s] && s !== _section
      );
      if(lostSections.length){
        throw new Error('Secciones perdidas en merge: '+lostSections.join(', ')+'. Cancelo subida.');
      }
    }

    // ── Protección 4: el payload no puede ser drásticamente más pequeño que el remoto.
    // Si el remoto pesaba >100KB y el nuevo pesa <50% de eso, algo está muy mal.
    // BYPASS de un solo uso: poner localStorage.setItem('__gh_sync_force_shrink','1')
    // permite UN push ignorando esta protección. Se limpia automáticamente tras usarse.
    if(remote.content){
      const remoteSize = JSON.stringify(remote.content).length;
      const newSize = JSON.stringify(merged).length;
      const bypass = _origGetItem.call(localStorage, '__gh_sync_force_shrink') === '1';
      if(remoteSize > 100000 && newSize < remoteSize * 0.5){
        if(bypass){
          // Consumir el flag (un solo uso) y permitir el push
          try { localStorage.removeItem('__gh_sync_force_shrink'); } catch(e){}
          console.warn('[GitHubSync] Bypass de protección de tamaño activado (un solo uso). Subiendo '+newSize+' bytes vs remoto '+remoteSize+'.');
        } else {
          throw new Error('El payload nuevo pesa <50% del remoto ('+newSize+' vs '+remoteSize+'). Cancelo por seguridad. Si el descenso es legítimo, ejecuta en consola: localStorage.setItem("__gh_sync_force_shrink","1") y vuelve a sincronizar.');
        }
      }
    }

    // ── Protección 5: backup local del remoto ANTES de subir.
    // Guardamos el contenido remoto en localStorage por si la subida lo corrompe.
    if(remote.content){
      try {
        const backupKey = '__gh_sync_lastgood';
        const backup = {
          content: remote.content,
          sha: remote.sha,
          timestamp: new Date().toISOString()
        };
        // Si el JSON es enorme, recortamos para que quepa en localStorage (~5MB límite)
        const backupStr = JSON.stringify(backup);
        if(backupStr.length < 4500000){
          _origSetItem.call(localStorage, backupKey, backupStr);
        }
      } catch(e){
        // Si falla el backup local (espacio, etc.) no abortamos: seguimos con la subida.
        console.warn('[GitHubSync] backup local falló:', e.message);
      }
    }

    // Pasamos un `rebuild` a pushRaw: si hay conflicto (otra pestaña pushó
    // mientras este push estaba en vuelo, o el usuario siguió editando),
    // re-leemos sectionData desde localStorage y re-mergeamos con el remoto
    // fresco. Sin esto, se perdían los cambios hechos entre la captura
    // inicial y el retry.
    const rebuild = (freshRemote) => mergeSections(freshRemote, { [_section]: readSectionData() });
    await pushRaw(merged, rebuild);

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
// BOOTSTRAP + RESYNC MANUAL (botón en cada dashboard)
// ────────────────────────────────────────────────────────────────────
//
// Objetivo: evitar que el usuario entre directo a un dashboard (bookmark,
// F5, link compartido) con localStorage VIEJO y que la primera edición
// machaque el remoto. Solución de dos partes:
//
//   1) bootstrapAutoSync(): si el usuario no ha sincronizado en esta
//      pestaña/sesión, descarga data.json fresco y recarga la página
//      para que el render arranque con datos actuales. Bloquea visual-
//      mente la app con un overlay durante la descarga.
//
//   2) manualResync(): botón clicable (el propio badge ghSyncBadge) que
//      fuerza una re-sincronización en cualquier momento.
//
// La sesión se marca con sessionStorage.__gh_synced_session = '1' al final
// de pullAndApplyAll(), de modo que navegar entre dashboards de la misma
// pestaña no vuelve a sincronizar.

function _ensureOverlay(){
  let ov = document.getElementById('ghAutoSyncOverlay');
  if(ov) return ov;
  ov = document.createElement('div');
  ov.id = 'ghAutoSyncOverlay';
  ov.style.cssText = [
    'position:fixed','inset:0','background:rgba(13,13,13,0.96)',
    // 100000 = por encima del gate de PIN (dashboard-auth.js usa 99999),
    // así durante el pull no se ve nada parpadear por debajo.
    'z-index:100000','display:flex','flex-direction:column',
    'align-items:center','justify-content:center','gap:14px',
    'color:#94a3b8','font-family:DM Mono,monospace','font-size:13px',
    'text-align:center','padding:20px',
    // CRÍTICO: dashboard-auth.js hace body.visibility='hidden' cuando
    // monta el gate del PIN. Sin esto, el overlay heredaría hidden y
    // sería invisible mientras el pull está en curso — el usuario vería
    // el PIN antes de tiempo. Forzamos visible.
    'visibility:visible'
  ].join(';');
  ov.innerHTML = '<div style="font-size:34px;animation:ghSpin 1.4s linear infinite">⟳</div>'+
                 '<div id="ghAutoSyncMsg">Sincronizando con GitHub…</div>';
  if(!document.getElementById('ghSpinKf')){
    const s = document.createElement('style');
    s.id = 'ghSpinKf';
    s.textContent = '@keyframes ghSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
  document.body.appendChild(ov);
  return ov;
}

function _removeOverlay(){
  const ov = document.getElementById('ghAutoSyncOverlay');
  if(ov && ov.parentNode) ov.parentNode.removeChild(ov);
}

function _showOverlayError(msg){
  const ov = _ensureOverlay();
  const m = ov.querySelector('#ghAutoSyncMsg');
  if(m){
    m.innerHTML = '<div style="color:#fbbf24;max-width:480px;line-height:1.5">⚠ '+msg+'</div>'+
      '<div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'+
      '<button id="ghRetryBtn" style="background:#1e3a5f;color:#cfe1ff;border:1px solid #2d4d75;padding:7px 16px;border-radius:5px;font-family:inherit;font-size:12px;cursor:pointer">Reintentar</button>'+
      '<button id="ghSkipBtn" style="background:transparent;color:#94a3b8;border:1px solid #1e3a5f;padding:7px 16px;border-radius:5px;font-family:inherit;font-size:12px;cursor:pointer">Continuar con datos viejos</button>'+
      '</div>';
    const r = ov.querySelector('#ghRetryBtn');
    const s = ov.querySelector('#ghSkipBtn');
    if(r) r.onclick = () => {
      try { sessionStorage.removeItem('__gh_synced_session'); } catch(_e){}
      location.reload();
    };
    if(s) s.onclick = () => { _removeOverlay(); };
  }
  const spin = ov.firstChild;
  if(spin) spin.style.animation = 'none';
}

async function bootstrapAutoSync(){
  if(!isLoggedIn()){ _removeOverlay(); return; }

  let alreadySynced = false;
  try { alreadySynced = !!sessionStorage.getItem('__gh_synced_session'); } catch(_e){}
  if(alreadySynced){
    _removeOverlay();
    // Recuperar timestamp del sync original (lo deja pullAndApplyAll) para
    // que el badge muestre hora real, no solo "sincronizado" a secas.
    let ts = '';
    try { ts = sessionStorage.getItem('__gh_synced_at') || ''; } catch(_e){}
    // Usar showStatus para que dispare el timer del modo compacto.
    showStatus(ts ? ('✓ sincronizado ' + ts) : '✓ sincronizado', 'ok');
    return;
  }

  _ensureOverlay();
  try {
    await pullAndApplyAll();
    location.reload();
  } catch(err){
    _showOverlayError(err && err.message ? err.message : 'No pude sincronizar');
  }
}

async function manualResync(){
  const badge = _findBadge();
  if(badge){
    badge.textContent = '⟳ sincronizando…';
    badge.dataset.kind = 'work';
    badge.style.color = '#fbbf24';
  }
  try {
    // Si hay cambios locales pendientes (autopush con timer activo o push
    // en vuelo), súbelos PRIMERO. Sin esto, pullAndApplyAll bajaría el
    // remoto y machacaría la edición que todavía no había subido.
    if(_pushTimer || _pushInFlight){
      if(badge) badge.textContent = '⟳ subiendo cambios pendientes…';
      try { await flush(); }
      catch(flushErr){
        // Si la subida falla, NO seguimos: pullear ahora perdería los cambios.
        throw new Error('No pude subir cambios pendientes: '+(flushErr.message||''));
      }
    }
    try { sessionStorage.removeItem('__gh_synced_session'); } catch(_e){}
    if(badge) badge.textContent = '⟳ descargando datos…';
    await pullAndApplyAll();
    // Hook opcional para dashboards que necesiten resync extra
    // (consulta lo usa para el catálogo de menús en IndexedDB).
    try {
      if(typeof window.ghOnManualResync === 'function'){
        await window.ghOnManualResync();
      }
    } catch(hookErr){
      console.warn('[GitHubSync] ghOnManualResync hook falló:', hookErr);
    }
    location.reload();
  } catch(err){
    if(badge){
      badge.textContent = '⚠ '+(err.message || 'error').slice(0, 60);
      badge.dataset.kind = 'error';
      badge.style.color = '#f87171';
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// API PÚBLICA
// ────────────────────────────────────────────────────────────────────

window.GitHubSync = {
  setupCredentials, isLoggedIn, clearCredentials, pullAndApplyAll,
  attach, enableAutoPush, setStatusElement, flush,
  fetchSecuritySection, fetchFullData, updateSecuritySection, getCachedSecurity,
  updateSection, fetchSection,
  getRepo, getBranch,
  hasToken: () => !!getToken(),
  bootstrapAutoSync, manualResync,
};

})();
