const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
const output=process.env.BIIO_TEST_OUTPUT||require('os').tmpdir();
const origin=process.env.BIIO_TEST_ORIGIN||'http://127.0.0.1:8765/oct02';
const templates=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const assignment={id:'as',plantillaId:templates[0].id,estado:'en_curso',rutina:{_planV:5,numMicro:6,entrenos:templates[0].entrenos},iteraciones:[{id:'it',numero:1,sesiones:{}}]};
const fixture={plantillas:templates,clientes:[{id:'active',nombre:'Cliente prueba activo',activo:true,asignaciones:[assignment],mediciones:[]},{id:'inactive',nombre:'Cliente prueba inactivo',activo:false,asignaciones:[],mediciones:[]}]};
async function context(browser,failDatabase=false){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await ctx.route('**/dashboard-auth.js',r=>r.fulfill({body:'window.DashboardAuth={gate:()=>Promise.resolve(),changePin:()=>{}}',contentType:'text/javascript'}));
 await ctx.route('**/github-sync.js',r=>r.fulfill({body:'window.GitHubSync=new Proxy({}, {get:()=>()=>Promise.resolve()})',contentType:'text/javascript'}));
 await ctx.route(/^https:\/\//,r=>r.abort());
 await ctx.addInitScript(({fixture,failDatabase})=>{
  localStorage.setItem('tob_online_v2',JSON.stringify(fixture));
  const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='tob_online_v2_before_plan6')throw new DOMException('Storage full','QuotaExceededError');return set.call(this,k,v);};
  if(failDatabase){const open=indexedDB.open.bind(indexedDB);indexedDB.open=(name,...args)=>{if(name==='consulta-safety-v1')throw new Error('Database unavailable');return open(name,...args);};}
 },{fixture,failDatabase});return ctx;
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  // Actual first render, without manually switching filters or calling render functions.
  for(const failDatabase of [false,true]){
   const ctx=await context(browser,failDatabase),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/consulta.html');
   await page.waitForFunction(()=>document.querySelectorAll('#tobClientesBody tr').length===1);
   assert.equal(await page.locator('#tobPlantillasGroups tbody tr').count(),16);
   if(failDatabase){await page.waitForFunction(()=>!!document.getElementById('tobLoadNotice')?.textContent);assert.equal(await page.evaluate(()=>tobDB.clientes[0].asignaciones[0].rutina._planV),5);}
   else{
    await page.waitForFunction(()=>tobDB.clientes[0].asignaciones[0].rutina._planV===6);
    const backup=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('consulta-safety-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('snapshots').objectStore('snapshots').get('before-plan6');q.onsuccess=()=>{resolve(q.result.raw);db.close();};};r.onerror=()=>reject(r.error);}));
    assert.deepEqual(JSON.parse(backup),fixture);
    await page.evaluate(()=>tobOpenAsignacion('active','as','it'));
    const comment=page.getByLabel('Comentario del día 1',{exact:true});await comment.fill('Día cómodo; sin molestias.');await comment.press('Tab');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(TOB_KEY)).clientes[0].asignaciones[0].iteraciones[0].sesiones[1].A.comentario),'Día cómodo; sin molestias.');
    const kg=page.locator('[data-tob-number="kg"]').first();await kg.fill('20,5');await kg.press('Tab');
    await page.addScriptTag({path:require.resolve('pdf-lib/dist/pdf-lib.min.js')});
    const result=await page.evaluate(async()=>{
     const a=tobAsig(),it=tobIt(),pl=tobDB.plantillas.find(p=>p.id===a.plantillaId),ej=a.rutina.entrenos[0].ejercicios[0];
     const bytes=await tobBuildSourcePdf({nombre:'Prueba'},a,pl,it,false,true),pdf=await PDFLib.PDFDocument.load(bytes),form=pdf.getForm();
     const savedComment=form.getTextField('sesion_comentario_A_1').getText();form.getTextField('sesion_comentario_A_1').setText('Comentario importado del día');
     form.getTextField(`ej_${ej.id}_1_A_series_0_reps`).setText('8 reps');let b=await pdf.save();const before=JSON.stringify(it.sesiones);await tobReadPdfFile({name:'invalid.pdf',arrayBuffer:async()=>b});const unchanged=before===JSON.stringify(it.sesiones);
     form.getTextField(`ej_${ej.id}_1_A_series_0_reps`).setText('8');b=await pdf.save();await tobReadPdfFile({name:'valid.pdf',arrayBuffer:async()=>b});
     return {savedComment,unchanged,comment:it.sesiones[1].A.comentario,kg:it.sesiones[1].A.ejs[ej.id].series[0].kg,bytes:Array.from(b)};
    });
    assert.equal(result.savedComment,'Día cómodo; sin molestias.');assert.equal(result.comment,'Comentario importado del día');assert.ok(result.unchanged);assert.equal(result.kg,20.5);
    fs.writeFileSync(path.join(output,'comentarios-dia.pdf'),Buffer.from(result.bytes));
    await page.screenshot({path:path.join(output,'consulta-oct02-desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'consulta-oct02-mobile.png')});
   }
   assert.deepEqual(errors,[]);console.log(JSON.stringify({consulta:true,backupUnavailable:failDatabase,firstActiveRows:1,templates:16,errors}));await ctx.close();
  }
  const ctx=await context(browser),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/options.html');await page.evaluate(()=>openRoadmapCfg());
  const cases=await page.evaluate(()=>[
   [25,24,'yes',false,null,'Mantener · sin FIX normal'],[25,25,'yes',false,null,'Cerrar el ciclo'],[50,49,'unknown',false,null,'Revisar viabilidad'],[50,49,'yes',false,null,'Mantener'],[50,-10,'no',false,null,'Evaluar FIX defensivo'],[75,1,'yes',false,null,'Cerrar el ciclo'],[75,-1,'yes',false,null,'Evaluar FIX defensivo'],[75,0,'yes',false,null,'Decidir ahora'],[0,5,'yes',true,null,'Emergency FIX Review'],[25,40,'yes',false,21,'Revisar cierre del ciclo']
  ].map(([checkpoint,profit,viable,emergency,et,expected])=>({actual:pcsDecision({checkpoint,profit,viable,emergency,et}).action,expected})));
  cases.forEach(c=>assert.equal(c.actual,c.expected));
  const roll=await page.evaluate(()=>{
   const old={idOp:'test-cycle',activo:'SPX',apertura:'2026-07-01',exp:'2026-08-15',totalNetoOvr:-5.45};
   HIST.push(old);
   try{return pcsCycleMetrics({idOp:'test-cycle',activo:'SPX',apertura:'2026-08-01',exp:'2026-10-09',contracts:2,pDebito:0,comi:0},'2026-08-20',{premiumTotal:1205,pnlEst:705});}
   finally{HIST.splice(HIST.indexOf(old),1);}
  });
  assert.ok(Math.abs(roll.profit-160/660*100)<1e-8);
  assert.equal(roll.time,50);assert.equal(roll.checkpoint,50);

  await page.locator('#pcsCp').selectOption('75');await page.locator('#pcsProfit').fill('5');assert.ok((await page.locator('#pcsAnswer').innerText()).includes('Cerrar el ciclo'));
  await page.screenshot({path:path.join(output,'pcs-oct02-desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'pcs-oct02-mobile.png')});
  assert.equal(await page.evaluate(()=>document.querySelector('#roadmapOverlay .cfg-modal').scrollWidth>document.querySelector('#roadmapOverlay .cfg-modal').clientWidth+1),false);
  await page.goto(origin+'/patrimonio.html');assert.equal(await page.locator('#alertsWrapper,#portfolioMovementSummary').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({pcsCases:cases.length,patrimonioPanelsRemoved:true,errors}));await ctx.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
