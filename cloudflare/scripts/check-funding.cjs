const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]||'test-output/funding');await fs.mkdir(out,{recursive:true});
  const {COMMON_FILES,FILE_MODULE,RECORD_FILES}=await import('../src/policy.mjs'),{listRecords,commitRecords,recordStatus}=await import('../src/records.mjs'),{recordLoadingHtml}=await import('../src/worker.mjs');
  const db=new DatabaseSync(':memory:');db.exec(await fs.readFile(path.join(root,'cloudflare/business-migrations/0001_records.sql'),'utf8'));db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run('qa','active','synthetic',1,'2026-10-23');
  function prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}
  const binding={prepare,async batch(statements){db.exec('BEGIN');try{for(const statement of statements)await statement.run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}};
  let browser,context,offline=false,external=0;const errors=[],origin='https://funding-fixture.test';
  const session=()=>({lastActivity:Math.floor(Date.now()/1000),expiresAt:Math.floor(Date.now()/1000)+28800,idleMinutes:30,maxHours:8});
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin){external++;return route.abort();}
      try{
        if(url.pathname==='/api/session')return route.fulfill({json:{user:{id:'funding-test',name:'Test user',role:'user',active:true,permissions:['funding']},session:session(),dataMode:'records',writesEnabled:true}});
        if(url.pathname==='/api/session/activity')return route.fulfill({json:{session:session()}});
        if(url.pathname.startsWith('/api/records/')){
          const namespace=url.pathname.split('/')[3];assert.equal(namespace,'funding');
          if(request.method()==='POST'){if(offline)return route.abort();return route.fulfill({json:await commitRecords(binding,'qa',namespace,'funding-test',JSON.parse(request.postData()))});}
          return route.fulfill({json:url.pathname.endsWith('/status')?await recordStatus(binding,'qa',namespace):await listRecords(binding,'qa',namespace,url.searchParams.get('cursor')||'')});
        }
        const file=url.pathname.slice(1)||'index.html';if(!COMMON_FILES.has(file)&&!FILE_MODULE[file])return route.fulfill({status:404,body:'Not allowed'});
        if(file.endsWith('.html')&&!request.headers()['x-ft-prepared'])return route.fulfill({contentType:'text/html',body:recordLoadingHtml()});
        const body=await fs.readFile(path.join(RECORD_FILES.has(file)?path.join(root,'cloudflare/src'):root,file));
        return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript',body});
      }catch(error){return route.fulfill({status:error.status||500,json:{error:error.message}});}
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await page.locator('#menuScreen.active').waitFor();assert.equal(await page.locator('[data-dashboard-id="funding"]').isVisible(),true);assert.equal(await page.locator('[data-dashboard-id="consulta"]').isVisible(),false);
    await page.locator('[data-dashboard-id="funding"]').click();await page.waitForFunction(()=>window.FundingApp?.ready);
    assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n,0,'Merely opening must not create data');
    await page.locator('#newAccount').click();assert.equal(await page.locator('[name=company]').inputValue(),'Earn2Trade');assert.equal(await page.locator('[name=amount]').inputValue(),'75');
    await page.locator('[name=company]').fill('Synthetic Firm');await page.locator('[name=name]').fill('TCP25');await page.locator('[name=date]').fill('2026-10-01');await page.locator('#saveEvent').click();await page.waitForFunction(()=>FundingApp.getData().events.length===1&&!FTRecords.pending());
    async function editorSave(values){for(const [name,value]of Object.entries(values)){const el=page.locator(`#eventForm [name="${name}"]`);if(await el.evaluate(el=>el.tagName==='SELECT'))await el.selectOption(value);else await el.fill(value);}await page.locator('#saveEvent').click();await page.locator('#editor').waitFor({state:'hidden'});await page.waitForFunction(()=>!FTRecords.pending());}
    async function quick(type,values){await page.locator(`#accountDetail [data-action="${type}"]`).click();await editorSave(values);}
    await page.locator('[data-tab="accounts"]').click();await page.locator('#accountsTable [data-action=detail]').first().click();
    await quick('approve',{date:'2026-10-10'});await quick('request',{date:'2026-10-12',amount:'1500'});
    await page.locator('#accountDetail [data-action=receive-request]').click();await editorSave({date:'2026-10-15',amount:'1200',fee:'10'});await quick('close-account',{date:'2026-10-20'});
    assert.equal(await page.evaluate(()=>FundingModel.metrics(FundingApp.getData()).net),112500);
    await page.screenshot({path:path.join(out,'account-desktop.png'),fullPage:true});await page.locator('[data-close=accountDetail]').click();
    await page.locator('[data-tab=dashboard]').click();await page.screenshot({path:path.join(out,'dashboard-desktop.png'),fullPage:true});
    const pixels=await page.locator('#mainChart').evaluate(canvas=>{const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let painted=0;for(let i=3;i<d.length;i+=4)if(d[i])painted++;return painted;});assert.ok(pixels>1000,'The main chart must render pixels');
    await page.locator('[data-tab=statistics]').click();assert.match(await page.locator('#statisticsKpis').innerText(),/100/);await page.screenshot({path:path.join(out,'statistics-desktop.png'),fullPage:true});
    const data=await page.evaluate(()=>FundingApp.getData());await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.FundingApp?.ready);assert.deepEqual(await page.evaluate(()=>FundingApp.getData()),data);
    await page.locator('#newAccount').click();await editorSave({company:'Synthetic Other',name:'50K',date:'2026-10-05',amount:'100'});await page.locator('[data-tab=accounts]').click();await page.getByRole('button',{name:'50K',exact:true}).click();
    await quick('fail',{date:'2026-10-06'});await quick('reset',{date:'2026-10-07',amount:'40'});await quick('approve',{date:'2026-10-09'});await page.locator('[data-close=accountDetail]').click();
    const rates=await page.evaluate(()=>{const m=FundingModel.metrics(FundingApp.getData());return {funding:m.fundingRate,payout:m.payoutRate,pending:m.payoutPending};});assert.equal(rates.funding,2/3*100);assert.equal(rates.payout,100);assert.equal(rates.pending,1);
    await page.locator('#newMovement').click();await page.locator('[data-action=event-type][data-type=capital]').click();await editorSave({date:'2026-10-01',amount:'1000'});
    await page.locator('#newMovement').click();await page.locator('[data-action=event-type][data-type=expense]').click();await editorSave({date:'2026-10-21',amount:'10',currency:'EUR',rate:'1.1',notes:'External fee, paid separately'});
    const expenseId=await page.evaluate(()=>FundingApp.getData().events.find(e=>e.type==='expense').id);
    await page.locator('[data-tab=movements]').click();await page.locator(`[data-action=edit-event][data-id="${expenseId}"]`).click();await editorSave({amount:'20'});assert.equal(await page.evaluate(id=>FundingApp.getData().events.find(e=>e.id===id).revisions.length,expenseId),1);
    await page.locator(`[data-action=void-event][data-id="${expenseId}"]`).click();await page.waitForFunction(id=>!!FundingApp.getData().events.find(e=>e.id===id).voidedAt,expenseId);await page.locator('#showVoided').check();await page.locator(`[data-action=restore-event][data-id="${expenseId}"]`).click();await page.waitForFunction(()=>!FTRecords.pending());
    const downloadEvent=page.waitForEvent('download');await page.locator('#exportJson').click();const download=await downloadEvent,file=path.join(out,'synthetic-export.json');await download.saveAs(file);const exported=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(exported.data.events.length,await page.evaluate(()=>FundingApp.getData().events.length));
    await page.locator('#importFile').setInputFiles(file);await page.getByText(/Archivo ya presente/).waitFor();assert.equal(await page.evaluate(()=>FundingApp.getData().events.length),exported.data.events.length);
    const eventsCsv=await page.evaluate(()=>FundingModel.exportRows(FundingApp.getData()).events);assert.ok(eventsCsv.length>5);
    for(const kind of ['accounts','events']){await page.locator('#exportCsv').click();const downloadPromise=page.waitForEvent('download');await page.locator(`[data-action="csv-${kind}"]`).click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/\.csv$/);}
    await page.locator('[data-tab=dashboard]').click();await page.locator('#companyFilter').selectOption('Synthetic Firm');assert.match(await page.locator('#mainKpis').innerText(),/1125|1\.125/);await page.locator('#companyFilter').selectOption('');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'dashboard-mobile.png'),fullPage:true});
    await page.locator('[data-tab=accounts]').click();await page.screenshot({path:path.join(out,'accounts-mobile.png'),fullPage:true});
    offline=true;await page.locator('#newMovement').click();await page.locator('[data-action=event-type][data-type=expense]').click();for(const [key,value]of Object.entries({date:'2026-10-22',amount:'1'}))await page.locator(`#eventForm [name=${key}]`).fill(value);await page.locator('#saveEvent').click();await page.locator('#formError').getByText(/conserva o exporta/).waitFor();
    assert.ok(await page.evaluate(()=>FTRecords.pending()));const pendingId=await page.evaluate(()=>FTRecords.client.pending.get('funding').requestId),pendingCount=await page.evaluate(()=>FundingApp.getData().events.length);assert.equal(await page.locator('#eventForm [name=amount]').isDisabled(),true);
    offline=false;await page.locator('#saveEvent').click();await page.locator('#editor').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>FundingApp.getData().events.length),pendingCount);assert.equal(await page.evaluate(()=>FTRecords.pending()),false);assert.equal(db.prepare('SELECT count(*) AS n FROM write_requests WHERE request_id=?').get(pendingId).n,1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE namespace<>'funding'").get().n,0);assert.deepEqual(errors,[]);
    const restoredContext=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
    try{
      await restoredContext.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='http://127.0.0.1:9555')return route.abort();const file=url.pathname.slice(1);if(!FILE_MODULE[file]&&!COMMON_FILES.has(file))return route.fulfill({status:404,body:'Not allowed'});return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript',body:await fs.readFile(path.join(root,file))});});
      const restoredPage=await restoredContext.newPage();restoredPage.on('pageerror',e=>errors.push(e.message));restoredPage.on('dialog',d=>d.accept());
      await restoredPage.goto('http://127.0.0.1:9555/funding.html?preview=1');await restoredPage.waitForFunction(()=>window.FundingApp?.ready);assert.equal(await restoredPage.evaluate(()=>FundingApp.getData().events.length),0);
      await restoredPage.locator('#importFile').setInputFiles(file);await restoredPage.getByText(/Importacion confirmada/).waitFor();assert.deepEqual(await restoredPage.evaluate(()=>FundingApp.getData()),exported.data);
      await restoredPage.reload();await restoredPage.waitForFunction(()=>window.FundingApp?.ready);assert.deepEqual(await restoredPage.evaluate(()=>FundingApp.getData()),exported.data);
      await restoredPage.locator('#importFile').setInputFiles(file);await restoredPage.getByText(/Archivo ya presente/).waitFor();assert.equal(await restoredPage.evaluate(()=>FundingApp.getData().events.length),exported.data.events.length);
      await restoredPage.screenshot({path:path.join(out,'restored-preview-mobile.png'),fullPage:true});
    }finally{await restoredContext.close();}
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({lifecycle:true,resets:true,editing:true,voidRestore:true,duplicatesPrevented:true,reopen:true,fx:true,offlineRetry:true,dashboardIntegration:true,emptyBookRestore:true,previewIsolated:true,csvDownloads:true,canvasPixels:pixels,mobileOverflow:false,productionWrites:0,errors,blockedExternalRequests:external}));
  }finally{await context?.close();await browser?.close();db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
