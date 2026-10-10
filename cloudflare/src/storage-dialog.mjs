export async function showStorageDialog(bridge,download){
  const dialog=document.createElement('dialog');dialog.className='ft-dialog';
  const heading=document.createElement('h2');heading.textContent='Copias locales';heading.style.fontSize='18px';dialog.appendChild(heading);
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Comprobando espacio...';dialog.appendChild(status);
  const stats=document.createElement('div');stats.className='ft-stats';dialog.appendChild(stats);
  const mb=bytes=>(bytes/1024/1024).toFixed(1)+' MB';
  async function refresh(){
    const health=await bridge.store.health();
    stats.replaceChildren();
    for(const [label,value]of [['Historial local',health.entries+' copias / '+mb(health.historyBytes)],['Espacio del navegador',health.quota!==null?mb(health.usage)+' / '+mb(health.quota):'Estimacion no disponible']]){const item=document.createElement('div'),title=document.createElement('span'),number=document.createElement('strong');title.textContent=label;number.textContent=value;item.append(title,number);stats.appendChild(item);}
    status.textContent=health.lowSpace?'Poco espacio disponible':health.persistent===true?'Almacenamiento persistente activo':'Espacio local comprobado';
  }
  const message=document.createElement('p');message.textContent='El archivado conserva la copia actual, su base y los cambios pendientes. No modifica los datos centrales ni el almacenamiento antiguo.';dialog.appendChild(message);
  const actions=document.createElement('div');actions.className='ft-actions';dialog.appendChild(actions);
  const button=(text,action,name)=>{const node=document.createElement('button');node.className='ft-button';if(window.FTSession?.icon&&name)node.append(window.FTSession.icon(name));node.append(document.createTextNode(text));node.onclick=async()=>{node.disabled=true;try{await action();}catch(error){status.textContent=error.message;}finally{node.disabled=false;}};actions.appendChild(node);return node;};
  button('Exportar copia',async()=>{await download(await bridge.exportCopies(window.ghEditorSnapshot?.()||null));},'download');
  function chooseFile(action){
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
    input.onchange=async()=>{try{if(input.files[0])await action(await input.files[0].text());}catch(error){status.textContent=error.message;}};input.click();
  }
  button('Verificar archivo y archivar',async()=>chooseFile(async text=>{
    const plan=await bridge.store.archivePlan(text);
    if(!plan.ids.length){status.textContent='No hay copias antiguas que archivar.';return;}
    if(!confirm('Archivo verificado. Se retiraran '+plan.ids.length+' copias antiguas ('+mb(plan.bytes)+') del nuevo historial local. Quedan conservadas en el archivo seleccionado. Las copias actuales y pendientes no se retiran. ¿Continuar?'))return;
    await bridge.store.archiveOldCopies(text,plan.archiveSha256);await refresh();
  }),'archive');
  button('Recuperar historial de un archivo',async()=>chooseFile(async text=>{
    if(!confirm('Se recuperaran copias historicas sin cambiar la version actual ni subir datos. ¿Continuar?'))return;
    const result=await bridge.store.restoreArchivedCopies(text);await refresh();status.textContent+=' | Recuperadas: '+result.restored;
  }),'restore');
  if(navigator.storage?.persist)button('Solicitar almacenamiento persistente',async()=>{
    const accepted=await navigator.storage.persist();await refresh();if(!accepted)status.textContent+=' | El navegador no concedio la solicitud.';
  },'persist');
  button('Cerrar',async()=>{dialog.close();dialog.remove();},'close').classList.add('ft-close');
  document.body.appendChild(dialog);window.FTIcons?.refresh();dialog.showModal();try{await refresh();}catch(error){status.textContent='No se pudo comprobar el espacio: '+error.message;}
}
