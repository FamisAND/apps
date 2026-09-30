const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.route('**/dashboard-auth.js',r=>r.fulfill({contentType:'text/javascript',body:'window.DashboardAuth={gate:()=>Promise.resolve(),changePin:()=>{}}'}));
 await context.route('**/github-sync.js',r=>r.fulfill({contentType:'text/javascript',body:'window.GitHubSync=new Proxy({}, {get:()=>()=>Promise.resolve()})'}));
 await context.route('**/api.github.com/**',r=>r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/consulta.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof tobBuildSeedPlantillas==='function');
 await page.addScriptTag({path:require.resolve('pdf-lib/dist/pdf-lib.min.js')});
 await page.evaluate(()=>{
   tobDB={clientes:[],plantillas:tobBuildSeedPlantillas()};
   window.testCli={id:'test',nombre:'Cliente de prueba',asignaciones:[],mediciones:[]};tobDB.clientes=[testCli];
 });
 const results=[];
 for(let i=0;i<16;i++){
  results.push(await page.evaluate(i=>{
   const pl=tobDB.plantillas[i],a={id:'test-a',plantillaId:pl.id,rutina:{entrenos:pl.entrenos,numMicro:pl.numMicro,_planV:6},iteraciones:[{id:'test-it',numero:1,sesiones:{}}]};
   testCli.asignaciones=[a];tobCurrentAsig={clienteId:testCli.id,asigId:a.id};tobCurrentItId=a.iteraciones[0].id;tobCurrentEntrenoId=pl.entrenos[0].id;
   const html=pl.entrenos.map(en=>en.ejercicios.map(ej=>tobRenderEjBlock(ej,en,Array.from({length:en.numMicro||pl.numMicro},(_,j)=>j+1),a.iteraciones[0])).join('')).join('');
   document.getElementById('tobEntContent').innerHTML=html;
   return {sexo:pl.sexo,categoria:pl.categoria,blocks:pl.entrenos.reduce((n,en)=>n+en.ejercicios.length,0),inputs:document.querySelectorAll('[data-tob-number]').length};
  },i));
 }
 await page.evaluate(()=>{document.querySelectorAll('.tob-page').forEach(e=>e.style.display='none');const target=document.getElementById('tobEntContent');document.body.append(target);target.style.cssText='display:block;padding:20px';});
 await page.screenshot({path:path.join(process.env.BIIO_TEST_OUTPUT || require('os').tmpdir(),'desktop.png'),fullPage:false});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(process.env.BIIO_TEST_OUTPUT || require('os').tmpdir(),'mobile.png'),fullPage:false});
 const input=page.locator('[data-tob-number="kg"]').first();await input.fill('20,5');await input.press('Tab');
 const numeric=await page.evaluate(()=>tobIt().sesiones[1].A.ejs[tobAsig().rutina.entrenos[0].ejercicios[0].id].series[0].kg);
 if(numeric!==20.5)throw new Error('UI numeric persistence failed');
 const blocked=await page.evaluate(()=>{
  const el=document.querySelector('[data-tob-number="kg"]');
  const data=new DataTransfer();data.setData('text/plain','20 kg');
  const paste=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});
  el.dispatchEvent(paste);
  const letter=new InputEvent('beforeinput',{data:'a',inputType:'insertText',bubbles:true,cancelable:true});el.dispatchEvent(letter);
  return paste.defaultPrevented&&letter.defaultPrevented;
 });
 if(!blocked)throw new Error('Invalid input was not blocked');
 const pdfImport=await page.evaluate(async()=>{
   const a=tobAsig(),ej=a.rutina.entrenos[0].ejercicios[0],it=tobIt();
   const make=async bad=>{const d=await PDFLib.PDFDocument.create();d.addPage();const f=d.getForm();f.createTextField(`ej_${ej.id}_1_A_series_0_kg`).setText('23,5');f.createTextField(`ej_${ej.id}_1_A_series_0_reps`).setText(bad?'30 reps':'8');f.createTextField(`comentario_${ej.id}_1_A`).setText('Comentario PDF');const b=await d.save();return {name:'prueba.pdf',arrayBuffer:async()=>b};};
   const before=JSON.stringify(it.sesiones);await tobReadPdfFile(await make(true));const atomic=before===JSON.stringify(it.sesiones);
   await tobReadPdfFile(await make(false));const r=it.sesiones[1].A.ejs[ej.id];return {atomic,kg:r.series[0].kg,reps:r.series[0].reps,comment:r.comentario};
 });
 if(!pdfImport.atomic||pdfImport.kg!==23.5||pdfImport.reps!==8||pdfImport.comment!=='Comentario PDF')throw new Error('PDF import failed '+JSON.stringify(pdfImport));
 for(const index of [0,7,14,15]){
  const bytes=await page.evaluate(async i=>{
   const pl=tobDB.plantillas[i],a={rutina:{entrenos:pl.entrenos,numMicro:pl.numMicro}};
   return Array.from(await tobBuildSourcePdf({nombre:'Prueba sin datos personales'},a,pl,{numero:1,sesiones:{}},false,true));
  },index);fs.writeFileSync(path.join(process.env.BIIO_TEST_OUTPUT || require('os').tmpdir(),`routine-${index}.pdf`),Buffer.from(bytes));
 }
 console.log(JSON.stringify({results,numeric,blocked,pdfImport,errors}));await browser.close();
 if(errors.length)throw new Error(errors.join('; '));
})().catch(e=>{console.error(e);process.exit(1)});
