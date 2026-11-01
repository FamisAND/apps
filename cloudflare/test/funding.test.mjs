import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {RecordBridge} from '../src/record-bridge.mjs';
import {RecordClient} from '../src/record-client.mjs';
import {listRecords,commitRecords,recordStatus} from '../src/records.mjs';
import {FILE_MODULE,canAccess} from '../src/policy.mjs';
const M=createRequire(import.meta.url)('../../funding-model.js');
const A=createRequire(import.meta.url)('../../funding-analysis.js');
const T=createRequire(import.meta.url)('../../funding-trades.js');
function fixture(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../business-migrations/0001_records.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run('test','active','synthetic',1,'2026-10-23');
  function prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}
  const binding={prepare,async batch(statements){db.exec('BEGIN');try{for(const s of statements)await s.run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}};
  const states=new Map();let lost=false;
  const store={heads:new Map(),async state(key){return structuredClone(states.get(key)||null);},async checkpoint(e){const old=states.get(e.namespace);if(e.kind==='verified-load')states.set(e.namespace,{base:e});else if(e.kind==='draft')states.set(e.namespace,{base:old.base,draft:e});else if(e.kind==='pending-write')states.set(e.namespace,{base:old.base,pending:e});else states.set(e.namespace,{base:e.base});}};
  const fetchImpl=async(url,options={})=>{const u=new URL(url,'https://fixture.test'),namespace=u.pathname.split('/')[3];try{if(options.method==='POST'){const result=await commitRecords(binding,'test',namespace,'user',JSON.parse(options.body));if(lost){lost=false;throw new TypeError('Lost receipt');}return Response.json(result);}return Response.json(u.pathname.endsWith('/status')?await recordStatus(binding,'test',namespace):await listRecords(binding,'test',namespace,u.searchParams.get('cursor')||''));}catch(error){if(!error.status)throw error;return Response.json({error:error.message},{status:error.status});}};
  const session={active:true,dataMode:'records',writesEnabled:true,user:{id:'user',active:true,role:'user',permissions:['funding']}};
  return {db,states,fetchImpl,store,bridge:()=>new RecordBridge({session:()=>session,store,fetchImpl}),lose(){lost=true;}};
}
test('new tracker starts empty without any database writes; other empty modules still fail closed',async()=>{const f=fixture();try{const bridge=f.bridge();assert.deepEqual(await bridge.open('funding'),{funding_tracker_v1:null});assert.equal(f.db.prepare('SELECT count(*) AS n FROM records').get().n,0);assert.equal(f.db.prepare('SELECT count(*) AS n FROM write_requests').get().n,0);assert.deepEqual(await f.bridge().open('funding'),{funding_tracker_v1:null});const client=new RecordClient({fetchImpl:f.fetchImpl,checkpoint:async()=>{}});await assert.rejects(()=>client.load('training_online',{allowEmpty:true}),{status:400});await assert.rejects(()=>client.load('training_online'));}finally{f.db.close();}});
test('funding draft, commit, lost receipt retry and reopen preserve account and event IDs',async()=>{const f=fixture();try{
  const bridge=f.bridge();await bridge.open('funding');const book=M.empty();book.accounts.push({id:'account',company:'Synthetic',name:'25K',conditions:A.blank()});book.analysis={version:1,templates:[{id:'test-config',name:'Personal',config:A.blank()}],saved:[]};book.events.push({id:'purchase',accountId:'account',type:'purchase',date:'2026-10-19',order:1,money:M.money(75,'USD',1,'USD')});M.validate(book);
  await bridge.setDraft('funding',{funding_tracker_v1:book});assert.deepEqual((await f.bridge().open('funding')).funding_tracker_v1,book);
  f.lose();await assert.rejects(()=>bridge.save('funding'),/Lost receipt/);assert.ok(f.states.get('funding').pending);
  await bridge.retry('funding');assert.equal(f.db.prepare('SELECT count(*) AS n FROM write_requests').get().n,1);
  const copy=await f.bridge().open('funding');assert.deepEqual(copy.funding_tracker_v1,book);assert.equal(M.metrics(copy.funding_tracker_v1,{end:'2026-10-23'}).net,-7500);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM records WHERE namespace<>'funding'").get().n,0);
}finally{f.db.close();}});
test('funding module permissions are independent and every static asset is protected',()=>{for(const file of ['funding.html','funding.js','funding-model.js','funding.css','funding-chart.umd.js','funding-analysis.js','funding-analysis-ui.js','funding-trades.js','funding-trades-ui.js'])assert.equal(FILE_MODULE[file],'funding');const user={active:true,role:'user',permissions:['options','training_online']};assert.equal(canAccess(user,'funding'),false);assert.equal(canAccess({...user,permissions:['funding']},'funding'),true);assert.equal(canAccess({...user,permissions:['funding']},'training_online'),false);});

test('trading Analytics, source CSV chunks and identifiers survive cloud roundtrip without changing cash',async()=>{const f=fixture();try{
 const bridge=f.bridge();await bridge.open('funding');const book=M.empty(),rows=Array.from({length:150},(_,i)=>({id:'row-'+i,importId:'csv',external:'SYNTHETIC',symbol:'MNQ',contract:'MNQZ26',side:'long',quantity:1,opened:1793000000000+i*1000,closed:1793000060000+i*1000,net:1000,gross:1200,fees:200,currency:'USD',raw:{source:'Synthetic CSV row'}}));
 const analytics={...T.empty(),rows,settings:{timeZone:'UTC',dayStart:0,currency:'USD'},imports:[{id:'csv',hash:'synthetic-only',base64:Buffer.from('synthetic original file\n'.repeat(10000)).toString('base64')}]};
 book.accounts.push({id:'account',company:'Synthetic',name:'50K',externalIds:{evaluation:'E-1',funded:'F-1'},analytics});book.events.push({id:'purchase',accountId:'account',type:'purchase',date:'2026-10-01',order:1,money:M.money(75,'USD',1,'USD')});M.validate(book);
 await bridge.setDraft('funding',{funding_tracker_v1:book});await bridge.save('funding');const copy=(await f.bridge().open('funding')).funding_tracker_v1;assert.deepEqual(copy,book);assert.equal(M.metrics(copy).net,-7500);assert.equal(T.analytics(copy.accounts[0].analytics,analytics.settings).total.net,150000);assert.equal(f.db.prepare("SELECT count(*) AS n FROM records WHERE record_key LIKE '%/c:%'").get().n>0,true);
 }finally{f.db.close();}});
