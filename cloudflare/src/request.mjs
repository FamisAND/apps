export async function readResponse(url,{fetchImpl=globalThis.fetch.bind(globalThis),timeoutMs=30000,...options}={},consume=response=>response.json()){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw new Error('Invalid request deadline');
  const controller=new AbortController(),parent=options.signal;
  const cancel=()=>controller.abort(parent.reason);
  if(parent?.aborted)cancel();else parent?.addEventListener('abort',cancel,{once:true});
  let timer,timedOut=false;
  const timeoutError=()=>Object.assign(new Error('La respuesta central ha tardado demasiado. No se ha confirmado ningun cambio; conserva las copias y reintenta.'),{status:504});
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(timeoutError());},timeoutMs);});
  try{
    return await Promise.race([Promise.resolve().then(()=>fetchImpl(url,{...options,signal:controller.signal})).then(consume),deadline]);
  }catch(error){if(timedOut)throw timeoutError();throw error;}
  finally{clearTimeout(timer);parent?.removeEventListener('abort',cancel);}
}
