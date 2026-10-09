import {RecordClient} from './record-client.mjs';
import {photoNamespace,photoValue,verifyPhoto} from './media-format.mjs';
export class RecordMedia {
  constructor(bridge){this.bridge=bridge;this.cache=new Map();}
  async get(id){
    const namespace=await photoNamespace(id),bridge=this.bridge;
    if(!bridge.allowed(namespace))throw new Error('Fotos no autorizadas');
    if(bridge.values.has(namespace))return verifyPhoto(id,bridge.values.get(namespace));
    if(!this.cache.has(namespace)){
      const reader=new RecordClient({fetchImpl:bridge.fetch,checkpoint:async()=>{}});
      const promise=(async()=>{
        const local=await bridge.store.state(namespace);
        if(local?.draft||local?.pending){await bridge.open(namespace,{allowEmpty:true});return verifyPhoto(id,bridge.values.get(namespace));}
        return verifyPhoto(id,await reader.load(namespace,{allowEmpty:true}));
      })().catch(error=>{this.cache.delete(namespace);throw error;});
      this.cache.set(namespace,promise);
    }
    return this.cache.get(namespace);
  }
  async put(id,dataUrl){
    const namespace=await photoNamespace(id),value=await photoValue(id,dataUrl),bridge=this.bridge;
    await bridge.open(namespace,{allowEmpty:true});
    await bridge.setDraft(namespace,value);await bridge.save(namespace,value);this.cache.delete(namespace);
    return true;
  }
  async remove(id){return this.put(id,null);}
  async keys(){
    const catalog=this.bridge.values.get('tob_menus_catalog');
    return (catalog?.recetas||[]).filter(recipe=>recipe._fotoLocal).map(recipe=>recipe.id);
  }
}
