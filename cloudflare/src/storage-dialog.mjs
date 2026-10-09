export async function showStorageDialog(bridge,download){
  const dialog=document.createElement('dialog');dialog.style.cssText='box-sizing:border-box;width:min(620px,94vw);max-height:85vh;overflow:auto;padding:24px;border:1px solid #777;border-radius:4px;background:#15191e;color:#fff;font:14px sans-serif';
  const heading=document.createElement('h2');heading.textContent='Copias locales';heading.style.fontSize='18px';dialog.appendChild(heading);
  const status=document.createElement('p');status.setAttribute('role','status');dialog.appendChild(status);
  const mb=bytes=>(bytes/1024/1024).toFixed(1)+' MB';
  async function refresh(){
    const health=await bridge.store.health();
    status.textContent=health.entries+' copias: '+mb(health.historyBytes)+(health.quota!==null?' | Navegador: '+mb(health.usage)+' de '+mb(health.quota):' | Cuota no disponible')+(health.lowSpace?' | Poco espacio disponible':'')+(health.persistent===true?' | Almacenamiento persistente':'');
  }
  const message=document.createElement('p');message.textContent='El archivado conserva la copia actual, su base y los cambios pendientes. No modifica los datos centrales ni el almacenamiento antiguo.';dialog.appendChild(message);
  const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px';dialog.appendChild(actions);
  const button=(text,action)=>{const node=document.createElement('button');node.textContent=text;node.style.padding='8px 12px';node.onclick=async()=>{node.disabled=true;try{await action();}catch(error){status.textContent=error.message;}finally{node.disabled=false;}};actions.appendChild(node);return node;};
  button('Exportar copia',async()=>{await download(await bridge.exportCopies(window.ghEditorSnapshot?.()||null));});
  function chooseFile(action){
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
    input.onchange=async()=>{try{if(input.files[0])await action(await input.files[0].text());}catch(error){status.textContent=error.message;}};input.click();
  }
  button('Verificar archivo y archivar',async()=>chooseFile(async text=>{
    const plan=await bridge.store.archivePlan(text);
    if(!plan.ids.length){status.textContent='No hay copias antiguas que archivar.';return;}
    if(!confirm('Archivo verificado. Se retiraran '+plan.ids.length+' copias antiguas ('+mb(plan.bytes)+') del nuevo historial local. Quedan conservadas en el archivo seleccionado. Las copias actuales y pendientes no se retiran. ¿Continuar?'))return;
    await bridge.store.archiveOldCopies(text,plan.archiveSha256);await refresh();
  }));
  button('Recuperar historial de un archivo',async()=>chooseFile(async text=>{
    if(!confirm('Se recuperaran copias historicas sin cambiar la version actual ni subir datos. ¿Continuar?'))return;
    const result=await bridge.store.restoreArchivedCopies(text);await refresh();status.textContent+=' | Recuperadas: '+result.restored;
  }));
  if(navigator.storage?.persist)button('Solicitar almacenamiento persistente',async()=>{
    const accepted=await navigator.storage.persist();await refresh();if(!accepted)status.textContent+=' | El navegador no concedio la solicitud.';
  });
  button('Cerrar',async()=>{dialog.close();dialog.remove();});
  document.body.appendChild(dialog);dialog.showModal();try{await refresh();}catch(error){status.textContent='No se pudo comprobar el espacio: '+error.message;}
}
