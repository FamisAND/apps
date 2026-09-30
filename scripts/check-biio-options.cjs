const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path');
const root=path.resolve(__dirname,'..');
const noop=()=>{};
const doc={addEventListener:noop,getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],readyState:'loading'};
const storage=new Map();
const ctx=vm.createContext({console,document:doc,window:{addEventListener:noop},navigator:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:noop,clearTimeout:noop,setInterval:noop,Date,Intl,Blob,URL,TextEncoder,Uint8Array,crypto:require('crypto').webcrypto});
for(const file of ['biio-source.js','biio-support.js','consulta.js','options-dates.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
const run=s=>vm.runInContext(s,ctx);
assert.equal(run(`optionDTE('2026-10-16','2026-09-26')`),20);
for(const [a,b,n] of [['2026-10-16','2026-10-16',0],['2026-10-15','2026-10-16',1],['2026-09-25','2026-09-28',3],['2026-03-28','2026-03-30',2],['2026-10-24','2026-10-26',2],['2026-03-07','2026-03-09',2]])assert.equal(run(`optionDTE('${b}','${a}')`),n);
assert.equal(run(`calendarDayIndex('2026-02-30')`),null);
assert.equal(run(`marketISODate(new Date('2026-09-26T00:15:00+02:00'))`),'2026-09-25');
assert.equal(run(`marketISODate(new Date('2026-09-26T04:15:00Z'))`),'2026-09-26');
run(`setOptionsValuationDate('2026-09-25')`);
assert.equal(run(`optionDTE('2026-10-16')`),21);
run(`marketISODate(new Date('2026-09-26T04:15:00Z'))`);
assert.equal(run(`optionDTE('2026-10-16')`),21); // No automatic rollover in an open page.
run(`setOptionsValuationDate('2026-09-26')`);
assert.equal(run(`optionDTE('2026-10-16')`),20);
assert.equal(run(`optionDTE('2026-09-25')`),-1);
assert.equal(run(`tobParseResult('20,5','kg')`),20.5);
for(const [v,f] of [['20 kg','kg'],['30 reps','reps'],['-1','kg'],['1.5','reps'],['1e2','kg'],['--','kg']])assert.throws(()=>run(`tobParseResult(${JSON.stringify(v)},'${f}')`));
const templates=run('tobBuildSeedPlantillas()');assert.equal(templates.length,16);
let plans=0;
for(const t of templates){
  for(const en of t.entrenos)for(const ej of en.ejercicios)for(const p of Object.values(ej.planByMicro)){assert.ok(p.label || p.series===0);assert.ok(Number.isInteger(p.series));plans++;}
}
const reac=templates.find(t=>t.categoria==='Reacondicionamiento'&&t.sexo==='H');
assert.deepEqual(Array.from(reac.entrenos[0].ejercicios[0].planByMicro[3].repsTarget),['12','10','8']);
assert.equal(reac.entrenos[0].ejercicios[0].planByMicro[5].pausa,`2'00"`);
// Reordering must preserve matching IDs, never steal a different exercise's ID.
run(`globalThis.old=[{id:'A',letra:'A',ejercicios:[{id:'keep',nombre:'PRESS BANCA'},{id:'unrelated',nombre:'CUSTOM'}]}];globalThis.migrated=tobBuildOfficialEntrenos(tobBiioDataFor('Reacondicionamiento','H'),old)`);
assert.equal(run(`migrated[0].ejercicios.find(e=>e.nombre==='PRESS BANCA').id`),'keep');
assert.notEqual(run(`migrated[0].ejercicios[0].id`),'unrelated');
fs.writeFileSync(process.argv[2] || path.join(require('os').tmpdir(),'biio-templates.json'),JSON.stringify(templates,null,2));
// Run the real load/migration on a populated older-schema copy.
run(`
 tobRenderClientes=()=>{};tobRenderPlantillas=()=>{};
 const pl=tobBuildSeedPlantillas()[0];pl._planV=5;
 const a={id:'a',plantillaId:pl.id,notas:'conservar',rutina:{numMicro:6,_planV:5,entrenos:JSON.parse(JSON.stringify(pl.entrenos))},iteraciones:[{id:'it',numero:1,sesiones:{1:{A:{fecha:'2026-01-02',aerobica:{tipo:'andar',tiempo:'30'},ejs:{}}}}}]};
 a.rutina.entrenos[0].ejercicios.forEach(ej=>{a.iteraciones[0].sesiones[1].A.ejs[ej.id]={series:[{kg:42.5,reps:12}],comentario:'nota preservada'};});
 a.iteraciones[0].sesiones[1].A.ejs.orphan={series:[{kg:71,reps:7}],comentario:'no perder'};
 globalThis.before=JSON.parse(JSON.stringify(a));
 localStorage.setItem(TOB_KEY,JSON.stringify({plantillas:[pl],clientes:[{id:'c',nombre:'Prueba',asignaciones:[a],mediciones:[{peso:73}]}]}));
 tobLoad();globalThis.after=tobDB.clientes[0].asignaciones[0];
`);
assert.equal(run('JSON.stringify(before.iteraciones)'),run('JSON.stringify(after.iteraciones)'));
assert.equal(run('after._planMigrationBackup.rutina._planV'),5);
assert.ok(run('after._migrationUnmapped.length')>0);
assert.equal(run('tobDB.clientes[0].mediciones[0].peso'),73);
run(`globalThis.legacy={iteraciones:[{id:'i',sesiones:{1:{A:{ejs:{e:{series:[{kg:'20 kg',reps:'12'},{kg:'30,5',reps:'1.2'}],comentario:'Original'}}}}}}]};tobNormalizeLegacyResults(legacy);`);
assert.equal(run('legacy._numericBackup.length'),2);
assert.equal(run('legacy.iteraciones[0].sesiones[1].A.ejs.e.series[1].kg'),30.5);
assert.ok(run(`legacy.iteraciones[0].sesiones[1].A.ejs.e.comentario.includes('Original')`));
// Syntax audit of every top-level JS and every inline HTML script.
let scripts=0;
for(const f of fs.readdirSync(root)){
 if(f.endsWith('.js')){new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});scripts++;}
 if(f.endsWith('.html'))for(const match of fs.readFileSync(path.join(root,f),'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   if(/type=["'](?:application\/ld\+json|importmap)/.test(match[1])||!match[2].trim())continue;
   new vm.Script(match[2],{filename:f});scripts++;
 }
}
console.log(JSON.stringify({templates:templates.length,plans,scripts,tests:'passed'}));
