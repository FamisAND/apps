const assert=require('node:assert/strict');
const path=require('node:path');
const {readFile,mkdir,realpath}=require('node:fs/promises');
const {createHash}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const [sourceArg,outputArg]=process.argv.slice(2);
  if(!sourceArg||!outputArg)throw new Error('Provide a private source and NEW private screenshot directory');
  const source=await realpath(sourceArg),output=path.join(await realpath(path.dirname(outputArg)),path.basename(outputArg));
  for(const file of [source,output])assert.ok(file.split(path.sep).includes('.full-training-backups'));
  await mkdir(output);
  const bytes=await readFile(source),original=JSON.parse(bytes),values={'legacy-only-sentinel':'preserve me'};
  const {STORAGE_KEYS}=await import('../src/record-layout.mjs');
  const {COMMON_FILES,FILE_MODULE}=await import('../src/policy.mjs');
  for(const [namespace,keys]of Object.entries(STORAGE_KEYS))for(const key of keys){
    const value=original[namespace]?.[key];if(value!==undefined)values[key]=typeof value==='string'?value:JSON.stringify(value);
  }
  const root=path.resolve(__dirname,'..','..'),browser=await chromium.launch({channel:'msedge',headless:true});
  const summary=[];let githubRequests=0;
  try{
    for(const file of ['index.html','full_training.html','consulta.html','patrimonio.html','options.html','facturas.html']){
      const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
      try{
        await context.addInitScript(values=>{for(const [key,value]of Object.entries(values))localStorage.setItem(key,value);},values);
        await context.route('**/*',async route=>{
          const url=new URL(route.request().url()),file=url.pathname.split('/').pop();
          if(url.hostname==='api.github.com')githubRequests++;
          if(url.origin!=='https://famisand.github.io'||!COMMON_FILES.has(file)&&!FILE_MODULE[file])return route.abort();
          try{await route.fulfill({body:await readFile(path.join(root,file)),contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript'});}
          catch(_error){await route.abort();}
        });
        const page=await context.newPage();page.on('dialog',dialog=>dialog.dismiss());
        await page.goto('https://famisand.github.io/apps/'+file,{waitUntil:'domcontentloaded'});
        await page.locator('#ftLegacyArchive').waitFor();
        assert.equal(await page.evaluate(()=>GitHubSync.ready),false);
        const state=await page.evaluate(async()=>{
          const raw=Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]));
          const blocked=[];
          for(const action of [()=>localStorage.setItem('ft_v4','BAD'),()=>localStorage.removeItem('ft_v4'),()=>localStorage.clear()]){
            try{action();blocked.push(false);}catch(_error){blocked.push(true);}
          }
          let syncBlocked=false;try{await GitHubSync.flush();}catch(_error){syncBlocked=true;}
          const creationBlocked=await new Promise(resolve=>{const request=indexedDB.open('ft-forbidden-create',1);request.onerror=()=>resolve(true);request.onsuccess=()=>{request.result.close();resolve(false);};});
          return {raw,blocked,syncBlocked,creationBlocked,link:document.querySelector('#ftLegacyArchive a').href};
        });
        assert.deepEqual(state.raw,values);assert.deepEqual(state.blocked,[true,true,true]);assert.equal(state.syncBlocked,true);assert.equal(state.creationBlocked,true);
        assert.equal(state.link,'https://full-training-private.sergiofamisr.workers.dev/'+file);
        const downloadPromise=page.waitForEvent('download');
        await page.getByRole('button',{name:'Exportar copia local',exact:true}).click();
        const downloaded=JSON.parse(await readFile(await (await downloadPromise).path(),'utf8'));
        assert.deepEqual(downloaded.values,Object.fromEntries(Object.entries(values).filter(([key])=>key!=='legacy-only-sentinel')));assert.equal(downloaded.centralConfirmation,false);
        if(file==='index.html'||file==='consulta.html'){
          await page.screenshot({path:path.join(output,file.replace('.html','-desktop.png'))});
          await page.setViewportSize({width:390,height:844});
          assert.ok(await page.locator('#ftLegacyArchive').evaluate(element=>element.scrollWidth<=element.clientWidth));
          await page.screenshot({path:path.join(output,file.replace('.html','-mobile.png'))});
        }
        summary.push({file,readOnly:true,storagePreserved:true,localExportExact:true});
      }finally{await context.close();}
    }
    assert.equal(githubRequests,0);
    assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
    console.log(JSON.stringify({status:'LEGACY_CUTOVER_VERIFIED',summary,githubRequests,originalUnchanged:true,productionWrites:0},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
