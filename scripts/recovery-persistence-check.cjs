const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const required=['BACKUP_JSON','LOCAL_CONSULTA_JSON','STORAGE_SIZES_JSON','TEST_STATE_PATH'];
  for(const key of required)if(!process.env[key])throw new Error('Missing '+key);
  if(fs.existsSync(process.env.TEST_STATE_PATH))throw new Error('Use a new private test state path');
  const remote=JSON.parse(fs.readFileSync(process.env.BACKUP_JSON,'utf8'));
  const rawLocal=fs.readFileSync(process.env.LOCAL_CONSULTA_JSON,'utf8');
  const sizes=JSON.parse(fs.readFileSync(process.env.STORAGE_SIZES_JSON,'utf8')).filter(x=>x.origin==='https://famisand.github.io');
  const source=fs.readFileSync(path.join(__dirname,'..','github-sync.js'),'utf8');
  const server=http.createServer((_req,res)=>res.end('<!doctype html><html><body></body></html>'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  let puts=0;
  async function configure(context){
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith(origin+'/'))return route.continue();
      if(url.startsWith('https://api.github.com/repos/fixture/data/contents/data.json')){
        if(route.request().method()==='PUT'){puts++;return route.fulfill({status:403,body:'Writes forbidden in recovery verification'});}
        return route.fulfill({json:{sha:'fixture-sha',content:Buffer.from(JSON.stringify(remote)).toString('base64')}});
      }
      return route.abort();
    });
    const page=await context.newPage();await page.goto(origin);await page.addScriptTag({content:source});
    return page;
  }
  try{
    const first=await browser.newContext({serviceWorkers:'block'}),page=await configure(first);
    await page.evaluate(({sizes,rawLocal})=>{
      for(const x of sizes)localStorage.setItem(x.key,'x'.repeat(x.utf16Bytes/2));
      localStorage.setItem('tob_online_v2',rawLocal);
      GitHubSync.setupCredentials({repo:'fixture/data',token:'SYNTHETIC'});
    },{sizes,rawLocal});
    await page.evaluate(()=>GitHubSync.pullAndApplyAll({resolveRemote:true}));
    const actual=await page.evaluate(()=>JSON.parse(localStorage.getItem('tob_online_v2')));
    const expected=typeof remote.training_online.tob_online_v2==='string'?JSON.parse(remote.training_online.tob_online_v2):remote.training_online.tob_online_v2;
    assert.deepEqual(actual,expected);
    const count=db=>db.clientes.reduce((n,c)=>n+(c.mediciones||[]).filter(m=>m.fecha.startsWith('2026-10')).length,0);
    assert.equal(count(actual),6);
    const state=await first.storageState({indexedDB:true});
    fs.writeFileSync(process.env.TEST_STATE_PATH,JSON.stringify(state),{flag:'wx'});
    await first.close();
    const second=await browser.newContext({storageState:state,serviceWorkers:'block'}),reopened=await configure(second);
    assert.deepEqual(await reopened.evaluate(()=>JSON.parse(localStorage.getItem('tob_online_v2'))),expected);
    assert.equal(await reopened.evaluate(async()=> (await GitHubSync.readLegacyArchive()).length),2);
    await reopened.evaluate(()=>GitHubSync.pullAndApplyAll());
    assert.deepEqual(await reopened.evaluate(()=>JSON.parse(localStorage.getItem('tob_online_v2'))),expected);
    assert.equal(puts,0);
    await second.close();
    console.log('Recovery persists across closed/reopened isolated contexts: 6 October measurements, every other field unchanged, both legacy archives retained, no writes to any remote.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
