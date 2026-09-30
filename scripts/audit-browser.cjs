const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
(async()=>{
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[];
for(const name of ['index','full_training','consulta','options','patrimonio','facturas']){
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.route('**/dashboard-auth.js',r=>r.fulfill({contentType:'text/javascript',body:'window.DashboardAuth={gate:()=>Promise.resolve(),changePin:()=>{}}'}));
 await context.route('**/github-sync.js',r=>r.fulfill({contentType:'text/javascript',body:'window.GitHubSync=new Proxy({}, {get:()=>()=>Promise.resolve()})'}));
 await context.route('**/api.github.com/**',r=>r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:8765/${name}.html`,{waitUntil:'domcontentloaded'});
 if(name==='options'){
  await page.evaluate(()=>{ACTIVAS=[{id:1,activo:'SPX',strat:'PCS',exp:'2026-10-16',apertura:'2026-09-01',contracts:1,pCredito:2,priceCurrent:1,shortStrike:6000,longStrike:5975}];setOptionsValuationDate('2026-09-26');showTab('activas');renderActivas();});
  const value=await page.evaluate(()=>({dte:optionDTE('2026-10-16'),card:document.querySelector('.act-dte-pill')?.textContent}));
  if(value.dte!==20||value.card!=='20d')throw new Error('Options mismatch '+JSON.stringify(value));
 }
 await page.screenshot({path:path.join(process.env.BIIO_TEST_OUTPUT || require('os').tmpdir(),`${name}-desktop.png`)});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(process.env.BIIO_TEST_OUTPUT || require('os').tmpdir(),`${name}-mobile.png`)});
 results.push({page:name,errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});
 await context.close();
}
fs.writeFileSync(path.join(process.env.BIIO_TEST_OUTPUT || require('os').tmpdir(),'audit-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
