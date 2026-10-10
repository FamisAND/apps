import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {commitRecords,listRecords,recordHistory,sha256} from '../src/records.mjs';
import {packSnapshot,unpackSnapshot} from '../src/snapshot-codec.mjs';
function fixture(status='active'){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../business-migrations/0001_records.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../business-migrations/0002_session_commits.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run('fixture',status,'synthetic',1,'2026-10-08');
  function prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}
  const binding={prepare,async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
  const save=(requestId,operations,actor='admin')=>commitRecords(binding,'fixture','training_online',actor,{datasetId:'fixture',requestId,operations});
  return {db,binding,save};
}
const put=(key,version,value)=>({key,expectedVersion:version,value});
test('two sessions cannot overwrite the same record; independent records can coexist',async()=>{
  const f=fixture();try{
    await f.save('request_initial_01',[put('client/a',0,{id:'a',peso:60}),put('client/b',0,{id:'b',peso:70})]);
    await f.save('request_session_01',[put('client/a',1,{id:'a',peso:61})],'session-one');
    await assert.rejects(()=>f.save('request_session_02',[put('client/a',1,{id:'a',peso:59})],'session-two'),{status:409});
    await f.save('request_session_03',[put('client/b',1,{id:'b',peso:71})],'session-two');
    const rows=(await listRecords(f.binding,'fixture','training_online')).records;
    assert.equal(rows.find(r=>r.key==='client/a').value.peso,61);assert.equal(rows.find(r=>r.key==='client/b').value.peso,71);
  }finally{f.db.close();}
});
test('a stale member aborts an entire batch, including its receipt and earlier changes',async()=>{
  const f=fixture();try{
    await f.save('request_initial_01',[put('a',0,1),put('b',0,2)]);
    await assert.rejects(()=>f.save('request_conflict_01',[put('a',1,3),put('b',0,4)]),{status:409});
    assert.equal(f.db.prepare("SELECT version FROM records WHERE record_key='a'").get().version,1);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM write_requests WHERE request_id='request_conflict_01'").get().n,0);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM record_versions WHERE record_key='a'").get().n,1);
  }finally{f.db.close();}
});
test('retry after a lost response is idempotent, including after later edits',async()=>{
  const f=fixture();try{
    const operations=[put('a',0,{id:'original'})];const first=await f.save('request_initial_01',operations);
    await f.save('request_followup_01',[put('a',1,{id:'latest'})]);
    const replay=await f.save('request_initial_01',operations);assert.equal(replay.replayed,true);assert.deepEqual(replay.records,first.records);
    assert.equal(f.db.prepare("SELECT version FROM records WHERE record_key='a'").get().version,2);
    await assert.rejects(()=>f.save('request_initial_01',[put('a',2,{id:'different'})]),{status:409});
    await assert.rejects(()=>f.save('request_initial_01',operations,'other-user'),{status:409});
  }finally{f.db.close();}
});
test('deletion is recoverable; stale writes cannot resurrect a removed record',async()=>{
  const f=fixture();try{
    await f.save('request_initial_01',[put('a',0,{id:'retained'})]);
    await f.save('request_deletion_01',[{key:'a',expectedVersion:1,operation:'delete'}]);
    await assert.rejects(()=>f.save('request_stale_001',[put('a',1,{id:'stale'})]),{status:409});
    await assert.rejects(()=>f.save('request_implicit01',[put('a',2,{id:'implicit'})]),{status:409});
    const history=await recordHistory(f.binding,'fixture','training_online','a');assert.equal(history.records[1].value.id,'retained');
    await f.save('request_restore_01',[{key:'a',expectedVersion:2,operation:'restore',value:history.records[1].value}]);
    assert.equal((await listRecords(f.binding,'fixture','training_online')).records[0].value.id,'retained');
    assert.throws(()=>f.db.exec('DELETE FROM record_versions'),/history-is-immutable/);
    assert.throws(()=>f.db.exec('UPDATE record_versions SET version=99'),/history-is-immutable/);
    assert.throws(()=>f.db.exec('DELETE FROM records'),/use-a-tombstone/);
  }finally{f.db.close();}
});
test('staging and verified datasets never accept normal writes',async()=>{
  for(const state of ['staging','verified']){const f=fixture(state);try{await assert.rejects(()=>f.save('request_forbidden',[put('a',0,1)]),{status:state==='staging'?503:423});assert.equal(f.db.prepare('SELECT count(*) AS n FROM records').get().n,0);}finally{f.db.close();}}
});
test('request size, duplicate keys and invalid versions are rejected before changes',async()=>{
  const f=fixture();try{
    for(const operations of [[put('a',-1,1)],[put('a',0,1),put('a',0,2)],Array.from({length:301},(_,i)=>put(String(i),0,1))])await assert.rejects(()=>f.save('request_invalid01',operations),{status:400});
    await assert.rejects(()=>f.save('request_oversize1',[put('a',0,'x'.repeat(100000))]),{status:413});
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM write_requests').get().n,0);
  }finally{f.db.close();}
});
test('pagination and history return no records from another dataset or namespace',async()=>{
  const f=fixture();try{
    await f.save('request_initial_01',Array.from({length:10},(_,i)=>put('a'+i,0,{i,padding:'x'.repeat(80000)})));
    let cursor='',total=0;
    do{const page=await listRecords(f.binding,'fixture','training_online',cursor);assert.ok(page.records.length>0);assert.ok(page.records.reduce((n,r)=>n+Buffer.byteLength(JSON.stringify(r.value)),0)<=384*1024);total+=page.records.length;cursor=page.nextCursor;}while(cursor);
    assert.equal(total,10);
    assert.equal((await listRecords(f.binding,'fixture','options')).records.length,0);
  }finally{f.db.close();}
});
test('snapshot codec preserves every field, ID, order, raw string and unusual key',async()=>{
  const sample=Object.fromEntries([
    ['clientes',[{id:'a/ü',mediciones:[{id:'m1',peso:60}],menus:[{id:'menu-1',datos:[null,true,1,'1']}]},{id:1,datos:'raw'},{id:'1',datos:'raw-string'}]],
    ['__proto__',{keep:1}],['empty',[]],['serialized','{ "keep" : 1 }'],
  ]);
  const packed=await packSnapshot(sample);assert.deepEqual(await unpackSnapshot(packed),sample);
  assert.ok([...packed.keys()].some(key=>key.includes('/i:s:m1')));
  assert.ok([...packed.keys()].some(key=>key.includes('/i:n:1')));
  assert.ok([...packed.keys()].some(key=>key.includes('/i:s:1')));
});
test('large fields split into checksummed records, corruption or missing parts stop loading',async()=>{
  const sample={clientes:[{id:'a',notes:'é'.repeat(100000)+'😀',nested:{id:'not-an-array'}}]};
  const packed=await packSnapshot(sample);assert.deepEqual(await unpackSnapshot(packed),sample);
  assert.ok([...packed.values()].every(value=>Buffer.byteLength(JSON.stringify(value))<96*1024));
  const part=[...packed.keys()].find(key=>key.includes('/c:'));const corrupted=new Map(packed);corrupted.set(part,{type:'chunk',text:'broken'});
  await assert.rejects(()=>unpackSnapshot(corrupted),/checksum/);
  corrupted.delete(part);await assert.rejects(()=>unpackSnapshot(corrupted),/Missing/);
});
test('changing a measurement does not modify other clients or other measurements',async()=>{
  const initial={clientes:[{id:'a',mediciones:[{id:'m1',peso:60},{id:'m2',peso:61}]},{id:'b',mediciones:[{id:'m3',peso:70}]}]};
  const next=structuredClone(initial);next.clientes[0].mediciones[1].peso=62;
  const before=await packSnapshot(initial),after=await packSnapshot(next),changed=[];
  for(const [key,value]of after)if(JSON.stringify(before.get(key))!==JSON.stringify(value))changed.push(key);
  assert.equal(changed.length,1);assert.ok(changed[0].endsWith('/i:s:m2'));
});
test('missing references and cycles never produce a partial restored dataset',async()=>{
  await assert.rejects(()=>unpackSnapshot(new Map([['root',{type:'refs',keys:['missing']}]])),/Missing/);
  await assert.rejects(()=>unpackSnapshot(new Map([['root',{type:'refs',keys:['root']}]])),/circular/);
  assert.equal((await sha256('test')).length,64);
});

test('a paginated load rejects a mixed snapshot if another session writes meanwhile',async()=>{
  const f=fixture();try{
    await f.save('request_initial_01',[put('a',0,1),put('b',0,2)]);
    const initial=await listRecords(f.binding,'fixture','training_online');
    await f.save('request_followup_01',[put('b',1,3)]);
    await assert.rejects(()=>listRecords(f.binding,'fixture','training_online','a',initial.generation),{status:409});
    assert.throws(()=>f.db.exec('DELETE FROM write_requests'),/receipt-is-immutable/);
  }finally{f.db.close();}
});
