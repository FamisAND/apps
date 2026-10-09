const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const server=require('./session-preview.cjs');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
      const context=await browser.newContext({viewport:{width,height}});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin+'/session-admin.html');
      await page.locator('#users tr').nth(1).waitFor();
      assert.equal(await page.locator('#users tr').count(),2);
      assert.equal(await page.locator('#sessions tr').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('#refresh').click();
      await page.locator('#users tr').nth(1).waitFor();
      await page.screenshot({path:path.resolve('..','safety-analysis','session-admin-'+name+'.png'),fullPage:true});
      assert.deepEqual(errors,[]);
      await context.close();
      console.log(name+': loaded, refresh works, no page overflow or JavaScript errors');
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
