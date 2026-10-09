import {readFile,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {unpackSnapshot,CODEC_VERSION} from '../src/snapshot-codec.mjs';
import {sha256} from '../src/hash.mjs';
import {openSettings} from '../src/settings-crypto.mjs';

const [sourcePath,bundlePath,exportPath,expectedStatus='staging']=process.argv.slice(2);
if(!sourcePath||!bundlePath||!exportPath)throw new Error('Provide source backup, private bundle and fresh D1 export');
assert.ok(['staging','verified','active'].includes(expectedStatus),'Invalid expected dataset status');
const source=await realpath(sourcePath),bundleFile=await realpath(bundlePath),exportFile=await realpath(exportPath);
for(const file of [source,bundleFile,exportFile]){
  assert.ok(file.toLowerCase().split(path.sep).includes('.full-training-backups'),'All inputs must remain in private backups');
}
const sourceText=await readFile(source,'utf8'),original=JSON.parse(sourceText);
const bundle=JSON.parse(await readFile(bundleFile,'utf8')),exportText=await readFile(exportFile,'utf8');
const preflight=JSON.parse(await readFile(path.join(path.dirname(bundleFile),'verification.private.json'),'utf8'));
assert.equal(await sha256(sourceText),preflight.sourceSha256);
assert.equal(bundle.codecVersion,CODEC_VERSION);
const db=new DatabaseSync(':memory:');
try{
  // Reconstruct the official export in isolation, never against a live database.
  db.exec(exportText);
  const datasets=db.prepare('SELECT * FROM datasets WHERE id=?').all(bundle.datasetId);
  assert.equal(datasets.length,1);
  assert.equal(datasets[0].id,bundle.datasetId);
  assert.equal(datasets[0].status,expectedStatus);
  assert.equal(datasets[0].source_sha256,bundle.sourceSha256);
  assert.equal(datasets[0].codec_version,CODEC_VERSION);
  assert.equal(db.prepare('SELECT count(*) AS n FROM write_requests WHERE dataset_id=?').get(bundle.datasetId).n,0);
  const expectedCount=bundle.namespaces.reduce((n,section)=>n+section.records.length,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM records WHERE dataset_id=?').get(bundle.datasetId).n,expectedCount);
  assert.equal(db.prepare('SELECT count(*) AS n FROM record_versions WHERE dataset_id=?').get(bundle.datasetId).n,expectedCount);
  const summary=[];
  for(const section of bundle.namespaces){
    const rows=db.prepare('SELECT * FROM records WHERE dataset_id=? AND namespace=? ORDER BY record_key').all(bundle.datasetId,section.namespace);
    assert.equal(rows.length,section.records.length);
    const expected=new Map(section.records.map(row=>[row.key,row])),loaded=new Map();
    for(const row of rows){
      const input=expected.get(row.record_key);
      assert.ok(input,'Unexpected remote record');
      assert.equal(row.payload,input.payload);
      assert.equal(row.payload_sha256,input.sha256);
      assert.equal(await sha256(row.payload),input.sha256);
      assert.equal(row.payload_bytes,Buffer.byteLength(row.payload));
      assert.equal(row.version,1);
      assert.equal(row.deleted,0);
      assert.equal(row.actor_id,'migration-import');
      const history=db.prepare('SELECT * FROM record_versions WHERE dataset_id=? AND namespace=? AND record_key=?').all(bundle.datasetId,section.namespace,row.record_key);
      assert.equal(history.length,1);
      assert.equal(history[0].operation,'import');
      assert.equal(history[0].request_id,null);
      assert.equal(history[0].payload,row.payload);
      assert.equal(history[0].payload_sha256,row.payload_sha256);
      assert.equal(history[0].version,1);
      loaded.set(row.record_key,JSON.parse(row.payload));
    }
    if(section.namespace==='private_settings'){
      const secret=JSON.parse(await readFile(path.join(path.dirname(bundleFile),'worker-secret.private.json'),'utf8'));
      const value=await openSettings(loaded.get('root'),secret.SETTINGS_ENCRYPTION_KEY,bundle.datasetId);
      for(const [key,item]of Object.entries(value.sections))assert.deepEqual(item,original[key]);
    }else{
      const restored=await unpackSnapshot(loaded),expectedValue=await unpackSnapshot(new Map(section.records.map(row=>[row.key,JSON.parse(row.payload)])));
      assert.deepEqual(restored,expectedValue);
      if(Object.hasOwn(original,section.namespace))assert.deepEqual(restored,original[section.namespace]);
    }
    summary.push({namespace:section.namespace,records:rows.length,hashesExact:true,roundtripExact:true});
  }
  const report={status:expectedStatus==='active'?'ACTIVE_DATASET_BACKUP_VERIFIED':'REMOTE_COPY_VERIFIED_NOT_ACTIVATED',verifiedAt:new Date().toISOString(),datasetId:bundle.datasetId,
    sourceSha256:bundle.sourceSha256,exportSha256:await sha256(exportText),totalRecords:expectedCount,
    datasetStatus:expectedStatus,normalWriteRequests:0,summary,originalsChanged:false};
  await writeFile(path.join(path.dirname(exportFile),'remote-verification.private.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({...report,summary:summary.filter(row=>!row.namespace.startsWith('recipe_photo_')),photoNamespaces:summary.filter(row=>row.namespace.startsWith('recipe_photo_')).length},null,2));
}finally{db.close();}
