(async()=>{
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const raw=fs.readFileSync(process.argv[2],'utf8'),before=JSON.parse(raw),storage=new Map([['tob_online_v2',raw]]),noop=()=>{};
const ctx=vm.createContext({console,document:{readyState:'loading',addEventListener:noop,getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},window:{addEventListener:noop},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:noop,clearTimeout:noop,setInterval:noop,Date,Intl,crypto:require('crypto').webcrypto});
for(const file of ['biio-source.js','biio-support.js','consulta.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),ctx);
await vm.runInContext('tobLoadNotice=()=>{};tobBackupDatabase=async raw=>{globalThis.backup=raw;};tobRenderClientes=()=>{};tobRenderPlantillas=()=>{};tobLoad()',ctx);
const after=JSON.parse(vm.runInContext('JSON.stringify(tobDB)',ctx));
assert.equal(vm.runInContext('backup',ctx),raw);
let assignments=0,iterations=0,unmapped=0,records=0;
for(const c of before.clientes){
 const n=after.clientes.find(x=>x.id===c.id);assert.ok(n);
 for(const [k,v] of Object.entries(c))if(k!=='asignaciones')assert.deepStrictEqual(n[k],v);
 assert.equal(n.asignaciones?.length,c.asignaciones?.length);
 for(const a of c.asignaciones||[]){
  assignments++; const b=n.asignaciones.find(x=>x.id===a.id);assert.ok(b);
  for(const [k,v]of Object.entries(a))if(!['rutina','iteraciones'].includes(k))assert.deepStrictEqual(b[k],v);
  // Valid historic results must remain byte-for-byte equal; invalid numbers must have exact backup.
  if(!b._numericBackup?.length)assert.deepStrictEqual(b.iteraciones,a.iteraciones);
  else assert.deepStrictEqual(b._planMigrationBackup.iteraciones,a.iteraciones);
  iterations+=(a.iteraciones||[]).length;unmapped+=(b._migrationUnmapped||[]).length;
  for(const it of a.iteraciones||[])for(const entries of Object.values(it.sesiones||{}))for(const ses of Object.values(entries))records+=Object.keys(ses.ejs||{}).length;
 }
}
for(const [k,v] of Object.entries(before))if(!['clientes','plantillas'].includes(k))assert.deepStrictEqual(after[k],v);
const once=JSON.stringify(after);await vm.runInContext('tobLoad()',ctx);assert.equal(vm.runInContext('JSON.stringify(tobDB)',ctx),once);
console.log(JSON.stringify({clients:before.clientes.length,assignments,iterations,exerciseRecords:records,unmapped,backupExact:true,idempotent:true,preserved:true,bytesBefore:raw.length,bytesAfter:once.length}));

})().catch(e=>{console.error(e);process.exit(1)});
