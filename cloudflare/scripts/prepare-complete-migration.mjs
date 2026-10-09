import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {packSnapshot,unpackSnapshot,CODEC_VERSION} from '../src/snapshot-codec.mjs';
import {sha256} from '../src/hash.mjs';
import {photoNamespace,photoValue} from '../src/media-format.mjs';
import {sealSettings,openSettings} from '../src/settings-crypto.mjs';

const [sourcePath,photosPath,outPath,settingsKeyPath]=process.argv.slice(2);
if(!sourcePath||!photosPath||!outPath)throw new Error('Provide private source, verified photos and a NEW private output directory');
const source=await realpath(sourcePath),photos=await realpath(photosPath),parent=await realpath(path.dirname(outPath)),output=path.join(parent,path.basename(outPath));
for(const file of [source,photos,output])if(!file.toLowerCase().split(path.sep).includes('.full-training-backups'))throw new Error('All data must remain inside the private backup root');
try{await stat(output);throw new Error('Never overwrite an existing rehearsal');}catch(error){if(error.code!=='ENOENT')throw error;}
const sourceBytes=await readFile(source),photoBytes=await readFile(photos),original=JSON.parse(sourceBytes),sets=JSON.parse(photoBytes);
const sourceHash=await sha256(sourceBytes.toString('utf8')),photosHash=await sha256(photoBytes.toString('utf8'));
const combinedHash=await sha256(JSON.stringify({sourceHash,photosHash})),id='complete-'+combinedHash.slice(0,16),at=new Date().toISOString();
const namespaces=['training','training_online','tob_menus_catalog','options','patrimonio','facturas'];
const catalog=typeof original.tob_menus_catalog==='string'?JSON.parse(original.tob_menus_catalog):original.tob_menus_catalog;
const images=new Map();
for(const set of sets)for(const image of set.images){
  const namespace=await photoNamespace(image.id),value=await photoValue(image.id,image.dataUrl);
  assert.equal(value.sha256,image.sha256);assert.equal(value.bytes,image.bytes);
  if(images.has(namespace))assert.deepEqual(images.get(namespace),value,'Conflicting photo copies: stop, never choose by timestamp');
  images.set(namespace,value);
}
for(const recipe of catalog.recetas.filter(recipe=>recipe._fotoLocal))assert.ok(images.has(await photoNamespace(recipe.id)),'Missing recipe photo: stop before import');
const values=new Map(namespaces.filter(namespace=>Object.hasOwn(original,namespace)).map(namespace=>[namespace,original[namespace]]));
values.set('__dashboard_config',original.__dashboard_config||{});
for(const [namespace,value]of images)values.set(namespace,value);
let secret;
if(settingsKeyPath){
  const keyFile=await realpath(settingsKeyPath);
  if(!keyFile.toLowerCase().split(path.sep).includes('.full-training-backups'))throw new Error('Settings key must remain inside the private backup root');
  secret=JSON.parse(await readFile(keyFile,'utf8')).SETTINGS_ENCRYPTION_KEY;
  if(typeof secret!=='string'||Buffer.from(secret,'base64').length!==32)throw new Error('Invalid backed-up settings key');
}else{
  secret=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}
const privateSections=Object.fromEntries(Object.entries(original).filter(([namespace])=>!namespaces.includes(namespace)&&namespace!=='__dashboard_config'));
const sealed=await sealSettings({sections:privateSections},secret,id);assert.deepEqual(await openSettings(sealed,secret,id),{sections:privateSections});
const db=new DatabaseSync(':memory:'),bundles=[],summary=[];
try{
  db.exec(await readFile(new URL('../business-migrations/0001_records.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run(id,'staging',combinedHash,CODEC_VERSION,at);
  const insert=db.prepare('INSERT INTO record_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  for(const [namespace,value]of [...values,['private_settings',sealed]]){
    const records=namespace==='private_settings'?new Map([['root',value]]):await packSnapshot(value),rows=[];
    for(const [key,node]of records){
      const payload=JSON.stringify(node),hash=await sha256(payload);assert.ok(Buffer.byteLength(payload)<=96*1024);
      insert.run(id,namespace,key,1,'import',payload,hash,0,'migration-rehearsal',null,at);rows.push({key,payload,sha256:hash});
    }
    const loaded=new Map(db.prepare('SELECT * FROM records WHERE dataset_id=? AND namespace=?').all(id,namespace).map(row=>[row.record_key,JSON.parse(row.payload)]));
    assert.deepEqual(namespace==='private_settings'?loaded.get('root'):await unpackSnapshot(loaded),value);
    bundles.push({namespace,records:rows});summary.push({namespace,records:rows.length,roundtripExact:true});
  }
  const totalRecords=summary.reduce((total,row)=>total+row.records,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n,totalRecords);
  const quote=value=>value===null?'NULL':"'"+String(value).replaceAll("'","''")+"'";
  const sql=[`INSERT INTO datasets VALUES(${[id,'staging',combinedHash,CODEC_VERSION,at].map(quote).join(',')});`];
  for(const bundle of bundles)for(const row of bundle.records)sql.push(`INSERT INTO record_versions VALUES(${[id,bundle.namespace,row.key,1,'import',row.payload,row.sha256,0,'migration-import',null,at].map(quote).join(',')});`);
  assert.ok(sql.every(statement=>Buffer.byteLength(statement)<=100000),'Oversized SQL import statement');
  await mkdir(output);
  await writeFile(path.join(output,'migration-bundle.private.json'),JSON.stringify({codecVersion:CODEC_VERSION,datasetId:id,sourceSha256:combinedHash,createdAt:at,namespaces:bundles}),{flag:'wx'});
  await writeFile(path.join(output,'staging-import.private.sql'),sql.join('\n'),{flag:'wx'});
  await writeFile(path.join(output,'worker-secret.private.json'),JSON.stringify({SETTINGS_ENCRYPTION_KEY:secret}),{flag:'wx'});
  await writeFile(path.join(output,'verification.private.json'),JSON.stringify({datasetId:id,sourceSha256:sourceHash,photosSha256:photosHash,combinedSha256:combinedHash,totalRecords,photoCount:images.size,mainSections:summary.filter(row=>namespaces.includes(row.namespace)),privateSettingsEncrypted:true,originalSourcesUnchanged:Buffer.compare(sourceBytes,await readFile(source))===0&&Buffer.compare(photoBytes,await readFile(photos))===0,status:'LOCAL_REHEARSAL_ONLY',productionWrites:0},null,2),{flag:'wx'});
  console.log(JSON.stringify({datasetId:id,totalRecords,photoCount:images.size,privateSettingsEncrypted:true,status:'LOCAL_REHEARSAL_VERIFIED',productionWrites:0,output}));
}finally{db.close();}
