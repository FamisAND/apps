import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeSection} from '../src/github.mjs';
test('gateway writes one section and preserves every unrelated section',async()=>{
  const originalFetch=globalThis.fetch,original={training_online:{tob_online_v2:{clientes:[{id:'preserved'}]}},options:{ot_activas:[{id:'old'}]},__ia_config:{keys:{fixture:'PRIVATE'}},version:1};
  let submitted;
  globalThis.fetch=async(_url,opts)=>{
    if(opts.method==='PUT'){submitted=JSON.parse(opts.body);return Response.json({content:{sha:'new'}});}
    return Response.json({sha:'old',content:Buffer.from(JSON.stringify(original)).toString('base64')});
  };
  try{
    const value={ot_activas:[{id:'new'}]};
    assert.deepEqual(await writeSection({GITHUB_TOKEN:'test-only',GITHUB_REPO:'test/data'},'options',value,'old'),{sha:'new'});
    const decoded=JSON.parse(Buffer.from(submitted.content,'base64').toString());
    assert.deepEqual(decoded.training_online,original.training_online);
    assert.deepEqual(decoded.__ia_config,original.__ia_config);
    assert.deepEqual(decoded.options,value);
  }finally{globalThis.fetch=originalFetch;}
});
test('gateway does not submit stale writes or retry GitHub conflicts',async()=>{
  const originalFetch=globalThis.fetch;let puts=0;
  globalThis.fetch=async(_url,opts)=>{if(opts.method==='PUT'){puts++;return new Response('',{status:409});}return Response.json({sha:'fresh',content:Buffer.from('{}').toString('base64')});};
  try{
    const env={GITHUB_TOKEN:'test-only',GITHUB_REPO:'test/data'};
    assert.deepEqual(await writeSection(env,'options',{},'stale'),{conflict:true});assert.equal(puts,0);
    assert.deepEqual(await writeSection(env,'options',{},'fresh'),{conflict:true});assert.equal(puts,1);
  }finally{globalThis.fetch=originalFetch;}
});
