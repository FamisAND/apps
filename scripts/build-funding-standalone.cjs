const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'Tracker de Fondeo - Local.html');

const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const replaceOnce = (value, from, to, label) => {
  if (!value.includes(from)) throw new Error(`No se encontro el bloque: ${label}`);
  return value.replace(from, to);
};
const inlineScript = (value) => value.replace(/<\/script/gi, '<\\/script');

let html = read('funding.html');
let runtime = read('funding.js');

runtime = replaceOnce(
  runtime,
  "let db=M.empty(),adapter,tab='dashboard',editor=null,dirty=false,busy=false,unsavedBook=false,canEdit=false,chart,monthly,bankroll,detailId=null;",
  "let db=M.empty(),adapter,fileHandle=null,externalDirty=true,tab='dashboard',editor=null,dirty=false,busy=false,unsavedBook=false,canEdit=false,chart,monthly,bankroll,detailId=null;",
  'estado principal'
);

runtime = replaceOnce(
  runtime,
  "function notice(message,error=false){$('notice').hidden=!message;$('notice').textContent=message;$('notice').style.borderColor=error?'#a85e50':'';}",
  `function notice(message,error=false){$('notice').hidden=!message;$('notice').textContent=message;$('notice').style.borderColor=error?'#a85e50':'';}
  function updateLocalFileState(){
    const state=$('localSaveState'),label=$('exportJson')?.querySelector('[data-save-label]');
    if(label)label.textContent=fileHandle?'Actualizar JSON':'Guardar JSON...';
    if(!state)return;
    state.textContent=externalDirty?'Cambios seguros en el navegador; JSON pendiente':'JSON actualizado';
    state.classList.toggle('pending',externalDirty);
  }`,
  'estado visual local'
);

runtime = replaceOnce(
  runtime,
  "db=next;updateFilterOptions();render();await adapter.save(next);unsavedBook=false;notice('');if(detailId&&$('accountDetail').open)showDetail(detailId);",
  "db=next;updateFilterOptions();render();await adapter.save(next);unsavedBook=false;externalDirty=true;updateLocalFileState();notice('Cambios guardados automaticamente en este navegador.');if(detailId&&$('accountDetail').open)showDetail(detailId);",
  'guardado de cambios'
);

runtime = replaceOnce(
  runtime,
  "  function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}\n  async function checksum(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');}\n  async function exportJson(){const data=M.clone(db),out={format:'full-training-funding',version:1,exportedAt:new Date().toISOString(),sha256:await checksum(data),data};download(JSON.stringify(out,null,2),'fondeo-'+M.today()+'.json','application/json');}",
  `  function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function checksum(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
  async function jsonEnvelope(){const data=M.clone(db);return {format:'full-training-funding',version:1,exportedAt:new Date().toISOString(),sha256:await checksum(data),data};}
  async function exportJson(){const out=await jsonEnvelope();download(JSON.stringify(out,null,2),'fondeo-'+M.today()+'.json','application/json');}
  async function handleWritable(handle){
    if(!handle||typeof handle.createWritable!=='function')return false;
    if(typeof handle.queryPermission!=='function')return true;
    const permission=await handle.queryPermission({mode:'readwrite'});
    if(permission==='granted')return true;
    return permission==='prompt'&&typeof handle.requestPermission==='function'&&await handle.requestPermission({mode:'readwrite'})==='granted';
  }
  async function saveJsonFile(){
    if(busy||unsavedBook)throw new Error('Espera a que termine el guardado local antes de crear la copia JSON.');
    if(!window.showSaveFilePicker){await exportJson();externalDirty=false;updateLocalFileState();notice('Copia JSON descargada. En este navegador se guarda como una descarga normal.');return;}
    let handle=fileHandle;
    try{
      if(!handle)handle=await window.showSaveFilePicker({id:'full-training-funding',suggestedName:'fondeo.json',types:[{description:'Copia de Fondeo',accept:{'application/json':['.json']}}]});
      else if(!await handleWritable(handle))handle=await window.showSaveFilePicker({id:'full-training-funding',suggestedName:'fondeo.json',types:[{description:'Copia de Fondeo',accept:{'application/json':['.json']}}]});
    }catch(error){
      if(error?.name==='AbortError')return;
      await exportJson();externalDirty=false;updateLocalFileState();notice('El navegador no permite sobrescritura directa. Se ha descargado una copia JSON nueva.');return;
    }
    const out=await jsonEnvelope(),writer=await handle.createWritable();
    await writer.write(JSON.stringify(out,null,2));await writer.close();
    fileHandle=handle;await adapter.storeFileHandle?.(handle).catch(()=>{});externalDirty=false;updateLocalFileState();notice('JSON actualizado correctamente: '+(handle.name||'fondeo.json'));
  }
  async function openJsonFile(){
    if(!window.showOpenFilePicker){$('importFile').click();return;}
    let handle;
    try{[handle]=await window.showOpenFilePicker({id:'full-training-funding',multiple:false,types:[{description:'Copia de Fondeo',accept:{'application/json':['.json']}}]});}
    catch(error){if(error?.name==='AbortError')return;throw error;}
    await importJson(await handle.getFile());fileHandle=handle;await adapter.storeFileHandle?.(handle).catch(()=>{});externalDirty=true;updateLocalFileState();notice('JSON abierto. Pulsa Actualizar JSON para guardar sobre este mismo archivo.');
  }`,
  'guardado JSON'
);

