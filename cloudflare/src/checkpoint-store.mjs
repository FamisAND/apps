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
    const rows=await new Promise((resolve,reject)=>{
      const transaction=db.transaction('entries','readonly'),request=transaction.objectStore('entries').index('owner').getAll(this.ownerId);
      let result;request.onsuccess=()=>{result=request.result;};
      transaction.oncomplete=()=>resolve(result);transaction.onabort=()=>reject(transaction.error||fault('Exportacion local no completada'));
    });
    const unverifiedEntryIds=[];
    for(const row of rows)if(await sha256(row.payload)!==row.sha256)unverifiedEntryIds.push(row.id);
    if(unverifiedEntryIds.length&&!allowUnverified)throw fault('Una copia no supera la verificacion; no afirmar que el archivo esta verificado');
    return {format:'ft-record-checkpoints-v1',ownerId:this.ownerId,exportedAt:new Date().toISOString(),entries:rows,verified:!unverifiedEntryIds.length,unverifiedEntryIds};
  }
  async close(){if(this.database)(await this.database).close();this.database=null;}
}
