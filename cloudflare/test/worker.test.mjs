import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorker} from '../src/worker.mjs';
import {filterData,validateSection,canAccess} from '../src/policy.mjs';
import {verifyIdentity} from '../src/access.mjs';
function fixture(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_auth.sql',import.meta.url),'utf8'));
  const binding={prepare(sql){let args=[];const query=db.prepare(sql);return {bind(...values){args=values;return this;},async first(){return query.get(...args)||null;},async all(){return {results:query.all(...args)};},async run(){return query.run(...args);}};}};
  const env={AUTH_DB:binding,ADMIN_EMAIL:'admin@example.test',GITHUB_REPO:'fixture/data',DATA_WRITES_ENABLED:'false',ASSETS:{fetch:async()=>new Response('SYNTHETIC ASSET')}};
  const worker=createWorker({verifyIdentity:async request=>{const email=request.headers.get('fixture-identity');if(!email)throw new Error('No identity');return {email,iat:Number(request.headers.get('fixture-iat'))||Math.floor(Date.now()/1000)-10,exp:Math.floor(Date.now()/1000)+3600};}});
  const request=(route,{method='GET',email='admin@example.test',cookie,body,origin='https://fixture.test',headers={}}={})=>worker.fetch(new Request('https://fixture.test'+route,{method,headers:{'fixture-identity':email,...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),...headers},body:body?JSON.stringify(body):undefined}),env);
  async function login(email='admin@example.test'){const result=await request('/auth/start',{email});assert.equal(result.status,303);return result.headers.get('Set-Cookie').split(';')[0];}
  return {db,env,request,login};
}
test('unverified identity cannot bootstrap an administrator',async()=>{const f=fixture();try{assert.equal((await f.request('/auth/start',{email:''})).status,403);assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n,0);}finally{f.db.close();}});
test('administrator session uses secure opaque cookie compatible with Access navigation and hashed database ID',async()=>{const f=fixture();try{const result=await f.request('/auth/start');const header=result.headers.get('Set-Cookie');assert.match(header,/Secure; HttpOnly; SameSite=Lax/);assert.match(header,/^__Host-ft_session=/);assert.equal(result.headers.get('Location'),'/auth/complete?next=%2Findex.html');const token=header.split(';')[0].split('=')[1];assert.notEqual(f.db.prepare('SELECT id FROM sessions').get().id,token);const session=await f.request('/api/session',{cookie:header.split(';')[0]});assert.equal(session.status,200);assert.equal((await session.json()).user.role,'admin');}finally{f.db.close();}});

test('login completion stops rejected-cookie redirects without issuing another session',async()=>{const f=fixture();try{
  await f.request('/auth/start?next=/session-admin.html');
  const before=f.db.prepare('SELECT count(*) AS n FROM sessions').get().n;
  const response=await f.request('/auth/complete?next=/session-admin.html');
  assert.equal(response.status,401);assert.equal(response.headers.get('Location'),null);
  const html=await response.text();assert.match(html,/Reintentar acceso/);assert.doesNotMatch(html,/http-equiv|window\.location|location\.href/);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n,before);
}finally{f.db.close();}});

test('unauthenticated assets cannot start extra login redirects or sessions',async()=>{const f=fixture();try{
  for(const route of ['/favicon.ico','/app-session.js','/api/session','/unknown']){
    const response=await f.request(route);assert.equal(response.status,401);assert.equal(response.headers.get('Location'),null);
  }
  assert.equal((await f.request('/session-admin.html')).status,303);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
}finally{f.db.close();}});

