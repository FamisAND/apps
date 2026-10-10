import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../../app-session.js',import.meta.url),'utf8');
for(const [status,expected]of [[401,/caducado o se ha revocado/],[403,/verificar tu acceso/],[503,/servicio de sesiones.*HTTP 503/]]){
  test('session UI explains HTTP '+status+' without clearing or writing local data',async()=>{
    const writes=[],window={};
    runInNewContext(source,{window,fetch:async()=>new Response('{}',{status}),document:{body:null,addEventListener(){}},localStorage:{getItem(){return null;},setItem(...args){writes.push(args);}},setInterval(){}});
    await assert.rejects(window.FTSession.ready,expected);
    assert.equal(window.FTSession.active,false);assert.deepEqual(writes,[]);
  });
}

const syncSource=readFileSync(new URL('../../github-sync.js',import.meta.url),'utf8');
for(const mode of ['pending-conflict','failed-save'])test('single central status receives '+mode+' instead of only the hidden legacy badge',async()=>{
  class Storage{constructor(){this.values=new Map([['tob_online_v2','{"value":1}']]);}getItem(key){return this.values.get(key)??null;}setItem(key,value){this.values.set(key,String(value));}removeItem(key){this.values.delete(key);}}
  const localStorage=new Storage(),statuses=[],window={localStorage,addEventListener(){},FTSession:{dataMode:'records',active:true}};
  window.FTRecords={client:{pending:new Map(mode==='pending-conflict'?[['training_online',{value:{tob_online_v2:{value:2}}}]]:[])},status:(...args)=>statuses.push(args),save:async()=>{throw new Error('Synthetic server failure');},pending:()=>true};
  runInNewContext(syncSource,{window,Storage,localStorage,clearTimeout,setTimeout,console:{log(){}}});
  window.GitHubSync.attach({section:'training_online',keys:['tob_online_v2']});
  await assert.rejects(window.GitHubSync.flush(),mode==='pending-conflict'?/formulario difiere/:/Synthetic server failure/);
  assert.equal(statuses.length,1);assert.equal(statuses[0][0],'training_online');assert.equal(statuses[0][1],mode==='pending-conflict'?'conflict':'error');
  assert.equal(localStorage.getItem('tob_online_v2'),'{"value":1}');
});
