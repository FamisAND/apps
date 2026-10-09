export const STORED_KEY='__stored_on_server__';
export class PrivateSettingsClient {
  constructor(bridge){this.bridge=bridge;this.ai=null;this.version=null;this.pending=null;}
  async response(path,options){
    const response=await this.bridge.fetch(path,{credentials:'same-origin',cache:'no-store',...options});
    if(!response.ok){let message='Configuracion no confirmada';try{message=(await response.json()).error||message;}catch(_error){}throw Object.assign(new Error(message),{status:response.status});}
    return response.json();
  }
  async load(){
    if(this.pending)throw new Error('Hay una configuracion pendiente; reintenta o conserva el formulario antes de recargar');
    const result=await this.response('/api/settings/ai');this.ai=result.cfg;this.version=result.version;return structuredClone(this.ai);
  }
  async save(cfg){
    if(this.bridge.session().user.role!=='admin'||!this.bridge.session().writesEnabled)throw new Error('Solo administracion puede cambiar la configuracion en modo escritura');
    if(this.pending&&JSON.stringify(this.pending.cfg)!==JSON.stringify(cfg))throw new Error('Confirma primero la configuracion pendiente');
    this.pending||={requestId:crypto.randomUUID(),expectedVersion:this.version,cfg:structuredClone(cfg)};
    const result=await this.response('/api/settings/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(this.pending)});
    if(result.requestId!==this.pending.requestId)throw new Error('Confirmacion de configuracion incompatible');
    this.ai=result.cfg;this.version=result.version;this.pending=null;return structuredClone(this.ai);
  }
  async call(messages,cfg){
    return (await this.response('/api/ai/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:cfg.provider,model:cfg.model,key:cfg.key===STORED_KEY?undefined:cfg.key,messages})})).text;
  }
}
