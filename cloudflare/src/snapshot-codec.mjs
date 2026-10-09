import {sha256} from './hash.mjs';
export const CODEC_VERSION=1;
const LIMIT=64*1024;
const encoder=new TextEncoder();
const idKey=id=>(typeof id==='number'?'n:':'s:')+encodeURIComponent(String(id));
function identified(array){
  if(!Array.isArray(array)||!array.length)return false;
  const seen=new Set();
  for(const item of array){
    if(!item||typeof item!=='object'||Array.isArray(item)||!Object.hasOwn(item,'id'))return false;
    if(!(typeof item.id==='string'&&item.id.length>0)&&!(typeof item.id==='number'&&Number.isFinite(item.id)))return false;
    const key=idKey(item.id);if(seen.has(key))return false;seen.add(key);
  }
  return true;
}
export async function packSnapshot(value){
  const records=new Map(),hasRefs=new WeakMap();
  function containsIds(node){
    if(!node||typeof node!=='object')return false;
    if(hasRefs.has(node))return hasRefs.get(node);
    const result=identified(node)||Object.values(node).some(containsIds);hasRefs.set(node,result);return result;
  }
  async function put(key,node){
    const raw=JSON.stringify(node);
    if(encoder.encode(raw).length>LIMIT){
      const hash=await sha256(raw),keys=[];
      for(let i=0;i<raw.length;i+=12000){
        const chunkKey=key+'/c:'+hash+':'+i/12000;
        records.set(chunkKey,{type:'chunk',text:raw.slice(i,i+12000)});keys.push(chunkKey);
      }
      records.set(key,{type:'chunks',keys,sha256:hash});
    }else records.set(key,node);
    return key;
  }
  async function encode(node,path){
    if(identified(node)){
      const keys=[];
      for(const item of node){const key=path+'/i:'+idKey(item.id);await put(key,await encode(item,key));keys.push(key);}
      return {type:'refs',keys};
    }
    if(!containsIds(node))return {type:'value',value:node};
    if(Array.isArray(node))return {type:'array',items:await Promise.all(node.map((item,i)=>encode(item,path+'/a:'+i)))};
    const entries=[];
    for(const [key,item]of Object.entries(node))entries.push([key,await encode(item,path+'/p:'+encodeURIComponent(key))]);
    return {type:'object',entries};
  }
  await put('root',await encode(value,'root'));
  return records;
}
export async function unpackSnapshot(records){
  const map=records instanceof Map?records:new Map(records),visiting=new Set();
  async function record(key){
    if(!map.has(key)||visiting.has(key))throw new Error('Missing or circular snapshot record: '+key);
    visiting.add(key);
    try{
      const node=map.get(key);
      if(node?.type==='chunks'){
        let raw='';
        for(const part of node.keys){const chunk=map.get(part);if(chunk?.type!=='chunk')throw new Error('Missing snapshot chunk');raw+=chunk.text;}
        if(await sha256(raw)!==node.sha256)throw new Error('Snapshot chunk checksum mismatch');
        return await decode(JSON.parse(raw));
      }
      return await decode(node);
    }finally{visiting.delete(key);}
  }
  async function decode(node){
    switch(node?.type){
      case 'value':return structuredClone(node.value);
      case 'refs':{const values=[];for(const key of node.keys)values.push(await record(key));return values;}
      case 'array':{const values=[];for(const item of node.items)values.push(await decode(item));return values;}
      case 'object':{const entries=[];for(const [key,item]of node.entries)entries.push([key,await decode(item)]);return Object.fromEntries(entries);}
      default:throw new Error('Unknown snapshot codec node');
    }
  }
  return record('root');
}
