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
