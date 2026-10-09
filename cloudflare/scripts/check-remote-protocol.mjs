import assert from 'node:assert/strict';
import {mkdir,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {getPlatformProxy} from 'wrangler';
import {packSnapshot,unpackSnapshot} from '../src/snapshot-codec.mjs';
import {commitRecords,listRecords,sha256} from '../src/records.mjs';
import {RecordClient} from '../src/record-client.mjs';

const [outputArg]=process.argv.slice(2);
if(!outputArg)throw new Error('Provide a NEW private verification directory');
const output=path.join(await realpath(path.dirname(outputArg)),path.basename(outputArg));
assert.ok(output.split(path.sep).includes('.full-training-backups'));
await mkdir(output);
const proxy=await getPlatformProxy({configPath:'wrangler.protocol-validation.jsonc',remoteBindings:true,persist:false,envFiles:[]});
const db=proxy.env.DATA_DB,id='protocol-check-'+crypto.randomUUID(),namespace='migration_validation',at=new Date().toISOString();
let created=false,report;
try{
  await db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').bind(id,'staging',await sha256('synthetic protocol verification'),1,at).run();created=true;
  const value=(first,second)=>({items:[{id:'synthetic-first',count:first},{id:'synthetic-second',count:second}]});
  const seed=value(1,2);
  for(const [key,value]of await packSnapshot(seed)){
    const payload=JSON.stringify(value);
    await db.prepare('INSERT INTO record_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,namespace,key,1,'import',payload,await sha256(payload),0,'synthetic-import',null,at).run();
  }
  await db.prepare("UPDATE datasets SET status='active' WHERE id=? AND status='staging'").bind(id).run();
  let loseReply=false,lostRequestId;
  const checkpoints=[];
  const client=actor=>new RecordClient({checkpoint:async event=>{checkpoints.push(structuredClone(event));},fetchImpl:async(url,options={})=>{
    try{
      const parsed=new URL(url,'https://isolated-check.invalid');
      let result;
      if(options.method==='POST'){
        const request=JSON.parse(options.body);result=await commitRecords(db,id,namespace,actor,request);
        if(loseReply){loseReply=false;lostRequestId=request.requestId;throw Object.assign(new Error('Synthetic lost response'),{lost:true});}
      }else result=await listRecords(db,id,namespace,parsed.searchParams.get('cursor')||'',parsed.searchParams.has('generation')?Number(parsed.searchParams.get('generation')):null);
      return Response.json(result);
    }catch(error){if(error.lost)throw error;return Response.json({error:error.message},{status:error.status||503});}
  }});
  const a=client('synthetic-session-a'),b=client('synthetic-session-b');
  const av=await a.load(namespace),bv=await b.load(namespace);
  av.items[0].count=3;bv.items[1].count=4;
  await a.save(namespace,av);await b.save(namespace,bv);
  const reader=client('synthetic-reader');
  assert.deepEqual(await reader.load(namespace),value(3,4));
  const c=client('synthetic-session-c'),d=client('synthetic-session-d');
  const cv=await c.load(namespace),dv=await d.load(namespace);
  cv.items[0].count=5;dv.items[0].count=99;dv.items[1].count=99;
  await c.save(namespace,cv);
  await assert.rejects(d.save(namespace,dv),error=>error.status===409);
  assert.ok(d.pending.has(namespace));
  assert.deepEqual(await reader.load(namespace),value(5,4));
  const retry=client('synthetic-retry'),rv=await retry.load(namespace);rv.items[1].count=6;loseReply=true;
  await assert.rejects(retry.save(namespace,rv),/Synthetic lost response/);
  const receipt=await retry.retry(namespace);assert.equal(receipt.requestId,lostRequestId);assert.equal(receipt.replayed,true);
  assert.deepEqual(await reader.load(namespace),value(5,6));
  assert.equal((await db.prepare('SELECT count(*) AS n FROM write_requests WHERE dataset_id=? AND request_id=?').bind(id,lostRequestId).first()).n,1);
  const rows=(await db.prepare('SELECT record_key,payload FROM records WHERE dataset_id=? AND namespace=?').bind(id,namespace).all()).results;
  assert.deepEqual(await unpackSnapshot(new Map(rows.map(row=>[row.record_key,JSON.parse(row.payload)]))),value(5,6));
  report={status:'REAL_D1_PROTOCOL_VERIFIED',datasetId:id,syntheticOnly:true,businessDataChanged:false,
    independentChangesPreserved:true,staleBatchEntirelyRejected:true,rejectedDraftRetained:true,lostReplyRetryIdempotent:true,checkpoints:checkpoints.length};
}finally{
  if(created)await db.prepare("UPDATE datasets SET status='retired' WHERE id=?").bind(id).run();
  await proxy.dispose();
}
await writeFile(path.join(output,'verification.private.json'),JSON.stringify({...report,testDatasetRetired:true},null,2),{flag:'wx'});
console.log(JSON.stringify({...report,testDatasetRetired:true},null,2));
