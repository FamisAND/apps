import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createWorker} from '../src/worker.mjs';
import {commitRecords,recordStatus,listRecords,sha256} from '../src/records.mjs';
import {sessionChanges,sessionCounts} from '../src/session-activity.mjs';
import {RecordClient} from '../src/record-client.mjs';
import {packSnapshot} from '../src/snapshot-codec.mjs';

function database(migrations){
  const db=new DatabaseSync(':memory:');for(const file of migrations)db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const binding={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};},async batch(statements){db.exec('BEGIN');try{for(const statement of statements)await statement.run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}};return {db,binding};
}
function authFixture(){
  const f=database(['migrations/0001_auth.sql','migrations/0002_session_policy.sql']);
  const env={AUTH_DB:f.binding,ADMIN_EMAIL:'admin@example.test'};
  const worker=createWorker({verifyIdentity:async request=>({email:request.headers.get('test-email')||'admin@example.test',iat:1,exp:Math.floor(Date.now()/1000)+86400})});
  const request=(path,cookie,method='GET',body,extra={})=>worker.fetch(new Request('https://fixture.test'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:'https://fixture.test'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})}),env);
  async function login(){const response=await request('/auth/start');return response.headers.get('Set-Cookie').split(';')[0];}
  return {...f,env,request,login};
}
test('background session checks never extend idle expiry; trusted activity endpoint does',async()=>{
  const f=authFixture();try{const cookie=await f.login(),old=Math.floor(Date.now()/1000)-1700;f.db.prepare('UPDATE sessions SET last_seen=?').run(old);
    const state=await (await f.request('/api/session',cookie)).json();assert.equal(state.session.lastActivity,old);assert.equal(state.user.sessionId,undefined);assert.equal(f.db.prepare('SELECT last_seen FROM sessions').get().last_seen,old);
    assert.equal((await f.request('/api/session/activity',cookie,'POST')).status,200);assert.ok(f.db.prepare('SELECT last_seen FROM sessions').get().last_seen>old);
  }finally{f.db.close();}
});
test('expired activity cannot revive a session and expired HTML does not silently log in',async()=>{
  const f=authFixture();try{const cookie=await f.login();f.db.prepare('UPDATE sessions SET last_seen=?').run(Math.floor(Date.now()/1000)-1801);
    assert.equal((await f.request('/api/session',cookie)).status,401);assert.equal((await f.request('/api/session/activity',cookie,'POST')).status,401);
    const page=await f.request('/index.html',cookie);assert.equal(page.status,401);assert.equal(page.headers.get('Location'),null);assert.match(await page.text(),/auth\/restart/);assert.match(page.headers.get('Set-Cookie'),/Max-Age=0/);assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n,1);
  }finally{f.db.close();}
});
test('idle settings validate ranges, require admin and CSRF, and hard expiry bounds active sessions',async()=>{
  const f=authFixture();try{const cookie=await f.login();
    assert.equal((await f.request('/api/admin/session-policy',cookie,'PATCH',{idleMinutes:0,maxHours:8})).status,400);
    assert.equal((await f.request('/api/admin/session-policy',cookie,'PATCH',{idleMinutes:120,maxHours:1})).status,400);
    assert.equal((await f.request('/api/admin/session-policy',cookie,'PATCH',{idleMinutes:20,maxHours:4},{Origin:'https://evil.test'})).status,403);
    f.db.prepare("INSERT INTO users (id,email,name,role,permissions,created_at) VALUES ('user','user@example.test','User','user','[]',1)").run();
    const login=await f.request('/auth/start',null,'GET',null,{'test-email':'user@example.test'}),userCookie=login.headers.get('Set-Cookie').split(';')[0];
    assert.equal((await f.request('/api/admin/session-policy',userCookie,'PATCH',{idleMinutes:20,maxHours:4},{'test-email':'user@example.test'})).status,403);
    assert.equal((await f.request('/api/admin/session-policy',cookie,'PATCH',{idleMinutes:20,maxHours:4})).status,200);
    assert.deepEqual(f.db.prepare('SELECT idle_minutes,max_hours FROM session_policy').get(),Object.assign(Object.create(null),{idle_minutes:20,max_hours:4}));
    f.db.prepare('UPDATE sessions SET created_at=?').run(Math.floor(Date.now()/1000)-14401);assert.equal((await f.request('/api/session',cookie)).status,401);
  }finally{f.db.close();}
});
test('latest-session display is limited to ten without deleting older history',async()=>{
  const f=authFixture();try{let cookie;for(let i=0;i<12;i++)cookie=await f.login();const result=await (await f.request('/api/admin/sessions',cookie)).json();assert.equal(result.sessions.length,10);assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n,12);}finally{f.db.close();}
});
test('session attribution is transactional, immutable and not duplicated or reassigned on replay',async()=>{
  const f=database(['business-migrations/0001_records.sql','business-migrations/0002_session_commits.sql']);try{
    f.db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run('test','active','synthetic',1,'2026-10-10');
    const body={datasetId:'test',requestId:'test_request_0001',operations:[{key:'a',expectedVersion:0,value:{type:'value',value:1}}]};
    await commitRecords(f.binding,'test','training_online','user',body,'session-a');await commitRecords(f.binding,'test','training_online','user',body,'session-b');
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM session_commits').get().n,1);assert.equal(f.db.prepare('SELECT session_id FROM session_commits').get().session_id,'session-a');
    await assert.rejects(()=>commitRecords(f.binding,'test','training_online','user',{...body,requestId:'test_request_0002'},'session-b'),{status:409});assert.equal(f.db.prepare('SELECT count(*) AS n FROM session_commits').get().n,1);
    assert.throws(()=>f.db.exec('DELETE FROM session_commits'),/immutable/);assert.throws(()=>f.db.exec("UPDATE session_commits SET actor_id='x'"),/immutable/);
    assert.equal((await sessionCounts(f.binding,'test',['session-a']))[0].saves,1);
  }finally{f.db.close();}
});
test('human activity links a measurement to its client and excludes confidential field contents',async()=>{
  const f=database(['business-migrations/0001_records.sql','business-migrations/0002_session_commits.sql']);try{
    f.db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run('test','active','synthetic',1,'2026-10-10');
    const value={tob_online_v2:{clientes:[{id:'client',nombre:'Cliente ejemplo',mediciones:[{id:'m1',peso:60,nota:'PRIVATE NOTE'}]}]}},nodes=await packSnapshot(value);
    await commitRecords(f.binding,'test','training_online','user',{datasetId:'test',requestId:'test_request_0001',operations:[...nodes].map(([key,value])=>({key,value,expectedVersion:0}))},'session-a');
    const result=await sessionChanges(f.binding,'test','session-a');assert.ok(result.changes[0].items.some(item=>item.type==='Medicion'&&item.client==='Cliente ejemplo'));assert.ok(!JSON.stringify(result).includes('PRIVATE NOTE'));
  }finally{f.db.close();}
});
test('only a matching central generation can reuse verified local data, without another copy',async()=>{
  const nodes=await packSnapshot({clients:[{id:'a',peso:60}]}),records=[];for(const [key,value]of nodes)records.push([key,{key,value,version:1,deleted:false,sha256:await sha256(JSON.stringify(value))}]);
  const base={namespace:'training_online',datasetId:'test',generation:1,records,value:{clients:[{id:'a',peso:60}]}},requests=[],copies=[];
  const client=new RecordClient({checkpoint:async event=>copies.push(event),fetchImpl:async url=>{requests.push(url);return Response.json({datasetId:'test',generation:1});}});
  assert.deepEqual(await client.load('training_online',{cachedBase:base}),base.value);assert.equal(requests.length,1);assert.match(requests[0],/\/status$/);assert.equal(copies.length,0);
});
test('stale or damaged cache falls back to a complete verified central load',async()=>{
  for(const damage of [false,true]){
    const nodes=await packSnapshot({value:42}),records=[];for(const [key,value]of nodes)records.push({key,value,version:1,deleted:false,sha256:await sha256(JSON.stringify(value))});
    const base={namespace:'training_online',datasetId:'test',generation:damage?2:1,records:records.map(r=>[r.key,structuredClone(r)]),value:{value:42}};if(damage)base.records[0][1].sha256='bad';
    let reads=0;const client=new RecordClient({checkpoint:async()=>{},fetchImpl:async url=>url.endsWith('/status')?Response.json({datasetId:'test',generation:2}):(reads++,Response.json({datasetId:'test',generation:2,records,nextCursor:null}))});
    assert.deepEqual(await client.load('training_online',{cachedBase:base}),{value:42});assert.equal(reads,1);
  }
});
test('changing an unrelated module does not invalidate the cached namespace',async()=>{
  const f=database(['business-migrations/0001_records.sql','business-migrations/0002_session_commits.sql']);try{
    f.db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run('test','active','synthetic',1,'2026-10-10');
    await commitRecords(f.binding,'test','options','user',{datasetId:'test',requestId:'test_request_0001',operations:[{key:'root',expectedVersion:0,value:{type:'value',value:{keep:true}}}]},'session-a');
    const status=await recordStatus(f.binding,'test','training_online');assert.equal(status.generation,1);assert.equal(status.changedGeneration,0);assert.equal(status.stable,true);
    const node={type:'value',value:{keep:true}},base={namespace:'training_online',datasetId:'test',generation:0,records:[['root',{key:'root',value:node,version:1,deleted:false,sha256:await sha256(JSON.stringify(node))}]],value:{keep:true}};
    let requests=0;const client=new RecordClient({checkpoint:async()=>{throw new Error('No new copy expected');},fetchImpl:async()=>{requests++;return Response.json(status);}});
    assert.deepEqual(await client.load('training_online',{cachedBase:base}),{keep:true});assert.equal(requests,1);
    assert.equal((await recordStatus(f.binding,'test','options')).changedGeneration,1);
  }finally{f.db.close();}
});
