import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FILE_MODULE,canAccess} from '../src/policy.mjs';
import {packSnapshot,unpackSnapshot} from '../src/snapshot-codec.mjs';
test('routine guides and helpers require Consulta permission',()=>{
  for(const file of ['routine-support.js','routine-ui.js','routine-pdf.js','exercise-library.js','exercise-box-squat-start.jpg','exercise-lat-pulldown-end.jpg'])assert.equal(FILE_MODULE[file],'training_online');
  assert.equal(canAccess({role:'user',active:true,permissions:['funding']},FILE_MODULE['exercise-box-squat-start.jpg']),false);
});
test('optional session prescriptions round-trip without rewriting plans or other iterations',async()=>{
  const value={tob_online_v2:{clientes:[{id:'c',asignaciones:[{id:'a',rutina:{entrenos:[{id:'A',ejercicios:[{id:'e',nombre:'Box squat',planByMicro:{1:{series:3},3:{series:4,porcentaje:'70%',sourceCells:['M2']}}}]}]},iteraciones:[{id:'i',sesiones:{}},{id:'j',sesiones:{}}]}]}],plantillas:[{id:'p',custom:'preserve'}]}};
  const before=await packSnapshot(value),changed=structuredClone(value),db=changed.tob_online_v2;
  db.clientes[0].asignaciones[0].iteraciones[0].sesiones={3:{A:{ejs:{e:{prescripcion:{plan:{pausa:'120'}}}}}}};db.exerciseAliases={'box squat':'box-squat'};
  const after=await packSnapshot(changed);assert.deepEqual(await unpackSnapshot(after),changed);
  // The bridge still parses the same localStorage key; the codec isolates identified records.
  assert.deepEqual(Object.keys(changed),['tob_online_v2']);assert.notDeepEqual(after,before);
  const touched=[...after].filter(([key,v])=>JSON.stringify(v)!==JSON.stringify(before.get(key))).map(([key])=>key);
  assert.equal(touched.length,2);assert.ok(touched.includes('root'));assert.ok(touched.some(key=>key.endsWith('/p:iteraciones/i:s:i')));
  const round=(await unpackSnapshot(after)).tob_online_v2,original=value.tob_online_v2;
  assert.deepEqual(round.clientes[0].asignaciones[0].rutina,original.clientes[0].asignaciones[0].rutina);
  assert.deepEqual(round.clientes[0].asignaciones[0].iteraciones[1],original.clientes[0].asignaciones[0].iteraciones[1]);assert.deepEqual(round.plantillas,original.plantillas);
});
