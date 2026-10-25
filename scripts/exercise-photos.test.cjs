const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),L=require('../exercise-library.js');
test('all published movements have two real JPEGs with unique IDs',async()=>{
  const sharp=require('../cloudflare/node_modules/sharp');
  assert.equal(L.entries.length,58);assert.equal(new Set(L.entries.map(x=>x.id)).size,58);
  for(const e of L.entries){assert.equal(e.images.length,2);for(const file of e.images){assert.match(file,/^exercise-[a-z0-9-]+-(start|end)\.jpg$/);const bytes=fs.readFileSync(path.join(root,file));assert.equal(bytes.readUInt16BE(0),0xffd8);const meta=await sharp(bytes).metadata();assert.ok(meta.width>=250&&meta.height>=150,file);}}
});
test('every original BIIO exercise and circuit component has explicit illustrations',()=>{
  const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'biio-source.js'),'utf8'),c);const source=vm.runInContext('TOB_BIIO_SOURCE',c);
  for(const blocks of Object.values(source))for(const routine of Object.values(blocks))for(const en of routine.entrenos)for(const e of en.ejercicios){
    const names=e.tipo==='circuito'?e.circuitoLineas:[e.nombre];
    for(const name of names){const before=JSON.stringify(e);assert.ok(L.resolve(name)||L.referenceIllustrations(name).length,name);assert.equal(JSON.stringify(e),before);}
  }
});
test('every photograph is protected by the Consulta module allowlist',async()=>{
  const {FILE_MODULE}=await import('../cloudflare/src/policy.mjs');
  assert.equal(FILE_MODULE['exercise-photos.js'],'training_online');
  for(const e of L.entries)for(const src of e.images)assert.equal(FILE_MODULE[src],'training_online',src);
});
test('alternatives stay separate and unknown variants never match by substring',()=>{
  assert.equal(L.resolve('DOMINADAS').id,'pull-up');assert.equal(L.resolve('DOMINADAS SUPINAS').id,'chin-up');
  assert.equal(L.resolve('LAT MACHINE SUPINA').id,'supinated-lat-pulldown');
  for(const name of ['REMO','PRESS CON MANCUERNAS','DEAD CURL ( BICEPS )','AB ROLL PULL DOWN','PESO MUERTO RUMANO MANCUERNA'])assert.equal(L.resolve(name),null);
  assert.ok(L.referenceNote('DEAD CURL ( BICEPS )'));assert.ok(L.referenceNote('AB ROLL PULL DOWN'));
  assert.deepEqual(L.referenceIllustrations('DOMINADAS (o LAT MACHINE)').map(x=>x.id),['lat-pulldown','pull-up']);
  assert.equal(L.byId('seated-leg-curl'),null,'Unclear machine image must not be published');
});
test('photo catalog startup never accesses browser storage',()=>{
  const c={localStorage:new Proxy({},{get(){throw Error('Storage read');}}),indexedDB:new Proxy({},{get(){throw Error('IndexedDB read');}})};vm.createContext(c);
  for(const file of ['exercise-photos.js','exercise-library.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
  assert.equal(c.FTExercises.entries.length,58);
});
