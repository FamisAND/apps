const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode=text=>Uint8Array.from(atob(text),character=>character.charCodeAt(0));
async function key(secret){
  if(typeof secret!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(secret))throw new Error('Clave privada de configuracion no disponible');
  return crypto.subtle.importKey('raw',decode(secret),'AES-GCM',false,['encrypt','decrypt']);
}
export async function sealSettings(value,secret,context){
  const iv=crypto.getRandomValues(new Uint8Array(12)),additionalData=new TextEncoder().encode(context);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},await key(secret),new TextEncoder().encode(JSON.stringify(value)));
  return {format:'ft-private-settings-v1',iv:encode(iv),ciphertext:encode(ciphertext)};
}
export async function openSettings(envelope,secret,context){
  if(envelope?.format!=='ft-private-settings-v1'||typeof envelope.iv!=='string'||typeof envelope.ciphertext!=='string')throw new Error('Configuracion privada incompatible');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv),additionalData:new TextEncoder().encode(context)},await key(secret),decode(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}
