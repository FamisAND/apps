import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {RecordClient} from '../src/record-client.mjs';
import {packSnapshot} from '../src/snapshot-codec.mjs';
import {listRecords,commitRecords,sha256} from '../src/records.mjs';
async function fixture(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../business-migrations/0001_records.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run('fixture','staging','synthetic',1,'2026-10-08');
  const original={clientes:[{id:'a',mediciones:[{id:'m1',peso:60}]},{id:'b',mediciones:[{id:'m2',peso:70}]}]};
  for(const [key,value]of await packSnapshot(original)){const raw=JSON.stringify(value);db.prepare('INSERT INTO record_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('fixture','training_online',key,1,'import',raw,await sha256(raw),0,'import',null,'2026-10-08');}
  db.exec("UPDATE datasets SET status='active'");
  function prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}
  const binding={prepare,async batch(statements){db.exec('BEGIN');try{for(const statement of statements)await statement.run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}};
  let postCount=0,loseResponse=false,corruptResponse=false;
  async function fetchImpl(url,options){
    const parsed=new URL(url,'https://fixture.test');
    try{
      if(options.method==='POST'){
        postCount++;
        const result=await commitRecords(binding,'fixture','training_online','admin',JSON.parse(options.body));
        if(loseResponse){loseResponse=false;throw new TypeError('Synthetic connection lost after commit');}
        return Response.json(result);
      }
      const result=await listRecords(binding,'fixture','training_online',parsed.searchParams.get('cursor')||'',parsed.searchParams.has('generation')?Number(parsed.searchParams.get('generation')):null);
      if(corruptResponse)result.records[0].value={invalid:true};
      return Response.json(result);
    }catch(error){if(!error.status)throw error;return Response.json({error:error.message},{status:error.status});}
  }
  const copies=[];
  const client=checkpoint=>new RecordClient({fetchImpl,checkpoint:checkpoint|| (async value=>copies.push(structuredClone(value)))});
  return {db,binding,original,client,copies,get postCount(){return postCount;},set loseResponse(value){loseResponse=value;},set corruptResponse(value){corruptResponse=value;}};
}
test('two clients save different measurements without whole-section replacement',async()=>{
  const f=await fixture();try{
    const a=f.client(),b=f.client(),av=await a.load('training_online'),bv=await b.load('training_online');
    av.clientes[0].mediciones[0].peso=61;bv.clientes[1].mediciones[0].peso=71;
    await a.save('training_online',av);await b.save('training_online',bv);
    const verified=await f.client().load('training_online');assert.equal(verified.clientes[0].mediciones[0].peso,61);assert.equal(verified.clientes[1].mediciones[0].peso,71);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM record_versions WHERE operation='put'").get().n,2);
  }finally{f.db.close();}
});
test('same measurement conflict retains durable pending and rejects downloading over it',async()=>{
  const f=await fixture();try{
    const a=f.client(),b=f.client(),av=await a.load('training_online'),bv=await b.load('training_online');
    av.clientes[0].mediciones[0].peso=61;bv.clientes[0].mediciones[0].peso=59;
    await a.save('training_online',av);await assert.rejects(()=>b.save('training_online',bv),{status:409});
    assert.ok(b.pending.has('training_online'));assert.ok(f.copies.some(copy=>copy.kind==='pending-write'&&copy.value.clientes[0].mediciones[0].peso===59));
    await assert.rejects(()=>b.load('training_online'),{status:409});
  }finally{f.db.close();}
});
test('a lost response retries the same persisted request and never duplicates the change',async()=>{
  const f=await fixture();try{
    const client=f.client(),value=await client.load('training_online');value.clientes[0].mediciones[0].peso=61;f.loseResponse=true;
    await assert.rejects(()=>client.save('training_online',value),/connection lost/);
    const id=client.pending.get('training_online').requestId;const receipt=await client.retry('training_online');assert.equal(receipt.requestId,id);assert.equal(receipt.replayed,true);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM write_requests').get().n,1);assert.equal(client.pending.size,0);
  }finally{f.db.close();}
});
test('checkpoint failure prevents transmission; failed confirmation checkpoint stays retryable',async()=>{
  const f=await fixture();try{
    const client=f.client(async copy=>{if(copy.kind==='pending-write')throw new Error('Storage full');});const value=await client.load('training_online');value.clientes[0].mediciones[0].peso=61;
    await assert.rejects(()=>client.save('training_online',value),/Storage full/);assert.equal(f.postCount,0);
    let fail=true;const second=f.client(async copy=>{if(copy.kind==='confirmed-write'&&fail)throw new Error('Confirmation quota');});const next=await second.load('training_online');next.clientes[0].mediciones[0].peso=62;
    await assert.rejects(()=>second.save('training_online',next),/Confirmation quota/);assert.ok(second.pending.size);fail=false;assert.equal((await second.retry('training_online')).replayed,true);
  }finally{f.db.close();}
});
test('corrupt downloads never replace the verified base or report success',async()=>{
  const f=await fixture();try{const client=f.client();f.corruptResponse=true;await assert.rejects(()=>client.load('training_online'),/verificado/);assert.equal(client.bases.size,0);assert.equal(f.copies.length,0);}finally{f.db.close();}
});
test('an ordinary bulk edit commits all related records in one atomic request',async()=>{
  const f=await fixture();try{const client=f.client();const value=await client.load('training_online');value.clientes.push(...Array.from({length:40},(_,i)=>({id:'new-'+i,mediciones:[]})));await client.save('training_online',value);assert.deepEqual(await f.client().load('training_online'),value);assert.equal(f.postCount,1);}finally{f.db.close();}
});
test('oversized imports refuse partial saving and require a controlled import',async()=>{
  const f=await fixture();try{const client=f.client();const value=await client.load('training_online');value.clientes.push(...Array.from({length:301},(_,i)=>({id:'new-'+i,mediciones:[]})));await assert.rejects(()=>client.save('training_online',value),{status:413});assert.equal(f.postCount,0);}finally{f.db.close();}
});
test('an active dataset switch rejects the old client before touching the new data',async()=>{
  const f=await fixture();try{await assert.rejects(()=>commitRecords(f.binding,'fixture','training_online','admin',{datasetId:'old-copy',requestId:'request_wrongcopy',operations:[{key:'root',expectedVersion:1,value:{wrong:true}}]}),{status:409});assert.equal(f.db.prepare('SELECT count(*) AS n FROM write_requests').get().n,0);}finally{f.db.close();}
});

test('double-clicking save cannot start two competing commits in one client',async()=>{
  const f=await fixture();try{
    let release;const gate=new Promise(resolve=>{release=resolve;});
    const client=f.client(async copy=>{if(copy.kind==='pending-write')await gate;});
    const value=await client.load('training_online');value.clientes[0].mediciones[0].peso=61;
    const first=client.save('training_online',value);
    await assert.rejects(()=>client.save('training_online',value),{status:409});
    await assert.rejects(()=>client.load('training_online'),{status:409});
    release();await first;assert.equal(f.postCount,1);
  }finally{f.db.close();}
});

test('a restarted client restores the exact pending request and retries without duplicates',async()=>{
  const f=await fixture();try{
    const copies=[],client=f.client(async copy=>copies.push(structuredClone(copy)));
    const value=await client.load('training_online');value.clientes[0].mediciones[0].peso=61;f.loseResponse=true;
    await assert.rejects(()=>client.save('training_online',value),/connection lost/);
    const next=f.client();const restored=await next.restore('training_online',{base:copies[0],pending:copies.at(-1)});
    assert.deepEqual(restored,value);const receipt=await next.retry('training_online');assert.equal(receipt.replayed,true);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM write_requests').get().n,1);
    await assert.rejects(()=>next.restore('training_online',{base:copies[0]}),{status:409});
  }finally{f.db.close();}
});

test('a restored draft must match its exact operations and original versions before recovery',async()=>{
  const f=await fixture();try{
    const copies=[],client=f.client(async copy=>copies.push(structuredClone(copy)));
    const value=await client.load('training_online');value.clientes[0].mediciones[0].peso=61;f.loseResponse=true;
    await assert.rejects(()=>client.save('training_online',value),/connection lost/);
    const original={base:copies[0],pending:copies.at(-1)},before=f.postCount;
    for(const alter of [
      state=>{state.pending.value.clientes[0].mediciones[0].peso=100;},
      state=>{state.pending.operations[0].expectedVersion++;},
      state=>{state.pending.operations.push(structuredClone(state.pending.operations[0]));},
      state=>{state.pending.operations[0].operation='delete';},
      state=>{state.pending.requestId='invalid';},
    ]){
      const state=structuredClone(original);alter(state);const restarted=f.client();
      await assert.rejects(()=>restarted.restore('training_online',state),{status:409});
      assert.equal(restarted.bases.size,0);assert.equal(restarted.pending.size,0);
    }
    assert.equal(f.postCount,before);assert.equal(original.pending.value.clientes[0].mediciones[0].peso,61);
  }finally{f.db.close();}
});

test('resuming a pending request verifies it and snapshots the caller value before waiting',async()=>{
  const f=await fixture();try{
    const copies=[],client=f.client(async copy=>copies.push(structuredClone(copy)));
    const value=await client.load('training_online');value.clientes[0].mediciones[0].peso=61;f.loseResponse=true;
    await assert.rejects(()=>client.save('training_online',value),/connection lost/);
    const restarted=f.client();await restarted.restore('training_online',{base:copies[0]});
    const invalid=structuredClone(copies.at(-1));invalid.operations[0].value={wrong:true};
    await assert.rejects(()=>restarted.resumePending(invalid),{status:409});assert.equal(restarted.pending.size,0);
    const pending=structuredClone(copies.at(-1)),resuming=restarted.resumePending(pending);
    pending.value.clientes[0].mediciones[0].peso=100;await resuming;
    assert.equal(restarted.pending.get('training_online').value.clientes[0].mediciones[0].peso,61);
    assert.equal((await restarted.retry('training_online')).replayed,true);
  }finally{f.db.close();}
});

test('retry never transmits a pending request whose draft has changed in memory',async()=>{
  const f=await fixture();try{
    const client=f.client(),value=await client.load('training_online');value.clientes[0].mediciones[0].peso=61;f.loseResponse=true;
    await assert.rejects(()=>client.save('training_online',value),/connection lost/);
    const before=f.postCount;client.pending.get('training_online').operations[0].expectedVersion++;
    await assert.rejects(()=>client.retry('training_online'),{status:409});assert.equal(f.postCount,before);assert.equal(client.pending.size,1);
  }finally{f.db.close();}
});

test('incomplete record metadata is refused before replacing a verified copy',async()=>{
  const f=await fixture();try{
    const initial=f.client();await initial.load('training_online');const base=initial.bases.get('training_online');
    initial.fetch=async()=>Response.json({datasetId:'fixture',generation:0,nextCursor:null,records:[{...base.records.values().next().value,deleted:undefined}]});
    await assert.rejects(()=>initial.load('training_online'),{status:503});assert.equal(initial.bases.get('training_online'),base);
  }finally{f.db.close();}
});
