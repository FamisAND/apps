const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {readFile,realpath,mkdir}=require('node:fs/promises');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const [sourceArg,bundleArg,outputArg]=process.argv.slice(2);
  if(!sourceArg||!bundleArg||!outputArg)throw new Error('Provide private backup, verified bundle and NEW private screenshot directory');
  const source=await realpath(sourceArg),bundleFile=await realpath(bundleArg),parent=await realpath(path.dirname(outputArg)),output=path.join(parent,path.basename(outputArg));
  for(const file of [source,bundleFile,output])if(!file.toLowerCase().split(path.sep).includes('.full-training-backups'))throw new Error('Keep real-data test files outside the published repository');
  await mkdir(output);
  const {packSnapshot,unpackSnapshot}=await import('../src/snapshot-codec.mjs');
  const {listRecords,commitRecords,sha256}=await import('../src/records.mjs');
  const {FILE_MODULE,COMMON_FILES,RECORD_FILES}=await import('../src/policy.mjs');
  const {openSettings}=await import('../src/settings-crypto.mjs');
  const {publicAiConfig}=await import('../src/private-settings.mjs');
  const bytes=await readFile(source),original=JSON.parse(bytes.toString('utf8')),bundle=JSON.parse(await readFile(bundleFile,'utf8'));
  const verification=JSON.parse(await readFile(path.join(path.dirname(bundleFile),'verification.private.json'),'utf8'));
  assert.equal(await sha256(bytes.toString('utf8')),verification.sourceSha256);
  let aiConfig={};
  const sealed=bundle.namespaces.find(section=>section.namespace==='private_settings')?.records[0];
  if(sealed){const secret=JSON.parse(await readFile(path.join(path.dirname(bundleFile),'worker-secret.private.json'),'utf8'));aiConfig=publicAiConfig(await openSettings(JSON.parse(sealed.payload),secret.SETTINGS_ENCRYPTION_KEY,bundle.datasetId));}
  const root=path.resolve(__dirname,'..','..'),db=new DatabaseSync(':memory:');
  console.log('Preparing isolated real-shape fixture; originals are read only');
  db.exec(await readFile(path.join(__dirname,'..','business-migrations','0001_records.sql'),'utf8'));
  db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run('html-fixture','staging',bundle.sourceSha256,1,new Date().toISOString());
  const insert=db.prepare('INSERT INTO record_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  db.exec('BEGIN');for(const section of bundle.namespaces)for(const row of section.records)insert.run('html-fixture',section.namespace,row.key,1,'import',row.payload,row.sha256,0,'isolated-import',null,new Date().toISOString());db.exec('COMMIT');db.exec("UPDATE datasets SET status='active'");
  function prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return db.prepare(sql).run(...values);}};}
  const binding={prepare,async batch(statements){db.exec('BEGIN');try{for(const statement of statements)await statement.run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}};
  let writesEnabled=false;const requests=[];
  const server=http.createServer(async(request,response)=>{
    const url=new URL(request.url,'http://127.0.0.1');
    try{
      let value;
      if(url.pathname==='/api/session')value={user:{id:'isolated-admin',name:'Test admin',role:'admin',active:true,permissions:[]},dataMode:'records',writesEnabled,modules:{}};
      else if(url.pathname==='/api/settings/ai'&&request.method==='GET')value={version:1,cfg:aiConfig};
      else if(url.pathname.startsWith('/api/records/')){
        const namespace=url.pathname.split('/')[3];assert.ok(bundle.namespaces.some(section=>section.namespace===namespace));
        if(request.method==='POST'){
          if(!writesEnabled)throw Object.assign(new Error('Synthetic read-only mode'),{status:423});
          let raw='';for await(const chunk of request)raw+=chunk;
          const body=JSON.parse(raw);requests.push({requestId:body.requestId,namespace,operations:body.operations.length});
          value=await commitRecords(binding,'html-fixture',namespace,'isolated-admin',body);
        }else value=await listRecords(binding,'html-fixture',namespace,url.searchParams.get('cursor')||'',url.searchParams.has('generation')?Number(url.searchParams.get('generation')):null);
      }else{
        const file=url.pathname.slice(1)||'index.html';
        if(!COMMON_FILES.has(file)&&!FILE_MODULE[file])throw Object.assign(new Error('Not in static allowlist'),{status:404});
        if(file.endsWith('.html')&&file!=='session-admin.html'&&request.headers['x-ft-prepared']!=='records-v1'){
          response.setHeader('Content-Type','text/html;charset=utf-8');response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/app-session.js"></script></head><body><p id="ftLoadMessage">Loading verified fixture</p><button id="ftLoadRetry" hidden onclick="location.reload()">Retry</button><button id="ftLoadExport" hidden>Export</button><script type="module" src="/record-loader.mjs"></script></body></html>');return;
        }
        const body=await readFile(path.join(RECORD_FILES.has(file)?path.join(root,'cloudflare','src'):root,file));
        response.setHeader('Content-Type',(file.endsWith('.html')?'text/html':/\.(js|mjs)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'application/json')+';charset=utf-8');response.end(body);return;
      }
      response.setHeader('Content-Type','application/json;charset=utf-8');response.end(JSON.stringify(value));
    }catch(error){response.writeHead(error.status||500,{'Content-Type':'application/json'});response.end(JSON.stringify({error:error.status?error.message:'Synthetic fixture failure'}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});
  console.log('Isolated browser launched');
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),summary=[];let forbidden=0;
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin||['cdnjs.cloudflare.com','cdn.jsdelivr.net'].includes(url.hostname)&&url.pathname.endsWith('.js'))return route.continue();
    if(url.hostname==='api.github.com')forbidden++;return route.abort();
  });
  function pageSetup(page){page.on('dialog',dialog=>dialog.dismiss());}
  async function loaded(page,file){
    console.log('Loading '+file);
    await page.goto(origin+'/'+file,{waitUntil:'domcontentloaded',timeout:120000});
    try{await page.waitForFunction(()=>window.FTRecords&&window.GitHubSync&&document.querySelector('#ftRecordStatus'),null,{timeout:120000});}
    catch(error){
      console.log(JSON.stringify(await page.evaluate(()=>({ready:document.readyState,message:document.getElementById('ftLoadMessage')?.textContent||null,mode:window.FTSession?.dataMode,records:window.FTRecords?.values.size,hasSync:!!window.GitHubSync,states:window.FTRecords?[...FTRecords.states].map(([namespace,state])=>({namespace,...state})):[]}))));
      await page.screenshot({path:path.join(output,file.replace('.html','-failed.png')),fullPage:true});throw error;
    }
    if(file==='consulta.html')await page.waitForFunction(()=>typeof tobDB!=='undefined'&&tobDB.clientes?.length>0,null,{timeout:30000});
  }
  try{
    for(const file of ['full_training.html','consulta.html','patrimonio.html','options.html','facturas.html']){
      const page=await context.newPage(),errors=[];pageSetup(page);page.on('pageerror',error=>errors.push(error.message));
      await loaded(page,file);
      const state=await page.evaluate(()=>({owner:FTRecords.ownerId,dataMode:FTSession.dataMode,writesEnabled:FTSession.writesEnabled,loaded:FTRecords.values.size,visible:document.body.innerText.length,status:document.querySelector('#ftRecordStatus').textContent}));
      assert.equal(state.owner,'isolated-admin');assert.equal(state.dataMode,'records');assert.equal(state.writesEnabled,false);assert.equal(state.loaded,7);assert.ok(state.visible>100);assert.match(state.status,/solo lectura/);
      assert.ok(!errors.length,'JavaScript errors in '+file+': '+errors.join(' | '));
      if(file==='consulta.html'){
        const expectedConsulta=typeof original.training_online.tob_online_v2==='string'?JSON.parse(original.training_online.tob_online_v2):original.training_online.tob_online_v2;
        assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(tobDB))),expectedConsulta,'Consulta changed imported clients, measurements or menus while loading');
        const catalog=typeof original.tob_menus_catalog==='string'?JSON.parse(original.tob_menus_catalog):original.tob_menus_catalog;
        const photo=await page.evaluate(async id=>{
          const dataUrl=await FTRecords.media.get(id),image=new Image();image.src=dataUrl;await image.decode();
          const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const context=canvas.getContext('2d');context.drawImage(image,0,0,32,32);
          const pixels=context.getImageData(0,0,32,32).data;
          return {width:image.naturalWidth,height:image.naturalHeight,colors:new Set(Array.from({length:1024},(_,index)=>pixels.slice(index*4,index*4+3).join(','))).size};
        },catalog.recetas.find(recipe=>recipe._fotoLocal).id);
        assert.ok(photo.width>0&&photo.height>0&&photo.colors>10,'Central recipe image is blank or failed to decode');
      }
      await page.screenshot({path:path.join(output,file.replace('.html','-desktop.png')),fullPage:true});
      summary.push({file,loaded:true,errors:0,legacyGitHubRequests:0});await page.close();console.log(file+': verified isolated read-only startup');
    }
    assert.equal(requests.length,0,'Read-only startup issued a write');assert.equal(forbidden,0,'A migrated HTML tried GitHub directly');
    writesEnabled=true;const page=await context.newPage();pageSetup(page);await loaded(page,'consulta.html');
    const changed=await page.evaluate(async()=>{
      const ci=tobDB.clientes.findIndex(c=>(c.mediciones||[]).some(m=>typeof m.pes==='number'));
      if(ci<0)throw new Error('No numeric measurement fixture found');
      const mi=tobDB.clientes[ci].mediciones.findIndex(m=>typeof m.pes==='number'),before=tobDB.clientes[ci].mediciones[mi].pes;
      tobDB.clientes[ci].mediciones[mi].pes=before+0.1;
      if(!tobSave(true))throw new Error('Application save rejected');
      await FTRecords.waitForDrafts('training_online');await GitHubSync.flush();
      return {ci,mi,before,after:before+0.1,pending:FTRecords.pending()};
    });
    assert.equal(changed.pending,false);assert.equal(requests.length,1);
    await page.close();const reopened=await context.newPage();pageSetup(reopened);await loaded(reopened,'consulta.html');
    assert.equal(await reopened.evaluate(({ci,mi})=>tobDB.clientes[ci].mediciones[mi].pes,changed),changed.after);
    await reopened.route('**/api/records/*/commit',route=>route.abort());
    const pending=await reopened.evaluate(async({ci,mi})=>{
      tobDB.clientes[ci].mediciones[mi].pes+=0.1;tobSave(true);await FTRecords.waitForDrafts('training_online');
      try{await GitHubSync.flush();}catch(_error){}
      const state=await FTRecords.store.state('training_online');return {requestId:state.pending?.requestId,peso:state.pending?.value.tob_online_v2.clientes[ci].mediciones[mi].pes};
    },changed);
    assert.ok(pending.requestId);await reopened.close({runBeforeUnload:false});
    const recovered=await context.newPage();pageSetup(recovered);await loaded(recovered,'consulta.html');
    await recovered.waitForFunction(()=>FTRecords.states.get('training_online')?.state==='confirmed',null,{timeout:30000});
    assert.equal(await recovered.evaluate(({ci,mi})=>tobDB.clientes[ci].mediciones[mi].pes,changed),pending.peso);
    assert.equal(requests.filter(request=>request.requestId===pending.requestId).length,1);
    await recovered.setViewportSize({width:390,height:844});await recovered.screenshot({path:path.join(output,'consulta-mobile.png'),fullPage:true});
    await recovered.getByRole('button',{name:'Copias y espacio',exact:true}).click();
    await recovered.getByRole('dialog').waitFor();await recovered.screenshot({path:path.join(output,'storage-mobile.png'),fullPage:true});
    const storageFits=await recovered.getByRole('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth&&element.getBoundingClientRect().right<=innerWidth);
    assert.ok(storageFits,'Storage dialog overflows on mobile');
    const rows=db.prepare("SELECT record_key,payload FROM records WHERE namespace='training_online' AND deleted=0").all();
    const final=await unpackSnapshot(new Map(rows.map(row=>[row.record_key,JSON.parse(row.payload)])));
    assert.equal(final.tob_online_v2.clientes[changed.ci].mediciones[changed.mi].pes,pending.peso);
    assert.equal(await sha256((await readFile(source)).toString('utf8')),verification.sourceSha256);
    console.log(JSON.stringify({status:'ISOLATED_HTMLS_VERIFIED',summary,measurementSaveConfirmed:true,reopenPreserved:true,offlinePendingRecovered:true,legacyGitHubRequests:forbidden,productionWrites:0,backupWrites:0,output},null,2));
    await recovered.close();
  }finally{
    await context.close();await browser.close();
    console.log('Closing isolated HTTP fixture');
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});db.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
