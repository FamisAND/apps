import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {RecordBridge} from '../src/record-bridge.mjs';
import {packSnapshot} from '../src/snapshot-codec.mjs';
import {listRecords,commitRecords,sha256} from '../src/records.mjs';
class Copies {
  constructor(){this.saved=[];this.current=new Map();this.heads=new Map();this.fail=false;}
  async state(namespace){return structuredClone(this.current.get(namespace)||null);}
  async checkpoint(event){
    if(this.fail&&event.kind==='draft')throw new Error('Synthetic storage quota');
    this.saved.push(structuredClone(event));const state=this.current.get(event.namespace)||{};
    if(event.kind==='verified-load')this.current.set(event.namespace,{base:event});
    else if(event.kind==='draft')this.current.set(event.namespace,{base:state.base,draft:event});
    else if(event.kind==='pending-write')this.current.set(event.namespace,{base:state.base,pending:event});
    else this.current.set(event.namespace,{base:event.base});
    this.heads.set(event.namespace,String(this.saved.length));
  }
  async exportCopies(){return {entries:structuredClone(this.saved)};}
}
async function fixture(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../business-migrations/0001_records.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run('bridge-fixture','staging','synthetic',1,'2026-10-08');
  const original={tob_online_v2:{clientes:[{id:'a',peso:60},{id:'b',peso:70}]}};
  for(const [key,value]of await packSnapshot(original)){
    const raw=JSON.stringify(value);db.prepare('INSERT INTO record_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('bridge-fixture','training_online',key,1,'import',raw,await sha256(raw),0,'import',null,'2026-10-08');
  }
  db.exec("UPDATE datasets SET status='active'");
  function prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}
  const binding={prepare,async batch(statements){db.exec('BEGIN');try{for(const statement of statements)await statement.run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}};
  let lose=false,posts=0;
  async function fetchImpl(url,options){
    const request=new URL(url,'https://fixture.invalid');
    try{
      if(options.method==='POST'){
        posts++;const result=await commitRecords(binding,'bridge-fixture','training_online','admin',JSON.parse(options.body));
        if(lose){lose=false;throw new TypeError('Synthetic lost response');}return Response.json(result);
      }
      return Response.json(await listRecords(binding,'bridge-fixture','training_online',request.searchParams.get('cursor')||'',request.searchParams.has('generation')?Number(request.searchParams.get('generation')):null));
    }catch(error){if(!error.status)throw error;return Response.json({error:error.message},{status:error.status});}
  }
  const session={active:true,dataMode:'records',writesEnabled:true,user:{id:'admin',role:'admin',permissions:[]}};
  const make=(store=new Copies())=>new RecordBridge({session:()=>session,fetchImpl,store});
  return {db,original,session,make,get posts(){return posts;},set lose(value){lose=value;}};
}
test('the bridge requires a verified session and can never infer admin from a local flag',()=>{
  for(const session of [{active:false,dataMode:'records',user:{id:'admin',role:'admin'}},{active:true,dataMode:'legacy',user:{id:'admin',role:'admin'}},{active:true,dataMode:'records',user:{role:'admin'}}])assert.throws(()=>new RecordBridge({session:()=>session}),{status:423});
});
test('a draft survives reopening without replacing it with the central copy',async()=>{
  const f=await fixture();try{
    const copies=new Copies(),bridge=f.make(copies),value=await bridge.open('training_online');value.tob_online_v2.clientes[0].peso=61;
    await bridge.setDraft('training_online',value);assert.equal(f.posts,0);
    const reopened=f.make(copies);assert.deepEqual(await reopened.open('training_online'),value);assert.equal(reopened.states.get('training_online').state,'draft');
    await reopened.save('training_online');assert.deepEqual(await f.make().open('training_online'),value);assert.equal(reopened.pending(),false);
  }finally{f.db.close();}
});
test('the compatibility facade leaves old localStorage keys untouched and bypasses its quota',async()=>{
  const f=await fixture();try{
    class Storage {constructor(){this.data=new Map([['tob_online_v2','original local data']]);}getItem(key){return this.data.get(key)??null;}setItem(){throw new Error('Synthetic localStorage quota');}removeItem(key){this.data.delete(key);}clear(){this.data.clear();}}
    const storage=new Storage(),bridge=f.make();await bridge.open('training_online');bridge.installStorage(storage,Storage.prototype);
    const value=structuredClone(f.original.tob_online_v2);value.clientes[0].peso=61;storage.setItem('tob_online_v2',JSON.stringify(value));
    assert.equal(JSON.parse(storage.getItem('tob_online_v2')).clientes[0].peso,61);await bridge.waitForDrafts('training_online');
    assert.equal(storage.data.get('tob_online_v2'),'original local data');assert.throws(()=>storage.clear());assert.throws(()=>storage.removeItem('tob_online_v2'));
    await bridge.save('training_online');assert.equal(f.posts,1);
  }finally{f.db.close();}
});
test('failed durable copying prevents transmission and keeps the volatile draft exportable',async()=>{
  const f=await fixture();try{
    const store=new Copies(),bridge=f.make(store),value=await bridge.open('training_online');store.fail=true;value.tob_online_v2.clientes[0].peso=61;
    await assert.rejects(()=>bridge.setDraft('training_online',value),/quota/);await assert.rejects(()=>bridge.save('training_online'),/quota/);
    assert.equal(f.posts,0);assert.equal(bridge.pending(),true);assert.equal((await bridge.exportCopies()).volatileDrafts[0].value.tob_online_v2.clientes[0].peso,61);
  }finally{f.db.close();}
});
test('a lost reply survives reopening and confirms with the original request ID',async()=>{
  const f=await fixture();try{
    const store=new Copies(),bridge=f.make(store),value=await bridge.open('training_online');value.tob_online_v2.clientes[0].peso=61;await bridge.setDraft('training_online',value);f.lose=true;
    await assert.rejects(()=>bridge.save('training_online'),/lost response/);const id=bridge.client.pending.get('training_online').requestId;
    const reopened=f.make(store);await reopened.open('training_online');assert.equal((await reopened.retry('training_online')).requestId,id);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM write_requests').get().n,1);assert.equal(reopened.pending(),false);
  }finally{f.db.close();}
});

test('a quota failure can be retried after space recovery without losing the latest draft',async()=>{
  const f=await fixture();try{
    const store=new Copies(),bridge=f.make(store),value=await bridge.open('training_online');store.fail=true;value.tob_online_v2.clientes[0].peso=61;
    await assert.rejects(()=>bridge.setDraft('training_online',value),/quota/);assert.equal(f.posts,0);
    store.fail=false;await bridge.persistDraft('training_online');assert.equal(bridge.errors.size,0);assert.equal(f.posts,0);
    await bridge.save('training_online');assert.deepEqual(await f.make().open('training_online'),value);assert.equal(bridge.pending(),false);
  }finally{f.db.close();}
});

test('an unavailable local archive does not prevent exporting the volatile draft and editor',async()=>{
  const f=await fixture();try{
    const store=new Copies(),bridge=f.make(store),value=await bridge.open('training_online');value.tob_online_v2.clientes[0].peso=61;await bridge.setDraft('training_online',value);
    store.exportCopies=async()=>{throw new Error('Synthetic unreadable archive');};
    const copy=await bridge.exportCopies({formValue:62});
    assert.equal(copy.incomplete,true);assert.equal(copy.verified,false);assert.equal(copy.centralConfirmation,false);
    assert.equal(copy.volatileDrafts[0].value.tob_online_v2.clientes[0].peso,61);assert.equal(copy.editor.formValue,62);assert.equal(f.posts,0);
  }finally{f.db.close();}
});

test('save snapshots its caller value before awaiting durable draft copying',async()=>{
  const f=await fixture();try{
    const bridge=f.make(),value=await bridge.open('training_online');value.tob_online_v2.clientes[0].peso=61;await bridge.setDraft('training_online',value);
    const saving=bridge.save('training_online',value);value.tob_online_v2.clientes[0].peso=99;await saving;
    assert.equal((await f.make().open('training_online')).tob_online_v2.clientes[0].peso,61);
  }finally{f.db.close();}
});
test('choosing the central copy retains the rejected draft and never writes to the server',async()=>{
  const f=await fixture();try{
    const a=f.make(),store=new Copies(),b=f.make(store),av=await a.open('training_online'),bv=await b.open('training_online');
    av.tob_online_v2.clientes[0].peso=61;bv.tob_online_v2.clientes[0].peso=62;await a.setDraft('training_online',av);await a.save('training_online');await b.setDraft('training_online',bv);
    await assert.rejects(()=>b.save('training_online'),{status:409});const before=f.posts;
    assert.deepEqual(await b.keepCopyAndLoadRemote('training_online'),av);assert.equal(f.posts,before);assert.equal(b.pending(),false);
    assert.ok(store.saved.some(event=>event.kind==='pending-write'&&event.value.tob_online_v2.clientes[0].peso===62));assert.equal(store.saved.at(-1).kind,'resolved-remote');
  }finally{f.db.close();}
});
test('read-only mode, revocation and identity changes block edits without deleting copies',async()=>{
  const f=await fixture();try{
    const bridge=f.make();await bridge.open('training_online');
    f.session.writesEnabled=false;assert.throws(()=>bridge.setDraft('training_online',f.original),{status:423});
    f.session.writesEnabled=true;f.session.active=false;assert.throws(()=>bridge.setDraft('training_online',f.original),{status:403});
    f.session.active=true;f.session.user.id='someone-else';assert.throws(()=>bridge.setDraft('training_online',f.original),{status:403});
    assert.equal(f.posts,0);assert.equal(bridge.values.size,1);
  }finally{f.db.close();}
});

test('save notices never claim success for drafts or failed confirmations',async()=>{
  const f=await fixture();try{
    const bridge=f.make();await bridge.open('training_online');assert.equal(bridge.saveNotice('Saved'),'Saved');
    bridge.status('training_online','copying');assert.match(bridge.saveNotice('Saved'),/pendiente/);
    bridge.status('training_online','error',new Error('Synthetic failure'));assert.match(bridge.saveNotice('Saved'),/NO confirmado: Synthetic failure/);
    bridge.status('training_online','confirmed');assert.equal(bridge.saveNotice('Saved'),'Saved');
  }finally{f.db.close();}
});
