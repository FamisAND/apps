const assert=require('node:assert/strict');
const path=require('node:path');
const {readFile,mkdir}=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const output=path.resolve(process.argv[2]||'test-output/session-experience');await mkdir(output,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});const origin='http://127.0.0.1:48909',root=path.resolve(__dirname,'..','..');
  try{
    for(const mode of ['admin','idle','continue','user']){
      const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      let lastActivity=Math.floor(Date.now()/1000)-(['idle','continue'].includes(mode)?1790:0),activityPosts=0,policyWrites=0;const expiresAt=Math.floor(Date.now()/1000)+28800;
      const state=()=>({user:{id:'synthetic-'+mode,name:'Usuario ejemplo',role:mode==='user'?'user':'admin',active:true,permissions:[]},session:{lastActivity,expiresAt,idleMinutes:30,maxHours:8},dataMode:'records',writesEnabled:true});
      await page.clock.install();
      await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin,'No production or external requests');
        if(url.pathname==='/api/session')return route.fulfill({json:state()});
        if(url.pathname==='/api/session/activity'){activityPosts++;lastActivity=Math.floor(Date.now()/1000);return route.fulfill({json:{session:state().session}});}
        if(url.pathname==='/api/admin/users')return route.fulfill({json:{users:[state().user]}});
        if(url.pathname==='/api/admin/sessions')return route.fulfill({json:{policy:{idleMinutes:30,maxHours:8},sessions:Array.from({length:10},(_,i)=>({id:String(i).padStart(64,'a'),name:'Usuario '+(i+1),email:'ejemplo'+i+'@example.test',created_at:lastActivity-i*3600,last_seen:lastActivity-i*3600,deadline:expiresAt,valid_version:i===0,revoked:0,activity:i===0?[{module:'Consulta',saves:2}]:[]}))}});
        if(url.pathname.endsWith('/changes'))return route.fulfill({json:{changes:[{at:new Date().toISOString(),module:'Consulta',items:[{action:'Alta',type:'Medicion',label:'',client:'Cliente ejemplo',fields:['peso','cintura']},{action:'Cambio',type:'Menu',label:'Menu semanal',client:'Cliente ejemplo',fields:['dias']}]}],nextCursor:null}});
        if(url.pathname==='/api/admin/session-policy'){policyWrites++;assert.deepEqual(request.postDataJSON(),{idleMinutes:45,maxHours:6});return route.fulfill({json:{ok:true}});}
        const file=url.pathname.slice(1);assert.ok(['session-admin.html','session-admin.js','app-session.js','session-ui.css','session-icons.js'].includes(file));let body=await readFile(path.join(root,file));
        if(file==='session-admin.html')body=Buffer.from(body.toString().replace('<head>','<head><script src="/app-session.js"></script>'));
        return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript',body});
      });
      await page.goto(origin+'/session-admin.html',{waitUntil:'domcontentloaded'});await page.locator('#ftSessionBar').waitFor();
      if(mode==='admin'){
        await page.getByRole('button',{name:'2 guardados'}).click();await page.getByText('Alta de medicion',{exact:false}).waitFor();
        await page.screenshot({path:path.join(output,'sessions-desktop.png'),fullPage:true});
        await page.locator('#idleMinutes').fill('45');await page.locator('#maxHours').fill('6');await page.getByRole('button',{name:'Guardar tiempos'}).click();await page.getByText('Tiempos guardados.',{exact:false}).waitFor();assert.equal(policyWrites,1);
        await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'sessions-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }else if(mode==='idle'){
        await page.clock.fastForward(1000);await page.locator('#ftSessionWarning').waitFor();assert.equal(activityPosts,0);
        await page.screenshot({path:path.join(output,'idle-warning.png'),fullPage:true});await page.clock.fastForward(12000);await page.locator('#ftSessionLock').waitFor();assert.equal(activityPosts,0);assert.equal(await page.evaluate(()=>FTSession.active),false);
        await page.screenshot({path:path.join(output,'idle-locked.png'),fullPage:true});
      }else if(mode==='continue'){
        await page.clock.fastForward(1000);await page.locator('#ftSessionWarning').waitFor();await page.getByRole('button',{name:'Seguir trabajando'}).click();await page.waitForFunction(()=>FTSession.active);await page.clock.fastForward(1000);assert.ok(activityPosts>=1);await page.locator('#ftSessionWarning').waitFor({state:'detached'});
      }else assert.equal(await page.getByLabel('Usuarios y sesiones',{exact:true}).count(),0);
      assert.deepEqual(errors,[]);await context.close();console.log(mode+': verified');
    }
    console.log(JSON.stringify({status:'SESSION_EXPERIENCE_VERIFIED',productionAccess:false,output}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
