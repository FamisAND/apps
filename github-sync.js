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
const DATA_KEYS = {
  training: ['ft_v4','ft_theme','ft_lang'],
  training_online: ['tob_online_v2'],
  patrimonio: ['pat_v5','pat_dismissed'],
  facturas: ['fac_v1'],
  options: ['ot_hist','ot_snaps','ot_activas','ot_cfg'],
};
const _bases = new Map();
const _expectedValues = new Map();
let _dirty = false;
let _blocked = false;
let _pushPromise = null;
let _reloadRequired = false;
let _safetyDBPromise;

function same(a,b){
  const canonical = v => Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
function scope(){ return getRepo()+'@'+getBranch()+(window.FTSession?':'+(window.FTSession.user?.id||'pending'):''); }
function conflict(message){ const e=new Error(message); e.syncConflict=true; return e; }
function safetyDB(){
  if(!_safetyDBPromise) _safetyDBPromise=new Promise((resolve,reject)=>{
    if(!window.indexedDB) return reject(new Error('IndexedDB no disponible: no puedo verificar una copia segura.'));
    const request=indexedDB.open('full-training-sync-safety-v1',1);
    const timer=setTimeout(()=>reject(new Error('La base de copias esta bloqueada. Cierra otras pestanas y reintenta.')),8000);
    request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'id'});
    request.onsuccess=()=>{clearTimeout(timer);const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
    request.onerror=()=>{clearTimeout(timer);reject(request.error);};
    request.onblocked=()=>{clearTimeout(timer);reject(new Error('Base de copias bloqueada.'));};
  }).catch(e=>{_safetyDBPromise=null;throw e;});
  return _safetyDBPromise;
}
async function safetyRead(id){
  const db=await safetyDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('records','readonly'),request=tx.objectStore('records').get(id);
    tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('No pude leer la copia.'));
  });
}
async function safetyWrite(record){
  const db=await safetyDB();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('records','readwrite');tx.objectStore('records').put(record);
    tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error('No pude preservar la copia.'));
  });
  if(!same(await safetyRead(record.id),record))throw new Error('La copia no supera la verificacion.');
}
const LEGACY_ARCHIVE_KEYS=['ot_images','__gh_sync_lastgood'];
async function textHash(raw){
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function readLegacyArchive(){
  const db=await safetyDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('records','readonly'),request=tx.objectStore('records').getAll();
    tx.oncomplete=()=>resolve(request.result.filter(r=>r.kind==='legacy-storage'));
    tx.onerror=tx.onabort=()=>reject(tx.error||new Error('No pude leer el archivo antiguo.'));
  });
}
async function archiveLegacyStorage(){
  if(!navigator.locks)throw new Error('No puedo coordinar el archivo seguro entre ventanas.');
  return navigator.locks.request('ft-legacy-storage-archive',async()=>{
    const copied=[];
    for(const key of LEGACY_ARCHIVE_KEYS){
      const raw=_origGetItem.call(localStorage,key);
      if(raw===null)continue;
      const sha256=await textHash(raw),id='legacy-storage:'+key+':'+sha256;
      let record=await safetyRead(id);
      if(!record){
        record={id,kind:'legacy-storage',key,sha256,raw,origin:location.origin,createdAt:new Date().toISOString()};
        await safetyWrite(record);
      }
      record=await safetyRead(id);
      if(record.raw!==raw || await textHash(record.raw)!==sha256)throw new Error('El archivo de '+key+' no supera la verificacion.');
      copied.push({key,raw});
    }
    // Preserve and verify every value before removing either redundant copy.
    for(const {key,raw} of copied){
      if(_origGetItem.call(localStorage,key)!==raw)throw conflict('Otra ventana ha cambiado '+key+'. No se retira ninguna copia.');
    }
    for(const {key} of copied){
      _origRemoveItem.call(localStorage,key);
      if(_origGetItem.call(localStorage,key)!==null)throw new Error('No se ha podido liberar la copia local de '+key);
    }
    return copied.length;
  });
}
async function restoreLegacyStorage(key,sha256){
  if(!LEGACY_ARCHIVE_KEYS.includes(key))throw new Error('Clave no admitida para recuperacion.');
  return navigator.locks.request('ft-legacy-storage-archive',async()=>{
    const record=await safetyRead('legacy-storage:'+key+':'+sha256);
    if(!record || await textHash(record.raw)!==sha256)throw new Error('Archivo ausente o no verificado.');
    const current=_origGetItem.call(localStorage,key);
    if(current!==null && current!==record.raw)throw conflict('Ya existe otra version de '+key+'. No se sobrescribira.');
    _origSetItem.call(localStorage,key,record.raw);
    if(_origGetItem.call(localStorage,key)!==record.raw)throw new Error('Recuperacion no verificada.');
    return true;
  });
}
async function openRecoveryArchive(){
  const records=await readLegacyArchive();
  const dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(520px,90vw);max-height:75vh;overflow:auto;background:#141821;color:#eee;border:1px solid #515967;border-radius:8px;padding:18px;visibility:visible;font:14px sans-serif';
  const title=document.createElement('h3');title.textContent='Copias de seguridad';dialog.appendChild(title);
  const error=document.createElement('p');error.style.color='#f87171';dialog.appendChild(error);
  const exportButton=document.createElement('button');exportButton.textContent='Exportar datos y archivo';
  exportButton.onclick=()=>exportSafetyCopy().catch(e=>error.textContent=e.message);dialog.appendChild(exportButton);
  for(const record of records){
    const row=document.createElement('div');row.style.cssText='margin-top:12px;padding-top:10px;border-top:1px solid #515967';
    const label=document.createElement('p');
    label.textContent=(record.key==='ot_images'?'Imagenes antiguas':'Respaldo antiguo')+' · '+Math.round(record.raw.length*2/1024)+' KB · '+record.createdAt.slice(0,10);
    row.appendChild(label);
    const restore=document.createElement('button');restore.textContent='Recuperar copia local';
    restore.onclick=async()=>{
      if(!confirm('Se recuperara esta clave antigua solo si hay espacio y no sobrescribe otra version. El archivo de seguridad se conserva. ¿Continuar?'))return;
      try{await restoreLegacyStorage(record.key,record.sha256);error.style.color='#34d399';error.textContent='Copia recuperada y verificada.';}
      catch(e){error.style.color='#f87171';error.textContent=e.name==='QuotaExceededError'?'No hay espacio. La copia sigue conservada en el archivo.':e.message;}
    };
    row.appendChild(restore);dialog.appendChild(row);
  }
  const close=document.createElement('button');close.textContent='Cerrar';close.style.marginTop='16px';
  close.onclick=()=>dialog.close();dialog.appendChild(close);
  dialog.addEventListener('close',()=>dialog.remove());document.body.appendChild(dialog);dialog.showModal();
}
async function preserve(kind,section,value){
  const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const id=kind+':'+scope()+':'+section+':'+fingerprint;
  if(await safetyRead(id))return;
  await safetyWrite({id,kind,section,scope:scope(),createdAt:new Date().toISOString(),value});
}
async function baseFor(section){
  if(!_bases.has(section)){
    const record=await safetyRead('base:'+scope()+':'+section);
    _bases.set(section,record ? {known:true,value:record.value} : {known:false});
  }
  return _bases.get(section);
}
async function rememberBase(section,value){
  await safetyWrite({id:'base:'+scope()+':'+section,kind:'base',scope:scope(),section,value});
  _bases.set(section,{known:true,value});
}
async function reconcileCatalog(local,remote){
  const section='tob_menus_catalog',base=await baseFor(section);
  await preserve('catalog-versions',section,{local,remote,base:base.known?base.value:null});
  const result={...remote,...local};
  for(const field of ['ingredientes','recetas','menus']){
    const indexed=value=>new Map((value?.[field]||[]).map(item=>[item.id,item]));
    const l=indexed(local),r=indexed(remote),b=indexed(base.value);
    result[field]=[];
    for(const id of new Set([...l.keys(),...r.keys(),...b.keys()])){
      const lv=l.get(id),rv=r.get(id),bv=b.get(id);let chosen;
      if(same(lv,rv))chosen=lv;
      else if(base.known && same(lv,bv))chosen=rv;
      else if(base.known && same(rv,bv))chosen=lv;
      else if(!base.known && (!lv||!rv))chosen=lv||rv;
      else throw conflict('Conflicto en el catalogo: '+field+'. No se elegira una receta por su fecha global.');
      if(chosen)result[field].push(chosen);
    }
  }
  result._syncTs=Math.max(local?._syncTs||0,remote?._syncTs||0);
  await rememberBase(section,remote||{});
  return result;
}
function readSection(section){
  const out={};
  (DATA_KEYS[section]||(_section===section?_watchedKeys:[])).forEach(k=>{
    const raw=_origGetItem.call(localStorage,k);if(raw===null)return;
    try{out[k]=JSON.parse(raw);}catch(_e){out[k]=raw;}
  });
  return out;
}
async function exclusive(operation){
  if(navigator.locks) return navigator.locks.request('ft-sync:'+scope(),operation);
  throw new Error('Este navegador no permite coordinar guardados seguros entre pestanas. Usa Chrome actualizado.');
}
async function exportSafetyCopy(){
  const values={};Object.keys(DATA_KEYS).forEach(s=>{values[s]=readSection(s);});
  if(typeof window.ghEditorSnapshot==='function')values.editor=window.ghEditorSnapshot();
  const legacyArchive=await readLegacyArchive();
  const url=URL.createObjectURL(new Blob([JSON.stringify({createdAt:new Date().toISOString(),data:values,legacyArchive},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='full-training-copia-local-'+Date.now()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function reportConflict(error){
  _blocked=true;
  showStatus('Conflicto: datos conservados. Exporta y revisa.', 'error');
  if(document.getElementById('ghSafetyConflict'))return;
  const panel=document.createElement('div');panel.id='ghSafetyConflict';
  panel.style.cssText='position:fixed;bottom:50px;right:10px;max-width:440px;padding:16px;background:#15191e;color:#eee;border:1px solid #f59e0b;border-radius:6px;z-index:100002;font:13px sans-serif;visibility:visible';
  const message=document.createElement('p');message.textContent=error.message;panel.appendChild(message);
  const download=document.createElement('button');download.textContent='Exportar copia local';download.onclick=exportSafetyCopy;panel.appendChild(download);
  const load=document.createElement('button');load.textContent='Conservar copia y cargar remoto';
  load.onclick=async()=>{
    if(!confirm('Se conservaran copias de ambas versiones. Se cargara la remota, sin fusionar tus cambios locales. ¿Continuar?'))return;
    load.disabled=true;
    try{await pullAndApplyAll({resolveRemote:true});location.reload();}catch(e){message.textContent=e.message;load.disabled=false;}
  };
  panel.appendChild(load);document.body.appendChild(panel);
}

// Funciones nativas, antes de cualquier intercepción
const _origSetItem    = Storage.prototype.setItem;
const _origRemoveItem = Storage.prototype.removeItem;
const _origGetItem    = Storage.prototype.getItem;

// ────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────

function getToken(){ return _origGetItem.call(localStorage, TOKEN_KEY); }
function getRepo(){ return window.FTSession ? (window.FTSession.user?.repo || 'session-api') : _origGetItem.call(localStorage, REPO_KEY); }
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
  if(window.FTSession){
    await window.FTSession.ready;
    if(path.startsWith('contents/'+FILE_NAME) && (!opts || opts.method!=='PUT')){
      return fetch('/api/data',{cache:'no-store',credentials:'same-origin'});
    }
    throw new Error('Esta operacion debe pasar por la API de sesiones.');
  }
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
  if(window.FTSession){
    await window.FTSession.ready;
    const res=await fetch('/api/data',{cache:'no-store',credentials:'same-origin'});
    if(!res.ok){const e=new Error('No pude leer los datos ('+res.status+').');e.status=res.status;throw e;}
    return res.json();
  }
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
//   - Sin `rebuild`, se bloquea el conflicto para no reponer datos antiguos.
async function pushRaw(payload, rebuild, attempt, expectedSha){
  attempt = attempt || 0;
  const branch = getBranch();
  const sha = expectedSha;
  if(window.FTSession){
    // Server-side mode only accepts one explicitly scoped section per write.
    const section=payload.__writeSection;
    if(!section)throw new Error('Falta la seccion autorizada para guardar.');
    const res=await fetch('/api/data/'+encodeURIComponent(section),{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha,section:payload[section]})});
    if(res.status===409 && attempt<CONFLICT_RETRIES){
      const remote=await pullRaw();
      if(!rebuild)throw conflict('Los datos remotos han cambiado.');
      return pushRaw(await rebuild(remote.content||{}),rebuild,attempt+1,remote.sha);
    }
    if(!res.ok){const e=new Error('Guardado rechazado ('+res.status+').');e.status=res.status;throw e;}
    return res.json();
  }
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
      ? await rebuild(remote.content || {})
      : (()=>{throw conflict('Conflicto remoto: no se permite reponer un payload antiguo.');})();
    return pushRaw(nextPayload, rebuild, attempt + 1, remote.sha);
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

function isLoggedIn(){ return !!window.FTSession || (!!getToken() && !!getRepo()); }

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
// Legacy storage is retained. Cleanup is never executed on startup.

// Descarga data.json y vuelca cada sección/clave en localStorage.
// Avisa via showStatus para que el badge (con glow CSS) refleje el estado real.
// Al acabar OK marca la sesión como sincronizada (sessionStorage), de modo que
// si el usuario navega entre dashboards de la misma pestaña no se vuelve a
// re-sincronizar innecesariamente.
async function pullAndApplyAll(opts){
  opts=opts||{};
  showStatus('⟳ sincronizando…', 'work');
  try {
    return await exclusive(async()=>{
    await archiveLegacyStorage();
    if((_dirty||_pushInFlight || (window.ghHasUnsavedChanges && window.ghHasUnsavedChanges())) && !opts.resolveRemote){
      throw conflict('Hay cambios locales pendientes. No se descargara encima de ellos.');
    }
    const remote = await pullRaw();
    setCachedSha(remote.sha || '');
    if(!remote.content){
      try { sessionStorage.setItem('__gh_synced_session', '1'); } catch(_e){}
      showStatus('✓ sin datos remotos', 'ok');
      return { fresh: true };
    }

    const planned=[];
    for(const section of Object.keys(DATA_KEYS)){
      if(!remote.content[section])continue;
      const local=readSection(section),incoming=remote.content[section];
      const base=await baseFor(section);
      if(!opts.resolveRemote && Object.keys(local).length && !same(local,incoming) && (!base.known || !same(local,base.value))){
        await preserve('conflict',section,{local,remote:incoming});
        throw conflict('La version local de '+section+' difiere de la nube. Ambas estan conservadas; revisa antes de elegir.');
      }
      planned.push({section,local,incoming});
    }
    await preserve('before-pull','all',{local:planned.map(p=>({section:p.section,data:p.local})),remote:remote.content,editor:window.ghEditorSnapshot?window.ghEditorSnapshot():null});
    for(const {section,incoming:sec} of planned){
      for(const key of DATA_KEYS[section]){
        if(!Object.prototype.hasOwnProperty.call(sec,key))continue;
        const val = sec[key];
        const str = (typeof val === 'string') ? val : JSON.stringify(val);
        if(_origGetItem.call(localStorage,key)!==str)_reloadRequired=true;
        _origSetItem.call(localStorage,key,str);
        if(_origGetItem.call(localStorage,key)!==str)throw new Error('No se ha verificado el guardado local de '+key);
        _expectedValues.set(key,str);
      }
      await rememberBase(section,sec);
    }
    _dirty=false;_blocked=false;

    const syncedAt = new Date().toLocaleTimeString('es-ES');
    try {
      sessionStorage.setItem('__gh_synced_session', '1');
      sessionStorage.setItem('__gh_synced_at', syncedAt);
    } catch(_e){}
    showStatus('✓ sincronizado '+syncedAt, 'ok');
    return { fresh: false, lastUpdate: remote.content.lastUpdate, security: remote.content.__security || null };
    });
  } catch(err){
    showStatus('⚠ error sync: '+(err.message||''), 'error');
    _blocked=true;
    if(err.syncConflict)reportConflict(err);
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
  await rememberBase('__security',_securityCache);
  return content;
}

async function fetchSecuritySection(){
  const remote = await pullRaw();
  setCachedSha(remote.sha || '');
  _securityCache = (remote.content && remote.content.__security) || {};
  return _securityCache;
}

async function updateSecuritySection(updater){
  const updated=await updateSection('__security',updater);
  _securityCache = updated;
  return updated;
}

// Updater genérico para CUALQUIER sección de data.json (ej. __ia_config, __fin, etc).
// El updater recibe la sección actual (objeto) y debe devolver la nueva (objeto entero).
// En caso de conflicto (otra pestaña/dashboard pushó entremedias) se re-ejecuta el
// updater contra el remoto FRESCO, de modo que nunca se revierten secciones ajenas.
async function updateSection(sectionName, updater){
  if(!sectionName || typeof sectionName !== 'string') throw new Error('sectionName requerido');
  return exclusive(async()=>{
  const remote = await pullRaw();
  setCachedSha(remote.sha || '');
  if(remote.sha && !remote.content){
    throw new Error('No pude leer data.json remoto. Recarga la app.');
  }
  const original=(remote.content && remote.content[sectionName])||{};
  const base=await baseFor(sectionName);
  if(base.known && !same(original,base.value)){
    await preserve('conflict',sectionName,{base:base.value,remote:original});
    throw conflict('La seccion '+sectionName+' ha cambiado desde que la abriste.');
  }
  let lastUpdated = updater(JSON.parse(JSON.stringify(original)));
  await preserve('before-update',sectionName,{remote:original,proposed:lastUpdated});
  const build = (remoteContent) => {
    const current = (remoteContent && remoteContent[sectionName]) || {};
    if(!same(current,original))throw conflict('Conflicto en '+sectionName+'. No se ha sobrescrito.');
    const result=mergeSections(remoteContent || {}, { [sectionName]: lastUpdated });
    if(window.FTSession)result.__writeSection=sectionName;
    return result;
  };
  const payload = build(remote.content);
  await pushRaw(payload, build,0,remote.sha);
  await rememberBase(sectionName,lastUpdated);
  return lastUpdated;
  });
}

// Lectura de una sección arbitraria (ej. __ia_config).
async function fetchSection(sectionName,opts){
  const remote = await pullRaw();
  setCachedSha(remote.sha || '');
  const value=(remote.content && remote.content[sectionName]) || null;
  if(!opts?.preserveBase){
    const base=await baseFor(sectionName);
    if(!base.known)await rememberBase(sectionName,value||{});
  }
  return value;
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
  _watchedKeys.forEach(k=>_expectedValues.set(k,_origGetItem.call(localStorage,k)));
  window.addEventListener('storage',e=>{
    if(e.storageArea===localStorage && _watchedKeys.includes(e.key)){
      _blocked=true;
      reportConflict(conflict('Otra pestana ha cambiado estos datos. Exporta lo pendiente antes de recargar.'));
    }
  });

  Storage.prototype.setItem = function(key, value){
    if(_enabled && this===window.localStorage && _watchedKeys.includes(key)){
      if(window.FTSession && !window.FTSession.active)throw new Error('Sesion no verificada. Los datos no se han cambiado.');
      if(_reloadRequired || _blocked || _origGetItem.call(this,key)!==_expectedValues.get(key)){
        const e=conflict('Los datos han cambiado en otra ventana. No se sustituira la version actual.');
        reportConflict(e);throw e;
      }
    }
    _origSetItem.call(this, key, value);
    if(this===window.localStorage && _watchedKeys.includes(key))_expectedValues.set(key,String(value));
    if(_enabled && this === window.localStorage && _watchedKeys.indexOf(key) >= 0){
      schedulePush();
    }
  };
  Storage.prototype.removeItem = function(key){
    if(this===window.localStorage && _watchedKeys.includes(key)){
      const e=conflict('No se permite eliminar una clave completa de datos desde la sincronizacion.');reportConflict(e);throw e;
    }
    _origRemoveItem.call(this, key);
    if(_enabled && this === window.localStorage && _watchedKeys.indexOf(key) >= 0){
      schedulePush();
    }
  };

  window.addEventListener('beforeunload', function(e){
    if(_dirty || _pushTimer || _pushInFlight){
      e.preventDefault();
      e.returnValue = 'Hay cambios sin guardar en GitHub. ¿Salir?';
      return e.returnValue;
    }
  });
}

// Lo llama dashboard-auth.js tras pasar el gate. Hasta ese momento,
// los cambios a localStorage NO se suben (porque podrían ser cambios
// del propio bootstrap antes de que el usuario haya entrado).
function enableAutoPush(){ _enabled = true;if(_dirty&&!_blocked)schedulePush(); }

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
  _dirty=true;
  clearTimeout(_pushTimer);
  if(_blocked)return;
  showStatus('● cambios pendientes', 'work');
  _pushTimer = setTimeout(()=>{doPush().catch(()=>{});}, PUSH_DELAY);
}

function doPush(){
  if(_pushPromise)return _pushPromise;
  _pushPromise=performPush().finally(()=>{
    _pushPromise=null;
    if(_dirty && !_blocked && _enabled)schedulePush();
  });
  return _pushPromise;
}
async function performPush(){
  _pushTimer = null;
  if(_blocked)throw conflict('Sincronizacion bloqueada: revisa el conflicto antes de guardar.');
  if(!_section)return;
  _pushInFlight = true;
  showStatus('subiendo a GitHub…', 'work');

  try {
    await exclusive(async()=>{
    const sectionData = readSection(_section);
    await preserve('version',_section,sectionData);
    const remote = await pullRaw();
    setCachedSha(remote.sha || '');

    // ── Protección 1: si el remoto tiene contenido pero NO pudimos leerlo,
    // NO subimos. Mejor un error temporal que machacar todo.
    if(remote.sha && !remote.content){
      throw new Error('No pude leer data.json remoto. Cancelo subida.');
    }

    const original=(remote.content && remote.content[_section])||{};
    const base=await baseFor(_section);
    if(!base.known || !same(original,base.value)){
      await preserve('conflict',_section,{local:sectionData,remote:original});
      throw conflict('La nube ha cambiado o falta una base verificada. No se ha sobrescrito '+_section+'.');
    }
    if(same(original,sectionData)){_dirty=false;return;}
    await preserve('version',_section,original);
    const rebuild=fresh=>{
      if(!same(fresh[_section]||{},original))throw conflict('Otra persona ha editado '+_section+'. Se conservan ambas versiones.');
      const result=mergeSections(fresh,{[_section]:sectionData});
      if(window.FTSession)result.__writeSection=_section;
      return result;
    };
    await pushRaw(rebuild(remote.content||{}),rebuild,0,remote.sha);
    await rememberBase(_section,sectionData);
    _dirty=!same(readSection(_section),sectionData);
    });
    showStatus('✓ guardado '+new Date().toLocaleTimeString('es-ES'), 'ok');
  } catch(err){
    console.error('[GitHubSync] error:', err);
    if(err.status === 401 || err.status === 403){
      showStatus('⚠ token inválido — vuelve al inicio', 'error');
    } else showStatus('⚠ no subido: '+(err.message||''), 'error');
    _blocked=true;
    if(err.syncConflict)reportConflict(err);
    throw err;
  } finally {
    _pushInFlight = false;
  }
}

async function flush(){
  clearTimeout(_pushTimer);_pushTimer=null;
  await doPush();
  while(_dirty && !_blocked){clearTimeout(_pushTimer);_pushTimer=null;await doPush();}
}

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

let _bootstrapPromise;
function bootstrapAutoSync(){
  if(!_bootstrapPromise)_bootstrapPromise=runBootstrapAutoSync().catch(err=>{
    _blocked=true;
    _showOverlayError(err && err.message ? err.message : 'No pude verificar la seguridad local');
    return false;
  });
  return _bootstrapPromise;
}
async function runBootstrapAutoSync(){
  if(window.FTSession)await window.FTSession.ready;
  if(!isLoggedIn()){ _removeOverlay(); return; }

  let alreadySynced = false;
  try { alreadySynced = !!sessionStorage.getItem('__gh_synced_session'); } catch(_e){}
  await safetyDB();
  await archiveLegacyStorage();
  if(alreadySynced && _section){
    const base=await baseFor(_section);alreadySynced=base.known;
    if(base.known)_dirty=!same(readSection(_section),base.value);
  }
  if(alreadySynced){
    _removeOverlay();
    // Recuperar timestamp del sync original (lo deja pullAndApplyAll) para
    // que el badge muestre hora real, no solo "sincronizado" a secas.
    let ts = '';
    try { ts = sessionStorage.getItem('__gh_synced_at') || ''; } catch(_e){}
    // Usar showStatus para que dispare el timer del modo compacto.
    showStatus(_dirty?'Cambios locales pendientes':ts ? ('✓ sincronizado ' + ts) : '✓ sincronizado', _dirty?'work':'ok');
    return true;
  }

  _ensureOverlay();
  try {
    await pullAndApplyAll();
    location.reload();
  } catch(err){
    _blocked=true;
    _showOverlayError(err && err.message ? err.message : 'No pude sincronizar');
    return false;
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
    if(_dirty || _pushTimer || _pushInFlight){
      if(_blocked && !document.getElementById('ghSafetyConflict'))_blocked=false;
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
  exportSafetyCopy,
  preserve,
  archiveLegacyStorage, readLegacyArchive, restoreLegacyStorage, openRecoveryArchive,
  reconcileCatalog,
  hasPendingChanges:()=>_dirty||_pushInFlight||_blocked,
  suspend:()=>{_blocked=true;clearTimeout(_pushTimer);_pushTimer=null;},
  get ready(){return _bootstrapPromise||Promise.resolve(true);},
};

})();
