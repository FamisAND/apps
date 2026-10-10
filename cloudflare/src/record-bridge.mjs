import {RecordClient} from './record-client.mjs';
import {CheckpointStore} from './checkpoint-store.mjs';
import {STORAGE_KEYS,NAMESPACE_MODULE} from './record-layout.mjs';
import {isPhotoNamespace} from './media-format.mjs';
const fault=(message,status=409)=>Object.assign(new Error(message),{status});
const raw=value=>typeof value==='string'?value:JSON.stringify(value);
const parsed=value=>{try{return JSON.parse(value);}catch(_error){return value;}};
export class RecordBridge {
  constructor({session,fetchImpl=globalThis.fetch.bind(globalThis),store,onStatus=()=>{},onProgress=()=>{}}={}){
    if(typeof session!=='function')throw fault('Se requiere una sesion verificada');
    const current=session();if(!current?.active||current.dataMode!=='records'||!current.user?.id)throw fault('El almacenamiento central no esta disponible',423);
    this.session=session;this.ownerId=current.user.id;this.store=store||new CheckpointStore({ownerId:this.ownerId});
    this.fetch=fetchImpl;this.onStatus=onStatus;this.onProgress=onProgress;this.values=new Map();this.shadow=new Map();this.drafts=new Map();this.errors=new Map();this.saving=new Set();this.states=new Map();
    this.client=new RecordClient({fetchImpl,checkpoint:event=>this.store.checkpoint(event),onProgress:event=>this.progress(event)});
  }
  progress(event){try{this.onProgress(event);}catch(_error){}}
  allowed(namespace){const current=this.session(),module=NAMESPACE_MODULE[namespace]||(isPhotoNamespace(namespace)?'training_online':null);return current?.active&&current.user?.id===this.ownerId&&current.dataMode==='records'&&module&&(current.user.role==='admin'||current.user.permissions.includes(module));}
  status(namespace,state,error=null){this.states.set(namespace,{state,error:error?.message||null});try{this.onStatus({namespace,state,error:error?.message||null});}catch(_error){}}
  assertWrite(namespace){
    if(!this.allowed(namespace))throw fault('Sesion o permisos no disponibles; conserva y exporta el borrador',403);
    if(!this.session().writesEnabled)throw fault('Este entorno esta en solo lectura',423);
    if(!this.values.has(namespace)||this.saving.has(namespace)||this.client.pending.has(namespace))throw fault('Hay un guardado pendiente; confirma o exporta antes de seguir');
    if(this.errors.has(namespace))throw this.errors.get(namespace);
  }
  hydrate(namespace,value){
    this.values.set(namespace,structuredClone(value));
    for(const key of STORAGE_KEYS[namespace]||[]){if(Object.hasOwn(value,key))this.shadow.set(key,raw(value[key]));else this.shadow.delete(key);}
  }
  async open(namespace,{allowEmpty=false}={}){
    if(!this.allowed(namespace))throw fault('Modulo no autorizado',403);
    if(this.values.has(namespace))return structuredClone(this.values.get(namespace));
    this.progress({namespace,phase:'local'});
    const stored=await this.store.state(namespace);let value;
    if(stored?.pending||stored?.draft){
      this.progress({namespace,phase:'recover'});
      await this.client.restore(namespace,{base:stored.base,pending:stored.pending});
      value=structuredClone(stored.pending?.value??stored.draft.value);
      this.status(namespace,stored.pending?'pending':'draft');
    }else{value=await this.client.load(namespace,{allowEmpty,cachedBase:stored?.base});this.status(namespace,'confirmed');}
    this.hydrate(namespace,value);return structuredClone(value);
  }
  async openAll({includeCatalog=true}={}){for(const namespace of Object.keys(NAMESPACE_MODULE))if(this.allowed(namespace)&&(includeCatalog||namespace!=='tob_menus_catalog'))await this.open(namespace);}
  setDraft(namespace,value){
    this.assertWrite(namespace);const copy=structuredClone(value),base=this.client.bases.get(namespace);
    this.hydrate(namespace,copy);this.status(namespace,'copying');
    const previous=this.drafts.get(namespace)||Promise.resolve();
    const next=previous.then(()=>this.store.checkpoint({kind:'draft',namespace,datasetId:base.datasetId,value:copy})).then(()=>{
      if(this.drafts.get(namespace)===next)this.status(namespace,'draft');
    }).catch(error=>{this.errors.set(namespace,error);this.status(namespace,'error',error);throw error;});
    this.drafts.set(namespace,next);next.catch(()=>{});return next;
  }
  async waitForDrafts(namespace){const pending=this.drafts.get(namespace);if(pending)await pending;}
  async persistDraft(namespace){
    if(!this.allowed(namespace)||!this.session().writesEnabled||this.saving.has(namespace)||this.client.pending.has(namespace))throw fault('No se puede rehacer la copia local en este estado');
    if(!this.errors.has(namespace))return;
    const base=this.client.bases.get(namespace),value=structuredClone(this.values.get(namespace));
    if(!base||value===undefined)throw fault('Falta la version base; exporta antes de continuar');
    try{
      await this.store.checkpoint({kind:'draft',namespace,datasetId:base.datasetId,value});
      this.errors.delete(namespace);this.drafts.delete(namespace);this.status(namespace,'draft');
    }catch(error){this.errors.set(namespace,error);this.status(namespace,'error',error);throw error;}
  }
  async save(namespace,value=this.values.get(namespace)){
    this.assertWrite(namespace);value=structuredClone(value);await this.waitForDrafts(namespace);this.assertWrite(namespace);
    this.saving.add(namespace);this.status(namespace,'pending');
    try{
      const receipt=await this.client.save(namespace,value);this.hydrate(namespace,value);this.status(namespace,'confirmed');return receipt;
    }catch(error){this.status(namespace,error.status===409?'conflict':'error',error);throw error;}
    finally{this.saving.delete(namespace);}
  }
  async retry(namespace){
    if(!this.allowed(namespace)||!this.session().writesEnabled)throw fault('La sesion no permite reintentar el guardado',423);
    if(this.saving.has(namespace))throw fault('Guardado en curso');
    this.saving.add(namespace);this.status(namespace,'pending');
    try{const result=await this.client.retry(namespace);this.hydrate(namespace,this.client.bases.get(namespace).value);this.status(namespace,'confirmed');return result;}
    catch(error){this.status(namespace,error.status===409?'conflict':'error',error);throw error;}
    finally{this.saving.delete(namespace);}
  }
  async peek(namespace){
    if(!this.allowed(namespace))throw fault('Modulo no autorizado',403);
    const reader=new RecordClient({fetchImpl:this.fetch,checkpoint:async()=>{}});
    return reader.load(namespace);
  }
  async refresh(namespace){
    if(!this.allowed(namespace)||this.states.get(namespace)?.state!=='confirmed'||this.saving.has(namespace))throw fault('Hay cambios locales conservados; no se recargara encima');
    const value=await this.client.load(namespace);this.hydrate(namespace,value);this.status(namespace,'confirmed');return value;
  }
  async update(namespace,updater){
    await this.open(namespace);this.assertWrite(namespace);
    const value=await updater(structuredClone(this.values.get(namespace)));
    await this.setDraft(namespace,value);await this.save(namespace,value);return structuredClone(value);
  }
  async keepCopyAndLoadRemote(namespace){
    if(!this.allowed(namespace)||this.saving.has(namespace))throw fault('El modulo no esta disponible para resolver el conflicto');
    await this.waitForDrafts(namespace);
    const state=await this.store.state(namespace);
    if(!state?.pending&&!state?.draft)throw fault('No hay un pendiente conservado que resolver');
    const reader=new RecordClient({fetchImpl:this.fetch,checkpoint:async()=>{}});const value=await reader.load(namespace),base=reader.bases.get(namespace);
    await this.store.checkpoint({kind:'resolved-remote',namespace,previousId:this.store.heads.get(namespace),datasetId:base.datasetId,base:{...base,namespace,records:[...base.records]}});
    this.client.bases.set(namespace,base);this.client.pending.delete(namespace);this.drafts.delete(namespace);this.errors.delete(namespace);this.hydrate(namespace,value);this.status(namespace,'confirmed');return value;
  }
  pending(){return [...this.states.values()].some(value=>value.state!=='confirmed');}
  saveNotice(message){
    const error=[...this.states.values()].find(value=>value.error);
    return error?'NO confirmado: '+error.error:this.pending()?'Cambio pendiente de confirmacion central':message;
  }
  async exportCopies(editor=null){
    let saved;
    try{saved=await this.store.exportCopies({allowUnverified:true});}
    catch(error){saved={format:'ft-record-checkpoints-v1',ownerId:this.ownerId,entries:[],verified:false,incomplete:true,storageError:error.message};}
    return {...saved,volatileDrafts:[...this.values].map(([namespace,value])=>({namespace,value})),editor:structuredClone(editor),privateSettingsDraft:structuredClone(this.settings?.pending||null),centralConfirmation:false};
  }
  installStorage(storage,prototype){
    const original={get:prototype.getItem,set:prototype.setItem,remove:prototype.removeItem,clear:prototype.clear},bridge=this;
    const namespaces=new Map(Object.entries(STORAGE_KEYS).flatMap(([namespace,keys])=>keys.map(key=>[key,namespace])));
    prototype.getItem=function(key){key=String(key);return this===storage&&namespaces.has(key)?bridge.shadow.get(key)??null:original.get.call(this,key);};
    prototype.setItem=function(key,value){
      key=String(key);value=String(value);const namespace=namespaces.get(key);
      if(this!==storage||!namespace)return original.set.call(this,key,value);
      if(bridge.shadow.get(key)===value)return;
      bridge.assertWrite(namespace);
      const section=structuredClone(bridge.values.get(namespace));section[key]=parsed(value);bridge.setDraft(namespace,section).catch(()=>{});
    };
    prototype.removeItem=function(key){if(this===storage&&namespaces.has(String(key)))throw fault('No se elimina una clave completa de datos');return original.remove.call(this,key);};
    prototype.clear=function(){if(this===storage)throw fault('No se limpia el almacenamiento existente');return original.clear.call(this);};
    return original;
  }
}
