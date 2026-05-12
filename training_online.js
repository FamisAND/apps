/**
 * training_online.js — Gestor de entrenamientos BIIO System
 *
 * Modelo de datos (localStorage 'tob_online_v1'):
 *   {
 *     clientes:    [{id, nombre, sexo, contacto, alta, asignaciones:[asig...], mediciones:[]}],
 *     plantillas:  [{id, nombre, categoria, sexo, microciclos:[], entrenos:[], ejercicios:[]}]
 *   }
 *
 *   asig:       {id, plantillaId, fechaInicio, estado, notas,
 *                rutina: <copia de plantilla editable>,
 *                completados: {[microId]:{[entId]:{fecha,peso,cond,calidad,nota,ejs:{[ejId]:{series:[{kg,reps}]}}}}}}
 *
 *   plantilla:
 *     id, nombre, categoria, sexo: 'H'|'M'|'U',
 *     microciclos: [{id, nombre}, ...],
 *     entrenos:    [{id, letra, nombre}, ...],
 *     ejercicios:  [{id, entrenoId, orden, nombre, planMicro:{[microId]:{series:N, reps:'20', pct:null}}, pausa, notas}]
 *
 * Sincroniza a data.json via GitHubSync.attach con section 'training_online'.
 */

const TOB_KEY = 'tob_online_v1';
let tobDB = { clientes: [], plantillas: [] };
let tobCurrentAsig = null;     // {clienteId, asigId}
let tobCurrentMicroId = null;
let tobCurrentEntrenoId = null;
let tobProgChart = null;

function tobUid(prefix){ return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }

function tobLoad(){
  try {
    const raw = localStorage.getItem(TOB_KEY);
    if(raw){
      tobDB = JSON.parse(raw);
      // backfill
      if(!tobDB.clientes) tobDB.clientes = [];
      if(!tobDB.plantillas) tobDB.plantillas = [];
    }
  } catch(e){ console.warn('tobLoad:', e); }
  // Seed inicial si no hay plantillas
  if(!tobDB.plantillas.length){
    tobDB.plantillas = tobBuildSeedPlantillas();
    tobSave(true);
  }
  tobRenderClientes();
  tobRenderPlantillas();
}

function tobSave(silent){
  try { localStorage.setItem(TOB_KEY, JSON.stringify(tobDB)); }
  catch(e){ console.error('tobSave:', e); }
  if(!silent && typeof GitHubSync !== 'undefined' && GitHubSync.markDirty){
    GitHubSync.markDirty();
  }
  tobBadge('💾 guardado');
}

function tobBadge(text){
  const el = document.getElementById('tobSaveBadge');
  if(!el) return;
  el.textContent = text;
  clearTimeout(tobBadge._t);
  tobBadge._t = setTimeout(() => el.textContent = '', 2000);
}

function tobToast(msg, type){
  const t = document.getElementById('tobToast');
  if(!t) return;
  t.textContent = msg;
  t.className = 'tob-toast show ' + (type || '');
  clearTimeout(tobToast._t);
  tobToast._t = setTimeout(() => t.className = 'tob-toast', 2500);
}

// ════════════════════════════════════════════════════════════════════
// NAVEGACIÓN DE TABS
// ════════════════════════════════════════════════════════════════════
function tobShowTab(name, btn){
  document.querySelectorAll('.tob-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tob-' + name).classList.add('active');
  if(btn) btn.classList.add('active');
  else {
    const tabs = document.querySelectorAll('.tob-tab');
    tabs.forEach(t => { if(t.getAttribute('onclick')?.includes(`'${name}'`)) t.classList.add('active'); });
  }
}

