const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  if(!process.env.BACKUP_JSON)throw new Error('Use a verified backup file, never a live browser profile');
  const backup=JSON.parse(fs.readFileSync(process.env.BACKUP_JSON,'utf8'));
  const saved=backup.training_online.tob_online_v2;
  const raw=typeof saved==='string'?saved:JSON.stringify(saved);
  const source=fs.readFileSync(path.join(__dirname,'..','consulta.js'),'utf8');
  const server=http.createServer((_req,res)=>res.end('<!doctype html><html><body></body></html>'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.evaluate(raw=>{localStorage.setItem('tob_online_v2',raw);window.GitHubSync={ready:Promise.resolve(false)};},raw);
    await page.addScriptTag({content:source});
    await page.evaluate(async()=>{tobRenderClientes=()=>{};tobRenderPlantillas=()=>{};await tobLoad();});
    assert.equal(await page.evaluate(()=>localStorage.getItem('tob_online_v2')),raw);
    assert.deepEqual(await page.evaluate(()=>tobDB),JSON.parse(raw));
    await context.close();console.log('Verified backup loads with every field and ID unchanged; no network or migration');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
