import {dataset,commitRecords,sha256} from './records.mjs';
import {sealSettings,openSettings} from './settings-crypto.mjs';
export const STORED_KEY='__stored_on_server__';
export const AI_PROVIDERS=['gemini','groq','anthropic','openrouter','deepseek'];
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export async function loadPrivateSettings(db,id,secret,version=null){
  await dataset(db,id);
  const row=version===null?await db.prepare("SELECT * FROM records WHERE dataset_id=? AND namespace='private_settings' AND record_key='root'").bind(id).first():
    await db.prepare("SELECT * FROM record_versions WHERE dataset_id=? AND namespace='private_settings' AND record_key='root' AND version=?").bind(id,version).first();
  if(!row||row.deleted||await sha256(row.payload)!==row.payload_sha256)fail(503,'Configuracion privada no verificada');
  try{return {version:row.version,value:await openSettings(JSON.parse(row.payload),secret,id)};}catch(_error){fail(503,'No se pudo abrir la configuracion privada; no se ha modificado');}
}
export function publicAiConfig(value){
  const cfg=value?.sections?.__ia_config||{},keys={},models={};
  for(const provider of AI_PROVIDERS){
    const key=cfg.keys?.[provider]||(cfg.provider===provider?cfg.key:'');
    keys[provider]=key?STORED_KEY:'';models[provider]=cfg.models?.[provider]||(cfg.provider===provider?cfg.model:'')||'';
  }
  const provider=AI_PROVIDERS.includes(cfg.provider)?cfg.provider:'gemini';
  return {provider,keys,models,key:keys[provider],model:models[provider],menuRules:typeof cfg.menuRules==='string'?cfg.menuRules:'',maxPasadas:cfg.maxPasadas??0,fallbackOrder:Array.isArray(cfg.fallbackOrder)?cfg.fallbackOrder:AI_PROVIDERS,disabled:Array.isArray(cfg.disabled)?cfg.disabled:[]};
}
function mergeAi(existing,patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||!AI_PROVIDERS.includes(patch.provider))fail(400,'Configuracion de IA invalida');
  const cfg=structuredClone(existing||{});cfg.keys={...cfg.keys};cfg.models={...cfg.models};
  if(cfg.provider&&cfg.key&&!cfg.keys[cfg.provider])cfg.keys[cfg.provider]=cfg.key;
  for(const [provider,key]of Object.entries(patch.keys||{})){
    if(!AI_PROVIDERS.includes(provider)||typeof key!=='string'||key.length>4096)fail(400,'Clave de proveedor invalida');
    if(key&&key!==STORED_KEY)cfg.keys[provider]=key;
  }
  for(const [provider,model]of Object.entries(patch.models||{})){
    if(!AI_PROVIDERS.includes(provider)||typeof model!=='string'||model.length>160||model&&!/^[\w.:/-]+$/.test(model))fail(400,'Modelo invalido');
    cfg.models[provider]=model;
  }
  for(const field of ['disabled','fallbackOrder'])if(patch[field]!==undefined){
    if(!Array.isArray(patch[field])||patch[field].some(provider=>!AI_PROVIDERS.includes(provider))||new Set(patch[field]).size!==patch[field].length)fail(400,'Orden de proveedores invalido');
    cfg[field]=[...patch[field]];
  }
  if(patch.menuRules!==undefined){if(typeof patch.menuRules!=='string'||patch.menuRules.length>30000)fail(400,'Reglas de menu demasiado grandes');cfg.menuRules=patch.menuRules;}
  cfg.provider=patch.provider;cfg.key=cfg.keys[cfg.provider]||'';cfg.model=cfg.models[cfg.provider]||'';cfg.maxPasadas=0;cfg._ts=Date.now();
  return cfg;
}
export async function saveAiSettings(db,id,secret,actorId,request,sessionId=null){
  const {requestId,expectedVersion,cfg}=request||{};
  if(typeof requestId!=='string'||!/^[\w-]{16,80}$/.test(requestId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)fail(400,'Referencia de configuracion invalida');
  const inputHash=await sha256(JSON.stringify({expectedVersion,cfg}));
  async function replay(){
    const prior=await db.prepare('SELECT * FROM write_requests WHERE dataset_id=? AND request_id=?').bind(id,requestId).first();
    if(!prior)return null;
    if(prior.actor_id!==actorId)fail(409,'El reintento pertenece a otra sesion');
    const receipt=JSON.parse(prior.receipt),saved=await loadPrivateSettings(db,id,secret,receipt.records[0]?.version);
    if(saved.value.request?.id!==requestId||saved.value.request?.hash!==inputHash)fail(409,'El reintento contiene otra configuracion');
    return {version:saved.version,cfg:publicAiConfig(saved.value),requestId,replayed:true};
  }
  const prior=await replay();if(prior)return prior;
  const current=await loadPrivateSettings(db,id,secret);
  if(current.version!==expectedVersion)fail(409,'La configuracion cambio en otra sesion; no se ha sobrescrito');
  const value=structuredClone(current.value);value.sections.__ia_config=mergeAi(value.sections.__ia_config,cfg);value.request={id:requestId,hash:inputHash};
  const sealed=await sealSettings(value,secret,id);
  let receipt;
  try{receipt=await commitRecords(db,id,'private_settings',actorId,{datasetId:id,requestId,operations:[{key:'root',expectedVersion,value:sealed}]},sessionId);}
  catch(error){const saved=await replay();if(saved)return saved;throw error;}
  return {version:receipt.records[0].version,cfg:publicAiConfig(value),requestId,replayed:false};
}
