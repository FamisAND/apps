const labels={training:'Full Training',training_online:'Consulta',options:'Opciones',patrimonio:'Patrimonio',facturas:'Facturas',tob_menus_catalog:'Catalogo',__dashboard_config:'Dashboard',private_settings:'Configuracion de Consulta'};
function fields(node){
  if(node?.type==='object')return Object.fromEntries(node.entries||[]);
  if(node?.type==='value'&&node.value&&typeof node.value==='object'&&!Array.isArray(node.value))return Object.fromEntries(Object.entries(node.value).map(([key,value])=>[key,{type:'value',value}]));
  return {};
}
function name(node){const value=fields(node);for(const key of ['nombre','nom','name','activo','titulo','title'])if(typeof value[key]?.value==='string')return value[key].value.slice(0,120);return '';}
function describe(row){
  const parts=row.record_key.split('/').filter(part=>part.startsWith('p:')).map(part=>{try{return decodeURIComponent(part.slice(2));}catch(_){return '';}});
  const path=parts.join(' ').toLowerCase();
  const kind=/medicion|measurement/.test(path)?'Medicion':/anamnes|entrevista/.test(path)?'Entrevista':/menu/.test(path)?'Menu':/rutina|asignacion/.test(path)?'Rutina':/cliente|client/.test(path)?'Cliente':/remesa/.test(path)?'Remesa':/factur/.test(path)?'Factura':/activas|hist/.test(path)?'Operacion':'Datos';
  const current=JSON.parse(row.payload),previous=row.previous_payload?JSON.parse(row.previous_payload):null;
  const before=fields(previous),after=fields(current),changed=Object.keys({...before,...after}).filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key])&&!/^(_|api|key|token|password|secret)/i.test(key)).slice(0,12);
  const action=row.operation==='delete'?'Retirada':row.operation==='restore'?'Recuperacion':row.version===1?'Alta':'Cambio';
  const clientKey=row.record_key.match(/^(.*\/p:(?:clientes|clients)\/i:[^/]+)/)?.[1]||null;
  return {type:kind,action,label:name(current)||name(previous),fields:changed,version:row.version,clientKey};
}
export async function sessionCounts(db,datasetId,ids){
  if(!ids.length)return [];
  const {results}=await db.prepare('SELECT session_id,namespace,count(*) AS saves FROM session_commits WHERE dataset_id=? AND session_id IN ('+ids.map(()=>'?').join(',')+') GROUP BY session_id,namespace').bind(datasetId,...ids).all();
  return results.map(row=>({...row,module:labels[row.namespace]||'Imagenes'}));
}
export async function sessionChanges(db,datasetId,sessionId,before=Number.MAX_SAFE_INTEGER){
  if(!Number.isSafeInteger(before)||before<1)throw Object.assign(new Error('Referencia de actividad invalida'),{status:400});
  const {results:events}=await db.prepare("SELECT s.rowid AS cursor,s.*,json_array_length(w.receipt,'$.records') AS record_count FROM session_commits s JOIN write_requests w ON w.dataset_id=s.dataset_id AND w.request_id=s.request_id WHERE s.dataset_id=? AND s.session_id=? AND s.rowid<? ORDER BY s.rowid DESC LIMIT 11").bind(datasetId,sessionId,before).all();
  const changes=[];
  for(const event of events.slice(0,10)){
    const {results:rows}=await db.prepare('SELECT v.record_key,v.operation,v.version,v.payload,p.payload AS previous_payload FROM record_versions v LEFT JOIN record_versions p ON p.dataset_id=v.dataset_id AND p.namespace=v.namespace AND p.record_key=v.record_key AND p.version=v.version-1 WHERE v.dataset_id=? AND v.request_id=? AND v.namespace=? ORDER BY v.record_key LIMIT 30').bind(datasetId,event.request_id,event.namespace).all();
    // Chunk records and reference containers support an entity; they are not separate user edits.
    const visible=rows.filter(row=>row.record_key!=='root'&&!row.record_key.includes('/c:')&&JSON.parse(row.payload)?.type!=='refs');
    changes.push({at:event.created_at,module:labels[event.namespace]||'Imagenes',items:event.namespace==='private_settings'?[{type:'Configuracion',action:'Cambio',label:'',fields:[],version:rows[0]?.version}]:visible.map(describe),recordCount:event.record_count,additionalRecords:Math.max(0,event.record_count-rows.length)});
  }
  const keys=[...new Set(changes.flatMap(event=>event.items.map(item=>item.clientKey)).filter(Boolean))],names=new Map();
  for(let offset=0;offset<keys.length;offset+=90){const group=keys.slice(offset,offset+90);const {results}=await db.prepare('SELECT record_key,payload FROM records WHERE dataset_id=? AND namespace=? AND record_key IN ('+group.map(()=>'?').join(',')+')').bind(datasetId,'training_online',...group).all();for(const row of results)names.set(row.record_key,name(JSON.parse(row.payload)));}
  for(const event of changes)for(const item of event.items){item.client=names.get(item.clientKey)||'';delete item.clientKey;}
  return {changes,nextCursor:events.length>10?events[9].cursor:null};
}
