const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {test} = require('node:test');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'consulta.js'), 'utf8');

function definition(text, name) {
  const start = text.indexOf('function '+name+'(');
  assert.ok(start >= 0);
  const next = text.indexOf('\nfunction ', start+1);
  return text.slice(start, next < 0 ? undefined : next);
}

function fixture(text = source, actualSave = true) {
  const cli = {id:'synthetic-client', mediciones:[]};
  const nodes = {
    tobMedFecha:{value:'2026-10-08'}, tobMedPes:{value:'70'},
    tobMedEstatura:{value:'170'}, tobMedNotas:{value:'Synthetic test'},
    tobMedEdadModo:{value:''}, tobMedicionModalBg:{dataset:{editId:''}}
  };
  let raw='original', fail=true, id=0;
  const results = {closed:0, rendered:0, messages:[], badges:[]};
  const context = vm.createContext({
    window:{}, console:{error(){}},
    TOB_KEY:'tob_online_v2', TOB_MED_PLECS:[], TOB_MED_PERIM:[],
    tobDB:{clientes:[cli]}, tobCurrentFichaId:cli.id,
    document:{getElementById:id=>nodes[id]},
    localStorage:{getItem:()=>raw,setItem:(_key,value)=>{
      if(fail) throw Object.assign(new Error('synthetic quota'),{name:'QuotaExceededError'});
      raw=value;
    }},
    tobBadge:text=>results.badges.push(text),
    tobToast:(message,type)=>results.messages.push({message,type}),
    tobUid:()=> 'synthetic-measurement-'+(++id),
    tobCloseMedicionModal:()=>results.closed++,
    tobRenderFicha:()=>results.rendered++,
    tobSave:()=>false
  });
  vm.runInContext('let tobStoredRaw="original", tobSaveFailed=false;', context);
  if(actualSave) vm.runInContext(definition(text,'tobSave'),context);
  vm.runInContext(definition(text,'tobSaveMedicion'),context);
  return {context,cli,nodes,results,allowSave:()=>{fail=false;},changeStored:()=>{raw='other-tab';},raw:()=>raw};
}

test('previously published code confirms success even when measurement save returns false',()=>{
  const published=execFileSync('git',['show','abfd1307090877b940b73b19c7dc98fcf5170a51:consulta.js'],{cwd:root,encoding:'utf8',maxBuffer:5_000_000});
  const f=fixture(published,false);
  vm.runInContext('tobSaveMedicion()',f.context);
  assert.equal(f.results.closed,1);
  assert.ok(f.results.messages.some(x=>x.type==='green'));
});

test('quota failure keeps the form and measurement draft; retry never duplicates it',()=>{
  const f=fixture();
  assert.equal(vm.runInContext('tobSaveMedicion()',f.context),false);
  assert.equal(f.results.closed,0);
  assert.equal(f.results.rendered,0);
  assert.equal(f.raw(),'original');
  assert.ok(f.results.messages.at(-1).message.includes('NO estan guardados'));
  assert.equal(f.cli.mediciones.length,1);
  const id=f.cli.mediciones[0].id;
  assert.equal(vm.runInContext('tobSaveMedicion()',f.context),false);
  assert.equal(f.cli.mediciones.length,1);
  f.allowSave();
  assert.equal(vm.runInContext('tobSaveMedicion()',f.context),true);
  assert.equal(f.cli.mediciones.length,1);
  assert.equal(f.cli.mediciones[0].id,id);
  assert.equal(f.results.closed,1);
  assert.equal(JSON.parse(f.raw()).clientes[0].mediciones[0].id,id);
  assert.equal(vm.runInContext('tobSaveFailed',f.context),false);
});

test('stale editor is rejected without a success notice or overwriting newer storage',()=>{
  const f=fixture();
  f.changeStored();
  assert.equal(vm.runInContext('tobSaveMedicion()',f.context),false);
  assert.equal(f.raw(),'other-tab');
  assert.equal(f.results.closed,0);
  assert.equal(vm.runInContext('tobSaveFailed',f.context),true);
});

test('failed save triggers the existing leave-page guard even outside the menu',()=>{
  const start=source.indexOf("window.addEventListener('beforeunload', e => {");
  const end=source.indexOf('\n});',start)+4;
  let handler;
  vm.runInNewContext(source.slice(start,end),{
    window:{addEventListener:(_name,fn)=>handler=fn},
    tobSaveFailed:true,tobMcIsDirty:()=>false
  });
  const event={preventDefault(){this.prevented=true;}};
  handler(event);
  assert.equal(event.prevented,true);
  assert.equal(event.returnValue,'');
});
