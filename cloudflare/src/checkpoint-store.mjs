import {sha256} from './hash.mjs';

const DB_NAME='full-training-record-checkpoints-v1';
const fault=message=>new Error(message);
export class CheckpointStore {
  constructor({ownerId,indexedDB=globalThis.indexedDB}={}){
    if(typeof ownerId!=='string'||!ownerId||!indexedDB)throw fault('No hay almacenamiento duradero asociado al usuario');
    this.ownerId=ownerId;this.indexedDB=indexedDB;this.heads=new Map();this.database=null;
  }
  key(namespace){
    if(typeof namespace!=='string'||!/^\w+$/.test(namespace))throw fault('Modulo de copia invalido');
    return JSON.stringify([this.ownerId,namespace]);
  }
  async open(){
    if(!this.database)this.database=new Promise((resolve,reject)=>{
      const request=this.indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        db.createObjectStore('entries',{keyPath:'id'}).createIndex('owner','ownerId');
        db.createObjectStore('heads',{keyPath:'key'});
      };
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(fault('Otra pestana bloquea el almacen de copias; no se guardara sin copia'));
      request.onsuccess=()=>resolve(request.result);
    });
    return this.database;
  }
  async get(store,key){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(store,'readonly'),request=transaction.objectStore(store).get(key);
      let value;request.onsuccess=()=>{value=request.result;};
      transaction.oncomplete=()=>resolve(value);
      transaction.onabort=()=>reject(transaction.error||fault('No se pudo leer la copia local'));
    });
  }
  async entry(id){
    const row=await this.get('entries',id);
    if(!row||row.ownerId!==this.ownerId||await sha256(row.payload)!==row.sha256)throw fault('La copia local no supera la verificacion; conservar y revisar');
    const event=JSON.parse(row.payload);
    if(this.key(event.namespace)!==row.key)throw fault('La copia local pertenece a otro modulo');
    return {row,event};
  }
  async state(namespace){
    const head=await this.get('heads',this.key(namespace));
    if(!head){this.heads.set(namespace,null);return null;}
    const current=await this.entry(head.id);
    let base=current.event,pending=null,draft=null;
    if(['pending-write','draft'].includes(base.kind)){
      if(base.kind==='pending-write')pending=base;else draft=base;
      if(!current.row.baseId)throw fault('El pendiente no tiene una copia base recuperable');
      base=(await this.entry(current.row.baseId)).event;
    }
    if(!['verified-load','confirmed-write','unchanged-write','resolved-remote'].includes(base.kind))throw fault('Copia base incompatible; no se sustituira');
    const verified=base.kind==='verified-load'?base:base.base;
    if(!verified||verified.namespace!==namespace||(pending||draft)&&(pending||draft).datasetId!==verified.datasetId)throw fault('Version base incompatible; conservar y revisar');
    this.heads.set(namespace,head.id);
    return {base:structuredClone(verified),pending:structuredClone(pending),draft:structuredClone(draft)};
  }
  async checkpoint(event){
    const namespace=event.namespace,key=this.key(namespace);
    if(!this.heads.has(namespace))await this.state(namespace);
    const previousId=this.heads.get(namespace),previous=previousId?await this.entry(previousId):null;
    const completed=['verified-load','confirmed-write','unchanged-write','resolved-remote'];
    const previousBase=previous&&completed.includes(previous.event.kind)?previousId:previous?.row.baseId;
    const baseEvent=previousBase?(await this.entry(previousBase)).event:null;
    const verifiedBase=baseEvent?.kind==='verified-load'?baseEvent:baseEvent?.base;
    if(event.kind==='verified-load'){
      if(['pending-write','draft'].includes(previous?.event.kind))throw fault('Hay cambios pendientes; no se descarga encima de ellos');
      const signatures=base=>JSON.stringify(base.records.map(([key,row])=>[key,row.version,row.sha256,row.deleted]).sort((a,b)=>a[0].localeCompare(b[0])));
      if(verifiedBase?.datasetId===event.datasetId&&signatures(verifiedBase)===signatures(event)&&JSON.stringify(verifiedBase.value)===JSON.stringify(event.value)){
        const head=await this.get('heads',key);
        if(head?.id!==previousId)throw fault('Otra pestana cambio la copia local; no se sustituira');
        return;
      }
    }else if(event.kind==='draft'){
      if(!verifiedBase||previous?.event.kind==='pending-write'||verifiedBase.datasetId!==event.datasetId||!Object.hasOwn(event,'value'))throw fault('No hay copia base compatible para conservar el borrador');
    }else if(event.kind==='pending-write'){
      if(!verifiedBase||!completed.concat('draft').includes(previous?.event.kind)||verifiedBase.datasetId!==event.datasetId)throw fault('No hay copia base compatible para conservar el guardado');
      if(previous.event.kind==='draft'&&JSON.stringify(previous.event.value)!==JSON.stringify(event.value))throw fault('El guardado no coincide con el borrador conservado');
    }else if(event.kind==='confirmed-write'){
      if(previous?.event.kind!=='pending-write'||previous.event.requestId!==event.requestId||previous.event.datasetId!==event.datasetId||!event.base)throw fault('La confirmacion no corresponde a la copia pendiente');
    }else if(event.kind==='unchanged-write'){
      if(!verifiedBase||previous?.event.kind==='pending-write'||event.datasetId!==verifiedBase.datasetId||!event.base||JSON.stringify(event.base.value)!==JSON.stringify(verifiedBase.value)||previous.event.kind==='draft'&&JSON.stringify(previous.event.value)!==JSON.stringify(verifiedBase.value))throw fault('No se puede descartar un borrador diferente de la base');
    }else if(event.kind==='resolved-remote'){
      if(!['pending-write','draft'].includes(previous?.event.kind)||event.previousId!==previousId||!event.base)throw fault('La copia anterior no esta conservada para resolver el conflicto');
    }else throw fault('Tipo de copia invalido');
    if(['draft','unchanged-write'].includes(event.kind)&&previous?.event.kind===event.kind&&JSON.stringify(previous.event)===JSON.stringify(event)){
      if((await this.get('heads',key))?.id!==previousId)throw fault('Otra pestana cambio la copia local; no se sustituira');
      return;
    }
    const payload=JSON.stringify(event),id=crypto.randomUUID();
    const row={id,key,ownerId:this.ownerId,previousId,baseId:['pending-write','draft'].includes(event.kind)?previousBase:null,
      createdAt:new Date().toISOString(),payload,sha256:await sha256(payload)};
    const db=await this.open();
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction(['entries','heads'],'readwrite'),heads=transaction.objectStore('heads');
      const request=heads.get(key);let mismatch=false;
      request.onsuccess=()=>{
        if((request.result?.id||null)!==previousId){mismatch=true;transaction.abort();return;}
        transaction.objectStore('entries').add(row);
        heads.put({key,id});
      };
      transaction.oncomplete=resolve;
      transaction.onabort=()=>reject(mismatch?fault('Otra pestana cambio la copia local; ambas versiones se conservan'):transaction.error||fault('No se ha confirmado la copia local'));
    });
    // Read back only after transaction completion; a put request alone is not a saved copy.
    const checked=await this.entry(id);
    if(checked.row.sha256!==row.sha256)throw fault('No se pudo verificar la copia recien guardada');
    this.heads.set(namespace,id);
  }
  async exportCopies({allowUnverified=false}={}){
    const db=await this.open();
    const {rows,heads}=await new Promise((resolve,reject)=>{
      const transaction=db.transaction(['entries','heads'],'readonly'),request=transaction.objectStore('entries').index('owner').getAll(this.ownerId),headRequest=transaction.objectStore('heads').getAll();
      let rows,heads;request.onsuccess=()=>{rows=request.result;};headRequest.onsuccess=()=>{heads=headRequest.result.filter(head=>JSON.parse(head.key)[0]===this.ownerId);};
      transaction.oncomplete=()=>resolve({rows,heads});transaction.onabort=()=>reject(transaction.error||fault('Exportacion local no completada'));
    });
    const unverifiedEntryIds=[];
    for(const row of rows)if(await sha256(row.payload)!==row.sha256)unverifiedEntryIds.push(row.id);
    if(unverifiedEntryIds.length&&!allowUnverified)throw fault('Una copia no supera la verificacion; no afirmar que el archivo esta verificado');
    return {format:'ft-record-checkpoints-v1',ownerId:this.ownerId,exportedAt:new Date().toISOString(),entries:rows,heads,verified:!unverifiedEntryIds.length,unverifiedEntryIds};
  }
  async archivePlan(fileText){
    let archive;try{archive=JSON.parse(fileText);}catch(_error){throw fault('El archivo no es una copia JSON valida');}
    if(archive?.format!=='ft-record-checkpoints-v1'||archive.ownerId!==this.ownerId||!Array.isArray(archive.entries)||archive.verified!==true||archive.incomplete)throw fault('La copia no corresponde al usuario o esta incompleta');
    const current=await this.exportCopies(),saved=new Map();
    for(const row of archive.entries){
      if(row.ownerId!==this.ownerId||saved.has(row.id)||typeof row.payload!=='string'||await sha256(row.payload)!==row.sha256)throw fault('El archivo no supera la verificacion de contenido');
      saved.set(row.id,row);
    }
    for(const row of current.entries)if(JSON.stringify(saved.get(row.id))!==JSON.stringify(row))throw fault('Hay copias mas recientes o distintas que no estan en el archivo; exporta de nuevo');
    const protectedIds=new Set(current.heads.map(head=>head.id));
    const byId=new Map(current.entries.map(row=>[row.id,row]));
    // Keep current bases and explicitly preserved conflict copies. Older linked
    // history is recoverable from the verified archive, never silently discarded.
    for(const id of protectedIds){
      const row=byId.get(id);if(!row)throw fault('La copia actual no esta completa; no se archiva');
      const event=JSON.parse(row.payload);
      if(row.baseId)protectedIds.add(row.baseId);
      if(event.kind==='resolved-remote'&&event.previousId)protectedIds.add(event.previousId);
    }
    const removable=current.entries.filter(row=>!protectedIds.has(row.id));
    return {archiveSha256:await sha256(fileText),entries:current.entries,heads:current.heads,ids:removable.map(row=>row.id),bytes:removable.reduce((sum,row)=>sum+new TextEncoder().encode(row.payload).length,0)};
  }
  async archiveOldCopies(fileText,expectedSha256){
    const plan=await this.archivePlan(fileText);
    if(plan.archiveSha256!==expectedSha256)throw fault('El archivo cambio desde la confirmacion; no se archiva');
    if(!plan.ids.length)return {archived:0,bytes:0};
    const db=await this.open();
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction(['entries','heads'],'readwrite'),entries=transaction.objectStore('entries'),heads=transaction.objectStore('heads');
      const rowsRequest=entries.index('owner').getAll(this.ownerId),headsRequest=heads.getAll();let rows,currentHeads,mismatch=false;
      const check=()=>{
        if(!rows||!currentHeads)return;
        const stable=value=>JSON.stringify([...value].sort((a,b)=>(a.id||a.key).localeCompare(b.id||b.key)));
        if(stable(rows)!==stable(plan.entries)||stable(currentHeads)!==stable(plan.heads)){mismatch=true;transaction.abort();return;}
        for(const id of plan.ids)entries.delete(id);
      };
      rowsRequest.onsuccess=()=>{rows=rowsRequest.result;check();};
      headsRequest.onsuccess=()=>{currentHeads=headsRequest.result.filter(head=>JSON.parse(head.key)[0]===this.ownerId);check();};
      transaction.oncomplete=resolve;transaction.onabort=()=>reject(mismatch?fault('Otra pestana cambio las copias; no se ha archivado nada'):transaction.error||fault('No se ha completado el archivado'));
    });
    return {archived:plan.ids.length,bytes:plan.bytes};
  }
  async restoreArchivedCopies(fileText){
    let archive;try{archive=JSON.parse(fileText);}catch(_error){throw fault('Archivo de copia invalido');}
    if(archive?.format!=='ft-record-checkpoints-v1'||archive.ownerId!==this.ownerId||!Array.isArray(archive.entries)||archive.verified!==true)throw fault('Copia incompatible');
    const ids=new Set();
    for(const row of archive.entries){
      const event=JSON.parse(row.payload);
      if(ids.has(row.id)||row.ownerId!==this.ownerId||row.key!==this.key(event.namespace)||await sha256(row.payload)!==row.sha256)throw fault('Copia incompatible o alterada');
      ids.add(row.id);
    }
    const db=await this.open();let restored=0;
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction('entries','readwrite'),entries=transaction.objectStore('entries');let mismatch=false;
      for(const row of archive.entries){const request=entries.get(row.id);request.onsuccess=()=>{
        if(request.result&&JSON.stringify(request.result)!==JSON.stringify(row)){mismatch=true;transaction.abort();return;}
        if(!request.result){entries.add(row);restored++;}
      };}
      transaction.oncomplete=resolve;transaction.onabort=()=>reject(mismatch?fault('Una copia existente es diferente; no se ha sustituido'):transaction.error||fault('Recuperacion local no completada'));
    });
    return {restored,headsChanged:false};
  }
  async health(storage=globalThis.navigator?.storage){
    const db=await this.open(),stats=await new Promise((resolve,reject)=>{
      const transaction=db.transaction('entries','readonly'),request=transaction.objectStore('entries').index('owner').openCursor(this.ownerId);
      let entries=0,historyBytes=0;
      request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;entries++;historyBytes+=new TextEncoder().encode(cursor.value.payload).length;cursor.continue();};
      transaction.oncomplete=()=>resolve({entries,historyBytes});transaction.onabort=()=>reject(transaction.error||fault('No se pudo comprobar el historial local'));
    });let estimate=null,persistent=null;
    try{estimate=await storage?.estimate?.();persistent=await storage?.persisted?.();}catch(_error){}
    const usage=Number.isFinite(estimate?.usage)?estimate.usage:null,quota=Number.isFinite(estimate?.quota)?estimate.quota:null;
    return {...stats,usage,quota,persistent,lowSpace:quota!==null&&usage!==null&&(usage/quota>=0.8||quota-usage<20*1024*1024)};
  }
  async close(){if(this.database)(await this.database).close();this.database=null;}
}
