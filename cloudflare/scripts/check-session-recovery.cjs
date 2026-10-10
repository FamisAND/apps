const assert=require('node:assert/strict');
const path=require('node:path');
const https=require('node:https');
const {tmpdir}=require('node:os');
const {execFileSync}=require('node:child_process');
const {readFile,mkdir,mkdtemp}=require('node:fs/promises');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const {createWorker}=await import('../src/worker.mjs'),output=path.resolve(process.argv[2]||'test-output/session-recovery');await mkdir(output,{recursive:true});
  const certificateDir=await mkdtemp(path.join(tmpdir(),'ft-session-cookie-test-')),key=path.join(certificateDir,'key.pem'),cert=path.join(certificateDir,'cert.pem');
  execFileSync(process.env.OPENSSL_PATH||'openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
  const tls={key:await readFile(key),cert:await readFile(cert)};
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{for(const mode of ['expired','missing-cookie']){
    const db=new DatabaseSync(':memory:');for(const file of ['0001_auth.sql','0002_session_policy.sql'])db.exec(await readFile(path.join(__dirname,'..','migrations',file),'utf8'));
    const binding={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return db.prepare(sql).run(...args);}};}};
    const env={AUTH_DB:binding,RECORDS_ENABLED:'true',ADMIN_EMAIL:'synthetic@example.test',ASSETS:{fetch:async()=>new Response('<!doctype html><html lang="es"><title>Prueba</title><p id="authenticated">Sesion lista</p></html>',{headers:{'Content-Type':'text/html'}})}};
    const worker=createWorker({verifyIdentity:async()=>({email:'synthetic@example.test',iat:1,exp:Math.floor(Date.now()/1000)+3600})});
    const context=await browser.newContext({viewport:{width:1280,height:800},ignoreHTTPSErrors:true});let requests=0,edgeLogouts=0,origin;
    const server=https.createServer(tls,async(request,response)=>{
      try{
        const url=new URL(request.url,origin);assert.ok(++requests<30,'Unexpected redirect cycle');
        if(url.pathname==='/cdn-cgi/access/logout'){edgeLogouts++;response.writeHead(303,{Location:'/synthetic-login'});response.end();return;}
        if(url.pathname==='/synthetic-login'){response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><html lang="es"><title>Prueba de identidad</title><a href="/auth/start?next=/index.html">Identificarme</a></html>');return;}
        const result=await worker.fetch(new Request(url,{method:request.method,headers:{...request.headers,'X-FT-Prepared':'records-v1'}}),env);
        response.writeHead(result.status,Object.fromEntries(result.headers));response.end(await result.text());
      }catch(error){response.writeHead(500);response.end('Synthetic fixture failed');console.error(error);}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='https://localhost:'+server.address().port;
    try{
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());assert.equal(url.origin,origin,'No external or production requests');return route.continue();
      });
      const page=await context.newPage();
      if(mode==='expired'){
        await page.goto(origin+'/auth/start?next=/index.html');await page.locator('#authenticated').waitFor();
        assert.ok((await context.cookies()).some(cookie=>cookie.name==='__Host-ft_session'));
        db.prepare('UPDATE sessions SET last_seen=?').run(Math.floor(Date.now()/1000)-1801);
      }
      await page.goto(origin+(mode==='expired'?'/index.html':'/auth/complete?next=/index.html'));
      await page.getByRole('heading',{name:mode==='expired'?'La sesion ha caducado':'No se ha podido abrir la sesion',exact:true}).waitFor();
      assert.equal((await context.cookies()).some(cookie=>cookie.name==='__Host-ft_session'),false,'Rejected login cookie must be removed, not preserved across reidentification');
      const before=db.prepare('SELECT count(*) AS n FROM sessions').get().n;
      await page.screenshot({path:path.join(output,mode+'.png')});
      await page.getByRole('link',{name:'Reintentar acceso'}).click();await page.getByRole('link',{name:'Identificarme',exact:true}).waitFor();
      assert.equal(edgeLogouts,1);assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,before);
      await page.getByRole('link',{name:'Identificarme',exact:true}).click();await page.locator('#authenticated').waitFor();
      assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,before+1);
      assert.ok((await context.cookies()).some(cookie=>cookie.name==='__Host-ft_session'));
      console.log(mode+': cookie recovery verified without loops; Access logout simulated');
    }finally{await context.close();await new Promise(resolve=>server.close(resolve));db.close();}
  }}finally{await browser.close();}
  console.log(JSON.stringify({status:'SESSION_COOKIE_RECOVERY_VERIFIED',productionAccess:false,output}));
})().catch(error=>{console.error(error);process.exitCode=1;});