runtime = replaceOnce(
  runtime,
  "    await exportJson();await commit(merged.value);notice('Importacion confirmada. '+merged.added+' registros incorporados.');",
  "    if(db.accounts.length||db.events.length)await exportJson();await commit(merged.value);notice('Importacion confirmada. '+merged.added+' registros incorporados.');",
  'respaldo antes de importar'
);

runtime = replaceOnce(
  runtime,
  "  $('exportJson').onclick=()=>exportJson().catch(error=>notice(error.message,true));$('exportCsv').onclick=()=>{$('infoTitle').textContent='Exportar CSV';$('infoContent').innerHTML=`<div class=\"account-actions\">${action('csv-accounts','Cuentas','download')}${action('csv-events','Movimientos','download')}</div>`;$('infoDialog').showModal();refreshIcons();};\n  $('importJson').onclick=()=>$('importFile').click();$('importFile').onchange=event=>importJson(event.target.files[0]).catch(error=>notice(error.message,true)).finally(()=>event.target.value='');",
  "  $('exportJson').onclick=()=>saveJsonFile().catch(error=>notice(error.message,true));$('openJson').onclick=()=>openJsonFile().catch(error=>notice(error.message,true));$('exportCsv').onclick=()=>{$('infoTitle').textContent='Exportar CSV';$('infoContent').innerHTML=`<div class=\"account-actions\">${action('csv-accounts','Cuentas','download')}${action('csv-events','Movimientos','download')}</div>`;$('infoDialog').showModal();refreshIcons();};\n  $('importJson').onclick=()=>openJsonFile().catch(error=>notice(error.message,true));$('importFile').onchange=event=>{fileHandle=null;adapter.storeFileHandle?.(null).catch(()=>{});importJson(event.target.files[0]).then(()=>{externalDirty=true;updateLocalFileState();}).catch(error=>notice(error.message,true)).finally(()=>event.target.value='');};",
  'botones JSON'
);

