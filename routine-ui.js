/* Optional routine presentation and per-session prescriptions. No startup writes. */
let tobRoutineMicro=1,tobRoutineEditor=null;
function tobRoutinePlan(ej,mn,it,entId){return FTRoutine.effective(ej,mn,it,entId).plan;}
function tobRoutineMovement(ej){return FTExercises.resolve(ej.nombre,tobDB.exerciseAliases||{},ej.libraryId);}
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
  return `<div class="routine-photos${movement.generated?' routine-photos--generated':''}">${movement.images.map((src,i)=>`<figure><img src="${src}" alt="${tobEsc(movement.name)}: ${i?'posición final':'posición inicial'}" loading="lazy" width="575" height="305"><figcaption>${movement.id==='forearm-plank'?'Mantener':i?'Final':'Inicio'}${movement.generated?' · Ilustración IA':''}</figcaption></figure>`).join('')}</div>`;
}
function tobRoutineGuides(a,it){
  return (a.rutina?.entrenos||[]).map(en=>{
    const items=new Map(),total=en.numMicro||tobNumMicroOf(a.rutina);
    for(const base of [...(en.ejercicios||[])].sort((a,b)=>(a.orden||0)-(b.orden||0)))for(let mn=1;mn<=total;mn++){
      const ej=FTRoutine.effective(base,mn,it,en.id);
      for(const name of ej.tipo==='circuito'?(ej.circuitoLineas||[]):[ej.nombre]){
        const movement=ej.tipo==='circuito'?FTExercises.resolve(name,tobDB.exerciseAliases||{}):tobRoutineMovement(ej);
        const subtitle=ej.tipo==='circuito'?'':ej.subtitle||'';
        const alternatives=movement?[null]:FTExercises.referenceIllustrations(name);
        for(const illustration of alternatives.length?alternatives:[null]){
          const key=(movement?.id||FTExercises.normalize(name))+'|'+subtitle+'|'+(illustration?.id||'');
          if(!items.has(key))items.set(key,{name,movement,subtitle,illustration});
        }
      }
    }
    return {name:en.nombre||'Entreno '+(en.letra||en.id),items:[...items.values()]};
  });
}
function tobRoutineRenderAppendix(a,it){
  const target=document.getElementById('tobRoutineAppendix');if(!target)return;
  target.innerHTML=`<header class="routine-appendix-title"><h3>Cómo realizar los ejercicios</h3><a class="routine-icon" href="#tobEntContent" title="Volver al registro" aria-label="Volver al registro"><span data-ft-icon="back"></span></a></header>`+
    tobRoutineGuides(a,it).map(group=>`<section class="routine-guide-group"><h4>${tobEsc(group.name)}</h4>${group.items.map(({name,movement,subtitle,illustration})=>`<article class="routine-guide"><div class="routine-guide-copy"><h5>${tobEsc(name)}</h5>${subtitle?`<p class="routine-guide-cue">${tobEsc(subtitle)}</p>`:''}${illustration?`<p class="routine-guide-cue">Variante ilustrada: ${tobEsc(illustration.name)}</p>`:''}${!movement&&FTExercises.referenceNote(name)?`<p class="routine-guide-cue">${tobEsc(FTExercises.referenceNote(name))}</p>`:''}<p>${tobEsc((movement||illustration)?.technique||'Ejercicio sin asociar. Consulta la variante con tu entrenador.')}</p></div>${tobRoutinePhotos(movement||illustration)}</article>`).join('')}</section>`).join('');
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
