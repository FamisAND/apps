import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../cutover.js',import.meta.url),'utf8');
function environment(origin,protocol,hostname){
  class Storage{constructor(){this.values=new Map();}getItem(key){return this.values.get(key)??null;}setItem(key,value){this.values.set(key,value);}removeItem(key){this.values.delete(key);}clear(){this.values.clear();}}
  class IDBDatabase{transaction(stores,mode){return {stores,mode};}}
  class IDBFactory{open(){return {transaction:{abort(){this.aborted=true;}},addEventListener(name,callback){this[name]=callback;}};}deleteDatabase(){return true;}}
  const localStorage=new Storage(),sessionStorage=new Storage(),listeners=[];
  localStorage.setItem('ft_v4','original');
  const window={},context={window,location:{origin,protocol,hostname,pathname:'/apps/consulta.html'},Storage,IDBDatabase,IDBFactory,localStorage,sessionStorage,document:{readyState:'loading',addEventListener:(...args)=>listeners.push(args)}};
  vm.runInNewContext(source,context);
  return {...context,listeners};
}
for(const [label,origin,protocol,hostname]of [['GitHub','https://famisand.github.io','https:','famisand.github.io'],['file','null','file:','']]){
  test(label+' legacy origin preserves values and refuses storage changes, upgrades and sync',async()=>{
    const env=environment(origin,protocol,hostname);
    assert.equal(await env.window.FTLegacyReadOnly.sync.ready,false);
    for(const action of [()=>env.localStorage.setItem('ft_v4','changed'),()=>env.localStorage.removeItem('ft_v4'),()=>env.localStorage.clear()])assert.throws(action,/solo lectura/);
    assert.equal(env.localStorage.getItem('ft_v4'),'original');
    env.sessionStorage.setItem('session-only','allowed');assert.equal(env.sessionStorage.getItem('session-only'),'allowed');
    const db=new env.IDBDatabase();assert.equal(db.transaction('kv','readonly').mode,'readonly');assert.throws(()=>db.transaction('kv','readwrite'),/solo lectura/);
    const factory=new env.IDBFactory(),request=factory.open('existing');request.upgradeneeded();assert.equal(request.transaction.aborted,true);assert.throws(()=>factory.deleteDatabase('existing'),/solo lectura/);
    await assert.rejects(env.window.FTLegacyReadOnly.sync.updateSection(),/solo lectura/);
    assert.equal(env.listeners.length,1);
  });
}
for(const [label,origin,hostname]of [['Cloudflare','https://full-training-private.sergiofamisr.workers.dev','full-training-private.sergiofamisr.workers.dev'],['isolated fixture','http://127.0.0.1','127.0.0.1']]){
  test(label+' leaves the central storage facade and application startup untouched',()=>{
    const env=environment(origin,origin.startsWith('https')?'https:':'http:',hostname);
    assert.equal(env.window.FTLegacyReadOnly,undefined);env.localStorage.setItem('ft_v4','allowed');assert.equal(env.localStorage.getItem('ft_v4'),'allowed');assert.equal(env.listeners.length,0);
  });
}
