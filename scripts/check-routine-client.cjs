const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||'../tmp/routine-qa-20261025');await fs.mkdir(out,{recursive:true});
  const modules=process.env.RUNTIME_MODULES||'C:/Users/sergi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
  const browser=await chromium.launch({channel:'msedge',headless:true});let errors=[];
  try{
    const context=await browser.newContext({viewport:{width:1280,height:950},serviceWorkers:'block'});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!=='http://127.0.0.1:9333'){
        if(url.pathname.endsWith('/pdf-lib.min.js'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(modules,'pdf-lib/dist/pdf-lib.min.js'))});
        if(url.pathname.endsWith('/chart.umd.js'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'funding-chart.umd.js'))});
        return route.fulfill({contentType:'text/javascript',body:''});
      }
      const file=url.pathname.slice(1)||'consulta.html';
      if(['github-sync.js','cutover.js','dashboard-auth.js'].includes(file))return route.fulfill({contentType:'text/javascript',body:'window.GitHubSync={ready:Promise.resolve(false),markDirty(){},setStatusElement(){},bootstrapAutoSync(){},attach(){},manualResync(){}};window.DashboardAuth={gate(){}};'});
      if(file.includes('..')||file.includes('/'))return route.abort();
      try{return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.jpg')?'image/jpeg':'text/javascript',body:await fs.readFile(path.join(root,file))});}catch{return route.fulfill({status:404,body:''});}
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto('http://127.0.0.1:9333/consulta.html',{waitUntil:'load'});await page.addScriptTag({path:path.join(root,'session-icons.js')});
    await page.evaluate(()=>{
      const source=JSON.parse(JSON.stringify(TOB_BIIO_SOURCE.M.Reacondicionamiento));
      source.id='template-test';source.categoria='Reacondicionamiento';source.nombre='Reacondicionamiento';source.sexo='M';
      source.entrenos.forEach(en=>{en.id=en.letra;en.ejercicios.forEach((ej,i)=>{ej.id='ej_'+en.id+'_'+i;ej.orden=i;});});
      const a={id:'assignment-test',plantillaId:source.id,fechaInicio:'2026-12-29',estado:'en_curso',notas:'PRIVATE NOTE MUST NOT EXPORT',rutina:{entrenos:JSON.parse(JSON.stringify(source.entrenos)),numMicro:source.numMicro},iteraciones:[{id:'iteration-test',numero:1,fechaInicio:'2026-12-29',sesiones:{}},{id:'iteration-2',numero:2,fechaInicio:'2027-02-01',sesiones:{}}]};
      tobDB={clientes:[{id:'client-test',nombre:'Cliente de prueba',asignaciones:[a]},{id:'other-client',nombre:'Otro cliente',asignaciones:[{...JSON.parse(JSON.stringify(a)),id:'other-assignment'}]}],plantillas:[source]};
      tobStoredRaw=JSON.stringify(tobDB);localStorage.setItem(TOB_KEY,tobStoredRaw);window.baseline=JSON.stringify(tobDB);
      tobOpenAsignacion('client-test',a.id,'iteration-test');
    });
    assert.equal(await page.locator('#tobEntContent .tob-ej-block').count(),await page.evaluate(()=>tobAsig().rutina.entrenos[0].ejercicios.length));
    assert.equal(await page.locator('#tobEntContent .routine-date').count(),6);
    assert.equal(await page.locator('#tobEntContent img').count(),0,'No images mixed into the editable register');
    assert.equal(await page.locator('.routine-segments,.routine-exercise').count(),0,'No replacement card workflow');
    assert.equal(await page.evaluate(()=>!!(document.getElementById('tobChartsGrid').compareDocumentPosition(document.getElementById('tobRoutineAppendix'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'Visual appendix comes after the complete register and charts');
    assert.equal(await page.evaluate(()=>JSON.stringify(tobDB)),await page.evaluate(()=>window.baseline),'opening must not mutate records');
    assert.ok(await page.locator('.routine-photos img').count()>0);
    await page.locator('.routine-photos img').first().scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.routine-photos img').naturalWidth>500);
    await page.locator('#tobEntContent').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'routine-desktop.png')});
    const old=await page.evaluate(()=>JSON.stringify(tobDB));
    await page.evaluate(()=>tobOpenEjEditorPlantilla('template-test','A','ej_A_0'));
    await page.locator('#tobEjEditMicro').selectOption('3');await page.locator('#tobEjEditorBg button').filter({hasText:'Guardar'}).click();
    assert.equal(await page.evaluate(()=>JSON.stringify(tobDB)),old,'opening/saving source micro3 must not flatten plans');
    await page.locator('.tob-ej-block').first().locator('.routine-plan-edit').nth(2).click();await page.locator('#routineEditRest').fill('2 minutos');
    await page.locator('#routineEditPercent').fill('70%');
    assert.equal(await page.evaluate(()=>ghHasUnsavedChanges()),true);
    await page.locator('#routineEditName').fill('Prensa 45°');await page.locator('#routineEditLibrary').selectOption('leg-press-45');await page.locator('#routineRememberAlias').check();
    await page.locator('#routineEditor button').filter({hasText:'Guardar ajuste'}).click();
    assert.equal(await page.locator('#routineEditor').isVisible(),false);
    await page.evaluate(()=>{
      const a=tobAsig(),ej=a.rutina.entrenos[0].ejercicios[0],it=tobIt();
      if(FTRoutine.effective(ej,3,it,'A').plan.pausa!=='2 minutos')throw Error('override missing');
      const baseline=JSON.parse(window.baseline);if(JSON.stringify(a.rutina)!==JSON.stringify(baseline.clientes[0].asignaciones[0].rutina))throw Error('base changed');
      if(JSON.stringify(tobDB.clientes[1])!==JSON.stringify(baseline.clientes[1]))throw Error('other client changed');
      if(JSON.stringify(a.iteraciones[1])!==JSON.stringify(baseline.clientes[0].asignaciones[0].iteraciones[1]))throw Error('other iteration changed');
    });
    const firstBlock=page.locator('.tob-ej-block').first();
    const kg=firstBlock.locator('input[data-tob-number=kg]').nth(2),reps=firstBlock.locator('input[data-tob-number=reps]').nth(2);
    assert.equal(await kg.isEditable(),true);assert.equal(await reps.isEditable(),true);
    await kg.fill('80');await kg.press('Tab');await reps.fill('10');await reps.press('Tab');
    assert.equal(await page.evaluate(()=>tobIt().sesiones[3].A.ejs.ej_A_0.series[0].kg),80);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(TOB_KEY)).clientes[0].asignaciones[0].iteraciones[0].sesiones[3].A.ejs.ej_A_0.series[0].reps),10);
    await page.evaluate(()=>tobRoutineOpenEditor('A','ej_A_0',3));await page.locator('#routineEditName').fill('Peso muerto');await page.locator('#routineEditor button').filter({hasText:'Guardar ajuste'}).click();
    assert.match(await page.locator('#routineEditorError').innerText(),/resultados/);await page.evaluate(()=>tobRoutineCloseEditor(true));
    const scores=await page.evaluate(()=>{const a=tobAsig(),s=tobIt().sesiones[3].A,items=tobRutinaChartItems(a.rutina);return items.filter(x=>x.ej.id==='ej_A_0').map(x=>[x.name,tobEjRowsFromSesion(s,x.ej,null).length]);});
    assert.equal(scores.find(x=>x[0]==='BOX SQUAT')[1],0);assert.equal(scores.find(x=>x[0]==='Prensa 45°')[1],1);
    await page.evaluate(()=>{tobRoutineMicro=3;tobRenderEntreno();});
    const date=page.locator('.routine-date').nth(2);await date.fill('02/01');await date.dispatchEvent('change');assert.equal(await page.evaluate(()=>tobIt().sesiones[3].A.fecha),'2027-01-02');
    await date.fill('31/02');await date.dispatchEvent('change');assert.equal(await page.evaluate(()=>tobIt().sesiones[3].A.fecha),'2027-01-02');await date.fill('02/01');await date.dispatchEvent('change');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('.tob-ej-head').first().click();await firstBlock.screenshot({path:path.join(out,'routine-mobile.png')});
    assert.equal(await firstBlock.evaluate(el=>el.scrollWidth>el.clientWidth),true,'The same matrix scrolls on mobile');
    await firstBlock.evaluate(el=>{el.scrollLeft=el.scrollWidth;});await firstBlock.screenshot({path:path.join(out,'routine-mobile-last-columns.png')});
    const bytes=await page.evaluate(async()=>Array.from(await tobBuildVisualRoutinePdf(tobDB.clientes[0],tobAsig(),tobDB.plantillas[0],tobIt(),false,true)));
    await fs.writeFile(path.join(out,'routine-synthetic.pdf'),Buffer.from(bytes));
    const blank=await page.evaluate(async()=>{const original=JSON.parse(window.baseline),cli=original.clientes[0],a=cli.asignaciones[0];return Array.from(await tobBuildVisualRoutinePdf(cli,a,original.plantillas[0],a.iteraciones[0],false,true));});
    await fs.writeFile(path.join(out,'routine-layout-preview.pdf'),Buffer.from(blank));
    await page.evaluate(async()=>{
      const bytes=await tobBuildVisualRoutinePdf(tobDB.clientes[0],tobAsig(),tobDB.plantillas[0],tobIt(),false,true),pdf=await PDFLib.PDFDocument.load(bytes);
      pdf.getForm().getTextField('fecha_A_1').setText('30/12');pdf.getForm().getTextField('ej_ej_A_0_1_A_series_0_kg').setText('20');
      pdf.getForm().getTextField('ej_ej_A_0_1_A_series_0_reps').setText('12');
      await tobReadPdfFile(new File([await pdf.save()],'synthetic-filled.pdf',{type:'application/pdf'}));
      if(!tobIt().sesiones[1]?.A)throw Error(document.getElementById('tobPdfStatus').textContent);
      if(tobIt().sesiones[1].A.fecha!=='2026-12-30'||tobIt().sesiones[1].A.ejs.ej_A_0.series[0].kg!==20)throw Error('PDF import failed');
      window.goodPdf=Array.from(await pdf.save());window.beforeBad=JSON.stringify(tobDB);
      pdf.getForm().getTextField('ej_ej_A_0_1_A_series_1_reps').setText('20 reps');
      await tobReadPdfFile(new File([await pdf.save()],'bad.pdf'));if(JSON.stringify(tobDB)!==window.beforeBad)throw Error('Invalid PDF mutated database');
      tobCurrentItId='iteration-2';await tobReadPdfFile(new File([new Uint8Array(window.goodPdf)],'wrong-iteration.pdf'));
      if(JSON.stringify(tobDB)!==window.beforeBad)throw Error('Wrong iteration mutated database');
    });
    assert.match(await page.locator('#tobPdfStatus').innerText(),/otro cliente, rutina o iteración/);
    if(process.env.ROUTINE_CLIENT_PDF){
      const external=await fs.readFile(process.env.ROUTINE_CLIENT_PDF);
      await page.evaluate(async bytes=>{tobCurrentItId='iteration-test';await tobReadPdfFile(new File([new Uint8Array(bytes)],'client-filled.pdf'));if(tobIt().sesiones[1]?.A?.ejs?.ej_A_0?.series?.[0]?.kg!==42.5)throw Error('Independent client PDF import failed: '+document.getElementById('tobPdfStatus').textContent);},Array.from(external));
    }
    await page.evaluate(()=>{tobCurrentItId='iteration-test';tobRoutineOpenEditor('A','ej_A_3',3);});
    await page.locator('#routineEditSeries').fill('4');await page.locator('#routineEditor button').filter({hasText:'Guardar ajuste'}).click();
    await page.evaluate(()=>{
      const record=tobIt().sesiones[3].A.ejs.ej_A_3;if(record.prescripcion.plan.recordSlots!==4)throw Error('Circuit round override missing');
      tobSetEjVal('ej_A_3','A',3,11,'kg','12','lineas');tobSetEjVal('ej_A_3','A',3,11,'reps','10','lineas');
      tobRoutineOpenEditor('A','ej_A_3',3);tobRoutineReset();
      if(record.prescripcion||record.lineas[11].kg!==12)throw Error('Reset removed historical circuit results');
    });
    const templateChecks=await page.evaluate(async()=>{
      const reports=[];
      for(const [sex,categories]of Object.entries(TOB_BIIO_SOURCE))for(const [category,data]of Object.entries(categories)){
        const pl=JSON.parse(JSON.stringify(data));pl.nombre=category;pl.categoria=category;pl.sexo=sex;
        pl.entrenos.forEach(en=>{en.id=en.letra;en.ejercicios.forEach((ej,i)=>{ej.id=`test_${en.id}_${i}`;ej.orden=i;});});
        const a={id:'qa',fechaInicio:'2026-10-01',rutina:pl,iteraciones:[]},it={id:'qa-it',numero:1,fechaInicio:'2026-10-01',sesiones:{}};
        const before=JSON.stringify(pl),bytes=await tobBuildVisualRoutinePdf({id:'qa',nombre:'QA'},a,pl,it,false,true),pdf=await PDFLib.PDFDocument.load(bytes);
        if(JSON.stringify(pl)!==before)throw Error('Template PDF mutated source');
        const fields=pdf.getForm().getFields().map(f=>f.getName());if(new Set(fields).size!==fields.length)throw Error('Duplicate field names');
        const last=pl.entrenos[0].numMicro||pl.numMicro;if(!fields.includes(`fecha_${pl.entrenos[0].id}_${last}`))throw Error('Last micro missing');
        reports.push({sex,category,pages:pdf.getPageCount(),fields:fields.length});
      }
      return reports;
    });assert.equal(templateChecks.length,16);await fs.writeFile(path.join(out,'template-pdf-checks.json'),JSON.stringify(templateChecks,null,2));
    await page.setViewportSize({width:1280,height:950});await page.evaluate(()=>{tobCurrentItId='iteration-test';tobRenderEntreno();});await page.locator('#tobEntContent').screenshot({path:path.join(out,'routine-matrix.png')});await page.locator('#tobRoutineAppendix').screenshot({path:path.join(out,'routine-appendix.png')});
    assert.deepEqual(errors,[]);console.log('Original editable matrix restored; appendix last; UI input saving, scoped overrides, history, PDF import and all 16 source exports passed');
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
