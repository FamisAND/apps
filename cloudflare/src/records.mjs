import {sha256} from './hash.mjs';
export {sha256} from './hash.mjs';
const MAX_PAYLOAD=96*1024;
const MAX_OPERATIONS=300;
const encoder=new TextEncoder();
function fail(status,message){const error=new Error(message);error.status=status;throw error;}
export function validKey(key){return typeof key==='string'&&key.length>0&&key.length<=2048&&!/[\u0000-\u001f]/.test(key);}
export async function dataset(db,id,write=false){
  if(!db||!id)fail(503,'Almacenamiento central no activado');
  const row=await db.prepare('SELECT * FROM datasets WHERE id=?').bind(id).first();
  if(!row||!['verified','active'].includes(row.status))fail(503,'Copia central no verificada');
  if(write&&row.status!=='active')fail(423,'Copia central en modo solo lectura');
  return row;
}
function publicRecord(row){return {key:row.record_key,version:row.version,value:JSON.parse(row.payload),sha256:row.payload_sha256,deleted:!!row.deleted,actorId:row.actor_id,updatedAt:row.updated_at};}
async function generation(db,id){return (await db.prepare('SELECT COALESCE(MAX(rowid),0) AS generation FROM write_requests WHERE dataset_id=?').bind(id).first()).generation;}
export async function listRecords(db,id,namespace,cursor='',expectedGeneration=null){
  await dataset(db,id);
  if(cursor&&!validKey(cursor))fail(400,'Cursor invalido');
  const start=await generation(db,id);
  if(expectedGeneration!==null&&(!Number.isSafeInteger(expectedGeneration)||expectedGeneration<0))fail(400,'Version de lectura invalida');
  if(expectedGeneration!==null&&expectedGeneration!==start)fail(409,'Los datos cambiaron durante la carga; vuelve a leer la copia completa');
  const {results}=await db.prepare('SELECT record_key,payload_bytes FROM records WHERE dataset_id=? AND namespace=? AND record_key>? ORDER BY record_key LIMIT 201').bind(id,namespace,cursor).all();
  if(!results.length){if(await generation(db,id)!==start)fail(409,'Los datos cambiaron durante la carga');return {datasetId:id,generation:start,records:[],nextCursor:null};}
  let count=0,bytes=0;
  for(const row of results){if(count===200||(count&&bytes+row.payload_bytes>384*1024))break;count++;bytes+=row.payload_bytes;}
  const last=results[count-1].record_key;
  const {results:rows}=await db.prepare('SELECT * FROM records WHERE dataset_id=? AND namespace=? AND record_key>? AND record_key<=? AND (SELECT COALESCE(MAX(rowid),0) FROM write_requests WHERE dataset_id=?)=? ORDER BY record_key').bind(id,namespace,cursor,last,id,start).all();
  if(await generation(db,id)!==start)fail(409,'Los datos cambiaron durante la carga; no se devuelve una copia mezclada');
  return {datasetId:id,generation:start,records:rows.map(publicRecord),nextCursor:results.length>count?last:null};
}
export async function recordHistory(db,id,namespace,key,before=Number.MAX_SAFE_INTEGER){
  await dataset(db,id);
  if(!validKey(key)||!Number.isSafeInteger(before)||before<1)fail(400,'Referencia invalida');
  const {results}=await db.prepare('SELECT *,created_at AS updated_at FROM record_versions WHERE dataset_id=? AND namespace=? AND record_key=? AND version<? ORDER BY version DESC LIMIT 9').bind(id,namespace,key,before).all();
  const rows=results.slice(0,8);
  return {records:rows.map(publicRecord),beforeVersion:results.length>8?rows.at(-1).version:null};
}
export async function commitRecords(db,id,namespace,actorId,value){
  await dataset(db,id,true);
  const {requestId,operations}=value||{};
  if(value?.datasetId!==id)fail(409,'El conjunto activo cambio; no se ha guardado sobre otra copia');
  if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)||!Array.isArray(operations)||!operations.length||operations.length>MAX_OPERATIONS)fail(400,'Peticion de guardado invalida');
  const keys=new Set(),prepared=[];
  for(const operation of operations){
    const {key,expectedVersion,operation:action='put'}=operation||{};
    if(!validKey(key)||keys.has(key)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion>=Number.MAX_SAFE_INTEGER||!['put','delete','restore'].includes(action))fail(400,'Operacion invalida');
    keys.add(key);
    if(action==='delete'&&expectedVersion===0)fail(400,'No se puede retirar un registro inexistente');
    if(action!=='delete'&&!Object.hasOwn(operation,'value'))fail(400,'Falta el contenido');
    const payload=JSON.stringify(action==='delete'?null:operation.value);
    if(typeof payload!=='string'||encoder.encode(payload).length>MAX_PAYLOAD)fail(413,'Registro demasiado grande; dividir antes de guardar');
    prepared.push({key,expectedVersion,action,payload,hash:await sha256(payload)});
  }
  const hash=await sha256(JSON.stringify({namespace,prepared}));
  async function replay(){
    const saved=await db.prepare('SELECT * FROM write_requests WHERE dataset_id=? AND request_id=?').bind(id,requestId).first();
    if(!saved)return null;
    if(saved.actor_id!==actorId||saved.request_sha256!==hash)fail(409,'Identificador de reintento reutilizado con otros datos');
    return JSON.parse(saved.receipt);
  }
  const existing=await replay();if(existing)return {...existing,replayed:true};
  const at=new Date().toISOString();
  const receipt={datasetId:id,requestId,committedAt:at,records:prepared.map(op=>({key:op.key,version:op.expectedVersion+1,sha256:op.hash,deleted:op.action==='delete'}))};
  // D1 batch is transactional: the revision trigger aborts the entire request on any stale record.
  const statements=[db.prepare('INSERT INTO write_requests VALUES(?,?,?,?,?,?)').bind(id,requestId,actorId,hash,JSON.stringify(receipt),at)];
  // Nine rows use 99 bound parameters, below D1's 100-parameter limit.
  for(let offset=0;offset<prepared.length;offset+=9){
    const group=prepared.slice(offset,offset+9),args=[];
    for(const op of group)args.push(id,namespace,op.key,op.expectedVersion+1,op.action,op.payload,op.hash,Number(op.action==='delete'),actorId,requestId,at);
    statements.push(db.prepare('INSERT INTO record_versions VALUES '+group.map(()=>'(?,?,?,?,?,?,?,?,?,?,?)').join(',')).bind(...args));
  }
  try{await db.batch(statements);}catch(error){
    const replayed=await replay();if(replayed)return {...replayed,replayed:true};
    const message=String(error.message||error);
    if(/stale-record|restore-required|not-deleted/.test(message))fail(409,'El registro cambio en otra sesion; no se ha sobrescrito ningun dato');
    if(/dataset-read-only|unverified-request/.test(message))fail(423,'Escrituras suspendidas; conserva los cambios pendientes');
    throw error;
  }
  const verified=await replay();
  if(!verified)fail(503,'No se pudo verificar la confirmacion; reintenta con el mismo identificador');
  return {...verified,replayed:false};
}
