import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {sealSettings,openSettings} from '../src/settings-crypto.mjs';
import {loadPrivateSettings,saveAiSettings,publicAiConfig,STORED_KEY} from '../src/private-settings.mjs';
import {aiText} from '../src/ai-proxy.mjs';
import {sha256} from '../src/hash.mjs';
const secret=btoa(String.fromCharCode(...new Uint8Array(32).fill(17)));
const original={sections:{__ia_config:{provider:'deepseek',keys:{deepseek:'synthetic-deepseek-secret',groq:'synthetic-groq-secret'},models:{deepseek:'deepseek-chat'},menuRules:'Original menu rules',unknownField:{keep:true}},__security:{keep:'synthetic-pin'},__fin:{providers:[]}}};
async function fixture(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../business-migrations/0001_records.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run('settings-fixture','staging','synthetic',1,'2026-10-09');
  const payload=JSON.stringify(await sealSettings(original,secret,'settings-fixture'));
  db.prepare('INSERT INTO record_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('settings-fixture','private_settings','root',1,'import',payload,await sha256(payload),0,'import',null,'2026-10-09');db.exec("UPDATE datasets SET status='active'");
  const binding={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};},async batch(statements){db.exec('BEGIN');try{for(const statement of statements)await statement.run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}};
  return {db,binding};
}
test('private settings encryption is authenticated and bound to its dataset',async()=>{
  const encrypted=await sealSettings(original,secret,'dataset-a');assert.doesNotMatch(JSON.stringify(encrypted),/synthetic-.*secret/);
  assert.deepEqual(await openSettings(encrypted,secret,'dataset-a'),original);
  await assert.rejects(()=>openSettings(encrypted,secret,'dataset-b'));
  await assert.rejects(()=>openSettings({...encrypted,ciphertext:'AAAA'},secret,'dataset-a'));
});
test('AI metadata never exposes private API keys or unrelated settings',()=>{
  const cfg=publicAiConfig(original);assert.equal(cfg.keys.deepseek,STORED_KEY);assert.equal(cfg.key,STORED_KEY);
  assert.doesNotMatch(JSON.stringify(cfg),/synthetic|unknownField|__security/);assert.equal(cfg.menuRules,'Original menu rules');
});
test('AI settings use CAS and idempotent receipts while preserving other secrets and unknown fields',async()=>{
  const f=await fixture();try{
    const request={requestId:'synthetic_settings_request',expectedVersion:1,cfg:{...publicAiConfig(original),menuRules:'Updated rules'}};
    const result=await saveAiSettings(f.binding,'settings-fixture',secret,'admin',request);assert.equal(result.version,2);
    const replay=await saveAiSettings(f.binding,'settings-fixture',secret,'admin',request);assert.equal(replay.replayed,true);
    await assert.rejects(()=>saveAiSettings(f.binding,'settings-fixture',secret,'other',request),{status:409});
    await assert.rejects(()=>saveAiSettings(f.binding,'settings-fixture',secret,'admin',{...request,cfg:{...request.cfg,menuRules:'Different'}}),{status:409});
    await assert.rejects(()=>saveAiSettings(f.binding,'settings-fixture',secret,'admin',{...request,requestId:'another_settings_request'}),{status:409});
    const saved=await loadPrivateSettings(f.binding,'settings-fixture',secret);assert.equal(saved.value.sections.__ia_config.keys.groq,'synthetic-groq-secret');
    assert.deepEqual(saved.value.sections.__security,original.sections.__security);assert.deepEqual(saved.value.sections.__ia_config.unknownField,{keep:true});
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM write_requests').get().n,1);
    assert.doesNotMatch(f.db.prepare('SELECT payload FROM records').get().payload,/synthetic-.*secret/);
  }finally{f.db.close();}
});
test('AI proxy pins endpoints, uses server keys and redacts provider error bodies',async()=>{
  let calls=0;
  const request={provider:'deepseek',model:'ignored-by-non-admin',messages:[{role:'user',content:'Synthetic test only'}]};
  const text=await aiText(original,request,{fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic-deepseek-secret');assert.equal(JSON.parse(options.body).model,'deepseek-chat');return Response.json({choices:[{message:{content:'{"ok":true}'}}]});
  }});assert.equal(text,'{"ok":true}');assert.equal(calls,1);
  await assert.rejects(()=>aiText(original,{...request,key:'other-key'}),{status:403});
  await assert.rejects(()=>aiText(original,{...request,provider:'https://example.invalid'}),{status:400});
  await assert.rejects(()=>aiText(original,request,{fetchImpl:async()=>new Response('reflected secret prompt',{status:429})}),error=>error.status===429&&!/reflected|secret|prompt/.test(error.message));
});
