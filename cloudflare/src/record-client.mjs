import {sha256} from './hash.mjs';
import {unpackSnapshot,packSnapshot} from './snapshot-codec.mjs';
function failure(message,status){const error=new Error(message);error.status=status;return error;}
async function changedRecords(base,value){
  const operations=[];
  for(const [key,node]of await packSnapshot(value)){
    const previous=base.records.get(key),hash=await sha256(JSON.stringify(node));
    if(!previous||previous.deleted||previous.sha256!==hash)operations.push({key,expectedVersion:previous?.version||0,operation:previous?.deleted?'restore':'put',value:node});
  }
  return operations;
}
async function verifyPending(namespace,base,pending){
  if(!pending||pending.namespace!==namespace||pending.datasetId!==base.datasetId||typeof pending.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(pending.requestId)||!Object.hasOwn(pending,'value')||!Array.isArray(pending.operations)||!pending.operations.length||pending.operations.length>300)throw failure('Copia pendiente incompatible; conservar y revisar',409);
  const expected=await changedRecords(base,pending.value);
  if(JSON.stringify(expected)!==JSON.stringify(pending.operations))throw failure('El borrador pendiente no coincide con sus operaciones; no se enviara',409);
}
async function verifyRecord(record,key){
  if(!record||typeof key!=='string'||!key||record.key!==key||!Number.isSafeInteger(record.version)||record.version<1||typeof record.deleted!=='boolean'||!Object.hasOwn(record,'value')||record.deleted&&record.value!==null||await sha256(JSON.stringify(record.value))!==record.sha256)throw failure('No se ha verificado un registro de la copia',503);
}
export class RecordClient {
  constructor({fetchImpl=globalThis.fetch.bind(globalThis),checkpoint}={}){
    if(typeof checkpoint!=='function')throw new Error('A verified durable checkpoint is required before editing');
    this.fetch=fetchImpl;this.checkpoint=checkpoint;this.bases=new Map();this.pending=new Map();this.busy=new Set();
  }
  async exclusive(namespace,action){
    if(this.busy.has(namespace))throw failure('Ya hay una operacion en curso para este modulo',409);
    this.busy.add(namespace);
    try{return await action();}finally{this.busy.delete(namespace);}
  }
  async response(url,options){
    const response=await this.fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    if(!response.ok){let message='Operacion central rechazada';try{message=(await response.json()).error||message;}catch(_e){}throw failure(message,response.status);}
    return response.json();
  }
  async load(namespace){
    return this.exclusive(namespace,()=>this.loadInternal(namespace));
  }
  async loadInternal(namespace){
    if(this.pending.has(namespace))throw failure('Hay un guardado pendiente de confirmar; no se descarga encima',409);
    const records=new Map();let cursor='',generation=null,datasetId=null;
    do{
      const query=new URLSearchParams({cursor});if(generation!==null)query.set('generation',String(generation));
      const page=await this.response('/api/records/'+encodeURIComponent(namespace)+'?'+query);
      if(generation!==null&&(generation!==page.generation||datasetId!==page.datasetId))throw failure('La copia central cambio durante la descarga',409);
      if(!Number.isSafeInteger(page.generation)||page.generation<0||typeof page.datasetId!=='string'||!page.datasetId||!Array.isArray(page.records))throw failure('Respuesta central invalida',503);
      generation=page.generation;datasetId=page.datasetId;
      for(const record of page.records){
        await verifyRecord(record,record?.key);
        if(records.has(record.key))throw failure('La copia contiene registros duplicados',503);
        records.set(record.key,record);
      }
      const next=page.nextCursor;if(next!==null&&(typeof next!=='string'||next<=cursor))throw failure('Paginacion central invalida',503);cursor=next;
    }while(cursor);
    const value=await unpackSnapshot(new Map([...records].filter(([,record])=>!record.deleted).map(([key,record])=>[key,record.value])));
    await this.checkpoint({kind:'verified-load',namespace,datasetId,generation,records:[...records],value});
    this.bases.set(namespace,{datasetId,generation,records,value});
    return structuredClone(value);
  }
  async save(namespace,value){
    return this.exclusive(namespace,()=>this.saveInternal(namespace,structuredClone(value)));
  }
  async saveInternal(namespace,value){
    if(this.pending.has(namespace))throw failure('Confirma primero el guardado pendiente',409);
    const base=this.bases.get(namespace);if(!base)throw failure('No hay una version base verificada para editar',409);
    const operations=await changedRecords(base,value);
    if(!operations.length){
      await this.checkpoint({kind:'unchanged-write',namespace,datasetId:base.datasetId,base:{...base,namespace,records:[...base.records]}});
      return {unchanged:true};
    }
    if(operations.length>300)throw failure('Esta edicion requiere una importacion controlada; no se guardara parcialmente',413);
    const requestId=crypto.randomUUID(),draft={namespace,requestId,operations,datasetId:base.datasetId,value:structuredClone(value)};
    // Checkpoint must resolve only after storage commit and read-back verification.
    await this.checkpoint({kind:'pending-write',...draft});
    this.pending.set(namespace,draft);
    return this.retryInternal(namespace);
  }
  async retry(namespace){
    return this.exclusive(namespace,()=>this.retryInternal(namespace));
  }
  async retryInternal(namespace){
    const pending=this.pending.get(namespace);if(!pending)throw failure('No hay guardado pendiente',409);
    await verifyPending(namespace,this.bases.get(namespace),pending);
    const receipt=await this.response('/api/records/'+encodeURIComponent(namespace)+'/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({datasetId:pending.datasetId,requestId:pending.requestId,operations:pending.operations})});
    if(receipt.requestId!==pending.requestId||receipt.datasetId!==pending.datasetId||!Array.isArray(receipt.records)||receipt.records.length!==pending.operations.length)throw failure('Confirmacion central invalida; conservar el pendiente',503);
    for(let i=0;i<pending.operations.length;i++){
      const operation=pending.operations[i],record=receipt.records[i];
      if(record.key!==operation.key||record.version!==operation.expectedVersion+1||record.sha256!==await sha256(JSON.stringify(operation.value))||record.deleted)throw failure('Confirmacion central no coincide; conservar el pendiente',503);
    }
    const base=this.bases.get(namespace);
    const records=new Map(base.records);
    for(let i=0;i<pending.operations.length;i++){const operation=pending.operations[i];records.set(operation.key,{...receipt.records[i],value:operation.value,updatedAt:receipt.committedAt});}
    const confirmed={namespace,datasetId:base.datasetId,generation:base.generation,records:[...records],value:structuredClone(pending.value)};
    await this.checkpoint({...pending,receipt,base:confirmed,kind:'confirmed-write'});
    this.bases.set(namespace,{...confirmed,records});this.pending.delete(namespace);
    return receipt;
  }
  async restore(namespace,state){
    return this.exclusive(namespace,async()=>{
      if(this.pending.has(namespace)||this.bases.has(namespace))throw failure('El modulo ya tiene datos cargados; no se sustituiran',409);
      const base=state?.base;
      if(!base||base.namespace!==namespace||typeof base.datasetId!=='string'||!base.datasetId||!Number.isSafeInteger(base.generation)||base.generation<0||!Array.isArray(base.records))throw failure('Copia base local invalida',409);
      const records=new Map();
      for(const [key,record]of base.records){
        await verifyRecord(record,key);
        if(records.has(key))throw failure('Copia base local duplicada',409);
        records.set(key,record);
      }
      const restored=await unpackSnapshot(new Map([...records].filter(([,r])=>!r.deleted).map(([key,r])=>[key,r.value])));
      if(await sha256(JSON.stringify(restored))!==await sha256(JSON.stringify(base.value)))throw failure('La copia base local no coincide con los registros',409);
      const pending=state.pending;
      if(pending)await verifyPending(namespace,{...base,records},pending);
      this.bases.set(namespace,{...structuredClone(base),records});
      if(pending)this.pending.set(namespace,structuredClone(pending));
      return structuredClone(pending?pending.value:base.value);
    });
  }
  async resumePending(pending){
    const copy=structuredClone(pending),namespace=copy?.namespace;
    return this.exclusive(namespace,async()=>{
      const base=this.bases.get(namespace);
      if(!base||this.pending.has(namespace))throw failure('Pendiente incompatible; conservar y revisar',409);
      await verifyPending(namespace,base,copy);
      this.pending.set(namespace,copy);
    });
  }
}
