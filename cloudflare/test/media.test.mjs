import {test} from 'node:test';
import assert from 'node:assert/strict';
import {photoNamespace,photoValue,verifyPhoto,isPhotoNamespace} from '../src/media-format.mjs';
import {RecordMedia} from '../src/media-client.mjs';
import {RecordClient} from '../src/record-client.mjs';
import {packSnapshot} from '../src/snapshot-codec.mjs';
import {sha256} from '../src/hash.mjs';
const image='data:image/png;base64,iVBORw0KGgo=';
test('photo identity preserves ID types and binary image checksums',async()=>{
  assert.notEqual(await photoNamespace(12),await photoNamespace('12'));
  assert.equal(isPhotoNamespace(await photoNamespace('recipe-a')),true);
  const value=await photoValue('a',image);assert.equal(value.bytes,8);assert.equal(await verifyPhoto('a',value),image);
  await assert.rejects(()=>verifyPhoto('b',value),/otra receta/);
  await assert.rejects(()=>verifyPhoto('a',{...value,sha256:'wrong'}),/verificacion/);
  await assert.rejects(()=>photoValue('a','data:image/svg+xml;base64,PHN2Zz4='),/Formato/);
  await assert.rejects(()=>photoNamespace({id:'a'}),/ID/);
  assert.equal(await verifyPhoto('a',await photoValue('a',null)),null);
});
test('new photos have an explicit empty base, while missing business records fail closed',async()=>{
  const events=[],client=new RecordClient({fetchImpl:async()=>Response.json({datasetId:'fixture',generation:0,records:[],nextCursor:null}),checkpoint:async event=>events.push(event)});
  const namespace=await photoNamespace('new');assert.equal(await client.load(namespace,{allowEmpty:true}),null);
  const restarted=new RecordClient({checkpoint:async()=>{}});assert.equal(await restarted.restore(namespace,{base:events[0]}),null);
  await assert.rejects(()=>client.load('training_online',{allowEmpty:true}),/Solo las fotos/);
  await assert.rejects(()=>client.load('training_online'),/Missing/);
});
test('reading a central photo is lazy and never writes a local checkpoint or uploads',async()=>{
  const value=await photoValue('a',image),records=[];
  for(const [key,node]of await packSnapshot(value))records.push({key,version:1,value:node,sha256:await sha256(JSON.stringify(node)),deleted:false});
  let calls=0,localReads=0;
  const bridge={allowed:()=>true,values:new Map(),store:{state:async()=>{localReads++;return null;}},fetch:async(url,options)=>{
    assert.equal(options.method,undefined);assert.match(url,/recipe_photo_/);calls++;return Response.json({datasetId:'fixture',generation:0,records,nextCursor:null});
  }};
  const media=new RecordMedia(bridge);assert.equal(calls,0);assert.equal(await media.get('a'),image);assert.equal(await media.get('a'),image);assert.equal(calls,1);assert.equal(localReads,1);
  bridge.allowed=()=>false;await assert.rejects(()=>media.get('a'),/autorizadas/);
});