// ════════════════════════════════════════════════════════════════════
// CLIENTES
// ════════════════════════════════════════════════════════════════════
function tobRenderClientes(){
  const tbody = document.getElementById('tobClientesBody');
  const empty = document.getElementById('tobClientesEmpty');
  if(!tobDB.clientes.length){
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = tobDB.clientes.map(c => {
    const last = (c.asignaciones||[]).slice(-1)[0];
    const lastInfo = last ? tobPlantillaName(last.plantillaId) + ` <span class="tob-badge ${last.estado}">${last.estado}</span>` : '<span style="color:var(--mute2)">—</span>';
    return `<tr>
      <td><strong>${tobEsc(c.nombre)}</strong></td>
      <td><span style="color:var(--mute);font-family:DM Mono,monospace;font-size:.78rem;">${tobEsc(c.contacto||'—')}</span></td>
      <td><span class="tob-badge ${c.sexo==='M'?'m':'h'}">${c.sexo==='M'?'♀ Mujer':'♂ Hombre'}</span></td>
      <td class="num">${(c.asignaciones||[]).length}</td>
      <td>${lastInfo}</td>
      <td class="actions">
        <button class="tob-action ghost" style="padding:5px 10px;" onclick="tobAbrirCliente('${c.id}')">📂 Abrir</button>
      </td>
    </tr>`;
  }).join('');
}

function tobPlantillaName(plantId){
  const p = tobDB.plantillas.find(p => p.id === plantId);
  return p ? tobEsc(p.nombre) + (p.sexo==='M'?' ♀':p.sexo==='H'?' ♂':'') : '(sin plantilla)';
}

function tobOpenClienteModal(cli){
  document.getElementById('tobClienteModalTitle').textContent = cli ? 'Editar cliente' : 'Nuevo cliente';
  document.getElementById('tobCliNombre').value = cli?.nombre || '';
  document.getElementById('tobCliSexo').value = cli?.sexo || 'H';
  document.getElementById('tobCliContacto').value = cli?.contacto || '';
  document.getElementById('tobCliAlta').value = cli?.alta || new Date().toISOString().slice(0,10);
  const sel = document.getElementById('tobCliPlantilla');
  sel.innerHTML = '<option value="">— Ninguna por ahora —</option>' +
    tobDB.plantillas.map(p => `<option value="${p.id}">${tobEsc(p.nombre)} (${p.sexo==='M'?'♀':p.sexo==='H'?'♂':'U'})</option>`).join('');
  sel.value = '';
  document.getElementById('tobClienteModalBg').dataset.editId = cli?.id || '';
  document.getElementById('tobClienteModalBg').classList.add('on');
}
function tobCloseClienteModal(){ document.getElementById('tobClienteModalBg').classList.remove('on'); }

function tobSaveCliente(){
  const nombre = document.getElementById('tobCliNombre').value.trim();
  if(!nombre){ tobToast('Falta el nombre', 'red'); return; }
  const sexo = document.getElementById('tobCliSexo').value;
  const contacto = document.getElementById('tobCliContacto').value.trim();
  const alta = document.getElementById('tobCliAlta').value;
  const plantId = document.getElementById('tobCliPlantilla').value;
  const editId = document.getElementById('tobClienteModalBg').dataset.editId;
  if(editId){
    const c = tobDB.clientes.find(c => c.id === editId);
    if(c){ Object.assign(c, {nombre, sexo, contacto, alta}); }
  } else {
    const c = { id: tobUid('cli'), nombre, sexo, contacto, alta, asignaciones: [], mediciones: [] };
    if(plantId) c.asignaciones.push(tobCreateAsignacion(plantId));
    tobDB.clientes.push(c);
  }
  tobSave();
  tobCloseClienteModal();
  tobRenderClientes();
  tobToast('✓ Cliente guardado', 'green');
}

function tobCreateAsignacion(plantId){
  const pl = tobDB.plantillas.find(p => p.id === plantId);
  if(!pl) return null;
  return {
    id: tobUid('asig'),
    plantillaId: plantId,
    fechaInicio: new Date().toISOString().slice(0,10),
    estado: 'en_curso',
    notas: '',
    // Copia profunda de la plantilla, editable solo para este cliente
    rutina: JSON.parse(JSON.stringify({
      microciclos: pl.microciclos,
      entrenos: pl.entrenos,
      ejercicios: pl.ejercicios
    })),
    completados: {}
  };
}

function tobAbrirCliente(cliId){
  const c = tobDB.clientes.find(c => c.id === cliId);
  if(!c) return;
  // Si tiene asignaciones, abrir la última. Si no, lanzar selector de plantilla.
  if(!c.asignaciones || !c.asignaciones.length){
    tobOpenAsignarModal(c);
    return;
  }
  // Si tiene varias, mostrar lista; si una, abrirla
  if(c.asignaciones.length === 1){
    tobOpenAsignacion(c.id, c.asignaciones[0].id);
  } else {
    tobOpenAsignarModal(c, true);
  }
}

// Modal rápido para elegir/crear asignación
function tobOpenAsignarModal(cli, hasExisting){
  const existing = (cli.asignaciones||[]).map(a => {
    const p = tobDB.plantillas.find(p => p.id === a.plantillaId);
    return `<button class="tob-action ghost" style="margin:4px;text-align:left;width:100%;" onclick="tobOpenAsignacion('${cli.id}','${a.id}');tobCloseConfirm()">
      <strong>${p ? tobEsc(p.nombre) : '(sin plantilla)'}</strong>
      <span style="color:var(--mute);font-size:.72rem;float:right;">${a.estado} · ${a.fechaInicio||''}</span>
    </button>`;
  }).join('');
  const newOptions = tobDB.plantillas.map(p =>
    `<option value="${p.id}">${tobEsc(p.nombre)} (${p.sexo==='M'?'♀':p.sexo==='H'?'♂':'U'})</option>`
  ).join('');
  document.getElementById('tobConfirmTitle').textContent = 'Asignaciones de ' + tobEsc(cli.nombre);
  document.getElementById('tobConfirmMsg').innerHTML = `
    ${existing ? '<div style="margin-bottom:14px;"><div class="tob-lbl">Asignaciones existentes:</div>' + existing + '</div>' : ''}
    <div class="tob-lbl">Crear nueva asignación con plantilla:</div>
    <select class="tob-select" id="tobAsigNewPlant">${newOptions}</select>
  `;
  document.getElementById('tobConfirmOk').textContent = '+ Crear asignación';
  document.getElementById('tobConfirmOk').classList.remove('danger');
  document.getElementById('tobConfirmOk').onclick = function(){
    const plId = document.getElementById('tobAsigNewPlant').value;
    const a = tobCreateAsignacion(plId);
    if(!a){ tobToast('Plantilla no encontrada', 'red'); return; }
    cli.asignaciones.push(a);
    tobSave();
    tobCloseConfirm();
    tobOpenAsignacion(cli.id, a.id);
    tobToast('✓ Asignación creada', 'green');
  };
  document.getElementById('tobConfirmBg').classList.add('on');
}

// ════════════════════════════════════════════════════════════════════
// PLANTILLAS
// ════════════════════════════════════════════════════════════════════
function tobRenderPlantillas(){
  const tbody = document.getElementById('tobPlantillasBody');
  const empty = document.getElementById('tobPlantillasEmpty');
  if(!tobDB.plantillas.length){ tbody.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = tobDB.plantillas.map(p => {
    const sexoBadge = p.sexo==='M' ? '<span class="tob-badge m">♀ Mujer</span>' :
                      p.sexo==='H' ? '<span class="tob-badge h">♂ Hombre</span>' :
                      '<span class="tob-badge">U</span>';
    return `<tr>
      <td><strong>${tobEsc(p.nombre)}</strong></td>
      <td><span style="color:var(--mute);font-size:.78rem;">${tobEsc(p.categoria||'—')}</span></td>
      <td>${sexoBadge}</td>
      <td class="num">${(p.microciclos||[]).length}</td>
      <td class="num">${(p.entrenos||[]).length}</td>
      <td class="num">${(p.ejercicios||[]).length}</td>
      <td class="actions">
        <button class="tob-action ghost" style="padding:4px 9px;" onclick="tobEditarPlantilla('${p.id}')">✏️</button>
        <button class="tob-action danger" style="padding:4px 9px;" onclick="tobDelPlantilla('${p.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function tobOpenPlantillaModal(pl){
  document.getElementById('tobPlantillaModalTitle').textContent = pl ? 'Editar plantilla' : 'Nueva plantilla';
  document.getElementById('tobPlNombre').value = pl?.nombre || '';
  document.getElementById('tobPlCategoria').value = pl?.categoria || 'Reacondicionamiento';
  document.getElementById('tobPlSexo').value = pl?.sexo || 'H';
  document.getElementById('tobPlMicros').value = (pl?.microciclos||[]).map(m => m.nombre).join('\n');
  document.getElementById('tobPlEntrenos').value = (pl?.entrenos||[]).map(e => `${e.letra} | ${e.nombre||''}`).join('\n');
  document.getElementById('tobPlEjercicios').value = (pl?.ejercicios||[]).map(ej => {
    const e = (pl.entrenos.find(en=>en.id===ej.entrenoId)||{}).letra || '?';
    const firstM = Object.keys(ej.planMicro||{})[0];
    const plan = firstM ? `${ej.planMicro[firstM].series}x${ej.planMicro[firstM].reps}` : '';
    return `${e} | ${ej.nombre} | ${plan} | ${ej.pausa||''}`;
  }).join('\n');
  document.getElementById('tobPlantillaModalBg').dataset.editId = pl?.id || '';
  document.getElementById('tobPlantillaModalBg').classList.add('on');
}
function tobClosePlantillaModal(){ document.getElementById('tobPlantillaModalBg').classList.remove('on'); }

function tobSavePlantilla(){
  const nombre = document.getElementById('tobPlNombre').value.trim();
  if(!nombre){ tobToast('Falta el nombre', 'red'); return; }
  const categoria = document.getElementById('tobPlCategoria').value;
  const sexo = document.getElementById('tobPlSexo').value;
  const microsRaw = document.getElementById('tobPlMicros').value.split('\n').map(l => l.trim()).filter(Boolean);
  const entrenosRaw = document.getElementById('tobPlEntrenos').value.split('\n').map(l => l.trim()).filter(Boolean);
  const ejsRaw = document.getElementById('tobPlEjercicios').value.split('\n').map(l => l.trim()).filter(Boolean);
  if(!microsRaw.length){ tobToast('Mete al menos 1 microciclo', 'red'); return; }
  if(!entrenosRaw.length){ tobToast('Mete al menos 1 entreno', 'red'); return; }

  const microciclos = microsRaw.map((nombre, i) => ({ id: 'm' + (i+1), nombre }));
  const entrenos = entrenosRaw.map(l => {
    const [letra, nombreEnt] = l.split('|').map(x => x.trim());
    return { id: letra || ('e' + Math.random().toString(36).slice(2,5)), letra: letra||'?', nombre: nombreEnt||'' };
  });
  const ejercicios = ejsRaw.map((l, i) => {
    const parts = l.split('|').map(x => x.trim());
    const [eletra, ejnom, plan, pausa] = parts;
    const ent = entrenos.find(e => e.letra === eletra);
    const planMicro = {};
    // Parse "2x20" o "3x20-15-12"
    let series = 3, reps = '';
    if(plan){
      const m = plan.match(/(\d+)\s*x\s*(.+)/i);
      if(m){ series = parseInt(m[1]); reps = m[2].trim(); }
    }
    microciclos.forEach(mc => {
      planMicro[mc.id] = { series, reps, pct: null, active: true };
    });
    return {
      id: tobUid('ej'),
      entrenoId: ent?.id || (entrenos[0]?.id || 'A'),
      orden: i,
      nombre: ejnom || '(ejercicio)',
      planMicro,
      pausa: pausa || '',
      notas: ''
    };
  });

  const editId = document.getElementById('tobPlantillaModalBg').dataset.editId;
  if(editId){
    const p = tobDB.plantillas.find(p => p.id === editId);
    if(p) Object.assign(p, { nombre, categoria, sexo, microciclos, entrenos, ejercicios });
  } else {
    tobDB.plantillas.push({ id: tobUid('pl'), nombre, categoria, sexo, microciclos, entrenos, ejercicios });
  }
  tobSave();
  tobClosePlantillaModal();
  tobRenderPlantillas();
  tobToast('✓ Plantilla guardada', 'green');
}

function tobEditarPlantilla(id){
  const p = tobDB.plantillas.find(p => p.id === id);
  if(p) tobOpenPlantillaModal(p);
}

function tobDelPlantilla(id){
  const p = tobDB.plantillas.find(p => p.id === id);
  if(!p) return;
  tobConfirm(`Eliminar plantilla "${p.nombre}"?`, 'Esto NO afecta a asignaciones existentes (mantienen su copia editable). Solo la quita del catálogo.', () => {
    tobDB.plantillas = tobDB.plantillas.filter(x => x.id !== id);
    tobSave();
    tobRenderPlantillas();
    tobToast('✓ Plantilla eliminada', 'green');
  });
}

// ════════════════════════════════════════════════════════════════════
// VISTA ASIGNACIÓN (registrar pesos/reps)
// ════════════════════════════════════════════════════════════════════
function tobOpenAsignacion(cliId, asigId){
  tobCurrentAsig = { clienteId: cliId, asigId };
  const cli = tobDB.clientes.find(c => c.id === cliId);
  const asig = cli?.asignaciones.find(a => a.id === asigId);
  if(!cli || !asig){ tobToast('Asignación no encontrada', 'red'); return; }
  const pl = tobDB.plantillas.find(p => p.id === asig.plantillaId);

  document.getElementById('tobTabAsig').style.display = '';
  tobShowTab('asignacion');
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tobTabAsig').classList.add('active');

  document.getElementById('tobAsigTitulo').textContent = `${cli.nombre} — ${pl ? pl.nombre : asig.rutina ? '(plantilla eliminada — rutina conservada)' : '(sin rutina)'}`;
  document.getElementById('tobAsigSubtitulo').textContent = (pl?.categoria || '') + (pl?.sexo === 'M' ? ' · ♀' : pl?.sexo === 'H' ? ' · ♂' : '');

  document.getElementById('tobAsigEstado').value = asig.estado;
  document.getElementById('tobAsigFecha').value = asig.fechaInicio || '';
  document.getElementById('tobAsigNotas').value = asig.notas || '';

  // Default micro/entreno
  const micros = asig.rutina?.microciclos || [];
  const entrenos = asig.rutina?.entrenos || [];
  tobCurrentMicroId = micros[0]?.id || null;
  tobCurrentEntrenoId = entrenos[0]?.id || null;

  tobRenderMicroTabs();
  tobRenderEntrenoTabs();
  tobRenderSesion();
  tobPopulateProgEj();
  tobRenderProgreso();
}

function tobCloseAsignacion(){
  tobCurrentAsig = null;
  document.getElementById('tobTabAsig').style.display = 'none';
  tobShowTab('clientes');
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.querySelector('.tob-tab[onclick*=\'clientes\']')?.classList.add('active');
}

function tobAsig(){ // helper para obtener asig actual
  if(!tobCurrentAsig) return null;
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  return cli?.asignaciones.find(a => a.id === tobCurrentAsig.asigId);
}

function tobAsigUpdateEstado(v){ const a = tobAsig(); if(a){ a.estado = v; tobSave(); } }
function tobAsigUpdateFecha(v){ const a = tobAsig(); if(a){ a.fechaInicio = v; tobSave(); } }
function tobAsigUpdateNotas(v){ const a = tobAsig(); if(a){ a.notas = v; tobSave(); } }

function tobDeleteAsignacion(){
  if(!tobCurrentAsig) return;
  tobConfirm('¿Eliminar esta asignación?', 'Se borra todo el progreso registrado de esta rutina para este cliente.', () => {
    const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
    if(cli){
      cli.asignaciones = cli.asignaciones.filter(a => a.id !== tobCurrentAsig.asigId);
      tobSave();
      tobToast('Asignación eliminada', 'green');
      tobCloseAsignacion();
      tobRenderClientes();
    }
  });
}

function tobRenderMicroTabs(){
  const a = tobAsig(); if(!a) return;
  const cont = document.getElementById('tobMicroTabs');
  cont.innerHTML = (a.rutina?.microciclos||[]).map(mc => {
    const completedCount = Object.keys((a.completados[mc.id])||{}).length;
    const isComp = completedCount >= (a.rutina?.entrenos?.length||1);
    return `<button class="tob-micro-tab ${tobCurrentMicroId===mc.id?'active':''} ${isComp?'completed':''}"
      onclick="tobSetMicro('${mc.id}')">${tobEsc(mc.nombre)} ${isComp?'✓':''}</button>`;
  }).join('');
}

function tobSetMicro(id){
  tobCurrentMicroId = id;
  tobRenderMicroTabs();
  tobRenderSesion();
}

function tobRenderEntrenoTabs(){
  const a = tobAsig(); if(!a) return;
  const cont = document.getElementById('tobEntrenoTabs');
  cont.innerHTML = (a.rutina?.entrenos||[]).map(e => {
    return `<button class="tob-entreno-tab ${tobCurrentEntrenoId===e.id?'active':''}"
      onclick="tobSetEntreno('${e.id}')">${tobEsc(e.letra)}${e.nombre?' · '+tobEsc(e.nombre):''}</button>`;
  }).join('');
}

function tobSetEntreno(id){
  tobCurrentEntrenoId = id;
  tobRenderEntrenoTabs();
  tobRenderSesion();
}

function tobGetSesion(){
  const a = tobAsig();
  if(!a || !tobCurrentMicroId || !tobCurrentEntrenoId) return null;
  if(!a.completados[tobCurrentMicroId]) a.completados[tobCurrentMicroId] = {};
  if(!a.completados[tobCurrentMicroId][tobCurrentEntrenoId]){
    a.completados[tobCurrentMicroId][tobCurrentEntrenoId] = { fecha:'', peso:null, cond:null, calidad:null, nota:'', ejs:{} };
  }
  return a.completados[tobCurrentMicroId][tobCurrentEntrenoId];
}

function tobRenderSesion(){
  const a = tobAsig(); if(!a) return;
  const s = tobGetSesion(); if(!s) return;
  document.getElementById('tobSesFecha').value = s.fecha || '';
  document.getElementById('tobSesPeso').value = s.peso == null ? '' : s.peso;
  document.getElementById('tobSesCond').value = s.cond == null ? '' : s.cond;
  document.getElementById('tobSesCalidad').value = s.calidad == null ? '' : s.calidad;
  tobRenderEjercicios();
}

function tobSaveSesionMeta(){
  const s = tobGetSesion(); if(!s) return;
  s.fecha = document.getElementById('tobSesFecha').value;
  const p = parseFloat(document.getElementById('tobSesPeso').value);
  s.peso = isNaN(p) ? null : p;
  const c = parseInt(document.getElementById('tobSesCond').value);
  s.cond = isNaN(c) ? null : c;
  const q = parseInt(document.getElementById('tobSesCalidad').value);
  s.calidad = isNaN(q) ? null : q;
  tobSave();
  tobRenderMicroTabs();
}

function tobRenderEjercicios(){
  const a = tobAsig(); if(!a) return;
  const s = tobGetSesion(); if(!s) return;
  const ejs = (a.rutina?.ejercicios||[]).filter(e => e.entrenoId === tobCurrentEntrenoId);
  ejs.sort((x,y) => (x.orden||0) - (y.orden||0));
  const cont = document.getElementById('tobEjerciciosCont');
  if(!ejs.length){
    cont.innerHTML = '<div class="tob-card" style="text-align:center;color:var(--mute2);">Este entreno no tiene ejercicios definidos. Edita la plantilla.</div>';
    return;
  }
  cont.innerHTML = ejs.map(ej => {
    const plan = ej.planMicro?.[tobCurrentMicroId];
    if(!plan || plan.active === false) return ''; // ejercicio no aplica en este microciclo
    const seriesN = plan.series || 1;
    const reps = plan.reps || '';
    const pct = plan.pct ? ` · ${plan.pct}%RM` : '';
    if(!s.ejs[ej.id]) s.ejs[ej.id] = { series: Array.from({length: seriesN}, () => ({ kg:null, reps:null })) };
    // Asegurar tamaño correcto
    while(s.ejs[ej.id].series.length < seriesN) s.ejs[ej.id].series.push({kg:null,reps:null});
    const seriesRows = Array.from({length: seriesN}, (_,i) => {
      const sr = s.ejs[ej.id].series[i] || {kg:null,reps:null};
      return `<div class="tob-series-grid">
        <span class="lbl">${i+1}ª</span>
        <input class="tob-input" type="number" step="0.5" placeholder="kg" value="${sr.kg==null?'':sr.kg}" oninput="tobSaveSerie('${ej.id}',${i},'kg',this.value)">
        <input class="tob-input" type="number" placeholder="reps" value="${sr.reps==null?'':sr.reps}" oninput="tobSaveSerie('${ej.id}',${i},'reps',this.value)">
      </div>`;
    }).join('');
    return `<div class="tob-ej">
      <div class="tob-ej-hdr">
        <span class="tob-ej-name">${tobEsc(ej.nombre)}</span>
        <span class="tob-ej-plan">${seriesN}×${tobEsc(reps)}${pct} ${ej.pausa?'· pausa '+tobEsc(ej.pausa):''}</span>
      </div>
      <div class="tob-series-grid"><span class="head"></span><span class="head">Kg</span><span class="head">Reps</span></div>
      ${seriesRows}
      <div style="margin-top:8px;">
        <input class="tob-input" placeholder="Notas del ejercicio (opcional)" value="${tobEsc(s.ejs[ej.id].nota||'')}" oninput="tobSaveSerieNota('${ej.id}',this.value)" style="font-size:.78rem;">
      </div>
    </div>`;
  }).join('');
}

function tobSaveSerie(ejId, idx, field, val){
  const s = tobGetSesion(); if(!s) return;
  if(!s.ejs[ejId]) s.ejs[ejId] = { series: [] };
  while(s.ejs[ejId].series.length <= idx) s.ejs[ejId].series.push({kg:null,reps:null});
  const v = val === '' ? null : parseFloat(val);
  s.ejs[ejId].series[idx][field] = isNaN(v) ? null : v;
  tobSave();
}

function tobSaveSerieNota(ejId, val){
  const s = tobGetSesion(); if(!s) return;
  if(!s.ejs[ejId]) s.ejs[ejId] = { series: [] };
  s.ejs[ejId].nota = val;
  tobSave();
}

// ════════════════════════════════════════════════════════════════════
// PROGRESO (gráfica)
// ════════════════════════════════════════════════════════════════════
function tobPopulateProgEj(){
  const a = tobAsig(); if(!a) return;
  const sel = document.getElementById('tobProgEj');
  const ejs = a.rutina?.ejercicios || [];
  sel.innerHTML = ejs.map(ej => `<option value="${ej.id}">${tobEsc(ej.nombre)}</option>`).join('');
}

function tobRenderProgreso(){
  const a = tobAsig(); if(!a) return;
  const ejId = document.getElementById('tobProgEj').value;
  const metric = document.getElementById('tobProgMetric').value;
  if(!ejId) return;
  // Recolectar todos los registros de este ejercicio a través de microciclos
  const points = [];
  (a.rutina?.microciclos||[]).forEach(mc => {
    const ses = a.completados[mc.id];
    if(!ses) return;
    Object.entries(ses).forEach(([entId, s]) => {
      const er = s.ejs?.[ejId];
      if(!er || !er.series?.length) return;
      const series = er.series.filter(x => x.kg != null || x.reps != null);
      if(!series.length) return;
      let val;
      if(metric === 'max') val = Math.max(...series.map(x => x.kg || 0));
      else if(metric === 'avg'){ const ks = series.filter(x=>x.kg!=null).map(x=>x.kg); val = ks.length ? ks.reduce((a,b)=>a+b,0)/ks.length : 0; }
      else if(metric === 'vol') val = series.reduce((sum,x) => sum + (x.kg||0) * (x.reps||0), 0);
      else if(metric === 'reps') val = series.reduce((sum,x) => sum + (x.reps||0), 0);
      points.push({ label: mc.nombre + ' / ' + entId, fecha: s.fecha || '', val });
    });
  });
  points.sort((x,y) => (x.fecha||'').localeCompare(y.fecha||''));

  const ctx = document.getElementById('tobProgChart').getContext('2d');
  if(tobProgChart) tobProgChart.destroy();
  tobProgChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: points.map(p => p.label + (p.fecha?` (${p.fecha})`:'')),
      datasets: [{
        label: { max:'Kg máx', avg:'Kg medio', vol:'Volumen', reps:'Reps totales' }[metric],
        data: points.map(p => p.val),
        borderColor: '#a78bfa',
        backgroundColor: 'rgba(167,139,250,.15)',
        fill: true,
        tension: 0.2,
        pointRadius: 4,
        pointBackgroundColor: '#a78bfa'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#cbd5e1' } } },
      scales: {
        x: { ticks: { color: '#7a96b8', font: { size: 10 } }, grid: { color: '#1e2d3d' } },
        y: { ticks: { color: '#7a96b8' }, grid: { color: '#1e2d3d' } }
      }
    }
  });
}

// ════════════════════════════════════════════════════════════════════
// PDF: GENERAR y PARSEAR
// ════════════════════════════════════════════════════════════════════

// Genera un PDF rellenable con la rutina actual. Cada serie tiene 2 campos
// con nombre estable: ej_<ejId>_<microId>_<entId>_s<i>_kg / _reps
// Más metadatos: meta_<microId>_<entId>_fecha / _peso / _cond / _calidad
async function tobGeneratePdf(){
  const a = tobAsig(); if(!a){ tobToast('Sin asignación abierta', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  if(!window.PDFLib){ tobToast('pdf-lib no cargada', 'red'); return; }
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();

  const W = 595, H = 842, MARGIN = 36;
  const newPage = () => doc.addPage([W, H]);
  let page = newPage();
  let y = H - MARGIN;

  function drawText(text, opts){
    const o = opts || {};
    page.drawText(text, {
      x: o.x || MARGIN, y: y, size: o.size || 9,
      font: o.bold ? fontB : font,
      color: o.color || rgb(0.1,0.1,0.1)
    });
  }
  function lineGap(n){ y -= n; if(y < MARGIN + 30){ page = newPage(); y = H - MARGIN; } }

  // Cabecera
  drawText(`Cliente: ${cli?.nombre||''} — ${pl?.nombre||'Rutina'}`, { size: 13, bold: true });
  lineGap(18);
  drawText(`Plantilla: ${pl?.categoria||''} · ${pl?.sexo==='M'?'Mujer':pl?.sexo==='H'?'Hombre':'Unisex'}  ·  Inicio: ${a.fechaInicio||''}`, { size: 9, color: rgb(0.3,0.3,0.3) });
  lineGap(20);

  (a.rutina?.microciclos||[]).forEach(mc => {
    if(y < MARGIN + 120){ page = newPage(); y = H - MARGIN; }
    drawText('MICROCICLO: ' + mc.nombre, { size: 11, bold: true, color: rgb(0.4,0.2,0.7) });
    lineGap(16);

    (a.rutina?.entrenos||[]).forEach(en => {
      if(y < MARGIN + 80){ page = newPage(); y = H - MARGIN; }
      drawText(`Entreno ${en.letra}${en.nombre?' — '+en.nombre:''}`, { size: 10, bold: true });
      lineGap(14);

      // Meta fields
      ['fecha','peso','cond','calidad'].forEach((field, i) => {
        const x = MARGIN + i*130;
        page.drawText({fecha:'Fecha',peso:'Peso ayunas',cond:'Cond 1-5',calidad:'Calidad 1-10'}[field],
          { x, y, size: 7, font, color: rgb(0.45,0.45,0.45) });
        const tf = form.createTextField(`meta_${mc.id}_${en.id}_${field}`);
        const exist = a.completados[mc.id]?.[en.id]?.[field];
        if(exist != null) tf.setText(String(exist));
        tf.addToPage(page, { x, y: y - 12, width: 90, height: 12,
          borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
      });
      lineGap(30);

      const ejs = (a.rutina?.ejercicios||[]).filter(e => e.entrenoId === en.id).sort((x,y)=>(x.orden||0)-(y.orden||0));
      ejs.forEach(ej => {
        const plan = ej.planMicro?.[mc.id];
        if(!plan || plan.active === false) return;
        if(y < MARGIN + 60){ page = newPage(); y = H - MARGIN; }
        const seriesN = plan.series || 1;
        const reps = plan.reps || '';
        drawText(`${ej.nombre}  ·  ${seriesN}×${reps}${plan.pct?' @'+plan.pct+'%':''}${ej.pausa?'  pausa '+ej.pausa:''}`, { size: 9, bold: true });
        lineGap(13);
        // Tabla de series
        for(let i=0; i<seriesN; i++){
          const xKg = MARGIN + 30, xRp = MARGIN + 130;
          page.drawText(`S${i+1}`, { x: MARGIN, y, size: 8, font, color: rgb(0.3,0.3,0.3) });
          page.drawText('kg', { x: xKg - 14, y, size: 7, font, color: rgb(0.5,0.5,0.5) });
          page.drawText('reps', { x: xRp - 22, y, size: 7, font, color: rgb(0.5,0.5,0.5) });

          const kgF = form.createTextField(`ej_${ej.id}_${mc.id}_${en.id}_s${i}_kg`);
          const rpF = form.createTextField(`ej_${ej.id}_${mc.id}_${en.id}_s${i}_reps`);
          const exist = a.completados[mc.id]?.[en.id]?.ejs?.[ej.id]?.series?.[i];
          if(exist){
            if(exist.kg != null) kgF.setText(String(exist.kg));
            if(exist.reps != null) rpF.setText(String(exist.reps));
          }
          kgF.addToPage(page, { x: xKg, y: y - 2, width: 75, height: 11, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
          rpF.addToPage(page, { x: xRp, y: y - 2, width: 75, height: 11, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
          lineGap(14);
        }
        lineGap(6);
      });
      lineGap(10);
    });
    lineGap(10);
  });

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a2 = document.createElement('a');
  a2.href = url;
  a2.download = `${(cli?.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_${pl?.nombre.replace(/[^a-zA-Z0-9]/g,'_')||'rutina'}.pdf`;
  a2.click();
  URL.revokeObjectURL(url);
  tobToast('✓ PDF generado y descargado', 'green');
}

// Parse PDF rellenado — extrae los form fields y rellena `completados`
function tobHandlePdfDrop(ev){
  const f = ev.dataTransfer.files[0];
  if(f) tobReadPdfFile(f);
}
function tobHandlePdfFile(ev){
  const f = ev.target.files[0];
  if(f) tobReadPdfFile(f);
}
async function tobReadPdfFile(file){
  const a = tobAsig(); if(!a){ tobToast('Abre una asignación antes', 'red'); return; }
  const status = document.getElementById('tobPdfStatus');
  status.textContent = '⏳ Leyendo ' + file.name + '...';
  try {
    const buf = await file.arrayBuffer();
    const doc = await PDFLib.PDFDocument.load(buf);
    const form = doc.getForm();
    const fields = form.getFields();
    let n = 0, m = 0;
    fields.forEach(f => {
      const name = f.getName();
      let val = '';
      try { val = f.getText ? f.getText() : ''; } catch(e){}
      if(val === undefined || val === null || val === '') return;
      // Meta
      let parts = name.match(/^meta_(m\d+)_([^_]+)_(\w+)$/);
      if(parts){
        const [, microId, entId, field] = parts;
        if(!a.completados[microId]) a.completados[microId] = {};
        if(!a.completados[microId][entId]) a.completados[microId][entId] = { fecha:'',peso:null,cond:null,calidad:null,nota:'',ejs:{} };
        if(field === 'fecha') a.completados[microId][entId].fecha = val;
        else a.completados[microId][entId][field] = parseFloat(val) || null;
        m++;
        return;
      }
      // Ejercicio: ej_<ejId>_<microId>_<entId>_s<i>_<kg|reps>
      parts = name.match(/^ej_([^_]+(?:_[^_]+)*)_m(\d+)_([^_]+)_s(\d+)_(kg|reps)$/);
      if(parts){
        const [, ejIdRaw, microNum, entId, sIdx, field] = parts;
        // ejId puede contener underscores. Como construimos con `ej_<ejId>_m<n>_...`,
        // la regex hace que ejIdRaw = el segmento antes de m<n>. Resolver con cuidado:
        const microId = 'm' + microNum;
        const ejId = ejIdRaw; // ya capturado
        if(!a.completados[microId]) a.completados[microId] = {};
        if(!a.completados[microId][entId]) a.completados[microId][entId] = { fecha:'',peso:null,cond:null,calidad:null,nota:'',ejs:{} };
        if(!a.completados[microId][entId].ejs[ejId]) a.completados[microId][entId].ejs[ejId] = { series: [] };
        const i = parseInt(sIdx);
        while(a.completados[microId][entId].ejs[ejId].series.length <= i) a.completados[microId][entId].ejs[ejId].series.push({kg:null,reps:null});
        const v = parseFloat(val);
        if(!isNaN(v)) a.completados[microId][entId].ejs[ejId].series[i][field] = v;
        n++;
      }
    });
    tobSave();
    status.innerHTML = `<span style="color:var(--green);">✓ ${n} valores de ejercicios + ${m} metadatos importados de "${tobEsc(file.name)}". Revisa abajo y ajusta si falta algo.</span>`;
    tobRenderMicroTabs();
    tobRenderSesion();
    tobRenderProgreso();
    tobToast(`✓ ${n} valores importados`, 'green');
  } catch(e){
    console.error(e);
    status.innerHTML = `<span style="color:var(--red);">✕ Error: ${tobEsc(e.message)}. El PDF puede no ser rellenable o estar corrupto.</span>`;
    tobToast('Error al leer PDF', 'red');
  }
}

// ════════════════════════════════════════════════════════════════════
// EXPORT / IMPORT JSON
// ════════════════════════════════════════════════════════════════════
function tobExport(){
  const blob = new Blob([JSON.stringify(tobDB, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `training_online_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  tobToast('✓ Exportado', 'green');
}

function tobImport(ev){
  const f = ev.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = function(){
    try {
      const d = JSON.parse(reader.result);
      if(!d.clientes || !d.plantillas){ tobToast('JSON inválido', 'red'); return; }
      tobConfirm('Reemplazar datos actuales?', 'Se sobrescriben clientes y plantillas con el contenido del archivo. Esto NO se puede deshacer.', () => {
        tobDB = d;
        tobSave();
        tobRenderClientes();
        tobRenderPlantillas();
        tobToast('✓ Importado', 'green');
      });
    } catch(e){ tobToast('Error parseando JSON', 'red'); }
  };
  reader.readAsText(f);
}

// ════════════════════════════════════════════════════════════════════
// CONFIRM modal genérico
// ════════════════════════════════════════════════════════════════════
function tobConfirm(title, msg, cb){
  document.getElementById('tobConfirmTitle').textContent = title;
  document.getElementById('tobConfirmMsg').textContent = msg;
  const ok = document.getElementById('tobConfirmOk');
  ok.textContent = 'Aceptar';
  ok.classList.add('danger');
  ok.onclick = function(){ tobCloseConfirm(); cb(); };
  document.getElementById('tobConfirmBg').classList.add('on');
}
function tobCloseConfirm(){ document.getElementById('tobConfirmBg').classList.remove('on'); }

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════
function tobEsc(s){ return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]); }

// ════════════════════════════════════════════════════════════════════
// SEED PLANTILLAS — 16 mesociclos BIIO (8 categorías x 2 sexos)
// Estructura simplificada. Cada plantilla usa 4 microciclos típicos.
// ════════════════════════════════════════════════════════════════════
function tobBuildSeedPlantillas(){
  // Microciclos comunes (la mayoría de mesociclos BIIO usan 3-4 + descarga)
  const mc4 = [
    {id:'m1', nombre:'1º microciclo'},
    {id:'m2', nombre:'2º microciclo'},
    {id:'m3', nombre:'3º microciclo'},
    {id:'m4', nombre:'Descarga'}
  ];
  const mc5 = [
    {id:'m1', nombre:'1º microciclo'},
    {id:'m2', nombre:'2º microciclo'},
    {id:'m3', nombre:'3º microciclo'},
    {id:'m4', nombre:'4º microciclo'},
    {id:'m5', nombre:'Descarga'}
  ];
  const ent3 = [
    {id:'A', letra:'A', nombre:'Entreno A'},
    {id:'B', letra:'B', nombre:'Entreno B'},
    {id:'C', letra:'C', nombre:'Entreno C'}
  ];
  // Helper para construir ejercicios con plan común a todos los microciclos
  function ej(entrenoId, nombre, series, reps, pausa, micros, pct){
    const planMicro = {};
    micros.forEach(mc => {
      planMicro[mc.id] = { series, reps, pct: pct||null, active: true };
    });
    return { id: tobUid('ej'), entrenoId, orden: 0, nombre, planMicro, pausa: pausa||'', notas: '' };
  }
  // Genera plantilla H/M para una categoría con ejercicios distintos
  function pl(nombre, categoria, sexo, micros, entrenos, ejercicios){
    return { id: tobUid('pl'), nombre, categoria, sexo, microciclos: micros, entrenos, ejercicios };
  }

  const out = [];

  // ═══ 1. REACONDICIONAMIENTO (1º meso Spanish Full Body) ═══
  // Hombre y Mujer — mismos ejercicios (no había variante GIRL en el original)
  ['H','M'].forEach(sx => {
    const ejs = [];
    let i = 0;
    [
      ['A', 'Prensa 45º', 2, '20', "60''"],
      ['A', 'Press Banca o Flexiones', 2, '15', "60''"],
      ['A', 'Hiperextensión o Quadra Bench', 2, '20', "60''"],
      ['A', 'Jalones agarre ancho', 2, '15', "60''"],
      ['A', 'Crunch inverso o Calf machine', 2, '20', "60''"],
      ['B', 'Sentadilla Goblet', 2, '20', "60''"],
      ['B', 'Press hombro mancuernas', 2, '15', "60''"],
      ['B', 'Peso muerto rumano', 2, '20', "60''"],
      ['B', 'Remo mancuerna', 2, '15', "60''"],
      ['B', 'Plancha abdominal', 2, '30s', "60''"],
      ['C', 'Zancadas', 2, '20', "60''"],
      ['C', 'Fondos pecho/triceps', 2, '15', "60''"],
      ['C', 'Hip thrust', 2, '20', "60''"],
      ['C', 'Curl bíceps barra', 2, '15', "60''"],
      ['C', 'Crunch + Calf', 2, '20', "60''"]
    ].forEach(row => { const [e,n,s,r,p] = row; const x = ej(e,n,s,r,p,mc4); x.orden = i++; ejs.push(x); });
    out.push(pl(`Reacondicionamiento — ${sx==='H'?'Hombre':'Mujer'}`, 'Reacondicionamiento', sx, mc4, ent3, ejs));
  });

  // ═══ 2. PREPARACIÓN FUERZA (2º meso Neurological Carryover) ═══
  ['H','M'].forEach(sx => {
    const ejs = [];
    let i = 0;
    [
      ['A', 'Box Squat (NCT)', 3, '5', "2'00\"", 65],
      ['A', 'Press Banca (NCT)', 3, '5', "2'00\"", 65],
      ['A', 'Peso Muerto (NCT)', 3, '5', "2'00\"", 60],
      ['A', 'Onda Waterbury — Dominadas/Press Militar', 8, '3', "1'00\"", 70],
      ['A', 'Abdomen o gemelos', 3, '12', "1'00\""],
      ['B', 'Sentadilla Frontal', 3, '5', "2'00\"", 65],
      ['B', 'Press Banca cerrado', 3, '5', "2'00\"", 65],
      ['B', 'Remo Pendlay', 3, '5', "2'00\"", 65],
      ['B', 'Onda Waterbury — Press Militar/Dominadas', 8, '3', "1'00\"", 70],
      ['B', 'Plancha lateral', 3, '30s', "1'00\""],
      ['C', 'Peso muerto sumo', 3, '5', "2'00\"", 60],
      ['C', 'Press inclinado', 3, '5', "2'00\"", 65],
      ['C', 'Remo barra', 3, '5', "2'00\"", 65],
      ['C', 'Onda Waterbury — Curl/Tríceps', 8, '3', "1'00\"", 70],
      ['C', 'Abdomen rueda', 3, '10', "1'00\""]
    ].forEach(row => { const [e,n,s,r,p,pct] = row; const x = ej(e,n,s,r,p,mc5,pct); x.orden = i++; ejs.push(x); });
    out.push(pl(`Preparación fuerza — ${sx==='H'?'Hombre':'Mujer'}`, 'Preparación fuerza', sx, mc5, ent3, ejs));
  });

  // ═══ 3. ESPECIALIZACIÓN TÉCNICA (3º meso NC Dinosaur) ═══
  ['H','M'].forEach(sx => {
    const ejs = [];
    let i = 0;
    [
      ['A', 'Sentadilla pausa 3s', 4, '4', "2'30\"", 70],
      ['A', 'Press banca pausa 2s', 4, '4', "2'30\"", 70],
      ['A', 'Dominadas lastradas', 4, '5', "2'00\""],
      ['A', 'Press militar estricto', 3, '5', "2'00\"", 70],
      ['A', 'Curl bíceps barra', 3, '8', "1'30\""],
      ['B', 'Peso muerto déficit', 4, '4', "2'30\"", 70],
      ['B', 'Press inclinado mancuerna', 4, '5', "2'00\""],
      ['B', 'Remo Yates', 4, '6', "2'00\""],
      ['B', 'Hip thrust pesado', 3, '6', "2'00\""],
      ['B', 'Extensión tríceps polea', 3, '10', "1'30\""],
      ['C', 'Sentadilla frontal pausa', 4, '4', "2'30\"", 70],
      ['C', 'Press banca cierre 2s', 4, '5', "2'00\"", 70],
      ['C', 'Remo Pendlay', 4, '5', "2'00\""],
      ['C', 'Encogimientos', 3, '10', "1'30\""],
      ['C', 'Plancha 60s', 3, '60s', "1'00\""]
    ].forEach(row => { const [e,n,s,r,p,pct] = row; const x = ej(e,n,s,r,p,mc5,pct); x.orden = i++; ejs.push(x); });
    out.push(pl(`Especialización técnica — ${sx==='H'?'Hombre':'Mujer'}`, 'Especialización técnica', sx, mc5, ent3, ejs));
  });

  // ═══ 4. FUERZA 1 (4º meso Isometronic) ═══
  ['H','M'].forEach(sx => {
    const ejs = [];
    let i = 0;
    [
      ['A', 'Sentadilla isométrica 6s', 5, '3', "3'00\"", 80],
      ['A', 'Press banca isométrico', 5, '3', "3'00\"", 80],
      ['A', 'Peso muerto top hold', 4, '3', "3'00\"", 80],
      ['A', 'Dominadas isométricas', 4, '5', "2'00\""],
      ['B', 'Sentadilla frontal isométrica', 5, '3', "3'00\"", 80],
      ['B', 'Press cerrado isométrico', 5, '3', "3'00\"", 80],
      ['B', 'Remo barra hold', 4, '4', "2'30\""],
      ['B', 'Press militar isométrico', 4, '4', "2'30\"", 75],
      ['C', 'Zancada búlgara isométrica', 4, '6', "2'30\""],
      ['C', 'Press inclinado pausa', 4, '5', "2'30\"", 75],
      ['C', 'Peso muerto rumano isom.', 4, '5', "2'30\"", 75],
      ['C', 'Curl + extensión tríceps', 4, '8-8', "1'30\""]
    ].forEach(row => { const [e,n,s,r,p,pct] = row; const x = ej(e,n,s,r,p,mc5,pct); x.orden = i++; ejs.push(x); });
    out.push(pl(`Fuerza 1 — ${sx==='H'?'Hombre':'Mujer'}`, 'Fuerza 1', sx, mc5, ent3, ejs));
  });

  // ═══ 5. FUERZA 2 (5º meso Método 20/20) ═══
  ['H','M'].forEach(sx => {
    const ejs = [];
    let i = 0;
    [
      ['A', 'Sentadilla 20 reps', 1, '20', "3'00\"", 60],
      ['A', 'Pull-over post-squat', 1, '20', "1'00\""],
      ['A', 'Press banca', 5, '5', "2'30\"", 80],
      ['A', 'Remo barra', 5, '5', "2'30\"", 80],
      ['A', 'Curl bíceps + tríceps', 4, '10', "1'30\""],
      ['B', 'Peso muerto', 5, '5', "3'00\"", 80],
      ['B', 'Press hombro', 5, '5', "2'30\"", 75],
      ['B', 'Dominadas lastradas', 5, '5', "2'30\""],
      ['B', 'Gemelos pie', 5, '15', "1'30\""],
      ['C', 'Sentadilla frontal', 5, '5', "2'30\"", 75],
      ['C', 'Press inclinado mancuerna', 4, '8', "2'00\""],
      ['C', 'Jalón al pecho', 4, '8', "2'00\""],
      ['C', 'Curl bíceps barra Z', 4, '10', "1'30\""]
    ].forEach(row => { const [e,n,s,r,p,pct] = row; const x = ej(e,n,s,r,p,mc4,pct); x.orden = i++; ejs.push(x); });
    out.push(pl(`Fuerza 2 — ${sx==='H'?'Hombre':'Mujer'}`, 'Fuerza 2', sx, mc4, ent3, ejs));
  });

  // ═══ 6. HÍBRIDO (7º meso Hybrid Extended Clusters) ═══
  ['H','M'].forEach(sx => {
    const ejs = [];
    let i = 0;
    [
      ['A', 'Sentadilla cluster 3+3+3', 4, '9', "3'00\"", 75],
      ['A', 'Press banca cluster', 4, '9', "3'00\"", 75],
      ['A', 'Remo Pendlay', 4, '6', "2'00\""],
      ['A', 'Curl bíceps + tríceps', 3, '12', "1'30\""],
      ['B', 'Peso muerto cluster', 4, '9', "3'00\"", 75],
      ['B', 'Press inclinado', 4, '8', "2'00\""],
      ['B', 'Dominadas lastradas', 4, '6', "2'00\""],
      ['B', 'Press hombro mancuernas', 4, '10', "1'30\""],
      ['C', 'Zancadas búlgaras', 4, '10', "2'00\""],
      ['C', 'Fondos lastrados', 4, '8', "2'00\""],
      ['C', 'Remo mancuerna', 4, '10', "1'30\""],
      ['C', 'Calf machine + abdomen', 4, '15', "1'00\""]
    ].forEach(row => { const [e,n,s,r,p,pct] = row; const x = ej(e,n,s,r,p,mc4,pct); x.orden = i++; ejs.push(x); });
    out.push(pl(`Hibrido — ${sx==='H'?'Hombre':'Mujer'}`, 'Hibrido', sx, mc4, ent3, ejs));
  });

  // ═══ 7. HIPERTROFIA (10º meso Método Holístico Distribuido) ═══
  ['H','M'].forEach(sx => {
    const ejs = [];
    let i = 0;
    [
      ['A', 'Press banca', 4, '8-10', "1'30\""],
      ['A', 'Press inclinado mancuerna', 4, '10', "1'30\""],
      ['A', 'Aperturas pecho polea', 3, '12-15', "1'00\""],
      ['A', 'Fondos paralelas', 3, '10', "1'30\""],
      ['A', 'Press francés', 4, '10', "1'00\""],
      ['B', 'Sentadilla', 4, '8-10', "2'00\""],
      ['B', 'Prensa', 4, '12', "1'30\""],
      ['B', 'Extensión cuádriceps', 4, '15', "1'00\""],
      ['B', 'Curl femoral', 4, '12', "1'00\""],
      ['B', 'Gemelos de pie', 5, '15', "1'00\""],
      ['C', 'Dominadas', 4, '8-10', "2'00\""],
      ['C', 'Remo Yates', 4, '10', "1'30\""],
      ['C', 'Jalón polea', 4, '12', "1'00\""],
      ['C', 'Curl bíceps barra', 4, '10', "1'00\""],
      ['C', 'Curl martillo', 3, '12', "1'00\""]
    ].forEach(row => { const [e,n,s,r,p] = row; const x = ej(e,n,s,r,p,mc4); x.orden = i++; ejs.push(x); });
    out.push(pl(`Hipertrofia — ${sx==='H'?'Hombre':'Mujer'}`, 'Hipertrofia', sx, mc4, ent3, ejs));
  });

  // ═══ 8. CALIDAD MUSCULAR (11º meso Daily Undulating Power & Pump) ═══
  ['H','M'].forEach(sx => {
    const ejs = [];
    let i = 0;
    [
      ['A', 'Press banca PUMP', 4, '12-15', "1'00\""],
      ['A', 'Aperturas polea', 4, '15', "45\""],
      ['A', 'Press inclinado smith', 4, '12', "1'00\""],
      ['A', 'Tríceps polea cuerda', 4, '15', "45\""],
      ['A', 'Tríceps barra Z', 4, '12', "1'00\""],
      ['B', 'Sentadilla PUMP', 4, '15-20', "1'30\""],
      ['B', 'Extensión cuádriceps drop', 4, '15', "45\""],
      ['B', 'Hip thrust', 4, '12-15', "1'00\""],
      ['B', 'Curl femoral', 4, '15', "45\""],
      ['B', 'Calf burnout', 5, '20', "30\""],
      ['C', 'Jalón polea ancho', 4, '12-15', "1'00\""],
      ['C', 'Remo gironda', 4, '15', "45\""],
      ['C', 'Pull-over polea', 4, '15', "45\""],
      ['C', 'Curl bíceps polea', 4, '15', "45\""],
      ['C', 'Curl concentrado', 4, '12', "45\""]
    ].forEach(row => { const [e,n,s,r,p] = row; const x = ej(e,n,s,r,p,mc4); x.orden = i++; ejs.push(x); });
    out.push(pl(`Calidad muscular — ${sx==='H'?'Hombre':'Mujer'}`, 'Calidad muscular', sx, mc4, ent3, ejs));
  });

  return out;
}

// Auto-init
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', tobLoad);
} else {
  tobLoad();
}