runtime = runtime.replace(/\n  setInterval\(\(\)=>\{if\(unsavedBook&&window\.FTRecords\?[\s\S]*?\},1000\);/, '');

const previewStart = runtime.indexOf('  async function previewAdapter(){');
const bootStart = runtime.indexOf('  async function boot(){', previewStart);
if (previewStart < 0 || bootStart < 0) throw new Error('No se encontro el adaptador local');
runtime = runtime.slice(0, previewStart) + `  async function previewAdapter(){
    const storage=await new Promise((resolve,reject)=>{const request=indexedDB.open('full-training-funding-local-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('book');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const read=key=>new Promise((resolve,reject)=>{const request=storage.transaction('book','readonly').objectStore('book').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const write=(key,value)=>new Promise((resolve,reject)=>{const tx=storage.transaction('book','readwrite');tx.objectStore('book').put(value,key);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('No se pudo guardar la copia local.'));});
    const get=async()=>await read('book')||M.empty();
    return {load:get,save:async value=>{await write('book',M.clone(value));if(JSON.stringify(await get())!==JSON.stringify(value))throw new Error('Copia local no verificada.');},loadFileHandle:()=>read('file-handle'),storeFileHandle:value=>write('file-handle',value)};
  }
` + runtime.slice(bootStart);

const localBootStart = runtime.indexOf('  async function boot(){');
const bootCall = runtime.indexOf('  boot();', localBootStart);
if (localBootStart < 0 || bootCall < 0) throw new Error('No se encontro el inicio local');
runtime = runtime.slice(0, localBootStart) + `  async function boot(){
    try{
      adapter=await previewAdapter();fileHandle=await adapter.loadFileHandle().catch(()=>null);canEdit=true;
      db=FundingAnalysis.migrate(M.validate(await adapter.load()));$('exportJson').disabled=false;$('openJson').disabled=false;$('newAccount').disabled=false;$('newMovement').disabled=false;$('importJson').disabled=false;updateFilterOptions();render();updateLocalFileState();window.FundingApp={ready:true,getData:()=>M.clone(db),importFile:importJson,showEditor};
    }catch(error){notice(error.message,true);$('newAccount').disabled=true;$('newMovement').disabled=true;$('openJson').disabled=true;$('exportJson').disabled=true;}
  }
` + runtime.slice(bootCall);

runtime=runtime.replace('  boot();', "  let chosenAnalysisId=null;FundingAnalysisUI.mount({get:()=>M.clone(db),mutate,notice,setAnalysisId:id=>{chosenAnalysisId=id;},newAccount:conditions=>showEditor({kind:'account',conditions,analysisId:chosenAnalysisId})});\n  FundingTradesUI.mount({get:()=>M.clone(db),save:saveTrades,retry:retryTrades,pending:()=>unsavedBook,editable:()=>canEdit});\n  boot();");

html = html
  .replace(/<link rel="stylesheet" href="[^"]+">\s*/g, '')
  .replace(/<script defer src="[^"]+"><\/script>\s*/g, '')
  .replace('<title>Tracker de Fondeo | Full Training</title>', '<title>Tracker de Fondeo - Version local</title>')
  .replace(/\s*<a class="icon-button" href="index\.html"[\s\S]*?<\/a>/, '')
  .replace('<div class="funding-brand"><h1>Tracker de Fondeo</h1><span id="bookCurrency">USD</span></div>', '<div class="funding-brand"><h1>Tracker de Fondeo</h1><span id="bookCurrency">USD</span><small>Version local independiente</small></div>')
  .replace('<div class="header-actions"><button class="secondary" id="exportJson" title="Exportar todo el historial" disabled><span data-ft-icon="download"></span><span>Copia JSON</span></button><button id="newAccount" disabled><span data-ft-icon="plus"></span>Nueva evaluacion</button></div>', '<div class="header-actions"><span class="local-save-state pending" id="localSaveState">Preparando guardado local...</span><button class="secondary" id="openJson" title="Abrir una copia JSON" disabled><span data-ft-icon="upload"></span><span>Abrir JSON</span></button><button class="secondary" id="exportJson" title="La primera vez pregunta donde guardarlo; despues actualiza el mismo archivo" disabled><span data-ft-icon="download"></span><span data-save-label>Guardar JSON...</span></button><button id="newAccount" disabled><span data-ft-icon="plus"></span>Nueva evaluacion</button></div>')
  .replace('<div id="previewNotice" class="notice" hidden>Vista local. Los datos de esta prueba no se envian a Cloudflare.</div>', '<div id="previewNotice" hidden></div>')
  .replace('>Importar JSON</button>', '>Abrir JSON</button>');

const css = [read('design-system.css'), read('funding.css'), `
.funding-brand small{display:block;color:var(--muted);font-size:.72rem;font-weight:600;margin-top:.1rem}
.local-save-state{border:1px solid rgba(47,125,93,.35);background:rgba(47,125,93,.12);border-radius:999px;color:#2f7d5d;font-size:.76rem;font-weight:700;padding:.42rem .7rem;white-space:nowrap}
.local-save-state.pending{border-color:rgba(177,119,38,.4);background:rgba(177,119,38,.12);color:#8b5e1d}
@media(max-width:900px){.local-save-state{order:5;width:100%;text-align:center}.header-actions{flex-wrap:wrap}.header-actions button{flex:1}.funding-header{align-items:flex-start}}
`].join('\n');

html = html.replace('</head>', `<style>\n${css}\n</style>\n</head>`);
html = html.replace('</body>', ()=>`<script>\n${inlineScript(read('session-icons.js'))}\n</script>\n<script>\n${inlineScript(read('funding-chart.umd.js'))}\n</script>\n<script>\n${inlineScript(read('funding-model.js'))}\n</script>\n<script>\n${inlineScript(read('funding-analysis.js'))}\n</script>\n<script>\n${inlineScript(read('funding-analysis-ui.js'))}\n</script>\n<script>\n${inlineScript(read('funding-trades.js'))}\n</script>\n<script>\n${inlineScript(read('funding-trades-ui.js'))}\n</script>\n<script>\n${inlineScript(runtime)}\n</script>\n</body>`);
html = `<!-- Archivo local independiente generado desde Full Training. No contiene datos personales ni conexion a Cloudflare. -->\n${html}`;

fs.writeFileSync(output, html, 'utf8');
console.log(output);
console.log(`${Buffer.byteLength(html)} bytes`);
