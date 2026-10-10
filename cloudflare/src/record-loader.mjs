import {RecordBridge} from './record-bridge.mjs';
import {FILE_NAMESPACE} from './record-layout.mjs';
import {showStorageDialog} from './storage-dialog.mjs';
import {RecordMedia} from './media-client.mjs';
import {PrivateSettingsClient} from './settings-client.mjs';
import {readResponse} from './request.mjs';
const file=location.pathname.split('/').at(-1)||'index.html';
let bridge;
let loading=true,stage='Comprobando la sesion',lastProgress=Date.now();
const labels={training:'Full Training',training_online:'Consulta',tob_menus_catalog:'Catalogo de recetas',options:'Opciones',patrimonio:'Patrimonio',facturas:'Facturas',__dashboard_config:'Dashboard'};
function loadMessage(text){stage=text;lastProgress=Date.now();const node=document.getElementById('ftLoadMessage');if(node)node.textContent=text;}
function loadProgress(event){
  const name=labels[event.namespace]||'Datos';
  const detail={local:'comprobando copias locales',recover:'recuperando la copia conservada',reconstruct:'reconstruyendo datos verificados',copy:'verificando la copia local'}[event.phase];
  loadMessage(name+': '+(detail||('pagina '+event.page+', '+event.records+' registros verificados'))+'...');
}
const watchdog=setInterval(()=>{
  if(!loading||Date.now()-lastProgress<30000)return;
  const message=document.getElementById('ftLoadMessage');if(message)message.textContent=stage+'. Esta tardando mas de lo habitual. No borres datos ni copias locales.';
},5000);
function unsavedEditor(){try{return !!window.ghHasUnsavedChanges?.();}catch(_error){return true;}}
function download(value){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='full-training-copia-'+new Date().toISOString().replaceAll(':','-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function mount(){
  window.addEventListener('beforeunload',event=>{if(bridge.pending()||bridge.settings?.pending||unsavedEditor()){event.preventDefault();event.returnValue='Hay cambios pendientes de confirmar';}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)window.FTSession.refresh().catch(()=>{});});
  window.FTSession.decorate();const bar=document.getElementById('ftSessionBar');if(!bar||bar.querySelector('#ftRecordStatus'))return;
  const group=document.createElement('div');group.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex:1';
  const status=document.createElement('span');status.id='ftRecordStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='flex:1;min-width:140px';group.appendChild(status);
  function button(label,action){const node=document.createElement('button');node.textContent=label;node.onclick=()=>action().catch(error=>alert(error.message));group.appendChild(node);return node;}
  const exportButton=button('Exportar copia',()=>bridge.exportDownload());exportButton.title='Conservar copias locales y borradores en un archivo privado';
  const retry=button('Reintentar',async()=>{
    if(bridge.settings?.pending){await bridge.settings.save(bridge.settings.pending.cfg);return;}
    const namespace=[...bridge.states].find(([,s])=>s.state!=='confirmed')?.[0]||FILE_NAMESPACE[file];
    if(!namespace)return;
    if(bridge.errors.has(namespace))await bridge.persistDraft(namespace);
    if(bridge.client.pending.has(namespace))await bridge.retry(namespace);
    else if(window.GitHubSync)await window.GitHubSync.flush();
  });
  button('Copias y espacio',()=>showStorageDialog(bridge,download));
  const compare=button('Comparar versiones',async()=>{
    const namespace=[...bridge.states].find(([,s])=>s.state!=='confirmed')?.[0]||FILE_NAMESPACE[file];
    if(!namespace)return;
    const remote=await bridge.peek(namespace),local=structuredClone(bridge.values.get(namespace));
    const dialog=document.createElement('dialog');dialog.style.cssText='max-width:900px;width:90%;border-radius:4px;padding:20px;background:#15191e;color:#fff;border:1px solid #555';
    const title=document.createElement('h2');title.textContent='Revisar conflicto';title.style.fontSize='18px';dialog.appendChild(title);
    const text=document.createElement('p');text.textContent='La copia local no se ha subido. Cargar la central conserva el borrador en el historial local; no sobrescribe la central.';dialog.appendChild(text);
    const area=document.createElement('textarea');area.readOnly=true;area.value=JSON.stringify({modulo:namespace,copiaLocal:local,copiaCentral:remote},null,2);area.style.cssText='box-sizing:border-box;width:100%;height:280px;background:#0d1115;color:#eee';area.setAttribute('aria-label','Comparacion de versiones');dialog.appendChild(area);
    const copy=document.createElement('button');copy.textContent='Exportar ambas';copy.onclick=()=>download({namespace,local,remote,editor:window.ghEditorSnapshot?.()||null});dialog.appendChild(copy);
    const load=document.createElement('button');load.textContent='Conservar copia y cargar central';load.onclick=async()=>{
      if(!confirm('Se conservara la copia local y se cargara la central. El formulario actual se cerrara. ¿Continuar?'))return;
      load.disabled=true;
      try{await bridge.exportDownload();await bridge.keepCopyAndLoadRemote(namespace);location.reload();}catch(error){load.disabled=false;alert(error.message);}
    };dialog.appendChild(load);
    const close=document.createElement('button');close.textContent='Volver';close.onclick=()=>{dialog.close();dialog.remove();};dialog.appendChild(close);
    document.body.appendChild(dialog);dialog.showModal();
  });
  bar.appendChild(group);
  const spacer=document.createElement('div');spacer.setAttribute('aria-hidden','true');document.body.appendChild(spacer);
  function render(){
    const states=[...bridge.states.values()],error=states.find(state=>state.error),pending=states.some(state=>state.state!=='confirmed')||!!bridge.settings?.pending,editor=unsavedEditor();
    status.textContent=error?'No confirmado: '+error.error:pending?'Cambios pendientes de confirmar':editor?'Formulario sin guardar':window.FTSession.writesEnabled?'Guardado central confirmado':'Copia central de solo lectura';
    status.style.color=error?'#ff9090':pending||editor?'#ffca64':'#74dfa1';retry.hidden=!pending||!window.FTSession.writesEnabled;compare.hidden=!pending;
    spacer.style.height=(bar.getBoundingClientRect().height+24)+'px';
  }
  bridge.onStatus=render;render();if(globalThis.ResizeObserver)new ResizeObserver(render).observe(bar);
  bridge.store.health().then(health=>{if(health.lowSpace){const warning=document.createElement('span');warning.textContent='Poco espacio local';warning.style.color='#ffca64';warning.setAttribute('role','status');group.appendChild(warning);}}).catch(()=>{});
  setInterval(render,1000);
}
try{
  await window.FTSession.ready;
  bridge=new RecordBridge({session:()=>window.FTSession,onProgress:loadProgress});bridge.media=new RecordMedia(bridge);bridge.settings=new PrivateSettingsClient(bridge);window.FTRecords=bridge;
  bridge.exportDownload=async()=>download(await bridge.exportCopies(window.ghEditorSnapshot?.()||null));
  await bridge.openAll({includeCatalog:file!=='index.html'});
  if(file!=='index.html'&&bridge.allowed('training_online')){loadMessage('Comprobando configuracion de Consulta...');await bridge.settings.load();}
  bridge.installStorage(localStorage,Storage.prototype);
  window.addEventListener('beforeunload',event=>{if(bridge.pending()){event.preventDefault();event.returnValue='Hay cambios pendientes de confirmar';}});
  loadMessage('Abriendo el modulo...');
  const html=await readResponse('/'+file,{credentials:'same-origin',cache:'no-store',headers:{'X-FT-Prepared':'records-v1'}},response=>{
    if(!response.ok)throw new Error('No se pudo cargar el modulo ('+response.status+')');return response.text();
  });
  loading=false;clearInterval(watchdog);document.open();document.write(html);document.close();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
}catch(error){
  loading=false;clearInterval(watchdog);
  const message=document.getElementById('ftLoadMessage');if(message)message.textContent='No se ha cargado una copia verificada: '+error.message;
  const retry=document.getElementById('ftLoadRetry');if(retry)retry.hidden=false;
  const copy=document.getElementById('ftLoadExport');if(copy){copy.hidden=!bridge;copy.onclick=()=>bridge.exportDownload().catch(error=>alert(error.message));}
  if(bridge){const space=document.createElement('button');space.textContent='Copias y espacio';space.onclick=()=>showStorageDialog(bridge,download);document.querySelector('main')?.appendChild(space);}
}
