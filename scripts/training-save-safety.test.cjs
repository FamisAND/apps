const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const text=fs.readFileSync(path.join(__dirname,'..','full_training.html'),'utf8');
function definition(name){const start=text.indexOf('function '+name+'('),end=text.indexOf('\nfunction ',start+1);return text.slice(start,end);}
function fixture(){
  const initial={clients:[{id:'c1'}],services:[{id:'s1'}],months:{'2026-10':{entries:[{id:'e1'}],gastos:[],stockSales:[]}}};
  let raw=JSON.stringify(initial),quota=false;
  const notices=[],badge={textContent:''};
  const context=vm.createContext({window:{},document:{getElementById:()=>badge},
    localStorage:{getItem:()=>raw,setItem:(_key,value)=>{if(quota)throw Object.assign(new Error('synthetic quota'),{name:'QuotaExceededError'});raw=value;}},
    toast:(message,type)=>notices.push({message,type}),updateExportBtn(){},setTimeout(){}});
  vm.runInContext("const SK='ft_v4';let db={},ftStoredRaw=null,ftSaveFailed=false;",context);
  vm.runInContext(definition('load')+definition('save'),context);
  return {context,initial,notices,badge,raw:()=>raw,quota:()=>quota=true,allowSave:()=>quota=false,otherEdit:()=>raw='newer data'};
}
test('loading Full Training never seeds, assigns IDs, or writes storage',()=>{
  const f=fixture(),before=f.raw();assert.equal(vm.runInContext('load()',f.context),true);
  assert.equal(f.raw(),before);assert.equal(vm.runInContext('JSON.stringify(db)',f.context),before);
});
test('stale Full Training editor cannot overwrite another tab',()=>{
  const f=fixture();vm.runInContext('load()',f.context);f.otherEdit();
  assert.throws(()=>vm.runInContext('db.clients[0].note="draft";save()',f.context),/Otra ventana/);
  assert.equal(f.raw(),'newer data');assert.equal(vm.runInContext('ftSaveFailed',f.context),true);
});
test('quota error stops success callbacks and keeps existing stored values',()=>{
  const f=fixture();vm.runInContext('load()',f.context);const before=f.raw();f.quota();
  assert.throws(()=>vm.runInContext('db.clients[0].note="draft";save();window.closedForm=true;',f.context),/synthetic quota/);
  assert.equal(f.raw(),before);assert.equal(f.context.window.closedForm,undefined);
  assert.equal(f.badge.textContent,'NO guardado');assert.ok(f.notices.at(-1).message.includes('Almacenamiento lleno'));
});
test('Full Training initializes only after access and sync have completed',()=>{
  assert.ok(text.includes('Promise.all([trainingAccessReady,GitHubSync.ready])'));
  assert.ok(!text.includes('// INIT\nload();'));
});

test('retrying a failed remittance save never duplicates draft entries',()=>{
  const f=fixture();vm.runInContext('load()',f.context);f.quota();
  const nodes={en_client:{value:'c1'},en_paid:{value:'pendiente'},entryErr:{textContent:''},
    entryLines:{children:[{querySelector:selector=>({value:{'.entry-svc':'s1','.entry-trainer':'t1','.entry-price':'37','.entry-recurring':'0'}[selector]})}]}};
  let ids=0,closed=0;
  Object.assign(f.context,{structuredClone,editEntryId:null,curKey:()=> '2026-10',ensureMonth(){},uid:()=> 'draft-'+(++ids),
    closeModal:()=>closed++,renderRemesas(){}});
  f.context.document.getElementById=id=>nodes[id]||f.badge;
  vm.runInContext(definition('saveEntry'),f.context);
  assert.equal(vm.runInContext('saveEntry()',f.context),false);
  assert.equal(vm.runInContext('saveEntry()',f.context),false);
  assert.equal(vm.runInContext("db.months['2026-10'].entries.length",f.context),1);
  assert.equal(closed,0);f.allowSave();
  assert.equal(vm.runInContext('saveEntry()',f.context),true);
  assert.equal(JSON.parse(f.raw()).months['2026-10'].entries.length,2);assert.equal(closed,1);
});
