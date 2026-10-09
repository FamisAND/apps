import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {packSnapshot,unpackSnapshot,CODEC_VERSION} from '../src/snapshot-codec.mjs';
import {sha256,validKey} from '../src/records.mjs';
const [sourcePath,outPath]=process.argv.slice(2);
if(!sourcePath||!outPath)throw new Error('Provide an existing private backup and a NEW directory inside .full-training-backups');
const source=await realpath(sourcePath),parent=await realpath(path.dirname(outPath)),output=path.join(parent,path.basename(outPath));
const parts=output.toLowerCase().split(path.sep);
if(!parts.includes('.full-training-backups'))throw new Error('Private migration output must stay inside .full-training-backups, never a published project');
try{await stat(output);throw new Error('Output exists: never overwrite a migration rehearsal');}catch(error){if(error.code!=='ENOENT')throw error;}
const bytes=await readFile(source),original=JSON.parse(bytes.toString('utf8')),sourceHash=await sha256(bytes.toString('utf8'));
const namespaces=['training','training_online','tob_menus_catalog','options','patrimonio','facturas'];
const id='rehearsal-'+sourceHash.slice(0,16),at=new Date().toISOString();
const bundles=[],summary=[],schema=await readFile(new URL('../business-migrations/0001_records.sql',import.meta.url),'utf8');
// All verification happens in memory before any output or data transfer is possible.
const db=new DatabaseSync(':memory:');
try{
  db.exec(schema);db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run(id,'staging',sourceHash,CODEC_VERSION,at);
  db.exec('BEGIN');
  const insert=db.prepare('INSERT INTO record_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  for(const namespace of namespaces){
    if(!Object.hasOwn(original,namespace))continue;
    const records=await packSnapshot(original[namespace]),rows=[];
    for(const [key,value]of records){
      if(!validKey(key))throw new Error('Record key too large; stop and review before migration');
      const payload=JSON.stringify(value),hash=await sha256(payload),size=Buffer.byteLength(payload);
      assert.ok(size<=96*1024,'Oversized record: stop before importing');
      insert.run(id,namespace,key,1,'import',payload,hash,0,'migration-rehearsal',null,at);
      rows.push({key,payload,sha256:hash});
    }
    const loaded=new Map();
    for(const row of db.prepare('SELECT * FROM records WHERE dataset_id=? AND namespace=? ORDER BY record_key').all(id,namespace)){
      assert.equal(await sha256(row.payload),row.payload_sha256);
      loaded.set(row.record_key,JSON.parse(row.payload));
    }
    const restored=await unpackSnapshot(loaded);
    assert.deepEqual(restored,original[namespace]);
    summary.push({namespace,records:rows.length,sourceBytes:Buffer.byteLength(JSON.stringify(original[namespace])),maxRecordBytes:Math.max(...rows.map(r=>Buffer.byteLength(r.payload))),roundtripExact:true});
    bundles.push({namespace,records:rows});
  }
  db.exec('COMMIT');
  db.prepare("UPDATE datasets SET status='verified' WHERE id=?").run(id);
  const count=db.prepare('SELECT count(*) AS n FROM records').get().n;
  assert.equal(count,summary.reduce((n,s)=>n+s.records,0));
  await mkdir(output);
  const bundle={codecVersion:CODEC_VERSION,datasetId:id,sourceSha256:sourceHash,createdAt:at,sourceMetadata:{version:original.version,lastUpdate:original.lastUpdate},namespaces:bundles};
  await writeFile(path.join(output,'migration-bundle.private.json'),JSON.stringify(bundle),{flag:'wx'});
  const quote=value=>value===null?'NULL':"'"+String(value).replaceAll("'","''")+"'";
  const sql=[`INSERT INTO datasets VALUES(${[id,'staging',sourceHash,CODEC_VERSION,at].map(quote).join(',')});`];
  for(const namespace of bundles)for(const row of namespace.records)sql.push(`INSERT INTO record_versions VALUES(${[id,namespace.namespace,row.key,1,'import',row.payload,row.sha256,0,'migration-import',null,at].map(quote).join(',')});`);
  assert.ok(sql.every(statement=>Buffer.byteLength(statement)<=100000),'SQL statement exceeds the D1 import limit: stop before transfer');
  await writeFile(path.join(output,'staging-import.private.sql'),sql.join('\n'),{flag:'wx'});
  await writeFile(path.join(output,'verification.private.json'),JSON.stringify({source,sourceSha256:sourceHash,datasetId:id,summary,totalRecords:count,excludedSharedSections:Object.keys(original).filter(key=>!namespaces.includes(key)),status:'LOCAL_REHEARSAL_ONLY',productionWrites:0,rollback:'Original GitHub and Chrome storage unchanged. Staging remains unreadable and cannot receive normal writes. Never replace the old JSON with a pre-migration snapshot after new edits.'},null,2),{flag:'wx'});
  console.log(JSON.stringify({status:'LOCAL_REHEARSAL_VERIFIED',totalRecords:count,summary,output,productionWrites:0},null,2));
}finally{db.close();}
