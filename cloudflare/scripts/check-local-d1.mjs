import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {commitRecords,listRecords,recordHistory} from '../src/records.mjs';
const parsed=new DatabaseSync(':memory:');
parsed.exec(await readFile(new URL('../business-migrations/0001_records.sql',import.meta.url),'utf8'));
const statements=parsed.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,rowid").all().map(row=>row.sql);
parsed.close();
const runtime=new Miniflare(convertV4MiniflareOptions({workers:[{name:'synthetic',modules:true,script:'export default {fetch(){return new Response("Synthetic rehearsal only")}}',compatibilityDate:'2026-10-08',d1Databases:{DATA_DB:'synthetic-record-rehearsal'}}]}));
try{
  const database=await runtime.getD1Database('DATA_DB'),db=database.withSession?.('first-primary')||database;
  await db.batch(statements.map(sql=>db.prepare(sql)));
  await db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').bind('fixture','active','synthetic',1,'2026-10-08').run();
  const save=(requestId,operations)=>commitRecords(db,'fixture','training_online','synthetic-user',{datasetId:'fixture',requestId,operations});
  const values=Array.from({length:20},(_,i)=>({key:'record-'+String(i).padStart(2,'0'),expectedVersion:0,value:{id:'same-id-'+i,peso:60+i}}));
  const first=await save('request_initial_01',values);assert.equal(first.records.length,20);
  const conflicting=values.map(item=>({...item,expectedVersion:1,value:{...item.value,peso:99}}));conflicting.at(-1).expectedVersion=0;
  await assert.rejects(()=>save('request_conflict_01',conflicting),{status:409});
  const rows=(await listRecords(db,'fixture','training_online')).records;
  assert.equal(rows.length,20);assert.ok(rows.every(row=>row.version===1));
  assert.equal((await save('request_initial_01',values)).replayed,true);
  await save('request_delete_01',[{key:values[0].key,expectedVersion:1,operation:'delete'}]);
  const history=await recordHistory(db,'fixture','training_online',values[0].key);assert.equal(history.records[1].value.peso,60);
  await save('request_restore_01',[{key:values[0].key,expectedVersion:2,operation:'restore',value:history.records[1].value}]);
  await assert.rejects(()=>db.prepare('DELETE FROM record_versions').run(),/history-is-immutable/);
  console.log('Local Cloudflare D1 runtime verified: schema, generated size column, atomic cross-statement rollback, retries, tombstone recovery and immutable history. Synthetic data only; no remote requests.');
}finally{await runtime.dispose();}
