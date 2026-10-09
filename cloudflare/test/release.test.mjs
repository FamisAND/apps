import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectRelease} from '../scripts/check-staged-release.mjs';
import {readFileSync} from 'node:fs';

test('deployed asset routing keeps literal HTML paths without redirecting the root into itself',()=>{
  const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(config.assets.html_handling,'none');assert.equal(config.assets.run_worker_first,true);
  assert.equal(config.vars.RECORDS_ENABLED,'true');assert.equal(config.vars.DATA_WRITES_ENABLED,'false');
  assert.equal(config.vars.ACTIVE_DATASET_ID,'complete-d765c29c63726711');
  assert.deepEqual(config.d1_databases.map(value=>value.binding),['AUTH_DB','DATA_DB']);
});

test('release inspection refuses backups and known credential patterns without printing them',()=>{
  const safe=inspectRelease(['consulta.js','cloudflare/src/worker.mjs'],'Synthetic source');
  assert.equal(safe.forbiddenPaths.length,0);assert.equal(safe.secretLikeValueFound,false);
  for(const file of ['data.json','cloudflare/.wrangler/config/default.toml','cloudflare/public/data.json','copy.private.json','photo.png'])assert.deepEqual(inspectRelease([file],'').forbiddenPaths,[file]);
  const value='ghp_'+'a'.repeat(40);const unsafe=inspectRelease(['source.js'],value);
  assert.equal(unsafe.secretLikeValueFound,true);assert.equal(JSON.stringify(unsafe).includes(value),false);
});
