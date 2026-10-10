import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../../index.js',import.meta.url),'utf8');
const start=source.lastIndexOf('\n(function init(){');
assert.ok(start>0,'Dashboard startup function not found');

test('verified record startup opens the dashboard without invoking the reload-based sync',async()=>{
  const calls=[],session={dataMode:'records',ready:Promise.resolve()};
  runInNewContext(source.slice(start),{window:{FTSession:session},goMenu:()=>calls.push('menu'),goLoading:()=>calls.push('reload-sync')});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['menu']);
});

test('legacy startup keeps its existing initial sync',async()=>{
  const calls=[],session={dataMode:'legacy',ready:Promise.resolve()};
  runInNewContext(source.slice(start),{window:{FTSession:session},goMenu:()=>calls.push('menu'),goLoading:()=>calls.push('legacy-sync')});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['legacy-sync']);
});

test('dashboard startup never opens data before the session is verified',async()=>{
  let reject;const calls=[],session={dataMode:'records',ready:new Promise((_,failure)=>{reject=failure;})};
  runInNewContext(source.slice(start),{window:{FTSession:session},goMenu:()=>calls.push('menu'),goLoading:()=>calls.push('sync')});
  assert.deepEqual(calls,[]);reject(new Error('Synthetic rejected session'));
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,[]);
});
