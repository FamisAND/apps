import {sha256} from './hash.mjs';
export const isPhotoNamespace=namespace=>/^recipe_photo_[a-f0-9]{64}$/.test(namespace);
export async function photoNamespace(id){
  if(!(typeof id==='string'&&id.length>0)&&!(typeof id==='number'&&Number.isFinite(id)))throw new Error('ID de foto invalido');
  return 'recipe_photo_'+await sha256(JSON.stringify([typeof id,id]));
}
export async function photoValue(id,dataUrl){
  await photoNamespace(id);
  if(dataUrl===null)return {id,dataUrl:null,sha256:null,bytes:0};
  if(typeof dataUrl!=='string'||dataUrl.length>2*1024*1024||!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]*={0,2}$/.test(dataUrl))throw new Error('Formato o tamano de foto no admitido; conserva el original');
  const binary=atob(dataUrl.slice(dataUrl.indexOf(',')+1)),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  if(!bytes.length)throw new Error('La foto esta vacia');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
  return {id,dataUrl,sha256:hash,bytes:bytes.length};
}
export async function verifyPhoto(id,value){
  if(value===null)return null;
  if(value?.id!==id)throw new Error('La foto pertenece a otra receta');
  const checked=await photoValue(id,value.dataUrl);
  if(checked.sha256!==value.sha256||checked.bytes!==value.bytes)throw new Error('La foto no supera la verificacion');
  return value.dataUrl;
}
