const assert=require('node:assert/strict');
const http=require('node:http');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
  const root=path.resolve(__dirname,'..','src');
  const server=http.createServer(async(request,response)=>{
    try{
      if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Synthetic checkpoint tests</title>');return;}
      const files=['hash.mjs','snapshot-codec.mjs','record-client.mjs','checkpoint-store.mjs'];
      const file=request.url.slice(1);
      if(!files.includes(file)){response.writeHead(404);response.end();return;}
      response.setHeader('Content-Type','text/javascript');response.end(await readFile(path.join(root,file)));
    }catch(_error){response.writeHead(500);response.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  console.log('Isolated browser launched');
  try{
    const context=await browser.newContext(),page=await context.newPage();
    page.on('console',message=>console.log('Browser: '+message.text()));
    await page.goto('http://127.0.0.1:'+server.address().port);
    let timer;
    const result=await Promise.race([page.evaluate(async()=>{
      const {CheckpointStore}=await import('/checkpoint-store.mjs');
      const {RecordClient}=await import('/record-client.mjs');
      const {packSnapshot}=await import('/snapshot-codec.mjs');
      const {sha256}=await import('/hash.mjs');
      const verify=(condition,message)=>{if(!condition)throw new Error(message);};
      const original={clientes:[{id:'synthetic-a',mediciones:[{id:'synthetic-m',peso:60}]}]};
      const records=[];
      for(const [key,value]of await packSnapshot(original))records.push({key,version:1,value,sha256:await sha256(JSON.stringify(value)),deleted:false});
      const receipts=new Map();let lose=true,postCount=0;
      async function fetchImpl(_url,options){
        if(options.method!=='POST')return Response.json({datasetId:'synthetic',generation:0,records,nextCursor:null});
        postCount++;const request=JSON.parse(options.body);
        if(receipts.has(request.requestId))return Response.json({...receipts.get(request.requestId),replayed:true});
        const receipt={datasetId:'synthetic',requestId:request.requestId,committedAt:new Date().toISOString(),records:[]};
        for(const operation of request.operations)receipt.records.push({key:operation.key,version:operation.expectedVersion+1,sha256:await sha256(JSON.stringify(operation.value)),deleted:false});
        receipts.set(request.requestId,receipt);
        if(lose){lose=false;throw new TypeError('Synthetic lost response');}
        return Response.json(receipt);
      }
      const store=new CheckpointStore({ownerId:'synthetic-admin'});
      const client=new RecordClient({fetchImpl,checkpoint:event=>store.checkpoint(event)});
      const value=await client.load('training_online');value.clientes[0].mediciones[0].peso=61;
      console.log('Verified base persisted');
      try{await client.save('training_online',value);throw new Error('Expected lost response');}catch(error){verify(/lost response/.test(error.message),'Unexpected pending error');}
      const pending=await store.state('training_online'),requestId=pending.pending.requestId;
      console.log('Pending persisted');
      verify(pending.pending.value.clientes[0].mediciones[0].peso===61,'Pending draft lost');
      await store.close();
      const recovered=new CheckpointStore({ownerId:'synthetic-admin'}),restarted=new RecordClient({fetchImpl,checkpoint:event=>recovered.checkpoint(event)});
      await restarted.restore('training_online',await recovered.state('training_online'));
      const receipt=await restarted.retry('training_online');
      console.log('Pending recovered and confirmed');
      verify(receipt.requestId===requestId&&receipt.replayed===true,'Retry changed its request');
      verify(receipts.size===1&&postCount===2,'Duplicate server commit');
      const confirmed=await recovered.state('training_online');
      verify(!confirmed.pending&&confirmed.base.value.clientes[0].mediciones[0].peso===61,'Confirmed draft lost');
      const exported=await recovered.exportCopies();verify(exported.entries.length===3,'Append-only history lost');
      const other=new CheckpointStore({ownerId:'synthetic-other'});
      verify(await other.state('training_online')===null,'Copies exposed across accounts');
      verify((await other.exportCopies()).entries.length===0,'Export exposed another account');
      const stale=new CheckpointStore({ownerId:'synthetic-admin'});
      await stale.state('training_online');
      await recovered.checkpoint({kind:'verified-load',...confirmed.base});
      verify((await recovered.exportCopies()).entries.length===3,'Identical reload duplicated the full snapshot');
      const centralValue=structuredClone(confirmed.base.value);centralValue.clientes[0].mediciones[0].peso=62;
      const centralRecords=[];
      for(const [key,value]of await packSnapshot(centralValue)){
        const previous=new Map(confirmed.base.records).get(key),hash=await sha256(JSON.stringify(value));
        centralRecords.push([key,{key,value,sha256:hash,version:previous.version+(hash!==previous.sha256?1:0),deleted:false}]);
      }
      const centralBase={namespace:'training_online',datasetId:'synthetic',generation:2,records:centralRecords,value:centralValue};
      await recovered.checkpoint({kind:'verified-load',...centralBase});
      try{await stale.checkpoint({kind:'verified-load',...centralBase});throw new Error('Expected stale checkpoint');}catch(error){verify(/Otra pestana/.test(error.message),'Stale checkpoint not rejected');}
      verify((await recovered.exportCopies()).entries.length===4,'Stale tab changed history');
      console.log('Account isolation and stale-tab guard passed');
      const draft=structuredClone(centralValue);draft.clientes[0].mediciones[0].peso=63;
      await recovered.checkpoint({kind:'draft',namespace:'training_online',datasetId:'synthetic',value:draft});
      const draftStore=new CheckpointStore({ownerId:'synthetic-admin'}),draftState=await draftStore.state('training_online');
      verify(draftState.draft.value.clientes[0].mediciones[0].peso===63&&draftState.base.value.clientes[0].mediciones[0].peso===62,'Draft did not survive reopening');
      const draftClient=new RecordClient({fetchImpl,checkpoint:event=>draftStore.checkpoint(event)});
      await draftClient.restore('training_online',draftState);await draftClient.save('training_online',draft);
      const saved=await draftStore.state('training_online');
      verify(!saved.draft&&!saved.pending&&saved.base.value.clientes[0].mediciones[0].peso===63,'Draft confirmation lost its base');
      await draftStore.checkpoint({kind:'draft',namespace:'training_online',datasetId:'synthetic',value:draft});
      verify((await draftClient.save('training_online',draft)).unchanged===true,'Unchanged save sent a new write');
      verify(!(await draftStore.state('training_online')).draft,'Unchanged save did not clear the unchanged draft');
      const rejected=structuredClone(draft);rejected.clientes[0].mediciones[0].peso=64;
      await draftStore.checkpoint({kind:'draft',namespace:'training_online',datasetId:'synthetic',value:rejected});
      const countBeforeResolve=postCount;
      await draftStore.checkpoint({kind:'resolved-remote',namespace:'training_online',previousId:draftStore.heads.get('training_online'),base:centralBase});
      const resolved=await draftStore.state('training_online'),copies=await draftStore.exportCopies();
      verify(resolved.base.value.clientes[0].mediciones[0].peso===62&&!resolved.draft&&!resolved.pending,'Explicit resolution did not select the verified central copy');
      verify(copies.entries.some(row=>{const event=JSON.parse(row.payload);return event.kind==='draft'&&event.value.clientes[0].mediciones[0].peso===64;}),'Resolution discarded the previous draft');
      verify(postCount===countBeforeResolve,'Selecting the central copy wrote to the server');
      console.log('Draft reopening, unchanged save and explicit resolution passed');
      // Deliberate corruption is confined to this fresh synthetic browser context.
      const db=await draftStore.open(),head=await draftStore.get('heads',draftStore.key('training_online'));
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('entries','readwrite'),entries=tx.objectStore('entries'),read=entries.get(head.id);
        read.onsuccess=()=>{const row=read.result;row.payload='{}';entries.put(row);};
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
      });
      try{await draftStore.state('training_online');throw new Error('Expected checksum failure');}catch(error){verify(/verificacion/.test(error.message),'Corruption not detected');}
      const forensic=await draftStore.exportCopies({allowUnverified:true});
      verify(!forensic.verified&&forensic.unverifiedEntryIds.includes(head.id)&&forensic.entries.length===copies.entries.length,'Forensic export lost the corrupt copy');
      await recovered.close();await stale.close();await other.close();await draftStore.close();
      return {pendingSurvivesReopen:true,retryIdempotent:true,confirmationVerified:true,historyAppendOnly:true,accountIsolation:true,staleTabRejected:true,reloadDeduplicated:true,draftSurvivesReopen:true,unchangedSaveSafe:true,resolutionPreservesDraft:true,corruptionRejected:true,forensicExportPreservesCopies:true};
    }),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Synthetic browser test timed out')),30000);})]).finally(()=>clearTimeout(timer));
    assert.ok(Object.values(result).every(value=>value===true));
    await context.close();console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
})().catch(error=>{console.error(error);process.exitCode=1;});
