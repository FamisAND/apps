import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildAssets} from '../asset-builder.mjs';
import {FILE_MODULE,COMMON_FILES,RECORD_FILES} from '../src/policy.mjs';

async function fixture(t){
  const tempRoot=path.resolve(tmpdir()),directory=await mkdtemp(path.join(tempRoot,'ft-assets-test-'));
  t.after(async()=>{
    assert.equal(path.dirname(path.resolve(directory)),tempRoot);
    assert.ok(path.basename(directory).startsWith('ft-assets-test-'));
    await rm(directory,{recursive:true,force:true});
  });
  const root=path.join(directory,'source'),output=path.join(directory,'output');
  await mkdir(path.join(root,'cloudflare','src'),{recursive:true});
  for(const file of new Set([...Object.keys(FILE_MODULE),...COMMON_FILES]))await writeFile(path.join(RECORD_FILES.has(file)?path.join(root,'cloudflare','src'):root,file),'Synthetic asset: '+file);
  return {root,output};
}

test('only the explicit static allowlist is built, including record startup modules',async t=>{
  const f=await fixture(t);await writeFile(path.join(f.root,'data.json'),'Synthetic private data');
  await buildAssets(f);const files=await readdir(f.output);
  assert.equal(files.includes('data.json'),false);assert.ok(files.includes('record-loader.mjs'));
  assert.equal(await readFile(path.join(f.output,'record-bridge.mjs'),'utf8'),'Synthetic asset: record-bridge.mjs');
  await buildAssets(f);assert.deepEqual(await readdir(f.output),files);
});

test('a stray file stops publication without deleting or overwriting existing files',async t=>{
  const f=await fixture(t);await mkdir(f.output);await writeFile(path.join(f.output,'data.json'),'Preserve this copy');await writeFile(path.join(f.output,'index.js'),'Previous generated file');
  await assert.rejects(()=>buildAssets(f),/publication stopped/);
  assert.equal(await readFile(path.join(f.output,'data.json'),'utf8'),'Preserve this copy');
  assert.equal(await readFile(path.join(f.output,'index.js'),'utf8'),'Previous generated file');
});