test('login completion requires the cookie and identity before returning to an internal HTML',async()=>{const f=fixture();try{
  const cookie=await f.login();
  const response=await f.request('/auth/complete?next=/session-admin.html',{cookie});
  assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'/session-admin.html');
  assert.equal((await f.request('/auth/complete?next=/session-admin.html',{cookie,email:'other@example.test'})).status,401);
  const external=await f.request('/auth/complete?next=https://evil.test',{cookie});assert.equal(external.headers.get('Location'),'/index.html');
  assert.equal((await f.request('/auth/complete',{cookie,method:'POST'})).status,405);
}finally{f.db.close();}});
test('unknown account cannot log in',async()=>{const f=fixture();try{assert.equal((await f.request('/auth/start',{email:'unknown@example.test'})).status,403);}finally{f.db.close();}});
test('create user, module permissions, direct URL denial and session revocation',async()=>{const f=fixture();try{
  const admin=await f.login();const created=await f.request('/api/admin/users',{method:'POST',cookie:admin,body:{email:'trainer@example.test',name:'Trainer',permissions:['training_online']}});assert.equal(created.status,201);const {id}=await created.json();
  const trainer=await f.login('trainer@example.test');assert.equal((await f.request('/patrimonio.html',{email:'trainer@example.test',cookie:trainer})).status,403);assert.equal((await f.request('/api/admin/users',{email:'trainer@example.test',cookie:trainer})).status,403);
  assert.equal((await f.request('/api/admin/users/'+id+'/revoke',{method:'POST',cookie:admin,body:{}})).status,200);
  assert.equal((await f.request('/api/session',{email:'trainer@example.test',cookie:trainer})).status,401);
  assert.equal((await f.request('/auth/start',{email:'trainer@example.test'})).status,401);
}finally{f.db.close();}});
test('permission update immediately invalidates an existing session',async()=>{const f=fixture();try{const admin=await f.login();const creation=await f.request('/api/admin/users',{method:'POST',cookie:admin,body:{email:'user@example.test',name:'User',permissions:['options']}});const {id}=await creation.json();const session=await f.login('user@example.test');assert.equal((await f.request('/api/admin/users/'+id,{method:'PATCH',cookie:admin,body:{active:false}})).status,200);assert.equal((await f.request('/api/session',{email:'user@example.test',cookie:session})).status,401);}finally{f.db.close();}});
test('CSRF cannot change users and main admin cannot be locked out',async()=>{const f=fixture();try{const cookie=await f.login();assert.equal((await f.request('/api/admin/users',{method:'POST',cookie,origin:'https://evil.test',body:{name:'Bad',email:'bad@example.test'}})).status,403);assert.equal((await f.request('/api/admin/users/root-admin',{method:'PATCH',cookie,body:{active:false}})).status,400);}finally{f.db.close();}});
test('cookie cannot be reused with a different Access identity',async()=>{const f=fixture();try{const cookie=await f.login();assert.equal((await f.request('/api/session',{email:'different@example.test',cookie})).status,401);}finally{f.db.close();}});
test('writes disabled by default; unauthorized section is denied first',async()=>{const f=fixture();try{const cookie=await f.login();assert.equal((await f.request('/api/data/training_online',{method:'PUT',cookie,body:{sha:'s',section:{tob_online_v2:{}}}})).status,423);}finally{f.db.close();}});
test('filtered data never returns hidden modules or private settings',()=>{const user={active:true,role:'user',permissions:['training_online']};const original={training_online:{tob_online_v2:{clientes:[{id:'keep'}]}},patrimonio:{secret:5},__security:{secret:'PIN'},__ia_config:{keys:{secret:'KEY'}}};const out=filterData(original,user);assert.deepEqual(out.training_online,original.training_online);assert.equal(out.patrimonio,undefined);assert.equal(out.__security,undefined);assert.equal(out.__ia_config,undefined);assert.equal(canAccess(user,'admin'),false);assert.equal(original.patrimonio.secret,5);});
test('invalid storage keys and private sections cannot be written',()=>{assert.throws(()=>validateSection('training_online',{__gh_sync_token:'attack'}));assert.throws(()=>validateSection('__security',{}));validateSection('training_online',{tob_online_v2:{clientes:[{id:'unchanged'}]}});});
test('JWT verification fails closed with missing configuration or token',async()=>{await assert.rejects(()=>verifyIdentity(new Request('https://fixture.test'),{}));await assert.rejects(()=>verifyIdentity(new Request('https://fixture.test'),{TEAM_DOMAIN:'https://test.cloudflareaccess.com',POLICY_AUD:'test'}));});

test('record API is disabled by default and its permissions precede database access',async()=>{const f=fixture();try{
  const admin=await f.login();assert.equal((await f.request('/api/records/training_online',{cookie:admin})).status,423);
  const creation=await f.request('/api/admin/users',{method:'POST',cookie:admin,body:{email:'user@example.test',name:'User',permissions:['training_online']}});assert.equal(creation.status,201);
  const session=await f.login('user@example.test');f.env.RECORDS_ENABLED='true';
  assert.equal((await f.request('/api/records/patrimonio',{email:'user@example.test',cookie:session})).status,403);
  assert.equal((await f.request('/api/records/training_online/commit',{method:'POST',email:'user@example.test',cookie:session,origin:'https://evil.test',body:{}})).status,403);
  assert.equal((await f.request('/api/records/training_online/commit',{method:'POST',email:'user@example.test',cookie:session,body:{}})).status,423);
}finally{f.db.close();}});

test('record mode cannot coexist with old whole-file reads or writes',async()=>{const f=fixture();try{
  const session=await f.login();f.env.RECORDS_ENABLED='true';f.env.DATA_WRITES_ENABLED='true';
  assert.equal((await f.request('/api/data',{cookie:session})).status,410);
  assert.equal((await f.request('/api/data/training_online',{method:'PUT',cookie:session,body:{sha:'old',section:{}}})).status,410);
}finally{f.db.close();}});

test('photo and AI settings permissions are checked before private database access',async()=>{const f=fixture();try{
  const admin=await f.login();f.env.RECORDS_ENABLED='true';
  await f.request('/api/admin/users',{method:'POST',cookie:admin,body:{email:'options@example.test',name:'Options only',permissions:['options']}});
  const cookie=await f.login('options@example.test'),email='options@example.test';
  for(const route of ['/api/records/recipe_photo_'+'a'.repeat(64),'/api/settings/ai','/api/records/private_settings'])assert.equal((await f.request(route,{cookie,email})).status,403);
  assert.equal((await f.request('/api/settings/ai',{method:'POST',cookie:admin,body:{}})).status,423);
  assert.equal((await f.request('/api/ai/text',{method:'POST',cookie:admin,origin:'https://other.test',body:{}})).status,403);
  assert.equal((await f.request('/api/records/private_settings',{cookie:admin})).status,403);
}finally{f.db.close();}});

test('record HTML uses verified-data startup instead of executing old seeds first',async()=>{const f=fixture();try{
  const session=await f.login();f.env.RECORDS_ENABLED='true';
  const state=await (await f.request('/api/session',{cookie:session})).json();assert.equal(state.dataMode,'records');assert.equal(state.writesEnabled,false);
  const shell=await f.request('/consulta.html',{cookie:session});assert.equal(shell.status,200);assert.match(await shell.text(),/record-loader\.mjs/);
  const prepared=await f.request('/consulta.html',{cookie:session,headers:{'X-FT-Prepared':'records-v1'}});assert.equal(prepared.status,200);assert.equal(await prepared.text(),'SYNTHETIC ASSET');
}finally{f.db.close();}});
