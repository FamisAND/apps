const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../routine-support.js'),L=require('../exercise-library.js');
test('calendar rejects impossible dates and preserves full years',()=>{
  assert.equal(R.fullDate('31/02/2026'),null);assert.equal(R.fullDate('29/02/2024'),'2024-02-29');
  assert.equal(R.fullDate('29/02/2026'),null);assert.equal(R.shortDate('2026-10-08'),'08/10');
  assert.equal(R.resolveDate('08/10',{existing:'2023-10-08',start:'2026-10-01'}),'2023-10-08');
});
test('anchored dates cross December without assuming the current year',()=>{
  assert.equal(R.resolveDate('02/01',{start:'2026-12-29',previous:'2026-12-30'}),'2027-01-02');
  assert.equal(R.resolveDate('30/12',{start:'2026-12-29',next:'2027-01-02'}),'2026-12-30');
  assert.throws(()=>R.resolveDate('02/01'),/año/);assert.throws(()=>R.resolveDate('31/02',{start:'2026-01-01'}));
  assert.throws(()=>R.resolveDate('05/12',{start:'2026-12-29'}),/ambiguos/);
});
test('base plans, unknown fields and other micros/iterations stay unchanged',()=>{
  const ej={id:'e',nombre:'SQUAT',source:{cell:'C8'},planByMicro:{1:{series:3,repsTarget:['15','12','10'],pausa:'90',porcentaje:'60%',custom:42},3:{series:3,repsTarget:['12','10','8'],pausa:'105',porcentaje:'70%'}}};
  const it={id:'i',sesiones:{}},before=JSON.stringify(ej);
  const desired={nombre:'Prensa 45°',subtitle:'',plan:{...R.basePlan(ej,3),pausa:'120'}};
  const patch=R.patchFor(ej,3,desired,it,'A');it.sesiones[3]={A:{ejs:{e:{prescripcion:patch}}}};
  assert.equal(R.effective(ej,3,it,'A').nombre,'Prensa 45°');assert.equal(R.effective(ej,3,it,'A').plan.porcentaje,'70%');
  assert.equal(R.effective(ej,1,it,'A').nombre,'SQUAT');assert.equal(R.effective(ej,3,{sesiones:{}},'A').nombre,'SQUAT');
  assert.equal(JSON.stringify(ej),before);assert.deepEqual(patch.plan,{pausa:'120'});
});
test('substitution never relabels completed results and circuits keep identity',()=>{
  const ej={id:'e',nombre:'Squat'},it={sesiones:{1:{A:{ejs:{e:{series:[{kg:30,reps:10}]}}}}}};
  assert.throws(()=>R.patchFor(ej,1,{nombre:'Prensa',plan:{}},it,'A'),/resultados/);
  assert.throws(()=>R.patchFor({...ej,tipo:'circuito'},2,{nombre:'Otro',plan:{}},it,'A'),/circuito/);
});
test('conservative aliases distinguish materials and alternatives',()=>{
  assert.equal(L.resolve('CURL CON BÁRRA').id,'barbell-curl');assert.equal(L.resolve('Box squat').id,'box-squat');
  for(const name of ['SQUAT','REMO','REMO O SEAL ROW','DOMINADAS O LAT MACHINE','PESO MUERTO RUMANO MANCUERNA','PRESS CON MANCUERNAS'])assert.equal(L.resolve(name),null);
  const aliases={[L.normalize('Remo propio')]:'chest-supported-row'};
  assert.equal(L.resolve('REMO PROPIO',aliases).id,'chest-supported-row');
});
test('reference alternatives have labeled illustrations without changing exercise identity',()=>{
  assert.equal(L.resolve('REMO o SEAL ROW'),null);assert.equal(L.referenceIllustration('REMO o SEAL ROW').id,'chest-supported-row');
  assert.equal(L.resolve('DOMINADAS (o LAT MACHINE)'),null);assert.equal(L.referenceIllustration('DOMINADAS (o LAT MACHINE)').id,'lat-pulldown');
  assert.equal(L.resolve('REMO'),null);assert.equal(L.referenceIllustration('REMO').id,'bent-over-barbell-row');
  assert.equal(L.resolve('DOMINADAS').id,'pull-up');assert.equal(L.referenceIllustration('DOMINADAS'),null);
});
