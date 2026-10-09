import {readFile,realpath} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import path from 'node:path';
import {RecordClient} from '../src/record-client.mjs';
import {unpackSnapshot,CODEC_VERSION} from '../src/snapshot-codec.mjs';
import {listRecords,commitRecords,sha256} from '../src/records.mjs';

const [sourcePath,bundlePath]=process.argv.slice(2);
if(!sourcePath||!bundlePath)throw new Error('Provide a verified private backup and its migration bundle');
const source=await realpath(sourcePath),bundleFile=await realpath(bundlePath);
for(const file of [source,bundleFile])if(!file.toLowerCase().split(path.sep).includes('.full-training-backups'))throw new Error('Only private backups may be used; never live browser data');
const bytes=await readFile(source),original=JSON.parse(bytes.toString('utf8'));
const bundle=JSON.parse(await readFile(bundleFile,'utf8'));
assert.equal(bundle.sourceSha256,await sha256(bytes.toString('utf8')));
assert.equal(bundle.codecVersion,CODEC_VERSION);
const namespaces=['training','training_online','tob_menus_catalog','options','patrimonio','facturas'];
assert.deepEqual(bundle.namespaces.map(item=>item.namespace).sort(),namespaces.toSorted());
const db=new DatabaseSync(':memory:'),at=new Date().toISOString(),summary=[];
const sameSnapshot=(actual,expected,message)=>assert.ok(isDeepStrictEqual(actual,expected),message);

// Real data is read only. The active dataset and all changes exist solely in RAM.
try{
  db.exec(await readFile(new URL('../business-migrations/0001_records.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run('isolated-fixture','staging',bundle.sourceSha256,CODEC_VERSION,at);
  const insert=db.prepare('INSERT INTO record_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  for(const section of bundle.namespaces)for(const row of section.records){
    assert.equal(await sha256(row.payload),row.sha256);
    insert.run('isolated-fixture',section.namespace,row.key,1,'import',row.payload,row.sha256,0,'isolated-import',null,at);
  }
  db.exec('COMMIT');db.exec("UPDATE datasets SET status='active'");
  function prepare(sql){
    let values=[];
    return {bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return db.prepare(sql).run(...values);}};
  }
  const binding={prepare,async batch(statements){
    db.exec('BEGIN');try{for(const statement of statements)await statement.run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  }};
  function client(actor,copies=[]){
    return new RecordClient({checkpoint:async event=>copies.push(structuredClone(event)),fetchImpl:async(url,options)=>{
      const request=new URL(url,'https://isolated.invalid'),namespace=decodeURIComponent(request.pathname.split('/')[3]);
      assert.ok(namespaces.includes(namespace));
      try{
        const result=options.method==='POST'
          ?await commitRecords(binding,'isolated-fixture',namespace,actor,JSON.parse(options.body))
          :await listRecords(binding,'isolated-fixture',namespace,request.searchParams.get('cursor')||'',request.searchParams.has('generation')?Number(request.searchParams.get('generation')):null);
        return Response.json(result);
      }catch(error){if(!error.status)throw error;return Response.json({error:error.message},{status:error.status});}
    }});
  }
  function numericField(node){
    if(node?.type!=='value'||!node.value||typeof node.value!=='object'||Array.isArray(node.value))return null;
    function find(value,keys=[]){
      if(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<Number.MAX_SAFE_INTEGER-10)return keys;
      if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){
        if(/id$/i.test(key))continue;
        const found=find(child,[...keys,key]);if(found)return found;
      }
      return null;
    }
    return find(node.value);
  }
  async function altered(base,key,field,increment){
    const records=new Map([...base.records].filter(([,row])=>!row.deleted).map(([key,row])=>[key,structuredClone(row.value)]));
    let target=records.get(key).value;
    for(const part of field.slice(0,-1))target=target[part];
    target[field.at(-1)]+=increment;
    return {records,value:await unpackSnapshot(records)};
  }
  const expectedByNamespace=new Map();
  for(const namespace of namespaces){
    const a=client('isolated-a'),b=client('isolated-b');
    sameSnapshot(await a.load(namespace),original[namespace],'First roundtrip failed in '+namespace);
    sameSnapshot(await b.load(namespace),original[namespace],'Second roundtrip failed in '+namespace);
    const base=a.bases.get(namespace),candidates=[...base.records].filter(([,row])=>numericField(row.value));
    assert.ok(candidates.length>=2,'Two independent editable records are required in '+namespace);
    const [[keyA,rowA],[keyB,rowB]]=candidates,fieldA=numericField(rowA.value),fieldB=numericField(rowB.value);
    const changeA=await altered(base,keyA,fieldA,1),changeB=await altered(base,keyB,fieldB,1);
    const writesBefore=db.prepare('SELECT count(*) AS n FROM write_requests').get().n;
    await a.save(namespace,changeA.value);await b.save(namespace,changeB.value);
    const both=changeA.records;both.set(keyB,changeB.records.get(keyB));
    const merged=await unpackSnapshot(both),reader=client('isolated-reader');
    sameSnapshot(await reader.load(namespace),merged,'Independent edits were not preserved in '+namespace);
    assert.equal(db.prepare('SELECT count(*) AS n FROM write_requests').get().n,writesBefore+2);
    for(const saved of [a,b]){
      const versions=db.prepare("SELECT count(*) AS n FROM record_versions WHERE namespace=? AND actor_id=? AND operation='put'").get(namespace,saved===a?'isolated-a':'isolated-b').n;
      assert.equal(versions,1,'An unrelated record was changed in '+namespace);
    }
    const c=client('isolated-c'),copies=[],d=client('isolated-d',copies);
    await c.load(namespace);await d.load(namespace);
    const conflictBase=c.bases.get(namespace),changeC=await altered(conflictBase,keyA,fieldA,2),changeD=await altered(conflictBase,keyA,fieldA,3);
    await c.save(namespace,changeC.value);
    const beforeConflict=db.prepare('SELECT count(*) AS n FROM write_requests').get().n;
    await assert.rejects(()=>d.save(namespace,changeD.value),{status:409});
    assert.equal(db.prepare('SELECT count(*) AS n FROM write_requests').get().n,beforeConflict);
    sameSnapshot(d.pending.get(namespace).value,changeD.value,'In-memory draft was lost in '+namespace);
    sameSnapshot(copies.at(-1).value,changeD.value,'Checkpoint draft was lost in '+namespace);
    sameSnapshot(await reader.load(namespace),changeC.value,'A stale write changed central data in '+namespace);
    expectedByNamespace.set(namespace,changeC.value);
    summary.push({namespace,records:base.records.size,roundtripExact:true,independentEditsPreserved:true,sameRecordConflictBlocked:true,pendingDraftPreserved:true,unrelatedRecordsChanged:0});
  }
  for(const namespace of namespaces)sameSnapshot(await client('isolated-final').load(namespace),expectedByNamespace.get(namespace),'Cross-module isolation failed in '+namespace);
  assert.equal(await sha256((await readFile(source)).toString('utf8')),bundle.sourceSha256);
  console.log(JSON.stringify({status:'ISOLATED_MEMORY_ONLY',sourceSha256:bundle.sourceSha256,summary,productionWrites:0,backupWrites:0,authenticatedAdminVerified:false},null,2));
}finally{db.close();}
