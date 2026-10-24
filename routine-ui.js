/* Optional routine presentation and per-session prescriptions. No startup writes. */
let tobRoutineMode='client',tobRoutineMicro=1,tobRoutineEditor=null;
function tobRoutinePlan(ej,mn,it,entId){return FTRoutine.effective(ej,mn,it,entId).plan;}
function tobRoutineMovement(ej){return FTExercises.resolve(ej.nombre,tobDB.exerciseAliases||{},ej.libraryId);}
function tobRoutineTools(en){
  const total=en.numMicro||tobNumMicroOf(tobAsig().rutina);tobRoutineMicro=Math.max(1,Math.min(tobRoutineMicro,total));
  return `<div class="routine-tools"><div class="routine-segments" role="group" aria-label="Vista de rutina">${[['client','Vista cliente'],['matrix','Todos los microciclos']].map(([v,l])=>`<button class="${tobRoutineMode===v?'on':''}" onclick="tobRoutineSetMode('${v}')">${l}</button>`).join('')}</div><label>Microciclo <select aria-label="Microciclo activo" onchange="tobRoutineMicro=Number(this.value);tobRenderEntreno()">${Array.from({length:total},(_,i)=>`<option ${i+1===tobRoutineMicro?'selected':''}>${i+1}</option>`).join('')}</select></label></div>`;
}
function tobRoutineSetMode(mode){tobRoutineMode=mode;tobRenderEntreno();}
function tobRoutineDateInput(it,a,mn,entId){
  const value=it?.sesiones?.[mn]?.[entId]?.fecha||'';
  return `<input class="routine-date" type="text" inputmode="numeric" maxlength="10" aria-label="Fecha microciclo ${mn}" placeholder="DD/MM" title="${tobEsc(value||'DD/MM; admite DD/MM/AAAA para confirmar el año')}" value="${tobEsc(FTRoutine.shortDate(value))}" onchange="tobRoutineSetDate(${mn},'${entId}',this)">`;
}
function tobRoutineSetDate(mn,entId,input){
  try{
    const date=FTRoutine.resolveDate(input.value,FTRoutine.dateContext(tobAsig(),tobIt(),mn,entId));
    const s=tobGetSesion(mn,entId);if(!s)return;
    s.fecha=date;if(!tobSave())return;
    input.value=FTRoutine.shortDate(date);input.title=date;input.setCustomValidity('');input.removeAttribute('data-routine-invalid');tobRenderChartsSoon();
  }catch(error){input.dataset.routineInvalid='true';input.setCustomValidity(error.message);input.reportValidity();tobToast(error.message,'red');}
}
function tobRoutinePhotos(movement){
  if(!movement)return '<span class="routine-unmatched">Ejercicio sin asociar</span>';
  return `<div class="routine-photos">${movement.images.map((src,i)=>`<figure><img src="${src}" alt="${tobEsc(movement.name)}: ${i?'posición final':'posición inicial'}" loading="lazy" width="575" height="305"><figcaption>${i?'Final':'Inicio'}</figcaption></figure>`).join('')}</div>`;
}
function tobRoutineRenderClient(en,it){
  const chartSection=document.getElementById('tobChartsGrid')?.closest('.tob-card');if(chartSection)chartSection.hidden=true;
  const a=tobAsig(),mn=tobRoutineMicro,s=it?.sesiones?.[mn]?.[en.id];
  let html=tobRoutineTools(en)+`<section class="routine-session"><h3>${tobEsc(en.nombre||en.letra)} · Microciclo ${mn}</h3><div class="routine-session-row"><label>Fecha ${tobRoutineDateInput(it,a,mn,en.id)}</label><span>${tobEsc(en.indicaciones?.[mn]||'')}</span></div></section>`;
  for(const original of [...(en.ejercicios||[])].sort((a,b)=>(a.orden||0)-(b.orden||0))){
    const ej=FTRoutine.effective(original,mn,it,en.id),plan=ej.plan,movement=tobRoutineMovement(ej),record=s?.ejs?.[ej.id];
    const circuit=ej.tipo==='circuito',arr=circuit?'lineas':'series';
    const programmed=circuit?(original.source?(plan.recordSlots||0)*(ej.circuitoLineas?.length||0):(ej.circuitoLineas?.length||0)):(plan.series||0);
    const count=Math.max(programmed,record?.[arr]?.length||0);
    html+=`<article class="routine-exercise"><header><div><h4>${tobEsc(ej.nombre)}</h4><span class="routine-equipment">${tobEsc(movement?.equipment||'')}</span></div><button class="routine-icon" title="Editar solo este microciclo" aria-label="Editar ${tobEsc(ej.nombre)} solo microciclo ${mn}" onclick="tobRoutineOpenEditor('${en.id}','${ej.id}',${mn})"><span data-ft-icon="edit"></span></button></header>
      ${tobRoutinePhotos(movement)}
      <div class="routine-prescription"><strong>${tobEsc(tobPlanLabel(plan))}</strong>${plan.porcentaje?`<strong>${tobEsc(plan.porcentaje)}</strong>`:''}<span>Descanso: ${tobEsc(plan.pausa||'Sin indicación')}</span>${['cargaObjetivo','rir','rpe','tempo'].map(k=>plan[k]?`<span>${{cargaObjetivo:'Carga',rir:'RIR',rpe:'RPE',tempo:'Tempo'}[k]}: ${tobEsc(plan[k])}</span>`:'').join('')}</div>
      ${ej.subtitle||plan.indicaciones?`<div class="routine-coach"><b>Entrenador</b><p>${tobEsc([ej.subtitle,plan.indicaciones].filter(Boolean).join('\n'))}</p></div>`:''}
      ${movement?`<details class="routine-technique"><summary>Cómo hacerlo</summary><p>${tobEsc(movement.technique)}</p></details>`:''}
      ${circuit?`<p>${(ej.circuitoLineas||[]).map(tobEsc).join(' / ')}</p>`:''}
      ${circuit?`<div class="routine-circuit-guides">${(ej.circuitoLineas||[]).map(name=>{const guide=FTExercises.resolve(name,tobDB.exerciseAliases||{});return `<details class="routine-technique"><summary>${tobEsc(name)}</summary>${tobRoutinePhotos(guide)}${guide?`<p>${tobEsc(guide.technique)}</p>`:''}</details>`;}).join('')}</div>`:''}
      <table class="routine-results"><thead><tr><th>${circuit?'Ronda / ejercicio':'Serie'}</th><th>Objetivo</th><th>Kg</th><th>Reps</th></tr></thead><tbody>${Array.from({length:count},(_,i)=>{
        const row=record?.[arr]?.[i]||{},targetIndex=circuit?Math.floor(i/(ej.circuitoLineas?.length||1)):i,target=Array.isArray(plan.repsTarget)?(plan.repsTarget[targetIndex]??plan.repsTarget[0]):plan.repsTarget;
        const label=circuit?`${Math.floor(i/(ej.circuitoLineas?.length||1))+1} · ${ej.circuitoLineas?.[i%(ej.circuitoLineas?.length||1)]||''}`:`${i+1}`;
        return `<tr><th>${tobEsc(label)}${i>=programmed?' (hist.)':''}</th><td>${tobEsc(i<programmed?target||'—':'—')}</td>${['kg','reps'].map(k=>`<td><input aria-label="${k} serie ${i+1} ${tobEsc(ej.nombre)}" type="text" inputmode="${k==='kg'?'decimal':'numeric'}" data-tob-number="${k}" value="${tobEsc(row[k]??'')}" onchange="tobSetEjVal('${ej.id}','${en.id}',${mn},${i},'${k}',this.value,'${arr}')"></td>`).join('')}</tr>`;
      }).join('')}</tbody></table><label class="routine-comment">Comentarios<textarea rows="2" onchange="tobSetComment('${ej.id}','${en.id}',${mn},this.value)">${tobEsc(record?.comentario||'')}</textarea></label></article>`;
  }
  html+=`<section class="routine-session"><label class="routine-comment">Comentario del día<textarea maxlength="300" rows="2" onchange="tobSetSessionComment('${en.id}',${mn},this.value)">${tobEsc(s?.comentario||'')}</textarea></label><p>Aeróbico: ${tobEsc(en.cardioByMicro?.[mn]?.label||'Sin indicación')}</p><div class="routine-session-row">${['tipo','tiempo','intensidad'].map(k=>`<label>${{tipo:'Tipo',tiempo:'Tiempo',intensidad:'Intensidad'}[k]}<input value="${tobEsc(s?.aerobica?.[k]||'')}" onchange="tobSetAerobica(${mn},'${en.id}','${k}',this.value)"></label>`).join('')}</div></section>`;
  document.getElementById('tobEntContent').innerHTML=tobMigrationNotice(a)+html;window.FTIcons?.refresh();
}
function tobRoutineEditorValues(){
  if(!tobRoutineEditor)return null;
  const value=id=>document.getElementById('routineEdit'+id).value.trim();
  const plan={series:Number(value('Series')),repsTarget:value('Reps').split('/').map(s=>s.trim()).filter(Boolean)};
  for(const [id,key]of [['Rest','pausa'],['Percent','porcentaje'],['Load','cargaObjetivo'],['Rir','rir'],['Rpe','rpe'],['Tempo','tempo'],['Notes','indicaciones']])plan[key]=value(id);
  return {nombre:value('Name'),subtitle:value('Subtitle'),libraryId:value('Library'),rememberAlias:document.getElementById('routineRememberAlias').checked,plan};
}
function tobRoutineEditorDirty(){
  return !!tobRoutineEditor&&JSON.stringify(tobRoutineEditorValues())!==tobRoutineEditor.initial;
}
function tobRoutineOpenEditor(entId,ejId,mn){
  if(tobRoutineEditorDirty()&&!confirm('Hay un ajuste sin guardar. ¿Descartarlo?'))return;
  const a=tobAsig(),it=tobIt(),en=a?.rutina?.entrenos.find(e=>e.id===entId),base=en?.ejercicios.find(e=>e.id===ejId);if(!base||!it)return;
  const ej=FTRoutine.effective(base,mn,it,entId),plan=ej.plan,movement=tobRoutineMovement(ej);
  const cli=tobDB.clientes.find(c=>c.id===tobCurrentAsig.clienteId);
  tobRoutineEditor={a,it,en,base,mn};
  let bg=document.getElementById('routineEditor');if(!bg){bg=document.createElement('div');bg.id='routineEditor';bg.className='tob-modal-bg on';document.body.append(bg);}bg.classList.add('on');
  const field=(id,label,value,type='text')=>`<label>${label}<input id="routineEdit${id}" type="${type}" value="${tobEsc(value??'')}"></label>`;
  bg.innerHTML=`<div class="tob-modal routine-editor" role="dialog" aria-modal="true" aria-labelledby="routineEditorTitle"><h3 id="routineEditorTitle">Solo este microciclo</h3><p class="routine-scope">${tobEsc(cli?.nombre||'')} · Iteración ${it.numero} · Microciclo ${mn} · Día ${tobEsc(en.letra||en.id)}</p>
    ${field('Name','Ejercicio',ej.nombre)}<label>Biblioteca<select id="routineEditLibrary"><option value="">Detección por nombre / sin asociar</option>${FTExercises.entries.map(e=>`<option value="${e.id}" ${ej.libraryId===e.id?'selected':''}>${tobEsc(e.name+' · '+e.equipment)}</option>`).join('')}</select></label><label class="routine-alias"><input id="routineRememberAlias" type="checkbox"> Reutilizar esta asociación para el mismo nombre</label>
    <div class="routine-fields">${field('Series',ej.tipo==='circuito'?'Rondas del circuito':'Series',plan.series,'number')}${field('Reps','Repeticiones (15/12/10)',Array.isArray(plan.repsTarget)?plan.repsTarget.join('/'):plan.repsTarget)}${field('Percent','Porcentaje',plan.porcentaje)}${field('Rest','Descanso',plan.pausa)}${field('Load','Carga objetivo',plan.cargaObjetivo)}${field('Tempo','Tempo',plan.tempo)}${field('Rir','RIR',plan.rir)}${field('Rpe','RPE',plan.rpe)}</div>
    ${field('Subtitle','Observación del entrenador',ej.subtitle)}<label>Indicaciones de esta sesión<textarea id="routineEditNotes" rows="3">${tobEsc(plan.indicaciones||'')}</textarea></label><p class="routine-library-note">${tobEsc(movement?.technique||'Ejercicio sin asociar')}</p><p id="routineEditorError" role="alert"></p><footer><button onclick="tobRoutineReset()" title="Quitar solo el ajuste de esta sesión">Volver al plan base</button><button onclick="tobRoutineCloseEditor()">Cancelar</button><button class="tob-action" onclick="tobRoutineSaveEditor()">Guardar ajuste</button></footer></div>`;
  tobRoutineEditor.initial=JSON.stringify(tobRoutineEditorValues());document.getElementById('routineEditName').focus();
}
function tobRoutineCloseEditor(force=false){
  if(!force&&tobRoutineEditorDirty()&&!confirm('¿Descartar el ajuste sin guardar?'))return;
  document.getElementById('routineEditor')?.classList.remove('on');tobRoutineEditor=null;
}
function tobRoutineSaveEditor(){
  const ctx=tobRoutineEditor;if(!ctx)return;
  try{
    if(tobAsig()!==ctx.a||tobIt()!==ctx.it)throw Error('La selección de cliente o iteración ha cambiado. Cierra y vuelve a abrir el ajuste.');
    const desired=tobRoutineEditorValues();
    if(!desired.nombre||!Number.isInteger(desired.plan.series)||desired.plan.series<0||desired.plan.series>30)throw Error('Indica un nombre y entre 0 y 30 series.');
    if(ctx.base.tipo==='circuito'&&desired.plan.series!==tobRoutinePlan(ctx.base,ctx.mn,ctx.it,ctx.en.id).series){
      if(desired.plan.series*(ctx.base.circuitoLineas?.length||1)>200)throw Error('El circuito supera las 200 posiciones de registro.');
      desired.plan.recordSlots=desired.plan.series;desired.plan.capacityUnspecified=false;
    }
    if(desired.libraryId&&!FTExercises.byId(desired.libraryId))throw Error('Asociación de biblioteca no válida.');
    const record=ctx.it.sesiones?.[ctx.mn]?.[ctx.en.id]?.ejs?.[ctx.base.id];
    const oldMovement=tobRoutineMovement(FTRoutine.effective(ctx.base,ctx.mn,ctx.it,ctx.en.id));
    const newMovement=FTExercises.resolve(desired.nombre,tobDB.exerciseAliases||{},desired.libraryId);
    if(FTRoutine.hasResults(record)&&oldMovement?.id!==newMovement?.id)throw Error('Ya hay resultados. No se puede asociar otra variante a este movimiento registrado.');
    if(document.getElementById('routineRememberAlias').checked&&!desired.libraryId)throw Error('Selecciona la variante de biblioteca antes de reutilizarla.');
    const patch=FTRoutine.patchFor(ctx.base,ctx.mn,desired,ctx.it,ctx.en.id);
    const ses=tobGetSesion(ctx.mn,ctx.en.id);ses.ejs[ctx.base.id]||={};
    if(Object.keys(patch).length)ses.ejs[ctx.base.id].prescripcion=patch;else delete ses.ejs[ctx.base.id].prescripcion;
    if(document.getElementById('routineRememberAlias').checked){
      tobDB.exerciseAliases||={};tobDB.exerciseAliases[FTExercises.normalize(desired.nombre)]=desired.libraryId;
    }
    if(!tobSave())return;
    tobRoutineCloseEditor(true);tobRenderEntreno();tobRenderCharts();tobToast('Ajuste aplicado solo a esta sesión','green');
  }catch(error){document.getElementById('routineEditorError').textContent=error.message;}
}
function tobRoutineReset(){
  const ctx=tobRoutineEditor;if(!ctx)return;
  const record=ctx.it.sesiones?.[ctx.mn]?.[ctx.en.id]?.ejs?.[ctx.base.id];
  if(!record?.prescripcion){tobRoutineCloseEditor(true);return;}
  if(record.prescripcion.nombre&&record.prescripcion.nombre!==ctx.base.nombre&&FTRoutine.hasResults(record)){document.getElementById('routineEditorError').textContent='Este movimiento ya tiene resultados. No se puede cambiar su identidad al volver al plan base.';return;}
  if(!confirm('¿Quitar el ajuste de esta sesión? Los resultados y comentarios se conservan.'))return;
  delete record.prescripcion;if(!tobSave())return;tobRoutineCloseEditor(true);tobRenderEntreno();tobRenderCharts();
}
const tobRoutineOldUnsaved=window.ghHasUnsavedChanges,tobRoutineOldSnapshot=window.ghEditorSnapshot;
function tobRoutineTemplateValues(){return _tobEditingEj?Array.from(document.querySelectorAll('#tobEjEditorBg input,#tobEjEditorBg select,#tobEjEditorBg textarea')).map(el=>[el.id,el.value]):null;}
function tobRoutineTemplateDirty(){return !!_tobEditingEj?.initial&&JSON.stringify(tobRoutineTemplateValues())!==_tobEditingEj.initial;}
function tobRoutineUncommitted(){return Array.from(document.querySelectorAll('[data-routine-uncommitted]')).map(el=>({binding:el.getAttribute('onchange'),value:el.value}));}
window.ghHasUnsavedChanges=()=>!!(tobRoutineOldUnsaved?.()||tobRoutineEditorDirty()||tobRoutineTemplateDirty()||document.querySelector('[data-routine-invalid],[data-routine-uncommitted]'));
window.ghEditorSnapshot=()=>({...tobRoutineOldSnapshot?.(),routineForm:tobRoutineEditorValues(),routineInputs:tobRoutineUncommitted(),templateForm:tobRoutineTemplateValues(),routineTarget:tobRoutineEditor?{assignment:tobRoutineEditor.a.id,iteration:tobRoutineEditor.it.id,micro:tobRoutineEditor.mn,day:tobRoutineEditor.en.id,exercise:tobRoutineEditor.base.id}:null});
document.addEventListener('input',event=>{if(event.target.matches('#tobEntContent input,#tobEntContent textarea'))event.target.dataset.routineUncommitted='true';});
document.addEventListener('change',event=>{if(event.target.matches('#tobEntContent input,#tobEntContent textarea')&&event.target.validity.valid&&!tobSaveFailed)delete event.target.dataset.routineUncommitted;});
window.addEventListener('beforeunload',event=>{if(window.ghHasUnsavedChanges()){event.preventDefault();event.returnValue='Formulario sin guardar';}});
