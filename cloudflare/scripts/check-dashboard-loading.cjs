const assert=require('node:assert/strict');
const path=require('node:path');
const {readFile,mkdir}=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
  const output=path.resolve(process.argv[2]||'test-output/dashboard-loading');
  await mkdir(output,{recursive:true});
  const {packSnapshot}=await import('../src/snapshot-codec.mjs');
  const {sha256}=await import('../src/hash.mjs');
  const {COMMON_FILES,FILE_MODULE,RECORD_FILES}=await import('../src/policy.mjs');
  const {recordLoadingHtml}=await import('../src/worker.mjs');
  const fixtures={training:{ft_v4:{clientes:[]}},training_online:{tob_online_v2:{clientes:Array.from({length:85},(_,i)=>({id:'synthetic-'+i,nom:'Synthetic '+i,menus:Array.from({length:20},(_,j)=>({id:'menu-'+j,nom:'Synthetic menu'})),mediciones:Array.from({length:50},(_,j)=>({id:'measurement-'+j,pes:60,data:'2026-10-01'}))}))}},options:{ot_activas:[],ot_hist:[],ot_cfg:{},ot_snaps:[]},patrimonio:{pat_v5:{}},facturas:{fac_v1:{}},__dashboard_config:{}};
  const records=new Map();
  for(const [namespace,value]of Object.entries(fixtures)){
    const rows=[];
    for(const [key,node]of await packSnapshot(value))rows.push({key,value:node,version:1,deleted:false,sha256:await sha256(JSON.stringify(node))});
    records.set(namespace,rows);
  }
  const origin='http://127.0.0.1:48899',root=path.resolve(__dirname,'..','..');
  const browser=await chromium.launch({channel:'msedge',headless:true});
  let centralWrites=0,externalRequests=0,blockedFontRequests=0,activityRequests=0;
  const session=()=>({lastActivity:Math.floor(Date.now()/1000),expiresAt:Math.floor(Date.now()/1000)+28800,idleMinutes:30,maxHours:8});
  try{
    for(const entry of ['/','/index.html','/missing-module.html','/failed-records.html']){
      const failModule=entry==='/missing-module.html',failRecords=entry==='/failed-records.html';
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      try{
        await context.addInitScript(()=>{
          window.__testReadStored=Storage.prototype.getItem;
          localStorage.setItem('tob_online_v2','SYNTHETIC ORIGINAL COPY');
        });
        const reads=[],errors=[];
        await context.route('**/*',async route=>{
          const request=route.request(),url=new URL(request.url());
          if(url.origin!==origin){
            if(url.hostname==='fonts.googleapis.com'&&url.pathname==='/css2')blockedFontRequests++;else externalRequests++;
            return route.abort();
          }
          if(url.pathname==='/api/session/activity'){activityRequests++;return route.fulfill({json:{session:session()}});}
          if(request.method()!=='GET'){centralWrites++;return route.fulfill({status:423,json:{error:'Synthetic read-only fixture'}});}
          if(url.pathname==='/api/session')return route.fulfill({json:{user:{id:'synthetic-admin',name:'Test admin',role:'admin',active:true,permissions:[]},session:session(),dataMode:'records',writesEnabled:false,modules:{}}});
          if(url.pathname.startsWith('/api/records/')){
            const namespace=url.pathname.split('/')[3];reads.push(namespace);
            if(failRecords)return route.fulfill({status:503,json:{error:'Synthetic records unavailable'}});
            assert.ok(records.has(namespace),'Unexpected namespace: '+namespace);
            if(url.pathname.endsWith('/status'))return route.fulfill({json:{datasetId:'synthetic-dashboard',generation:1,changedGeneration:0,stable:true}});
            const rows=records.get(namespace),start=Number(url.searchParams.get('cursor')||0),end=Math.min(start+200,rows.length);
            return route.fulfill({json:{datasetId:'synthetic-dashboard',generation:1,records:rows.slice(start,end),nextCursor:end<rows.length?String(end).padStart(8,'0'):null}});
          }
          if(failModule&&url.pathname==='/request.mjs')return route.abort();
          if(url.pathname===entry&&!request.headers()['x-ft-prepared'])return route.fulfill({contentType:'text/html',body:recordLoadingHtml()});
          const file=url.pathname.slice(1)||'index.html';
          if(!COMMON_FILES.has(file)&&!FILE_MODULE[file])return route.fulfill({status:404,body:'Synthetic not found'});
          return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript',body:await readFile(path.join(RECORD_FILES.has(file)?path.join(root,'cloudflare','src'):root,file))});
        });
        const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
        let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
        await page.goto(origin+entry,{waitUntil:'domcontentloaded'});
        if(failModule||failRecords){
          await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor({timeout:30000});
          const message=await page.locator('#ftLoadMessage').textContent();
          assert.match(message,failModule?/archivos de la aplicacion/:/Synthetic records unavailable/);
          assert.equal(await page.evaluate(()=>!!document.querySelector('#ftRecordStatus')),false,'Failed load must not show central confirmation');
        }else{
          await page.locator('#menuScreen.active').waitFor({timeout:60000});
          await page.locator('#ftRecordStatus').waitFor();
          await page.waitForTimeout(1500);assert.equal(navigations,1,'Dashboard entered a reload loop');
          assert.equal(await page.evaluate(()=>FTRecords.values.size),6);
          assert.equal(reads.includes('tob_menus_catalog'),false);
          assert.deepEqual(await page.evaluate(()=>FTRecords.values.get('training_online')),fixtures.training_online);
          assert.match(await page.locator('#ftRecordStatus').textContent(),/solo lectura/);
          assert.deepEqual(errors,[]);
          const copiesBefore=(await page.evaluate(()=>FTRecords.store.health())).entries;
          const readOffset=reads.length;await page.reload({waitUntil:'domcontentloaded'});await page.locator('#ftRecordStatus').waitFor({timeout:60000});
          assert.equal(reads.length-readOffset,6,'Reopening unchanged data must use six lightweight status reads');
          assert.equal((await page.evaluate(()=>FTRecords.store.health())).entries,copiesBefore,'Unchanged navigation must not accumulate duplicate backups');
          assert.equal(navigations,2,'Cache reopen must navigate only once');
          await page.screenshot({path:path.join(output,entry==='/'?'root-desktop.png':'index-desktop.png'),fullPage:true});
          await page.getByLabel('Herramientas y copias',{exact:true}).click();await page.getByRole('button',{name:'Copias y espacio',exact:true}).click();await page.getByRole('dialog').waitFor();await page.locator('.ft-stats strong').first().waitFor();assert.ok(activityRequests>0,'Activity tracking must survive prepared document replacement');
          await page.screenshot({path:path.join(output,entry==='/'?'copies-desktop.png':'copies-index.png'),fullPage:true});
          await page.getByRole('button',{name:'Cerrar',exact:true}).click();
          await page.setViewportSize({width:390,height:844});
          await page.screenshot({path:path.join(output,entry==='/'?'root-mobile.png':'index-mobile.png'),fullPage:true});
        }
        assert.equal(await page.evaluate(()=>__testReadStored.call(localStorage,'tob_online_v2')),'SYNTHETIC ORIGINAL COPY');
        assert.equal(navigations,failModule||failRecords?1:2);
        console.log(entry+': verified, '+reads.length+' record-page reads, no reload loop');
      }finally{await context.close();}
    }
    assert.equal(centralWrites,0);assert.equal(externalRequests,0);
    console.log(JSON.stringify({status:'SYNTHETIC_DASHBOARD_VERIFIED',records:[...records.values()].reduce((sum,rows)=>sum+rows.length,0),centralWrites,activityRequests,externalRequests,blockedFontRequests,productionAccess:false,output}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
