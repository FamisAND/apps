const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require('../cloudflare/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const output=process.argv[2]||path.join(root,'..','options-preview');
const baselineFile=process.argv[3]||path.resolve(root,'..','backup-2026-11-26-options-redesign','options.html');
fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';
  const file=name==='__baseline_options.html'?baselineFile:path.resolve(root,name);
  if(name!=='__baseline_options.html'&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes)});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[];
  try{
    for(const [label,width,height] of [['desktop',1440,950],['mobile',390,844]]){
      const context=await browser.newContext({viewport:{width,height}});
      await context.addInitScript(()=>{
        if(!localStorage.getItem('ot_activas'))localStorage.setItem('ot_activas',JSON.stringify([
          {id:1,idOp:'182',activo:'SPX',strat:'PCS',apertura:'2026-11-01',exp:'2026-12-19',contracts:2,pCredito:4.5,pDebito:1.5,priceCurrent:2.1,maxRisk:5000,delta:0.22,iv:28,ivr:40,comi:4.2,nota:'Revisar al llegar a 21 DTE.',legs:[{kind:'short_put',strike:6450,prima:4.5},{kind:'long_put',strike:6425,prima:1.5}]},
          {id:2,idOp:'183',activo:'IBIT',strat:'CC',apertura:'2026-11-10',exp:'2026-12-05',contracts:1,pCredito:1.2,priceCurrent:null,maxRisk:2400,delta:0.19,iv:55,ivr:48,comi:1.2}
        ]));
        if(!localStorage.getItem('ot_snaps'))localStorage.setItem('ot_snaps',JSON.stringify([
          {date:'2026-10',val:33000,dep:0,ret:0,navEntries:[{ts:'2026-10-15',val:33000,dep:0,ret:0}],metrics:[{ts:'2026-10-15',theta:-35,delta:134,vega:43,bp:83,spy:650,bpUsed:24000,gamma:7}]},
          {date:'2026-11',val:33402,dep:0,ret:0,navEntries:[{ts:'2026-11-04',val:33100,dep:0,ret:0},{ts:'2026-11-18',val:33402,dep:0,ret:0}],metrics:[{ts:'2026-11-04',theta:45,delta:30,vega:-60,bp:52,spy:660,bpUsed:17000,gamma:5},{ts:'2026-11-18',theta:55,delta:25,vega:-70,bp:48,spy:670,bpUsed:16000,gamma:4}]}
        ]));
      });
      await context.route('**/github-sync.js',r=>r.fulfill({contentType:'text/javascript',body:'window.GitHubSync={setStatusElement(){},manualResync(){},bootstrapAutoSync(){return Promise.resolve()},attach(){},enableAutoPush(){},preserve(){return Promise.resolve()}};'}));
      await context.route('**/dashboard-auth.js',r=>r.fulfill({contentType:'text/javascript',body:'window.DashboardAuth={gate(){return Promise.resolve()},changePin(){}};'}));
      let baseline;
      if(label==='desktop'&&fs.existsSync(baselineFile)){
        const old=await context.newPage();
        old.on('pageerror',e=>errors.push('baseline: '+e.message));
        await old.goto('http://127.0.0.1:'+server.address().port+'/__baseline_options.html',{waitUntil:'domcontentloaded',timeout:60000});
        await old.waitForTimeout(700);
        baseline=await old.evaluate(()=>({operations:HIST.map(computeEntry).map(e=>[e.id,e.idOp,e.totalNeto,e.comi,e.pCredito,e.pCierre,e.maxRisk]),snaps:JSON.stringify(SNAPS),active:JSON.stringify(ACTIVAS)}));
        await old.close();
      }
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(label+': '+e.message));
      await page.goto('http://127.0.0.1:'+server.address().port+'/options.html',{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForTimeout(2000);
      if(baseline){
        const current=await page.evaluate(()=>({operations:HIST.map(computeEntry).map(e=>[e.id,e.idOp,e.totalNeto,e.comi,e.pCredito,e.pCierre,e.maxRisk]),snaps:JSON.stringify(SNAPS),active:JSON.stringify(ACTIVAS)}));
        assert.deepEqual(current,baseline,'financial results and stored records must match the baseline');
      }
      for(const section of ['dash','activas','hist','strat','risk','calendar']){
        await page.evaluate(name=>showTab(name),section);
        await page.waitForTimeout(350);
        await page.screenshot({path:path.join(output,`${label}-${section}.png`),fullPage:false});
        const visible=await page.locator('#tab-'+section).isVisible();
        if(!visible)errors.push(label+': '+section+' not visible');
      }
      if(label==='desktop'){
        await page.evaluate(()=>showTab('hist'));
        const originalCount=await page.locator('#hFilteredStats .h-stat-val').first().innerText();
        await page.locator('#hSearch').fill('SPX');
        const filteredCount=await page.locator('#hFilteredStats .h-stat-val').first().innerText();
        assert.ok(Number(filteredCount)<Number(originalCount),'history search must narrow results');
        await page.locator('#hSearch').fill('');
        await page.locator('#hBody button[title="Ver detalle"]').first().click();
        assert.equal(await page.locator('#histDetailPanel').isVisible(),true);
        await page.locator('#histDetailPanel button').filter({hasText:'Patas'}).click();
        await page.evaluate(()=>document.getElementById('histDetailPanel').style.display='none');
        await page.evaluate(()=>{openEntryModal();closeEntryModal();openActModal(null);closeActModal();openActModal(0);closeActModal();openActCloseModal(0);closeActCloseModal();openRollModal(0);closeRollModal()});
        await page.evaluate(()=>{showTab('calendar');setCalendarMode('expirations');calPickMonth('2026-12');calDayClick('2026-12-05')});
        assert.match(await page.locator('#calDayDetail').innerText(),/IBIT/);
        await page.evaluate(()=>{setCalendarMode('results');const day=HIST.map(computeEntry).find(e=>e.cierre)?.cierre;if(day){calPickMonth(day.slice(0,7));calDayClick(day)}});
        assert.match(await page.locator('#calDayDetail').innerText(),/operativa/);
        await page.evaluate(()=>{document.getElementById('sm_date').value='2026-11-20';document.getElementById('sm_theta').value='-20';document.getElementById('sm_delta').value='-12';document.getElementById('sm_vega').value='-50';document.getElementById('sm_gamma').value='7';document.getElementById('sm_nav').value='33000';document.getElementById('sm_spy').value='680';document.getElementById('sm_bpUsed').value='14000';addMetricEntry()});
        await page.reload({waitUntil:'domcontentloaded'});
        const saved=await page.evaluate(()=>SNAPS.find(s=>s.date==='2026-11').metrics.find(m=>m.ts==='2026-11-20'));
        assert.equal(saved.gamma,7);
        assert.equal(saved.spy,680);
        assert.equal(saved.bpUsed,14000);
        assert.equal(saved.nav,33000);
      }
      await context.close();
    }
    console.log(JSON.stringify({output,errors}));
    if(errors.length)process.exitCode=1;
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
