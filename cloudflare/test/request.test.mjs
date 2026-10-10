import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readResponse} from '../src/request.mjs';

test('a stalled fetch has a bounded wait and aborts without reporting success',async()=>{
  let signal,consumed=false;
  await assert.rejects(readResponse('/synthetic',{timeoutMs:20,fetchImpl:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}},()=>{consumed=true;}),{status:504});
  assert.equal(signal.aborted,true);assert.equal(consumed,false);
});

test('the deadline includes a response body stalled after its headers',async()=>{
  let signal;
  await assert.rejects(readResponse('/synthetic',{timeoutMs:20,fetchImpl:async(_url,options)=>{signal=options.signal;return {json:()=>new Promise(()=>{})};}}),{status:504});
  assert.equal(signal.aborted,true);
});

test('successful responses preserve request options and use the supplied reader',async()=>{
  let sent;
  const result=await readResponse('/synthetic',{timeoutMs:1000,method:'POST',body:'synthetic',credentials:'same-origin',fetchImpl:async(url,options)=>{sent={url,options};return new Response('verified');}},response=>response.text());
  assert.equal(result,'verified');assert.equal(sent.url,'/synthetic');assert.equal(sent.options.method,'POST');assert.equal(sent.options.body,'synthetic');assert.equal(sent.options.credentials,'same-origin');assert.equal(sent.options.signal.aborted,false);
});

test('caller cancellation is forwarded without becoming a successful read',async()=>{
  const parent=new AbortController();
  const pending=readResponse('/synthetic',{signal:parent.signal,timeoutMs:1000,fetchImpl:async(_url,options)=>new Promise((_,reject)=>{
    options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});
  })});
  await Promise.resolve();parent.abort();await assert.rejects(pending,{name:'AbortError'});
});
