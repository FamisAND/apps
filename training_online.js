/**
 * training_online.js — BIIO System (formato Full Training, 6 microciclos)
 *
 * Modelo de datos en localStorage 'tob_online_v2':
 *
 *   { clientes: [...], plantillas: [...] }
 *
 * plantilla = {
 *   id, nombre, categoria, sexo: 'H'|'M'|'U',
 *   entrenos: [
 *     { id:'A', letra:'A', ejercicios: [
 *         { id, orden, nombre, subtitle,
 *           tipo: 'normal' | 'circuito',
 *           // Para 'circuito':
 *           circuitoLineas: ['EJ1','EJ2','EJ3'],
 *           // Plan común a todos los microciclos. Si distinto por micro, plan[microNum] override:
 *           planBase: { series:3, repsTarget:[15,12,10], pausa:"1'30''" },
 *           planByMicro: { 1:{...}, 2:{...}, ... 6:{...} }  // opcional, override
 *         }
 *     ]}, { id:'B', ... }
 *   ]
 * }
 *
 * asignacion = {
 *   id, plantillaId, fechaInicio, estado, notas,
 *   rutina: <copia editable>,
 *   iteraciones: [
 *     { id, numero:1,
 *       sesiones: {
 *         <microNum>: { <entrenoId>: {
 *             fecha, aerobica: { tipo, tiempo, intensidad },
 *             ejs: { <ejId>: { series:[{kg,reps}], lineas:[{kg,reps}] }}
 *         }}
 *       }
 *     }
 *   ]
 * }
 *
 * Microciclos siempre numerados 1..6 (formato Full Training).
 */

const TOB_KEY = 'tob_online_v2';
const TOB_NUM_MICRO = 6;
const TOB_IT_COLORS = ['#f5a623','#e0e0e0','#60a5fa','#3fb68b','#dc2626','#a78bfa','#fb923c','#22d3ee'];

let tobDB = { clientes: [], plantillas: [] };
let tobCurrentAsig = null;     // {clienteId, asigId}
let tobCurrentItId = null;
let tobCurrentEntrenoId = null;
let tobCharts = {};             // {ejId: Chart instance}

function tobUid(prefix){ return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }
function tobEsc(s){ return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]); }

function tobLoad(){
  try {
    const raw = localStorage.getItem(TOB_KEY);
    if(raw){
      tobDB = JSON.parse(raw);
      if(!tobDB.clientes) tobDB.clientes = [];
      if(!tobDB.plantillas) tobDB.plantillas = [];
    }
  } catch(e){ console.warn('tobLoad:', e); }

  // Backfill: si plantillas no tienen macrociclo, asignar "1º Powerbuilding"
  let backfilled = false;
  tobDB.plantillas.forEach(p => {
    if(!p.macrociclo){ p.macrociclo = '1º Powerbuilding'; backfilled = true; }
  });
  if(backfilled) tobSave(true);

  // Migrar de v1 si existía (estructura distinta)
  try {
    const v1 = localStorage.getItem('tob_online_v1');
    if(v1 && !tobDB.plantillas.length){
      // No migramos automáticamente — solo limpiamos
      localStorage.removeItem('tob_online_v1');
    }
  } catch(e){}

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
  if(!silent && typeof GitHubSync !== 'undefined' && GitHubSync.markDirty){ GitHubSync.markDirty(); }
  tobBadge('💾 guardado');
}

function tobBadge(text){
  const el = document.getElementById('tobSaveBadge'); if(!el) return;
  el.textContent = text;
  clearTimeout(tobBadge._t);
  tobBadge._t = setTimeout(() => el.textContent = '', 2000);
}

function tobToast(msg, type){
  const t = document.getElementById('tobToast'); if(!t) return;
  t.textContent = msg;
  t.className = 'tob-toast show ' + (type || '');
  clearTimeout(tobToast._t);
  tobToast._t = setTimeout(() => t.className = 'tob-toast', 2500);
}

// ═══ NAVEGACIÓN ═══
function tobShowTab(name, btn){
  document.querySelectorAll('.tob-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tob-' + name).classList.add('active');
  if(btn) btn.classList.add('active');
  else document.querySelectorAll('.tob-tab').forEach(t => {
    if(t.getAttribute('onclick')?.includes(`'${name}'`)) t.classList.add('active');
  });
}

// ═══ HELPERS PLAN ═══
function tobPlanFor(ej, microNum){
  if(ej.planByMicro && ej.planByMicro[microNum]) return ej.planByMicro[microNum];
  return ej.planBase || { series:3, repsTarget:[10], pausa:'' };
}
function tobPlanLabel(plan){
  const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
  return `${plan.series}×${reps}`;
}

// ═══ CLIENTES ═══
function tobRenderClientes(){
  const tbody = document.getElementById('tobClientesBody');
  const empty = document.getElementById('tobClientesEmpty');
  if(!tobDB.clientes.length){ tbody.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = tobDB.clientes.map(c => {
    const last = (c.asignaciones||[]).slice(-1)[0];
    const lastInfo = last
      ? tobPlantillaName(last.plantillaId) + ` <span class="tob-badge ${last.estado}">${last.estado}</span>`
      : '<span style="color:var(--mute2)">—</span>';
    const sexoCls = c.sexo==='M'?'m':c.sexo==='H'?'h':'u';
    const sexoTxt = c.sexo==='M'?'♀':c.sexo==='H'?'♂':'U';
    return `<tr>
      <td><strong>${tobEsc(c.nombre)}</strong></td>
      <td><span style="color:var(--mute);font-family:DM Mono,monospace;font-size:.78rem;">${tobEsc(c.contacto||'—')}</span></td>
      <td><span class="tob-badge ${sexoCls}">${sexoTxt}</span></td>
      <td class="num">${(c.asignaciones||[]).length}</td>
      <td>${lastInfo}</td>
      <td class="actions">
        <button class="tob-action ghost" style="padding:5px 10px;" onclick="tobAbrirCliente('${c.id}')">📂 Abrir</button>
        <button class="tob-action ghost" style="padding:5px 10px;" onclick="tobEditCliente('${c.id}')">✏️</button>
        <button class="tob-action danger" style="padding:5px 10px;" onclick="tobDelCliente('${c.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function tobPlantillaName(plantId){
  const p = tobDB.plantillas.find(p => p.id === plantId);
  if(!p) return '(plantilla eliminada)';
  const mc = p.macrociclo ? `<span style="font-size:.65rem;color:var(--mute);font-family:DM Mono,monospace;">[${tobEsc(p.macrociclo)}]</span> ` : '';
  return mc + tobEsc(p.nombre);
}

function tobOpenClienteModal(cli){
  document.getElementById('tobClienteModalTitle').textContent = cli ? 'Editar cliente' : 'Nuevo cliente';
  document.getElementById('tobCliNombre').value = cli?.nombre || '';
  document.getElementById('tobCliSexo').value = cli?.sexo || 'H';
  document.getElementById('tobCliContacto').value = cli?.contacto || '';
  document.getElementById('tobCliAlta').value = cli?.alta || new Date().toISOString().slice(0,10);
  const sel = document.getElementById('tobCliPlantilla');
  sel.innerHTML = '<option value="">— Ninguna —</option>' +
    tobDB.plantillas.map(p => `<option value="${p.id}">${tobEsc(p.nombre)}</option>`).join('');
  sel.value = '';
  document.getElementById('tobClienteModalBg').dataset.editId = cli?.id || '';
  document.getElementById('tobClienteModalBg').classList.add('on');
}
function tobCloseClienteModal(){ document.getElementById('tobClienteModalBg').classList.remove('on'); }

function tobSaveCliente(){
  const nombre = document.getElementById('tobCliNombre').value.trim();
  if(!nombre){ tobToast('Falta el nombre', 'red'); return; }
  const cli = {
    nombre,
    sexo: document.getElementById('tobCliSexo').value,
    contacto: document.getElementById('tobCliContacto').value.trim(),
    alta: document.getElementById('tobCliAlta').value
  };
  const editId = document.getElementById('tobClienteModalBg').dataset.editId;
  if(editId){
    const c = tobDB.clientes.find(c => c.id === editId);
    if(c) Object.assign(c, cli);
  } else {
    cli.id = tobUid('cli');
    cli.asignaciones = [];
    const plantId = document.getElementById('tobCliPlantilla').value;
    if(plantId){ const a = tobCreateAsignacion(plantId); if(a) cli.asignaciones.push(a); }
    tobDB.clientes.push(cli);
  }
  tobSave();
  tobCloseClienteModal();
  tobRenderClientes();
  tobToast('✓ Cliente guardado', 'green');
}

function tobEditCliente(id){
  const c = tobDB.clientes.find(c => c.id === id);
  if(c) tobOpenClienteModal(c);
}
function tobDelCliente(id){
  const c = tobDB.clientes.find(c => c.id === id);
  if(!c) return;
  tobConfirm(`Eliminar a ${c.nombre}?`, 'Se borran todas sus rutinas e iteraciones. No se puede deshacer.', () => {
    tobDB.clientes = tobDB.clientes.filter(x => x.id !== id);
    tobSave();
    tobRenderClientes();
    tobToast('Eliminado', 'green');
  });
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
    rutina: JSON.parse(JSON.stringify({ entrenos: pl.entrenos })),
    iteraciones: [
      { id: tobUid('it'), numero: 1, sesiones: {} }
    ]
  };
}

function tobAbrirCliente(cliId){
  // Ahora abre la FICHA del cliente (timeline + KPIs + charts globales)
  tobOpenFicha(cliId);
}

function tobBackToFicha(){
  if(tobCurrentAsig){
    const cliId = tobCurrentAsig.clienteId;
    tobCloseAsignacion();
    tobOpenFicha(cliId);
  } else {
    tobCloseAsignacion();
  }
}

function tobOpenAsignarModal(cli){
  // Agrupar asignaciones existentes por macrociclo
  const byMacro = {};
  (cli.asignaciones||[]).forEach(a => {
    const p = tobDB.plantillas.find(p => p.id === a.plantillaId);
    const mc = p?.macrociclo || '(Sin macrociclo)';
    if(!byMacro[mc]) byMacro[mc] = [];
    byMacro[mc].push({ a, p });
  });
  const existing = Object.entries(byMacro).map(([mc, items]) => {
    return `<div style="margin-bottom:10px;">
      <div style="font-family:DM Mono,monospace;font-size:.7rem;color:var(--acc);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">${tobEsc(mc)}</div>
      ${items.map(({a, p}) => `<button class="tob-action ghost" style="margin:2px 0;text-align:left;width:100%;display:block;" onclick="tobCloseConfirm();tobOpenAsignacion('${cli.id}','${a.id}')">
        <strong>${p ? tobEsc(p.nombre) : '(plantilla eliminada)'}</strong>
        <span style="color:var(--mute);font-size:.72rem;float:right;">${a.estado} · ${a.fechaInicio||''}</span>
      </button>`).join('')}
    </div>`;
  }).join('');

  // Plantillas para nueva, agrupadas por macrociclo en un optgroup
  const macroGroups = {};
  tobDB.plantillas.forEach(p => {
    const mc = p.macrociclo || '(Sin macrociclo)';
    if(!macroGroups[mc]) macroGroups[mc] = [];
    macroGroups[mc].push(p);
  });
  const newOptions = Object.entries(macroGroups).sort().map(([mc, list]) =>
    `<optgroup label="${tobEsc(mc)}">` +
    list.map(p => `<option value="${p.id}">${tobEsc(p.nombre)}</option>`).join('') +
    `</optgroup>`
  ).join('');
  document.getElementById('tobConfirmTitle').textContent = tobEsc(cli.nombre);
  document.getElementById('tobConfirmMsg').innerHTML = `
    ${existing ? '<div style="margin-bottom:14px;"><div class="tob-lbl">Rutinas existentes:</div>' + existing + '</div>' : ''}
    <div class="tob-lbl">Crear nueva rutina con plantilla:</div>
    <select class="tob-select" id="tobAsigNewPlant">${newOptions}</select>
  `;
  const ok = document.getElementById('tobConfirmOk');
  ok.textContent = '+ Crear rutina';
  ok.classList.remove('danger');
  ok.onclick = function(){
    const plId = document.getElementById('tobAsigNewPlant').value;
    const a = tobCreateAsignacion(plId);
    if(!a){ tobToast('Plantilla no encontrada', 'red'); return; }
    cli.asignaciones.push(a);
    tobSave();
    tobCloseConfirm();
    tobOpenAsignacion(cli.id, a.id);
    tobToast('✓ Rutina creada', 'green');
  };
  document.getElementById('tobConfirmBg').classList.add('on');
}

// ═══ PLANTILLAS ═══
function tobRenderPlantillas(){
  const cont = document.getElementById('tobPlantillasGroups');
  const empty = document.getElementById('tobPlantillasEmpty');
  if(!tobDB.plantillas.length){ cont.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';

  // Agrupar por macrociclo
  const groups = {};
  tobDB.plantillas.forEach(p => {
    const mc = p.macrociclo || '(Sin macrociclo)';
    if(!groups[mc]) groups[mc] = [];
    groups[mc].push(p);
  });

  // Ordenar macrociclos por nombre, plantillas dentro por categoría+sexo
  const sortedMacros = Object.keys(groups).sort();

  cont.innerHTML = sortedMacros.map(mc => {
    const list = groups[mc].sort((a,b) => {
      const c = (a.categoria||'').localeCompare(b.categoria||'');
      if(c) return c;
      return (a.sexo==='H'?0:a.sexo==='M'?1:2) - (b.sexo==='H'?0:b.sexo==='M'?1:2);
    });
    return `<div class="tob-mc-group">
      <div class="tob-mc-hdr" onclick="this.parentElement.classList.toggle('collapsed')">
        <span class="caret">▾</span>
        <span class="name">${tobEsc(mc)}</span>
        <span class="count">${list.length} plantilla${list.length===1?'':'s'}</span>
      </div>
      <table class="tob-table">
        <thead><tr>
          <th>Nombre</th><th>Categoría</th><th>Sexo</th>
          <th class="num">Entrenos</th><th class="num">Ej.</th><th></th>
        </tr></thead>
        <tbody>
          ${list.map(p => {
            const sexoBadge = `<span class="tob-badge ${p.sexo==='M'?'m':p.sexo==='H'?'h':'u'}">${p.sexo==='M'?'♀':p.sexo==='H'?'♂':'U'}</span>`;
            const nEj = (p.entrenos||[]).reduce((s,e) => s + (e.ejercicios||[]).length, 0);
            return `<tr>
              <td><strong>${tobEsc(p.nombre)}</strong></td>
              <td><span style="color:var(--mute);font-size:.78rem;">${tobEsc(p.categoria||'—')}</span></td>
              <td>${sexoBadge}</td>
              <td class="num">${(p.entrenos||[]).length}</td>
              <td class="num">${nEj}</td>
              <td class="actions">
                <button class="tob-action ghost" style="padding:4px 9px;" onclick="tobEditarPlantilla('${p.id}')">✏️</button>
                <button class="tob-action danger" style="padding:4px 9px;" onclick="tobDelPlantilla('${p.id}')">🗑</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }).join('');
}

function tobOpenPlantillaModal(pl){
  document.getElementById('tobPlantillaModalTitle').textContent = pl ? 'Editar plantilla' : 'Nueva plantilla';
  document.getElementById('tobPlMacrociclo').value = pl?.macrociclo || '1º Powerbuilding';
  document.getElementById('tobPlNombre').value = pl?.nombre || '';
  document.getElementById('tobPlCategoria').value = pl?.categoria || 'Reacondicionamiento';
  document.getElementById('tobPlSexo').value = pl?.sexo || 'H';
  document.getElementById('tobPlDef').value = pl ? tobPlantillaToText(pl) : '';
  document.getElementById('tobPlantillaModalBg').dataset.editId = pl?.id || '';
  document.getElementById('tobPlantillaModalBg').classList.add('on');
}
function tobClosePlantillaModal(){ document.getElementById('tobPlantillaModalBg').classList.remove('on'); }

function tobPlantillaToText(pl){
  const lines = [];
  (pl.entrenos||[]).forEach(en => {
    (en.ejercicios||[]).forEach(ej => {
      const plan = ej.planBase || tobPlanFor(ej, 1);
      const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
      let line = `${en.letra} | ${ej.nombre} | ${ej.tipo||'normal'} | ${ej.subtitle||''} | ${plan.series} | ${reps} | ${plan.pausa||''}`;
      if(ej.tipo === 'circuito' && Array.isArray(ej.circuitoLineas)) line += ` | ${ej.circuitoLineas.join(';')}`;
      lines.push(line);
    });
  });
  return lines.join('\n');
}

function tobParsePlantillaDef(text){
  const entrenosMap = {};
  text.split('\n').forEach(raw => {
    const l = raw.trim();
    if(!l || l.startsWith('#')) return;
    const parts = l.split('|').map(s => s.trim());
    if(parts.length < 6) return;
    const [letra, nombre, tipo, subtitle, seriesStr, repsStr, pausa, circLineas] = parts;
    if(!entrenosMap[letra]){
      entrenosMap[letra] = { id: letra, letra, nombre: 'Entreno ' + letra, ejercicios: [] };
    }
    const series = parseInt(seriesStr) || 3;
    const repsTarget = String(repsStr||'').split('/').map(x => x.trim()).filter(Boolean);
    const ej = {
      id: tobUid('ej'),
      orden: entrenosMap[letra].ejercicios.length,
      nombre,
      subtitle: subtitle || '',
      tipo: tipo === 'circuito' ? 'circuito' : 'normal',
      planBase: { series, repsTarget, pausa: pausa || '' }
    };
    if(ej.tipo === 'circuito' && circLineas){
      ej.circuitoLineas = circLineas.split(';').map(x => x.trim()).filter(Boolean);
    }
    entrenosMap[letra].ejercicios.push(ej);
  });
  return Object.values(entrenosMap);
}

function tobSavePlantilla(){
  const nombre = document.getElementById('tobPlNombre').value.trim();
  if(!nombre){ tobToast('Falta el nombre', 'red'); return; }
  const macrociclo = document.getElementById('tobPlMacrociclo').value.trim() || '(Sin macrociclo)';
  const categoria = document.getElementById('tobPlCategoria').value;
  const sexo = document.getElementById('tobPlSexo').value;
  const entrenos = tobParsePlantillaDef(document.getElementById('tobPlDef').value);
  if(!entrenos.length){ tobToast('Define al menos un ejercicio', 'red'); return; }
  const editId = document.getElementById('tobPlantillaModalBg').dataset.editId;
  if(editId){
    const p = tobDB.plantillas.find(p => p.id === editId);
    if(p) Object.assign(p, { macrociclo, nombre, categoria, sexo, entrenos });
  } else {
    tobDB.plantillas.push({ id: tobUid('pl'), macrociclo, nombre, categoria, sexo, entrenos });
  }
  tobSave();
  tobClosePlantillaModal();
  tobRenderPlantillas();
  tobToast('✓ Guardado', 'green');
}

function tobEditarPlantilla(id){
  const p = tobDB.plantillas.find(p => p.id === id);
  if(p) tobOpenPlantillaModal(p);
}
function tobDelPlantilla(id){
  const p = tobDB.plantillas.find(p => p.id === id);
  if(!p) return;
  tobConfirm(`Eliminar plantilla "${p.nombre}"?`, 'Las asignaciones existentes mantienen su copia. Solo se quita del catálogo.', () => {
    tobDB.plantillas = tobDB.plantillas.filter(x => x.id !== id);
    tobSave();
    tobRenderPlantillas();
    tobToast('Eliminada', 'green');
  });
}

// ═══ ASIGNACIÓN (rutina del cliente) ═══
function tobAsig(){
  if(!tobCurrentAsig) return null;
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  return cli?.asignaciones.find(a => a.id === tobCurrentAsig.asigId);
}

function tobOpenAsignacion(cliId, asigId){
  tobCurrentAsig = { clienteId: cliId, asigId };
  const cli = tobDB.clientes.find(c => c.id === cliId);
  const asig = cli?.asignaciones.find(a => a.id === asigId);
  if(!cli || !asig){ tobToast('No encontrado', 'red'); return; }
  const pl = tobDB.plantillas.find(p => p.id === asig.plantillaId);

  // Garantizar estructura
  if(!asig.iteraciones || !asig.iteraciones.length){
    asig.iteraciones = [{ id: tobUid('it'), numero: 1, sesiones: {} }];
  }
  tobCurrentItId = asig.iteraciones[asig.iteraciones.length-1].id;
  tobCurrentEntrenoId = asig.rutina?.entrenos?.[0]?.id || 'A';

  document.getElementById('tobTabAsig').style.display = '';
  tobShowTab('asignacion');
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tobTabAsig').classList.add('active');

  document.getElementById('tobAsigTitulo').textContent = `${cli.nombre} — ${pl?.nombre || '(plantilla eliminada)'}`;
  document.getElementById('tobAsigSubtitulo').textContent = (pl?.categoria || '') + (pl?.sexo === 'M' ? ' · ♀' : pl?.sexo === 'H' ? ' · ♂' : '');

  document.getElementById('tobAsigEstado').value = asig.estado;
  document.getElementById('tobAsigNotas').value = asig.notas || '';

  tobRenderItTabs();
  tobRenderEntTabs();
  tobRenderEntreno();
  tobRenderCharts();
}

function tobCloseAsignacion(){
  tobCurrentAsig = null;
  // Destruir charts para liberar memoria
  Object.values(tobCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  tobCharts = {};
  document.getElementById('tobTabAsig').style.display = 'none';
  tobShowTab('clientes');
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(".tob-tab[onclick*='clientes']")?.classList.add('active');
}

function tobAsigUpdateEstado(v){ const a=tobAsig(); if(a){a.estado=v;tobSave();tobRenderClientes();} }
function tobAsigUpdateNotas(v){ const a=tobAsig(); if(a){a.notas=v;tobSave();} }

function tobDeleteAsignacion(){
  if(!tobCurrentAsig) return;
  tobConfirm('¿Eliminar esta rutina?', 'Se borra TODO el progreso de TODAS las iteraciones.', () => {
    const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
    if(cli){
      cli.asignaciones = cli.asignaciones.filter(a => a.id !== tobCurrentAsig.asigId);
      tobSave();
      tobCloseAsignacion();
      tobRenderClientes();
      tobToast('Rutina eliminada', 'green');
    }
  });
}

function tobRenderItTabs(){
  const a = tobAsig(); if(!a) return;
  const cont = document.getElementById('tobItTabs');
  cont.innerHTML = a.iteraciones.map((it, i) => {
    const color = TOB_IT_COLORS[i % TOB_IT_COLORS.length];
    const active = it.id === tobCurrentItId ? 'active' : '';
    const borderStyle = it.id === tobCurrentItId ? `style="border-color:${color};color:${color};"` : '';
    return `<button class="tob-it-tab ${active}" ${borderStyle} onclick="tobSetIt('${it.id}')">
      <span class="dot" style="background:${color}"></span> Iteración ${it.numero}
    </button>`;
  }).join('') + `
    <button class="tob-action ghost" style="padding:5px 12px;font-size:.75rem;" onclick="tobAddIteracion()">+ Nueva iteración</button>
    ${a.iteraciones.length > 1 ? `<button class="tob-action danger" style="padding:5px 12px;font-size:.75rem;" onclick="tobDelIteracion()">🗑 Esta iteración</button>` : ''}
  `;
}

function tobSetIt(id){ tobCurrentItId = id; tobRenderItTabs(); tobRenderEntreno(); tobRenderCharts(); }

function tobAddIteracion(){
  const a = tobAsig(); if(!a) return;
  const num = Math.max(...a.iteraciones.map(i => i.numero)) + 1;
  const it = { id: tobUid('it'), numero: num, sesiones: {} };
  a.iteraciones.push(it);
  tobCurrentItId = it.id;
  tobSave();
  tobRenderItTabs(); tobRenderEntreno(); tobRenderCharts();
  tobToast(`✓ Iteración ${num} creada`, 'green');
}

function tobDelIteracion(){
  const a = tobAsig(); if(!a || a.iteraciones.length < 2) return;
  const it = a.iteraciones.find(i => i.id === tobCurrentItId);
  tobConfirm(`Eliminar iteración ${it.numero}?`, 'Se borran todos los kg/reps de esta iteración.', () => {
    a.iteraciones = a.iteraciones.filter(i => i.id !== tobCurrentItId);
    // Renumerar
    a.iteraciones.forEach((x,i) => x.numero = i+1);
    tobCurrentItId = a.iteraciones[a.iteraciones.length-1].id;
    tobSave();
    tobRenderItTabs(); tobRenderEntreno(); tobRenderCharts();
  });
}

function tobIt(){ const a=tobAsig(); return a?.iteraciones.find(i => i.id === tobCurrentItId); }

function tobRenderEntTabs(){
  const a = tobAsig(); if(!a) return;
  const cont = document.getElementById('tobEntTabs');
  cont.innerHTML = (a.rutina?.entrenos||[]).map(en =>
    `<button class="tob-ent-tab ${tobCurrentEntrenoId===en.id?'active':''}" onclick="tobSetEntreno('${en.id}')">
      Entreno ${en.letra}
    </button>`
  ).join('');
}

function tobSetEntreno(id){ tobCurrentEntrenoId = id; tobRenderEntTabs(); tobRenderEntreno(); }

function tobGetSesion(microNum, entId){
  const it = tobIt(); if(!it) return null;
  if(!it.sesiones[microNum]) it.sesiones[microNum] = {};
  if(!it.sesiones[microNum][entId]){
    it.sesiones[microNum][entId] = { fecha:'', aerobica:{tipo:'',tiempo:'',intensidad:''}, ejs:{} };
  }
  return it.sesiones[microNum][entId];
}

function tobRenderEntreno(){
  const a = tobAsig(); if(!a) return;
  const en = a.rutina?.entrenos.find(e => e.id === tobCurrentEntrenoId);
  if(!en){ document.getElementById('tobEntContent').innerHTML = '<div class="tob-card">Selecciona un entreno</div>'; return; }

  const it = tobIt();
  const microHeaders = Array.from({length:TOB_NUM_MICRO}, (_,i) => i+1);
  const micros = microHeaders.map(n => `${n}º`);

  const ejercicios = (en.ejercicios||[]).sort((x,y) => (x.orden||0)-(y.orden||0));

  // Fila de fechas en cabecera de la sección
  const fechasRow = microHeaders.map(mn => {
    const s = it ? (it.sesiones[mn]?.[en.id]) : null;
    return `<td class="micro-col"><input class="fecha" type="date" value="${s?.fecha||''}"
      onchange="tobSetFecha(${mn},'${en.id}',this.value)"></td>`;
  }).join('');

  let html = `<div class="tob-card">
    <table class="tob-ej-grid">
      <thead><tr>
        <th class="row-lbl" style="width:170px;">Fecha</th>
        ${microHeaders.map(n => `<th class="micro-col">µ${n}</th>`).join('')}
      </tr></thead>
      <tbody>
        <tr class="fecha-row"><td class="row-lbl">Fecha sesión</td>${fechasRow}</tr>
      </tbody>
    </table>
  </div>`;

  ejercicios.forEach(ej => {
    html += tobRenderEjBlock(ej, en, microHeaders, it);
  });

  // Aeróbica
  html += `<div class="tob-card">
    <div class="tob-card-title">Eventual actividad aeróbica</div>
    <table class="tob-ej-grid">
      <tbody>
        ${['tipo','tiempo','intensidad'].map(field => {
          const lblMap = {tipo:'Tipo',tiempo:'Tiempo',intensidad:'Intensidad'};
          return `<tr><td class="row-lbl" style="width:170px;">${lblMap[field]}</td>${microHeaders.map(mn => {
            const s = it ? (it.sesiones[mn]?.[en.id]) : null;
            const v = s?.aerobica?.[field] || '';
            return `<td class="micro-col"><input class="cell" style="width:90%;" value="${tobEsc(v)}" onchange="tobSetAerobica(${mn},'${en.id}','${field}',this.value)"></td>`;
          }).join('')}</tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;

  document.getElementById('tobEntContent').innerHTML = html;
}

function tobRenderEjBlock(ej, en, microHeaders, it){
  // Plan por microciclo (fila plan)
  const planRow = microHeaders.map(mn => {
    const plan = tobPlanFor(ej, mn);
    return `<td class="micro-col">${tobEsc(tobPlanLabel(plan))}</td>`;
  }).join('');

  // Reps target por microciclo (filas — una por cada repsTarget index)
  // Estilo Full Training: muestra 3 valores apilados de reps target (15/12/10 → 15, 12, 10 en celdas separadas?
  // Mejor: ponerlos en una sola celda como "15 / 12 / 10" en plan row. Ya está.

  const seriesN = Math.max(...microHeaders.map(mn => tobPlanFor(ej, mn).series || 3));
  const rows = [];

  // Filas de series (kg + rep por columna)
  for(let s = 0; s < seriesN; s++){
    const cells = microHeaders.map(mn => {
      const plan = tobPlanFor(ej, mn);
      if(s >= plan.series) return `<td class="micro-col" style="color:var(--mute2)">—</td>`;
      const ses = it ? (it.sesiones[mn]?.[en.id]) : null;
      const sr = ses?.ejs?.[ej.id]?.series?.[s] || { kg:null, reps:null };
      const repsTarget = Array.isArray(plan.repsTarget) ? (plan.repsTarget[s] || plan.repsTarget[0]) : plan.repsTarget;
      return `<td class="micro-col">
        <span class="tob-kgrp">
          <input class="cell" type="number" step="0.5" placeholder="kg" value="${sr.kg==null?'':sr.kg}"
            onchange="tobSetSerieKg('${ej.id}','${en.id}',${mn},${s},this.value)">
          <input class="cell" type="number" placeholder="${repsTarget||'rep'}" value="${sr.reps==null?'':sr.reps}"
            onchange="tobSetSerieReps('${ej.id}','${en.id}',${mn},${s},this.value)">
        </span>
      </td>`;
    }).join('');
    rows.push(`<tr><td class="row-lbl">${s+1}ª Serie</td>${cells}</tr>`);
  }

  // Para circuito, las "series" son en realidad "ejercicios alternados"
  let bodyRows;
  if(ej.tipo === 'circuito' && Array.isArray(ej.circuitoLineas) && ej.circuitoLineas.length){
    // Una fila por ejercicio del circuito
    bodyRows = ej.circuitoLineas.map((lineaName, i) => {
      const cells = microHeaders.map(mn => {
        const ses = it ? (it.sesiones[mn]?.[en.id]) : null;
        const sr = ses?.ejs?.[ej.id]?.lineas?.[i] || { kg:null, reps:null };
        return `<td class="micro-col">
          <span class="tob-kgrp">
            <input class="cell" type="number" step="0.5" placeholder="kg" value="${sr.kg==null?'':sr.kg}"
              onchange="tobSetLineaKg('${ej.id}','${en.id}',${mn},${i},this.value)">
            <input class="cell" type="number" placeholder="rep" value="${sr.reps==null?'':sr.reps}"
              onchange="tobSetLineaReps('${ej.id}','${en.id}',${mn},${i},this.value)">
          </span>
        </td>`;
      }).join('');
      return `<tr><td class="row-lbl">${tobEsc(lineaName)}</td>${cells}</tr>`;
    }).join('');
  } else {
    bodyRows = rows.join('');
  }

  // Plan label row con detalles de reps target
  const planDetail = microHeaders.map(mn => {
    const plan = tobPlanFor(ej, mn);
    const repsArr = Array.isArray(plan.repsTarget) ? plan.repsTarget : [plan.repsTarget];
    return `<td class="micro-col">${plan.series}×${tobEsc(repsArr.join('/'))}</td>`;
  }).join('');

  // Pausa row
  const pausaRow = microHeaders.map(mn => {
    const plan = tobPlanFor(ej, mn);
    return `<td class="micro-col">${tobEsc(plan.pausa||'—')}</td>`;
  }).join('');

  const subTitle = ej.subtitle ? `<span class="tob-ej-sub">${tobEsc(ej.subtitle)}</span>` : '';
  const tipoLabel = ej.tipo === 'circuito' ? '<span class="tob-ej-sub" style="color:var(--acc2);">· circuito ·</span>' : '';

  return `<div class="tob-ej-block">
    <div class="tob-ej-head">
      <span class="tob-ej-name">${tobEsc(ej.nombre)}</span>
      ${tipoLabel}
      ${subTitle}
    </div>
    <table class="tob-ej-grid">
      <thead><tr>
        <th class="row-lbl" style="width:170px;">SERIES × REPS</th>
        ${arrayHeaders()}
      </tr></thead>
      <tbody>
        <tr class="plan-row"><td class="row-lbl">Plan</td>${planDetail}</tr>
        ${bodyRows}
        <tr class="pausa-row"><td class="row-lbl">Pausa series</td>${pausaRow}</tr>
      </tbody>
    </table>
  </div>`;
  function arrayHeaders(){
    return microHeaders.map(n => `<th class="micro-col">µ${n}</th>`).join('');
  }
}

function tobSetFecha(microNum, entId, val){
  const s = tobGetSesion(microNum, entId); if(s){ s.fecha = val; tobSave(); tobRenderCharts(); }
}
function tobSetAerobica(microNum, entId, field, val){
  const s = tobGetSesion(microNum, entId); if(s){ s.aerobica[field] = val; tobSave(); }
}
function tobSetSerieKg(ejId, entId, microNum, idx, val){ tobSetEjVal(ejId, entId, microNum, idx, 'kg', val, 'series'); }
function tobSetSerieReps(ejId, entId, microNum, idx, val){ tobSetEjVal(ejId, entId, microNum, idx, 'reps', val, 'series'); }
function tobSetLineaKg(ejId, entId, microNum, idx, val){ tobSetEjVal(ejId, entId, microNum, idx, 'kg', val, 'lineas'); }
function tobSetLineaReps(ejId, entId, microNum, idx, val){ tobSetEjVal(ejId, entId, microNum, idx, 'reps', val, 'lineas'); }
function tobSetEjVal(ejId, entId, microNum, idx, field, val, arrName){
  const s = tobGetSesion(microNum, entId); if(!s) return;
  if(!s.ejs[ejId]) s.ejs[ejId] = {};
  if(!s.ejs[ejId][arrName]) s.ejs[ejId][arrName] = [];
  while(s.ejs[ejId][arrName].length <= idx) s.ejs[ejId][arrName].push({kg:null,reps:null});
  const v = val === '' ? null : parseFloat(val);
  s.ejs[ejId][arrName][idx][field] = isNaN(v) ? null : v;
  tobSave();
  tobRenderCharts();
}

// ═══ CHARTS ═══
function tobRenderCharts(){
  const a = tobAsig(); if(!a) return;
  const grid = document.getElementById('tobChartsGrid');
  // Destruir charts previos
  Object.values(tobCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  tobCharts = {};

  // Recolectar TODOS los ejercicios principales (tipo normal) de TODOS los entrenos
  const mainEjs = [];
  (a.rutina?.entrenos||[]).forEach(en => {
    (en.ejercicios||[]).forEach(ej => {
      if(ej.tipo !== 'circuito') mainEjs.push({ej, entId: en.id});
    });
  });

  if(!mainEjs.length){
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--mute2);padding:30px;">Aún no hay ejercicios principales con datos.</div>';
    return;
  }

  grid.innerHTML = mainEjs.map(({ej}) =>
    `<div class="tob-chart-card">
      <div class="hdr">${tobEsc(ej.nombre)}</div>
      <div class="body"><canvas id="tobChart_${ej.id}"></canvas></div>
    </div>`
  ).join('');

  // Plot — una línea por iteración
  if(window.ChartDataLabels && Chart.register){
    try { Chart.register(ChartDataLabels); } catch(e){}
  }

  mainEjs.forEach(({ej, entId}) => {
    const canvas = document.getElementById('tobChart_' + ej.id);
    if(!canvas) return;
    const datasets = [];
    a.iteraciones.forEach((it, idx) => {
      const color = TOB_IT_COLORS[idx % TOB_IT_COLORS.length];
      const points = [];
      const labels = [];
      for(let mn = 1; mn <= TOB_NUM_MICRO; mn++){
        const ses = it.sesiones[mn]?.[entId];
        if(!ses) continue;
        const series = ses.ejs?.[ej.id]?.series;
        if(!series || !series.length) continue;
        const volume = series.reduce((sum, sr) => sum + (sr.kg||0) * (sr.reps||0), 0);
        if(volume <= 0) continue;
        points.push(volume);
        labels.push(ses.fecha || `µ${mn}`);
      }
      if(!points.length) return;
      datasets.push({
        label: 'It. ' + it.numero,
        data: points,
        _labels: labels,
        borderColor: color,
        backgroundColor: color + '22',
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointStyle: 'crossRot',
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.05,
        fill: false,
        borderWidth: 2
      });
    });

    // Combinar todas las labels en una secuencia única (ordenadas por fecha si posible)
    const allLabels = new Set();
    datasets.forEach(ds => ds._labels.forEach(l => allLabels.add(l)));
    let labels = [...allLabels];
    // Si parecen fechas YYYY-MM-DD, ordenar como fechas; si no, dejar como están
    if(labels.every(l => /^\d{4}-\d{2}-\d{2}/.test(l))){
      labels.sort();
      labels = labels.map(l => l.split('-').reverse().join('/'));
    }

    // Re-alinear cada dataset a esos labels (con null para huecos)
    datasets.forEach(ds => {
      const map = {};
      ds._labels.forEach((l, i) => {
        const key = /^\d{4}-\d{2}-\d{2}/.test(l) ? l.split('-').reverse().join('/') : l;
        map[key] = ds.data[i];
      });
      ds.data = labels.map(l => map[l] != null ? map[l] : null);
      delete ds._labels;
      ds.spanGaps = true;
    });

    if(!datasets.length){
      canvas.getContext('2d').fillStyle = '#5a5240';
      canvas.getContext('2d').font = '12px DM Mono';
      canvas.getContext('2d').textAlign = 'center';
      canvas.getContext('2d').fillText('Sin datos aún', canvas.width/2, canvas.height/2);
      return;
    }

    tobCharts[ej.id] = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color:'#cbd5e1', font:{size:10}, boxWidth:12 }, position:'top', align:'end' },
          tooltip: { mode:'index', intersect:false },
          datalabels: {
            color: ctx => ctx.dataset.borderColor,
            font: { size: 9, weight:'600' },
            align: 'top',
            offset: 4,
            formatter: v => v == null ? '' : v
          }
        },
        scales: {
          x: { ticks:{ color:'#7a96b8', font:{size:9}, maxRotation:60, minRotation:45 },
               grid:{ color:'#1e1810' } },
          y: { ticks:{ color:'#7a96b8', font:{size:9} },
               grid:{ color:'#1e1810' }, beginAtZero:true }
        },
        interaction: { mode:'nearest', intersect:false }
      }
    });
  });
}

// ═══ PDF (igual que antes, simplificado) ═══
async function tobGeneratePdf(){
  const a = tobAsig(); if(!a){ tobToast('Sin rutina abierta', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  const it = tobIt();
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();

  const W = 842, H = 595; // landscape
  let page = doc.addPage([W,H]);
  let y = H - 30;
  const MX = 24;

  function text(t, opts){
    page.drawText(t, { x: opts?.x||MX, y, size: opts?.size||9, font: opts?.bold?fontB:font, color: opts?.color||rgb(0.1,0.1,0.1) });
  }
  function gap(n){ y -= n; if(y < 60){ page = doc.addPage([W,H]); y = H - 30; } }

  text(`${cli?.nombre||''} — ${pl?.nombre||''}  ·  Iteración ${it?.numero||1}`, { bold:true, size:13 });
  gap(20);

  const microHeaders = Array.from({length:TOB_NUM_MICRO}, (_,i)=>i+1);

  (a.rutina?.entrenos||[]).forEach(en => {
    if(y < 200){ page = doc.addPage([W,H]); y = H - 30; }
    text(`ENTRENO ${en.letra}`, { bold:true, size:11, color: rgb(0.96,0.65,0.13) });
    gap(15);

    // Fila fechas
    text('Fecha:', { size: 8 });
    microHeaders.forEach((mn, i) => {
      const x = MX + 80 + i*120;
      const tf = form.createTextField(`fecha_${mn}_${en.id}`);
      const ses = it?.sesiones[mn]?.[en.id];
      if(ses?.fecha) tf.setText(ses.fecha);
      tf.addToPage(page, { x, y: y-3, width: 100, height: 12, borderColor: rgb(0.6,0.6,0.6), borderWidth: 0.5 });
    });
    gap(20);

    (en.ejercicios||[]).sort((a,b)=>(a.orden||0)-(b.orden||0)).forEach(ej => {
      if(y < 100){ page = doc.addPage([W,H]); y = H - 30; }
      text(ej.nombre + (ej.subtitle ? ' — ' + ej.subtitle : ''), { bold:true, size:9 });
      gap(13);
      // Plan
      text('Plan:', { size: 7, color: rgb(0.4,0.4,0.4) });
      microHeaders.forEach((mn, i) => {
        const x = MX + 80 + i*120;
        const plan = tobPlanFor(ej, mn);
        const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
        page.drawText(`${plan.series}×${reps}`, { x, y, size: 8, font, color: rgb(0.4,0.4,0.4) });
      });
      gap(12);

      const isCirc = ej.tipo === 'circuito';
      const linesN = isCirc ? (ej.circuitoLineas?.length || 3) : Math.max(...microHeaders.map(mn => tobPlanFor(ej, mn).series));
      const arrName = isCirc ? 'lineas' : 'series';

      for(let s=0; s<linesN; s++){
        if(y < 30){ page = doc.addPage([W,H]); y = H - 30; }
        const lbl = isCirc ? (ej.circuitoLineas?.[s] || `${s+1}º Ej.`) : `${s+1}ª Serie`;
        page.drawText(lbl, { x: MX, y, size: 8, font, color: rgb(0.3,0.3,0.3) });
        microHeaders.forEach((mn, i) => {
          const x = MX + 80 + i*120;
          const ses = it?.sesiones[mn]?.[en.id];
          const sr = ses?.ejs?.[ej.id]?.[arrName]?.[s];
          const kgF = form.createTextField(`ej_${ej.id}_${mn}_${en.id}_${arrName}_${s}_kg`);
          const rpF = form.createTextField(`ej_${ej.id}_${mn}_${en.id}_${arrName}_${s}_reps`);
          if(sr?.kg != null) kgF.setText(String(sr.kg));
          if(sr?.reps != null) rpF.setText(String(sr.reps));
          kgF.addToPage(page, { x, y: y-3, width: 48, height: 11, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
          rpF.addToPage(page, { x: x+50, y: y-3, width: 48, height: 11, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
        });
        gap(14);
      }
      gap(6);
    });

    // Aeróbica
    ['tipo','tiempo','intensidad'].forEach(field => {
      if(y < 30){ page = doc.addPage([W,H]); y = H - 30; }
      const lblMap = {tipo:'Aeróbica tipo',tiempo:'  tiempo',intensidad:'  intensidad'};
      text(lblMap[field], { size:7, color: rgb(0.4,0.4,0.4) });
      microHeaders.forEach((mn, i) => {
        const x = MX + 80 + i*120;
        const tf = form.createTextField(`aer_${mn}_${en.id}_${field}`);
        const ses = it?.sesiones[mn]?.[en.id];
        if(ses?.aerobica?.[field]) tf.setText(ses.aerobica[field]);
        tf.addToPage(page, { x, y: y-3, width: 100, height: 11, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
      });
      gap(13);
    });
    gap(20);
  });

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a2 = document.createElement('a');
  a2.href = url;
  a2.download = `${(cli?.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_${(pl?.nombre||'rutina').replace(/[^a-zA-Z0-9]/g,'_')}_it${it?.numero}.pdf`;
  a2.click();
  URL.revokeObjectURL(url);
  tobToast('✓ PDF descargado', 'green');
}

function tobHandlePdfDrop(ev){ const f=ev.dataTransfer.files[0]; if(f) tobReadPdfFile(f); }
function tobHandlePdfFile(ev){ const f=ev.target.files[0]; if(f) tobReadPdfFile(f); }

async function tobReadPdfFile(file){
  const a = tobAsig(); if(!a){ tobToast('Abre una rutina antes', 'red'); return; }
  const it = tobIt(); if(!it){ tobToast('Sin iteración activa', 'red'); return; }
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
      if(!val) return;

      // fecha_<microNum>_<entId>
      let parts = name.match(/^fecha_(\d+)_(\w+)$/);
      if(parts){
        const [, microNum, entId] = parts;
        const s = tobGetSesionIt(it, parseInt(microNum), entId);
        s.fecha = val; m++; return;
      }
      // aer_<microNum>_<entId>_<field>
      parts = name.match(/^aer_(\d+)_(\w+)_(\w+)$/);
      if(parts){
        const [, microNum, entId, field] = parts;
        const s = tobGetSesionIt(it, parseInt(microNum), entId);
        s.aerobica[field] = val; m++; return;
      }
      // ej_<ejId>_<microNum>_<entId>_<series|lineas>_<idx>_<kg|reps>
      parts = name.match(/^ej_(.+?)_(\d+)_(\w+?)_(series|lineas)_(\d+)_(kg|reps)$/);
      if(parts){
        const [, ejId, microNum, entId, arrName, idx, field] = parts;
        const s = tobGetSesionIt(it, parseInt(microNum), entId);
        if(!s.ejs[ejId]) s.ejs[ejId] = {};
        if(!s.ejs[ejId][arrName]) s.ejs[ejId][arrName] = [];
        const i = parseInt(idx);
        while(s.ejs[ejId][arrName].length <= i) s.ejs[ejId][arrName].push({kg:null,reps:null});
        const v = parseFloat(val);
        if(!isNaN(v)) s.ejs[ejId][arrName][i][field] = v;
        n++;
      }
    });
    tobSave();
    status.innerHTML = `<span style="color:var(--green);">✓ ${n} valores + ${m} metadatos importados de "${tobEsc(file.name)}"</span>`;
    tobRenderEntreno();
    tobRenderCharts();
    tobToast(`✓ ${n} valores importados`, 'green');
  } catch(e){
    console.error(e);
    status.innerHTML = `<span style="color:var(--red);">✕ Error: ${tobEsc(e.message)}</span>`;
    tobToast('Error', 'red');
  }
}

function tobGetSesionIt(it, microNum, entId){
  if(!it.sesiones[microNum]) it.sesiones[microNum] = {};
  if(!it.sesiones[microNum][entId]){
    it.sesiones[microNum][entId] = { fecha:'', aerobica:{tipo:'',tiempo:'',intensidad:''}, ejs:{} };
  }
  return it.sesiones[microNum][entId];
}

// ═══ EDITAR rutina (la copia editable del cliente) ═══
function tobOpenEditPlantilla(){
  const a = tobAsig(); if(!a) return;
  // Hacemos modal de edición usando el mismo modal de plantilla pero con identificador especial
  // que indica que es rutina del cliente, no plantilla maestra
  const fakeP = { nombre: 'Rutina (editable solo para este cliente)', categoria: '—', sexo: '—', entrenos: a.rutina.entrenos };
  document.getElementById('tobPlantillaModalTitle').textContent = 'Editar ejercicios de esta rutina';
  document.getElementById('tobPlNombre').value = fakeP.nombre;
  document.getElementById('tobPlNombre').disabled = true;
  document.getElementById('tobPlCategoria').disabled = true;
  document.getElementById('tobPlSexo').disabled = true;
  document.getElementById('tobPlDef').value = tobPlantillaToText(fakeP);
  document.getElementById('tobPlantillaModalBg').dataset.editId = '__asig__';
  document.getElementById('tobPlantillaModalBg').classList.add('on');
}

// Hook tobSavePlantilla para detectar el caso __asig__
const _origSavePl = tobSavePlantilla;
tobSavePlantilla = function(){
  const editId = document.getElementById('tobPlantillaModalBg').dataset.editId;
  if(editId === '__asig__'){
    const a = tobAsig(); if(!a){ tobClosePlantillaModal(); return; }
    const entrenos = tobParsePlantillaDef(document.getElementById('tobPlDef').value);
    if(!entrenos.length){ tobToast('Sin ejercicios', 'red'); return; }
    a.rutina.entrenos = entrenos;
    // Re-asegurar entreno actual válido
    if(!entrenos.find(e => e.id === tobCurrentEntrenoId)) tobCurrentEntrenoId = entrenos[0].id;
    document.getElementById('tobPlNombre').disabled = false;
    document.getElementById('tobPlCategoria').disabled = false;
    document.getElementById('tobPlSexo').disabled = false;
    tobSave();
    tobClosePlantillaModal();
    tobRenderEntTabs(); tobRenderEntreno(); tobRenderCharts();
    tobToast('✓ Rutina actualizada', 'green');
    return;
  }
  _origSavePl();
};

const _origClosePl = tobClosePlantillaModal;
tobClosePlantillaModal = function(){
  document.getElementById('tobPlNombre').disabled = false;
  document.getElementById('tobPlCategoria').disabled = false;
  document.getElementById('tobPlSexo').disabled = false;
  _origClosePl();
};

// ═══ EXPORT/IMPORT ═══
function tobExport(){
  const blob = new Blob([JSON.stringify(tobDB, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `training_online_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  tobToast('✓ Exportado', 'green');
}

function tobImport(ev){
  const f = ev.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = function(){
    try {
      const d = JSON.parse(r.result);
      if(!d.clientes || !d.plantillas){ tobToast('JSON inválido', 'red'); return; }
      tobConfirm('Reemplazar datos?', 'Sobrescribe todo. No se puede deshacer.', () => {
        tobDB = d; tobSave();
        tobRenderClientes(); tobRenderPlantillas();
        tobToast('✓ Importado', 'green');
      });
    } catch(e){ tobToast('Error parseando', 'red'); }
  };
  r.readAsText(f);
}

// ═══ CONFIRM ═══
function tobConfirm(title, msg, cb){
  document.getElementById('tobConfirmTitle').textContent = title;
  document.getElementById('tobConfirmMsg').textContent = msg;
  const ok = document.getElementById('tobConfirmOk');
  ok.textContent = 'Aceptar'; ok.classList.add('danger');
  ok.onclick = function(){ tobCloseConfirm(); cb(); };
  document.getElementById('tobConfirmBg').classList.add('on');
}
function tobCloseConfirm(){ document.getElementById('tobConfirmBg').classList.remove('on'); }

// ═══ SEED PLANTILLAS — 16 mesociclos con estructura BIIO real ═══
function tobBuildSeedPlantillas(){
  // Helper para construir un ejercicio normal con plan distinto por microciclo
  function ej(nombre, subtitle, planByMicro){
    return {
      id: tobUid('ej'),
      nombre, subtitle: subtitle||'',
      tipo: 'normal',
      planByMicro
    };
  }
  function ejBase(nombre, subtitle, planBase){
    return { id: tobUid('ej'), nombre, subtitle: subtitle||'', tipo: 'normal', planBase };
  }
  function ejCirc(nombre, subtitle, lineas, planBase){
    return { id: tobUid('ej'), nombre, subtitle: subtitle||'', tipo: 'circuito', circuitoLineas: lineas, planBase };
  }
  // Plan típico Full Training Reacondicionamiento: 3x15/12/10 → 3x12/10/8 → 3x10/8/6 (en pares)
  const planRea = {
    1: { series:3, repsTarget:[15,12,10], pausa:"1'30''" },
    2: { series:3, repsTarget:[15,12,10], pausa:"1'30''" },
    3: { series:3, repsTarget:[12,10,8],  pausa:"1'45''" },
    4: { series:3, repsTarget:[12,10,8],  pausa:"1'45''" },
    5: { series:3, repsTarget:[10,8,6],   pausa:"2'00''" },
    6: { series:3, repsTarget:[10,8,6],   pausa:"2'00''" }
  };
  const planCircRea = {
    1: { series:2, repsTarget:[12], pausa:'30"' },
    2: { series:3, repsTarget:[12], pausa:'30"' },
    3: { series:3, repsTarget:[12], pausa:'30"' },
    4: { series:3, repsTarget:[12], pausa:'30"' },
    5: { series:3, repsTarget:[12], pausa:'30"' },
    6: { series:3, repsTarget:[12], pausa:'30"' }
  };

  function entA_rea(){
    const ejs = [
      { ...ej('BOX SQUAT', '1" Pausa en Box', planRea), orden: 0 },
      { ...ej('PRESS BANCA', '1" Pausa al Pecho', planRea), orden: 1 },
      { ...ej('REMO o SEAL ROW', 'Espalda Recta', planRea), orden: 2 },
      { ...ejCirc('CURL + HIPEREXT + CALF', 'Alternados', ['CURL con BARRA','HIPEREXTENSION','CALF MACHINE'], { series:3, repsTarget:[12], pausa:'30"' }), planByMicro: planCircRea, orden: 3 }
    ];
    // Aplicar planByMicro al circuit
    ejs[3].planByMicro = planCircRea; delete ejs[3].planBase;
    return { id:'A', letra:'A', nombre:'Entreno A', ejercicios: ejs };
  }
  function entB_rea(){
    const ejs = [
      { ...ej('PESO MUERTO', 'Espalda Neutra', planRea), orden: 0 },
      { ...ej('PRESS MILITAR', 'Hasta las Claviculas', planRea), orden: 1 },
      { ...ej('DOMINADAS o LAT MACHINE', 'Tocando el Pecho (peso + lastre)', planRea), orden: 2 },
      { ...ejCirc('PRENSA 45º + CRUNCH + FONDOS', 'Alternados', ['PRENSA 45º','CRUNCH INVERSO','FONDOS TRICEPS'], { series:3, repsTarget:[12], pausa:'30"' }), orden: 3 }
    ];
    ejs[3].planByMicro = planCircRea; delete ejs[3].planBase;
    return { id:'B', letra:'B', nombre:'Entreno B', ejercicios: ejs };
  }

  // ═══ Resto de categorías ═══
  // Cada categoría con plan distinto. Sólo Reacondicionamiento con datos exactos
  // del PDF; las demás con plan razonable. Sergio puede editar.

  // Preparación fuerza (2º meso): series altas, %RM, ondas
  const planPF = {
    1: { series:3, repsTarget:[5,5,5], pausa:"2'00''" },
    2: { series:3, repsTarget:[5,5,5], pausa:"2'00''" },
    3: { series:3, repsTarget:[5,5,5], pausa:"2'30''" },
    4: { series:3, repsTarget:[5,5,5], pausa:"2'30''" },
    5: { series:3, repsTarget:[3,3,3], pausa:"3'00''" },
    6: { series:3, repsTarget:[3,3,3], pausa:"3'00''" }
  };
  // Especialización (3º): pausas y técnica
  const planEsp = {
    1: { series:4, repsTarget:[6,6,6,6], pausa:"2'00''" },
    2: { series:4, repsTarget:[6,6,6,6], pausa:"2'00''" },
    3: { series:4, repsTarget:[5,5,5,5], pausa:"2'30''" },
    4: { series:4, repsTarget:[5,5,5,5], pausa:"2'30''" },
    5: { series:4, repsTarget:[4,4,4,4], pausa:"3'00''" },
    6: { series:4, repsTarget:[4,4,4,4], pausa:"3'00''" }
  };
  // Fuerza 1 (4º): isométrico
  const planF1 = {
    1: { series:5, repsTarget:[3,3,3,3,3], pausa:"3'00''" },
    2: { series:5, repsTarget:[3,3,3,3,3], pausa:"3'00''" },
    3: { series:5, repsTarget:[3,3,3,3,3], pausa:"3'00''" },
    4: { series:5, repsTarget:[3,3,3,3,3], pausa:"3'00''" },
    5: { series:4, repsTarget:[2,2,2,2], pausa:"3'00''" },
    6: { series:4, repsTarget:[2,2,2,2], pausa:"3'00''" }
  };
  // Fuerza 2 (5º): 20/20
  const planF2 = {
    1: { series:5, repsTarget:[5,5,5,5,5], pausa:"2'30''" },
    2: { series:5, repsTarget:[5,5,5,5,5], pausa:"2'30''" },
    3: { series:5, repsTarget:[5,5,5,5,5], pausa:"2'30''" },
    4: { series:5, repsTarget:[5,5,5,5,5], pausa:"2'30''" },
    5: { series:5, repsTarget:[5,5,5,5,5], pausa:"2'30''" },
    6: { series:5, repsTarget:[5,5,5,5,5], pausa:"2'30''" }
  };
  // Híbrido (7º): clusters
  const planHib = {
    1: { series:4, repsTarget:[9,9,9,9], pausa:"3'00''" },
    2: { series:4, repsTarget:[9,9,9,9], pausa:"3'00''" },
    3: { series:4, repsTarget:[9,9,9,9], pausa:"3'00''" },
    4: { series:4, repsTarget:[9,9,9,9], pausa:"3'00''" },
    5: { series:4, repsTarget:[6,6,6,6], pausa:"3'00''" },
    6: { series:4, repsTarget:[6,6,6,6], pausa:"3'00''" }
  };
  // Hipertrofia (10º): volumen
  const planHip = {
    1: { series:4, repsTarget:[10,10,10,10], pausa:"1'30''" },
    2: { series:4, repsTarget:[10,10,10,10], pausa:"1'30''" },
    3: { series:4, repsTarget:[8,8,8,8], pausa:"1'30''" },
    4: { series:4, repsTarget:[8,8,8,8], pausa:"1'30''" },
    5: { series:4, repsTarget:[12,12,12,12], pausa:"1'30''" },
    6: { series:4, repsTarget:[12,12,12,12], pausa:"1'30''" }
  };
  // Calidad muscular (11º): pump alto
  const planCM = {
    1: { series:4, repsTarget:[15,15,15,15], pausa:"1'00''" },
    2: { series:4, repsTarget:[15,15,15,15], pausa:"1'00''" },
    3: { series:4, repsTarget:[15,15,15,15], pausa:"1'00''" },
    4: { series:4, repsTarget:[15,15,15,15], pausa:"1'00''" },
    5: { series:4, repsTarget:[20,20,20,20], pausa:"45''" },
    6: { series:4, repsTarget:[20,20,20,20], pausa:"45''" }
  };

  function makeStandard(catName, planBase){
    const A = { id:'A', letra:'A', nombre:'Entreno A', ejercicios: [
      { id: tobUid('ej'), orden:0, nombre:'BOX SQUAT',       subtitle:'', tipo:'normal', planByMicro: planBase },
      { id: tobUid('ej'), orden:1, nombre:'PRESS BANCA',     subtitle:'', tipo:'normal', planByMicro: planBase },
      { id: tobUid('ej'), orden:2, nombre:'REMO',            subtitle:'', tipo:'normal', planByMicro: planBase },
      { id: tobUid('ej'), orden:3, nombre:'CURL + HIPEREXT + CALF', subtitle:'Alternados', tipo:'circuito',
        circuitoLineas:['CURL con BARRA','HIPEREXTENSION','CALF MACHINE'], planByMicro: planCircRea }
    ]};
    const B = { id:'B', letra:'B', nombre:'Entreno B', ejercicios: [
      { id: tobUid('ej'), orden:0, nombre:'PESO MUERTO',     subtitle:'', tipo:'normal', planByMicro: planBase },
      { id: tobUid('ej'), orden:1, nombre:'PRESS MILITAR',   subtitle:'', tipo:'normal', planByMicro: planBase },
      { id: tobUid('ej'), orden:2, nombre:'DOMINADAS',       subtitle:'', tipo:'normal', planByMicro: planBase },
      { id: tobUid('ej'), orden:3, nombre:'PRENSA + CRUNCH + FONDOS', subtitle:'Alternados', tipo:'circuito',
        circuitoLineas:['PRENSA 45º','CRUNCH INVERSO','FONDOS TRICEPS'], planByMicro: planCircRea }
    ]};
    return [A, B];
  }

  const out = [];
  const MACRO = '1º Powerbuilding';
  // 1. Reacondicionamiento (exacto del PDF)
  out.push({ id: tobUid('pl'), macrociclo: MACRO, nombre:'Reacondicionamiento — Hombre', categoria:'Reacondicionamiento', sexo:'H', entrenos:[entA_rea(), entB_rea()] });
  out.push({ id: tobUid('pl'), macrociclo: MACRO, nombre:'Reacondicionamiento — Mujer',  categoria:'Reacondicionamiento', sexo:'M', entrenos:[entA_rea(), entB_rea()] });
  // 2-8
  [
    ['Preparación fuerza',     planPF],
    ['Especialización técnica',planEsp],
    ['Fuerza 1',                planF1],
    ['Fuerza 2',                planF2],
    ['Hibrido',                 planHib],
    ['Hipertrofia',             planHip],
    ['Calidad muscular',        planCM]
  ].forEach(([cat, plan]) => {
    ['H','M'].forEach(sx => {
      out.push({ id: tobUid('pl'), macrociclo: MACRO, nombre:`${cat} — ${sx==='H'?'Hombre':'Mujer'}`, categoria: cat, sexo: sx, entrenos: makeStandard(cat, plan) });
    });
  });
  return out;
}

// ═══ DEMO: cliente Jean con datos exactos del PDF de ejemplo ═══
function tobSeedJean(){
  // Si Jean ya existe, solo completamos rutinas faltantes (resto de plantillas H sin asignar)
  const existing = tobDB.clientes.find(c => c.nombre.toLowerCase() === 'jean');
  if(existing){
    const before = existing.asignaciones.length;
    tobFakeSeedRemaining(existing);
    const added = existing.asignaciones.length - before;
    tobSave();
    tobRenderClientes();
    if(added > 0){
      tobToast(`✓ ${added} rutina${added===1?'':'s'} adicional${added===1?'':'es'} cargada${added===1?'':'s'}`, 'green');
    } else {
      tobToast('Jean ya tiene todas las rutinas H', 'red');
    }
    // Abrir la primera
    if(existing.asignaciones.length) tobOpenAsignacion(existing.id, existing.asignaciones[0].id);
    return;
  }
  const pl = tobDB.plantillas.find(p => p.nombre === 'Reacondicionamiento — Hombre');
  if(!pl){ tobToast('Falta plantilla "Reacondicionamiento — Hombre"', 'red'); return; }

  // Mapa nombre → id (estable porque tobCreateAsignacion hace deep copy preservando IDs)
  const ids = {};
  pl.entrenos.forEach(en => en.ejercicios.forEach(ej => { ids[en.letra + ':' + ej.nombre] = ej.id; }));

  const S = (kg, reps) => ({ kg, reps });

  // ── ITERACIÓN 1 (mayo-junio 2023) ──────────────────────────
  const fechaA1 = ['2023-05-19','2023-05-21','2023-05-24','2023-05-27','2023-05-31','2023-06-02'];
  const fechaB1 = ['2023-05-20','2023-05-23','2023-05-25','2023-05-28','2023-06-01','2023-06-04'];

  const boxSquat1 = [
    [S(60,15),S(80,12),S(100,10)],
    [S(80,15),S(100,12),S(110,10)],
    [S(105,12),S(110,10),S(115,8)],
    [S(110,12),S(115,10),S(120,8)],
    [S(115,10),S(120,8),S(125,6)],
    [S(120,10),S(125,8),S(130,6)]
  ];
  const pressBanca1 = [
    [S(55,15),S(60,12),S(65,10)],
    [S(60,15),S(62.5,12),S(65,10)],
    [S(62.5,12),S(65,10),S(70,8)],
    [S(65,12),S(70,10),S(72.5,8)],
    [S(70,10),S(72.5,8),S(75,6)],
    [S(70,10),S(70,10),S(70,10)]
  ];
  const remo1 = [
    [S(55,15),S(60,12),S(70,10)],
    [S(60,15),S(65,12),S(70,10)],
    [S(65,12),S(70,10),S(75,8)],
    [S(70,12),S(75,10),S(80,8)],
    [S(75,10),S(80,8),S(85,6)],
    [S(80,10),S(82.5,8),S(85,6)]
  ];
  const circA1 = [  // [Curl, Hipext, Calf]
    [S(26,12),S(15,12),S(35,12)],
    [S(31,12),S(15,12),S(40,12)],
    [S(31,12),S(20,12),S(40,12)],
    [S(32,12),S(25,12),S(45,12)],
    [S(33.5,12),S(25,12),S(50,12)],
    [S(33.5,12),S(25,12),S(50,12)]
  ];

  const pesoMuerto1 = [
    [S(100,15),S(105,12),S(107.5,8)],
    [S(95,15),S(100,12),S(105,10)],
    [S(100,12),S(102.5,10),S(105,8)],
    [S(102.5,12),S(105,10),S(110,8)],
    [S(105,10),S(110,8),S(115,6)],
    [S(108,10),S(115,8),S(120,6)]
  ];
  const pressMilitar1 = [
    [S(15,15),S(17.5,12),S(20,10)],
    [S(20,15),S(22.5,12),S(25,10)],
    [S(22.5,12),S(25,7),S(25,5)],
    [S(22.5,12),S(25,7),S(25,5)],
    [S(25,10),S(22.5,8),S(22.5,6)],
    [S(22.5,10),S(25,8),S(27.5,6)]
  ];
  const dominadas1 = [
    [S(65,15),S(70,12),S(70,10)],
    [S(70,15),S(75,10),S(75,10)],
    [S(70,12),S(75,10),S(80,8)],
    [S(75,12),S(80,10),S(80,8)],
    [S(80,10),S(80,8),S(80,6)],
    [S(80,10),S(82.5,8),S(85,6)]
  ];
  const circB1 = [  // [Prensa, Crunch, Fondos]
    [S(110,12),S(1,12),S(15,12)],
    [S(120,12),S(70,12),S(1,12)],
    [S(130,12),S(1,12),S(1,12)],
    [S(140,12),S(1,12),S(25,12)],
    [S(150,12),S(1,12),S(20,12)],
    [S(160,12),S(1,12),S(15,12)]
  ];

  // ── ITERACIÓN 2 (julio-agosto 2025) ──────────────────────
  const fechaA2 = ['2025-07-24','2025-07-28','2025-08-01','2025-08-03','2025-08-09','2025-08-11'];
  const fechaB2 = ['2025-07-25','2025-07-29','2025-08-02','2025-08-05','2025-08-09','2025-08-12'];
  const aerA2 = [10,15,15,20,30,15];   // minutos correr
  const aerB2 = [25,20,15,30,15,20];

  const boxSquat2 = [
    [S(125,15),S(130,12),S(135,10)],
    [S(130,15),S(135,12),S(140,10)],
    [S(135,12),S(140,10),S(145,8)],
    [S(140,10),S(150,8),S(160,6)],
    [S(150,10),S(160,8),S(170,6)],
    [S(160,10),S(170,8),S(180,6)]
  ];
  const pressBanca2 = [
    [S(62.5,15),S(65,10),S(70,8)],
    [S(62.5,15),S(67.5,12),S(72.5,5)],
    [S(67.5,12),S(70,10),S(75,7)],
    [S(70,12),S(72.5,10),S(77.5,7)],
    [S(70,12),S(72.5,10),S(77.5,7)],
    [S(70,12),S(72.5,10),S(77.5,7)]
  ];
  const remo2 = [
    [S(62.5,15),S(72.5,12),S(82.5,10)],
    [S(65,15),S(77.5,12),S(87.5,10)],
    [S(77.5,12),S(87.5,10),S(90,8)],
    [S(80,12),S(87.5,10),S(95,6)],
    [S(85,10),S(90,8),S(95,6)],
    [S(92.5,10),S(95,8),S(100,6)]
  ];
  const circA2 = [
    [S(30,12),S(30,12),S(75,12)],
    [S(32.5,12),S(32.5,12),S(140,12)],
    [S(32.5,12),S(37.5,12),S(140,12)],
    [S(32.5,12),S(37.5,12),S(140,12)],
    [S(32.5,12),S(37.5,12),S(160,12)],
    [S(32.5,12),S(37.5,12),S(140,12)]
  ];

  const pesoMuerto2 = [
    [S(120,15),S(125,12),S(130,10)],
    [S(125,15),S(130,12),S(135,6)],
    [S(130,12),S(135,10),S(145,8)],
    [S(135,12),S(140,10),S(145,6)],
    [S(140,10),S(150,8),S(160,6)],
    [S(145,10),S(155,8),S(165,4)]
  ];
  const pressMilitar2 = [
    [S(40,15),S(45,12),S(50,7)],
    [S(42.5,15),S(47.5,12),S(52.5,7)],
    [S(45,12),S(50,10),S(55,8)],
    [S(50,10),S(55,8),S(60,4)],
    [S(52.5,10),S(57.5,10),S(60,4)],
    [S(55,10),S(60,6),S(65,4)]
  ];
  const dominadas2 = [
    [S(5,15),S(7.5,10),S(10,6)],
    [S(5,11),S(7.5,8),S(10,4)],
    [S(7.5,10),S(10,10),S(12.5,6)],
    [S(7.5,6),S(10,10),S(15,6)],
    [S(10,10),S(12.5,8),S(15,6)],
    [S(12.5,9),S(15,8),S(20,6)]
  ];
  const circB2 = [
    [S(160,12),S(50,12),S(5,12)],
    [S(160,12),S(50,12),S(5,12)],
    [S(165,12),S(50,12),S(7.5,10)],
    [S(145,12),S(50,12),S(7.5,12)],
    [S(150,12),S(55,12),S(55,12)],
    [S(150,12),S(55,12),S(60,12)]
  ];

  // ── Construir cliente + asignación ──
  const cli = { id: tobUid('cli'), nombre: 'Jean', sexo: 'H', contacto: '', alta: '2023-05-19', asignaciones: [] };
  const asig = tobCreateAsignacion(pl.id);
  asig.fechaInicio = '2023-05-19';
  asig.notas = 'Demo cargada del PDF de ejemplo. Iteración 1 = mayo-jun 2023. Iteración 2 = jul-ago 2025.';

  function buildSesionA(it, mn, fechas, data, aerT){
    it.sesiones[mn] = it.sesiones[mn] || {};
    it.sesiones[mn]['A'] = {
      fecha: fechas[mn-1],
      aerobica: aerT ? { tipo:'Correr', tiempo:String(aerT[mn-1]), intensidad:'' } : { tipo:'', tiempo:'', intensidad:'' },
      ejs: {
        [ids['A:BOX SQUAT']]:                  { series: data.boxSquat[mn-1] },
        [ids['A:PRESS BANCA']]:                { series: data.pressBanca[mn-1] },
        [ids['A:REMO o SEAL ROW']]:            { series: data.remo[mn-1] },
        [ids['A:CURL + HIPEREXT + CALF']]:     { lineas: data.circ[mn-1] }
      }
    };
  }
  function buildSesionB(it, mn, fechas, data, aerT){
    it.sesiones[mn] = it.sesiones[mn] || {};
    it.sesiones[mn]['B'] = {
      fecha: fechas[mn-1],
      aerobica: aerT ? { tipo:'Correr', tiempo:String(aerT[mn-1]), intensidad:'' } : { tipo:'', tiempo:'', intensidad:'' },
      ejs: {
        [ids['B:PESO MUERTO']]:                  { series: data.pesoMuerto[mn-1] },
        [ids['B:PRESS MILITAR']]:                { series: data.pressMilitar[mn-1] },
        [ids['B:DOMINADAS o LAT MACHINE']]:      { series: data.dominadas[mn-1] },
        [ids['B:PRENSA 45º + CRUNCH + FONDOS']]: { lineas: data.circ[mn-1] }
      }
    };
  }

  // Iteración 1
  const it1 = asig.iteraciones[0];
  it1.numero = 1;
  const dA1 = { boxSquat: boxSquat1, pressBanca: pressBanca1, remo: remo1, circ: circA1 };
  const dB1 = { pesoMuerto: pesoMuerto1, pressMilitar: pressMilitar1, dominadas: dominadas1, circ: circB1 };
  for(let mn=1; mn<=6; mn++){
    buildSesionA(it1, mn, fechaA1, dA1);
    buildSesionB(it1, mn, fechaB1, dB1);
  }

  // Iteración 2
  const it2 = { id: tobUid('it'), numero: 2, sesiones: {} };
  asig.iteraciones.push(it2);
  const dA2 = { boxSquat: boxSquat2, pressBanca: pressBanca2, remo: remo2, circ: circA2 };
  const dB2 = { pesoMuerto: pesoMuerto2, pressMilitar: pressMilitar2, dominadas: dominadas2, circ: circB2 };
  for(let mn=1; mn<=6; mn++){
    buildSesionA(it2, mn, fechaA2, dA2, aerA2);
    buildSesionB(it2, mn, fechaB2, dB2, aerB2);
  }

  cli.asignaciones.push(asig);
  tobDB.clientes.push(cli);

  // ── Rellenar las otras 7 plantillas H con datos inventados progresivos ──
  tobFakeSeedRemaining(cli);

  tobSave();
  tobRenderClientes();
  tobToast(`✓ Jean cargado: ${cli.asignaciones.length} rutinas`, 'green');
  // Abrir directamente la Reacondicionamiento
  tobOpenAsignacion(cli.id, asig.id);
}

// Genera asignaciones con datos inventados progresivos para todas las plantillas
// del sexo del cliente que NO tenga aún. Útil para demo visual.
function tobFakeSeedRemaining(cli){
  // Base de kg por nombre de ejercicio (aproximaciones realistas Hombre intermedio-avanzado)
  const BASE = {
    'BOX SQUAT': 105, 'PRESS BANCA': 75, 'REMO': 75, 'REMO o SEAL ROW': 75,
    'PESO MUERTO': 135, 'PRESS MILITAR': 50, 'DOMINADAS': 12, 'DOMINADAS o LAT MACHINE': 12,
    'CURL + HIPEREXT + CALF': 32, 'PRENSA + CRUNCH + FONDOS': 145, 'PRENSA 45º + CRUNCH + FONDOS': 145
  };
  // Incremento por microciclo (kg)
  const DELTA = {
    'BOX SQUAT': 5, 'PRESS BANCA': 2.5, 'REMO': 2.5, 'REMO o SEAL ROW': 2.5,
    'PESO MUERTO': 5, 'PRESS MILITAR': 2.5, 'DOMINADAS': 1, 'DOMINADAS o LAT MACHINE': 1,
    'CURL + HIPEREXT + CALF': 1, 'PRENSA + CRUNCH + FONDOS': 5, 'PRENSA 45º + CRUNCH + FONDOS': 5
  };
  // Bias adicional por categoría (más kg en mesociclos de fuerza, menos en hipertrofia)
  const CAT_BOOST = {
    'Reacondicionamiento': 0,
    'Preparación fuerza': 10,
    'Especialización técnica': 15,
    'Fuerza 1': 20,
    'Fuerza 2': 25,
    'Hibrido': 15,
    'Hipertrofia': 5,
    'Calidad muscular': -5
  };

  const plantillasParaJean = tobDB.plantillas.filter(p =>
    p.sexo === cli.sexo &&
    !cli.asignaciones.find(a => a.plantillaId === p.id)
  );

  // Avanzar fechas: cada mesociclo aprox 1 mes después del último
  let cursor = new Date('2025-09-01');

  plantillasParaJean.forEach(pl => {
    const asig = tobCreateAsignacion(pl.id);
    const startStr = cursor.toISOString().slice(0,10);
    asig.fechaInicio = startStr;
    asig.notas = 'Demo con valores inventados (progresivos).';
    asig.estado = 'completada';

    const it = asig.iteraciones[0];
    it.numero = 1;

    const boost = CAT_BOOST[pl.categoria] || 0;

    // 6 microciclos × 2 entrenos. Fechas: A en lunes, B en jueves (aprox)
    for(let mn=1; mn<=6; mn++){
      pl.entrenos.forEach(en => {
        const dayOffset = (mn-1) * 7 + (en.letra === 'A' ? 0 : 2);
        const f = new Date(cursor); f.setDate(f.getDate() + dayOffset);
        const fechaStr = f.toISOString().slice(0,10);

        const ses = {
          fecha: fechaStr,
          aerobica: { tipo:'', tiempo:'', intensidad:'' },
          ejs: {}
        };

        en.ejercicios.forEach(ej => {
          const plan = tobPlanFor(ej, mn);
          // Resolver base + delta para este ejercicio (buscar nombre en map)
          let base = BASE[ej.nombre];
          let delta = DELTA[ej.nombre];
          if(base == null){
            // Heurística: si contiene PRESS, PRENSA etc, mid-range
            const u = ej.nombre.toUpperCase();
            if(u.includes('PRENSA') || u.includes('PRESS BANCA') || u.includes('SQUAT')) { base = 90; delta = 3; }
            else if(u.includes('PRESS')) { base = 50; delta = 2.5; }
            else if(u.includes('PESO MUERTO') || u.includes('DEADLIFT')) { base = 130; delta = 5; }
            else if(u.includes('CURL')) { base = 30; delta = 1; }
            else { base = 50; delta = 2; }
          }
          const baseKg = base + boost + (mn-1) * delta;

          if(ej.tipo === 'circuito'){
            const lineas = (ej.circuitoLineas||[]).map((nombreLin, li) => {
              // Variación por línea del circuito
              const offsets = [0, -5, 10];
              const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget[0] : plan.repsTarget;
              return { kg: Math.round((baseKg + (offsets[li] || 0)) * 2) / 2, reps: parseInt(reps) || 12 };
            });
            ses.ejs[ej.id] = { lineas };
          } else {
            const seriesArr = [];
            const repsTarget = Array.isArray(plan.repsTarget) ? plan.repsTarget : [plan.repsTarget];
            for(let s=0; s<plan.series; s++){
              const targetReps = repsTarget[s] != null ? repsTarget[s] : repsTarget[repsTarget.length-1];
              // Cada serie sube un poco de kg pero baja reps reales (a veces no llega al target)
              const kg = Math.round((baseKg + s * 2.5) * 2) / 2;
              const reps = Math.max(1, (parseInt(targetReps) || 8) - Math.floor(s/2));
              seriesArr.push({ kg, reps });
            }
            ses.ejs[ej.id] = { series: seriesArr };
          }
        });

        it.sesiones[mn] = it.sesiones[mn] || {};
        it.sesiones[mn][en.id] = ses;
      });
    }

    cli.asignaciones.push(asig);
    // Avanzar el cursor a 5 semanas después (para que cada mesociclo no se solape)
    cursor = new Date(cursor); cursor.setDate(cursor.getDate() + 35);
  });
}

// ═════════════════════════════════════════════════════════════════
// FICHA HISTÓRICA DEL CLIENTE
// ═════════════════════════════════════════════════════════════════
let tobCurrentFichaId = null;
let tobFichaCharts = {};

function tobOpenFicha(cliId){
  const c = tobDB.clientes.find(c => c.id === cliId);
  if(!c){ tobToast('Cliente no encontrado', 'red'); return; }
  tobCurrentFichaId = cliId;
  document.getElementById('tobTabFicha').style.display = '';
  tobShowTab('ficha');
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tobTabFicha').classList.add('active');
  tobRenderFicha();
}

function tobCloseFicha(){
  // Destruir charts
  Object.values(tobFichaCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  tobFichaCharts = {};
  tobCurrentFichaId = null;
  document.getElementById('tobTabFicha').style.display = 'none';
  tobShowTab('clientes');
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(".tob-tab[onclick*='clientes']")?.classList.add('active');
}

function tobRenderFicha(){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  document.getElementById('tobFichaNombre').textContent = cli.nombre + (cli.sexo==='M'?' ♀':cli.sexo==='H'?' ♂':'');
  const totalSes = tobCountSesiones(cli);
  document.getElementById('tobFichaMeta').textContent =
    `Cliente desde ${cli.alta || '—'}  ·  ${(cli.asignaciones||[]).length} rutinas  ·  ${totalSes} sesiones registradas` +
    (cli.contacto ? `  ·  ${cli.contacto}` : '');

  // KPIs
  const kpis = tobCalcGlobalKPIs(cli);
  document.getElementById('tobFichaKpis').innerHTML = `
    <div class="tob-kpi vol"><div class="lbl">Tonelaje total</div><div class="val">${kpis.tonelajeTotal.toLocaleString('es-ES')}<span class="unit"> kg</span></div></div>
    <div class="tob-kpi ses"><div class="lbl">Sesiones totales</div><div class="val">${totalSes}</div></div>
    <div class="tob-kpi"><div class="lbl">Rutinas completadas</div><div class="val">${kpis.completadas}<span class="unit"> / ${(cli.asignaciones||[]).length}</span></div></div>
    ${Object.entries(kpis.prByEj).slice(0,6).map(([n, kg]) =>
      `<div class="tob-kpi pr"><div class="lbl">PR ${tobEsc(n)}</div><div class="val">${kg}<span class="unit"> kg</span></div></div>`).join('')}
  `;

  // Timeline
  tobRenderTimeline(cli);

  // Charts globales
  tobRenderFichaCharts(cli);
}

function tobCountSesiones(cli){
  let n = 0;
  (cli.asignaciones||[]).forEach(a => {
    (a.iteraciones||[]).forEach(it => {
      Object.values(it.sesiones||{}).forEach(microSes => {
        Object.values(microSes).forEach(s => {
          // Contar como sesión si tiene fecha o al menos un kg/reps
          if(s.fecha) n++;
          else {
            const hasData = Object.values(s.ejs||{}).some(ej =>
              (ej.series||[]).some(sr => sr.kg!=null || sr.reps!=null) ||
              (ej.lineas||[]).some(sr => sr.kg!=null || sr.reps!=null)
            );
            if(hasData) n++;
          }
        });
      });
    });
  });
  return n;
}

// Calcula KPIs: tonelaje total, PR por ejercicio principal, asignaciones completadas
function tobCalcGlobalKPIs(cli){
  let tonelaje = 0;
  let completadas = 0;
  const prByEj = {};   // {nombreEj: max kg single set}
  (cli.asignaciones||[]).forEach(a => {
    if(a.estado === 'completada') completadas++;
    (a.iteraciones||[]).forEach(it => {
      Object.values(it.sesiones||{}).forEach(microSes => {
        Object.entries(microSes).forEach(([entId, s]) => {
          const en = a.rutina?.entrenos.find(e => e.id === entId);
          if(!en) return;
          en.ejercicios.forEach(ej => {
            if(ej.tipo === 'circuito') return; // solo principales
            const ses = s.ejs?.[ej.id];
            if(!ses?.series) return;
            ses.series.forEach(sr => {
              if(sr.kg != null && sr.reps != null){
                tonelaje += sr.kg * sr.reps;
                if(!prByEj[ej.nombre] || sr.kg > prByEj[ej.nombre]) prByEj[ej.nombre] = sr.kg;
              }
            });
          });
        });
      });
    });
  });
  // Ordenar PR por kg desc
  const sortedPr = {};
  Object.entries(prByEj).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => sortedPr[k] = v);
  return { tonelajeTotal: Math.round(tonelaje), completadas, prByEj: sortedPr };
}

function tobRenderTimeline(cli){
  const cont = document.getElementById('tobFichaTimeline');
  if(!cli.asignaciones || !cli.asignaciones.length){
    cont.innerHTML = '<div style="color:var(--mute2);padding:20px;text-align:center;">Sin rutinas asignadas. Usa el botón + Nuevo cliente y elige plantilla.</div>';
    return;
  }
  // Ordenar por fecha de inicio ascendente
  const sorted = [...cli.asignaciones].sort((a,b) => (a.fechaInicio||'').localeCompare(b.fechaInicio||''));
  cont.innerHTML = sorted.map(a => {
    const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
    const stats = tobCalcAsigStats(a);
    const fechaFin = stats.ultimaFecha || a.fechaInicio || '';
    return `<div class="tob-tl-item ${a.estado||''}" onclick="tobOpenAsignacion('${cli.id}','${a.id}')">
      <div class="tl-hdr">
        <span class="tl-fechas">${tobEsc(a.fechaInicio||'?')} → ${tobEsc(fechaFin)}</span>
        <span class="tl-name">${pl ? tobEsc(pl.nombre) : '(plantilla eliminada)'}</span>
        <span class="tob-badge ${a.estado||'en_curso'}">${a.estado||'en curso'}</span>
      </div>
      <div class="tl-meta">${pl ? tobEsc(pl.macrociclo||'') + ' · ' + tobEsc(pl.categoria||'') : ''}  ·  ${(a.iteraciones||[]).length} iteración${(a.iteraciones||[]).length===1?'':'es'}</div>
      <div class="tl-kpi">
        <span><strong>${stats.sesiones}</strong>sesiones</span>
        <span><strong>${stats.tonelaje.toLocaleString('es-ES')}</strong>kg movidos</span>
        ${Object.entries(stats.maxByEj).slice(0,3).map(([n,kg]) =>
          `<span>PR <strong>${tobEsc(n)}</strong>: ${kg}kg</span>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function tobCalcAsigStats(a){
  let tonelaje = 0, sesiones = 0;
  let ultimaFecha = '';
  const maxByEj = {};
  (a.iteraciones||[]).forEach(it => {
    Object.values(it.sesiones||{}).forEach(microSes => {
      Object.entries(microSes).forEach(([entId, s]) => {
        let hasData = false;
        const en = a.rutina?.entrenos.find(e => e.id === entId);
        if(!en) return;
        en.ejercicios.forEach(ej => {
          if(ej.tipo === 'circuito') return;
          const ses = s.ejs?.[ej.id];
          if(!ses?.series) return;
          ses.series.forEach(sr => {
            if(sr.kg != null && sr.reps != null){
              tonelaje += sr.kg * sr.reps;
              hasData = true;
              if(!maxByEj[ej.nombre] || sr.kg > maxByEj[ej.nombre]) maxByEj[ej.nombre] = sr.kg;
            }
          });
        });
        if(s.fecha || hasData) sesiones++;
        if(s.fecha && s.fecha > ultimaFecha) ultimaFecha = s.fecha;
      });
    });
  });
  // Ordenar maxByEj por kg desc
  const sorted = {};
  Object.entries(maxByEj).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>sorted[k]=v);
  return { tonelaje: Math.round(tonelaje), sesiones, ultimaFecha, maxByEj: sorted };
}

// Charts globales: una gráfica por ejercicio principal, mostrando PR a lo
// largo del tiempo a través de TODAS las rutinas (cada rutina-iteración = 1 línea)
function tobRenderFichaCharts(cli){
  const grid = document.getElementById('tobFichaCharts');
  Object.values(tobFichaCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  tobFichaCharts = {};

  // Recolectar todos los ejercicios principales únicos (por nombre)
  const ejNames = new Set();
  (cli.asignaciones||[]).forEach(a => {
    (a.rutina?.entrenos||[]).forEach(en => {
      (en.ejercicios||[]).forEach(ej => {
        if(ej.tipo !== 'circuito') ejNames.add(ej.nombre);
      });
    });
  });

  if(!ejNames.size){
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--mute2);padding:30px;">Sin datos de ejercicios principales aún.</div>';
    return;
  }

  // Para cada ejercicio: serie temporal de PR (max kg) por sesión, agrupado por rutina
  grid.innerHTML = [...ejNames].map(name => `
    <div class="tob-chart-card">
      <div class="hdr">${tobEsc(name)}</div>
      <div class="body"><canvas id="tobFichaChart_${tobSlug(name)}"></canvas></div>
    </div>
  `).join('');

  if(window.ChartDataLabels && Chart.register){ try { Chart.register(ChartDataLabels); } catch(e){} }

  [...ejNames].forEach(name => {
    const canvas = document.getElementById('tobFichaChart_' + tobSlug(name));
    if(!canvas) return;
    // Punto por sesión: x = fecha, y = max kg de la sesión
    const points = [];   // {fecha, kg, asigName}
    (cli.asignaciones||[]).forEach(a => {
      const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
      const asigLabel = pl ? pl.nombre : 'Rutina';
      (a.iteraciones||[]).forEach((it, idx) => {
        Object.values(it.sesiones||{}).forEach(microSes => {
          Object.entries(microSes).forEach(([entId, s]) => {
            const en = a.rutina?.entrenos.find(e => e.id === entId);
            const ej = en?.ejercicios.find(x => x.nombre === name);
            if(!ej || ej.tipo === 'circuito') return;
            const series = s.ejs?.[ej.id]?.series;
            if(!series || !series.length) return;
            const maxKg = Math.max(0, ...series.map(sr => sr.kg||0));
            if(maxKg <= 0) return;
            points.push({ fecha: s.fecha || '', kg: maxKg, asig: asigLabel, asigId: a.id, it: it.numero });
          });
        });
      });
    });
    if(!points.length){
      canvas.getContext('2d').fillStyle = '#5a5240';
      canvas.getContext('2d').font = '12px DM Mono';
      canvas.getContext('2d').textAlign = 'center';
      canvas.getContext('2d').fillText('Sin datos', canvas.width/2, canvas.height/2);
      return;
    }
    points.sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));

    // Agrupar por asigId+it para que cada (rutina-iteración) sea una "subserie" coloreada
    const groups = {};
    points.forEach(p => {
      const key = p.asigId + '_' + p.it;
      if(!groups[key]) groups[key] = { label: `${p.asig} (it.${p.it})`, points: [] };
      groups[key].points.push(p);
    });
    const labels = points.map(p => p.fecha ? p.fecha.split('-').reverse().join('/') : '?');
    const datasets = Object.values(groups).map((g, i) => {
      const color = TOB_IT_COLORS[i % TOB_IT_COLORS.length];
      // Alinear a labels
      const map = {};
      g.points.forEach(p => { map[p.fecha ? p.fecha.split('-').reverse().join('/') : '?'] = p.kg; });
      return {
        label: g.label,
        data: labels.map(l => map[l] != null ? map[l] : null),
        borderColor: color, backgroundColor: color+'22', pointBackgroundColor: color,
        pointRadius: 4, pointHoverRadius: 6, tension: 0.1, fill: false, spanGaps: true, borderWidth: 2
      };
    });

    tobFichaCharts[name] = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{ labels:{ color:'#cbd5e1', font:{size:9}, boxWidth:10 }, position:'top', align:'end' },
          datalabels: {
            color: ctx => ctx.dataset.borderColor,
            font: { size: 9, weight:'600' }, align:'top', offset:4,
            formatter: v => v == null ? '' : v
          }
        },
        scales:{
          x:{ ticks:{ color:'#7a96b8', font:{size:9}, maxRotation:60, minRotation:45 }, grid:{ color:'#1e1810' } },
          y:{ ticks:{ color:'#7a96b8', font:{size:9} }, grid:{ color:'#1e1810' }, beginAtZero:true }
        }
      }
    });
  });
}

function tobSlug(s){ return String(s).replace(/[^a-zA-Z0-9]/g,'_'); }

// ═════════════════════════════════════════════════════════════════
// PDF BONITO — rutina completada actual + histórico
// ═════════════════════════════════════════════════════════════════

// Render Chart.js a PNG dataURL (canvas oculto, animation off)
async function tobChartToPng(config, w, h){
  const canvas = document.createElement('canvas');
  canvas.width = w || 800; canvas.height = h || 380;
  canvas.style.position = 'fixed'; canvas.style.left = '-9999px'; canvas.style.top = '0';
  document.body.appendChild(canvas);
  const cfg = JSON.parse(JSON.stringify(config));
  if(!cfg.options) cfg.options = {};
  cfg.options.animation = false;
  cfg.options.responsive = false;
  cfg.options.maintainAspectRatio = false;
  // Forzar dpr para mejor calidad
  cfg.options.devicePixelRatio = 2;
  const chart = new Chart(canvas, cfg);
  await new Promise(r => setTimeout(r, 120));
  const png = chart.toBase64Image('image/png', 1.0);
  chart.destroy();
  canvas.remove();
  return png;
}

// Genera PDF "rutina completada" con cover + KPIs + charts + tabla
async function tobGeneratePdfActual(){
  const a = tobAsig(); if(!a){ tobToast('Sin rutina abierta', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  const it = tobIt();
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  tobToast('⏳ Generando PDF...', '');
  await tobBuildPdfRutina(cli, a, pl, it).catch(e => { console.error(e); tobToast('Error: '+e.message, 'red'); });
}

async function tobBuildPdfRutina(cli, a, pl, it){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontO = await doc.embedFont(StandardFonts.HelveticaOblique);
  const ORANGE = rgb(0.96, 0.65, 0.13);
  const BLACK = rgb(0.06, 0.06, 0.06);
  const GRAY_LT = rgb(0.94, 0.94, 0.94);
  const GRAY = rgb(0.55, 0.55, 0.55);
  const GRAY_DK = rgb(0.25, 0.25, 0.25);

  const W_L = 842, H_L = 595;  // landscape
  const W_P = 595, H_P = 842;  // portrait

  // ─── PÁGINA 1: COVER ───────────────────────────
  let page = doc.addPage([W_L, H_L]);
  // Banda lateral naranja
  page.drawRectangle({ x: 0, y: 0, width: 60, height: H_L, color: ORANGE });
  // Logo FULL TRAINING
  page.drawText('FULL', { x: 100, y: H_L - 100, size: 60, font: fontB, color: ORANGE });
  page.drawText('TRAINING', { x: 100, y: H_L - 160, size: 60, font: fontB, color: BLACK });
  page.drawText((pl?.categoria || '').toUpperCase(), { x: 100, y: H_L - 185, size: 14, font, color: GRAY });

  // Nombre cliente
  page.drawText(cli?.nombre || '—', { x: 100, y: H_L - 260, size: 36, font: fontB, color: BLACK });
  page.drawText(`${pl?.nombre || ''}`, { x: 100, y: H_L - 290, size: 16, font, color: GRAY_DK });
  page.drawText(`Iteración ${it?.numero || 1}  ·  ${a.fechaInicio || ''}`, { x: 100, y: H_L - 312, size: 11, font: fontO, color: GRAY });

  // KPIs
  const stats = tobCalcAsigStats(a);
  // En la cover, mostrar stats de ESTA iteración únicamente
  const statsIt = tobCalcItStats(a, it);
  const kpis = [
    ['SESIONES', statsIt.sesiones.toString(), ''],
    ['TONELAJE', statsIt.tonelaje.toLocaleString('es-ES'), 'kg'],
    ['EJERCICIOS', String(statsIt.ejCount), ''],
    ['MICROCICLOS', '6', '']
  ];
  const kpiW = 160, kpiH = 90, kpiGap = 14;
  const kpiStartX = 100;
  const kpiY = 160;
  kpis.forEach((kp, i) => {
    const x = kpiStartX + i * (kpiW + kpiGap);
    page.drawRectangle({ x, y: kpiY, width: kpiW, height: kpiH, color: rgb(0.97, 0.97, 0.97) });
    page.drawRectangle({ x, y: kpiY + kpiH - 4, width: kpiW, height: 4, color: ORANGE });
    page.drawText(kp[0], { x: x + 12, y: kpiY + kpiH - 26, size: 9, font: fontB, color: GRAY });
    page.drawText(kp[1], { x: x + 12, y: kpiY + 28, size: 28, font: fontB, color: BLACK });
    if(kp[2]) page.drawText(kp[2], { x: x + 12 + tobTextWidth(kp[1], 28, fontB) + 6, y: kpiY + 28, size: 11, font, color: GRAY });
  });
  // Footer cover
  page.drawText(`Generado: ${new Date().toLocaleDateString('es-ES')}`, { x: 100, y: 40, size: 9, font, color: GRAY });
  page.drawText('FULL TRAINING · BIIO System', { x: W_L - 240, y: 40, size: 9, font: fontO, color: GRAY });

  // ─── PÁGINA 2: GRÁFICAS DE PROGRESIÓN ──────────
  page = doc.addPage([W_L, H_L]);
  drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, 'EVOLUCIÓN DE FUERZA', `${cli?.nombre} — ${pl?.nombre}`, W_L, H_L);

  // Renderizar charts (uno por ejercicio principal) y embedlos
  const mainEjs = [];
  (a.rutina?.entrenos||[]).forEach(en => {
    (en.ejercicios||[]).forEach(ej => { if(ej.tipo !== 'circuito') mainEjs.push({ej, entId: en.id}); });
  });

  // Layout: 3 charts arriba (190x230), 2 charts abajo (190x230 cada uno) — tipo PDF original
  const slots = [
    { x: 80,  y: 280, w: 230, h: 180 },
    { x: 325, y: 280, w: 230, h: 180 },
    { x: 570, y: 280, w: 230, h: 180 },
    { x: 80,  y: 60,  w: 230, h: 180 },
    { x: 325, y: 60,  w: 230, h: 180 },
    { x: 570, y: 60,  w: 230, h: 180 }
  ];

  for(let i = 0; i < Math.min(mainEjs.length, 6); i++){
    const { ej, entId } = mainEjs[i];
    const cfg = tobBuildEjChartConfig(a, ej, entId);
    if(!cfg) continue;
    try {
      const png = await tobChartToPng(cfg, 600, 360);
      const img = await doc.embedPng(png);
      const slot = slots[i];
      // Cuadro de fondo
      page.drawRectangle({ x: slot.x - 4, y: slot.y - 22, width: slot.w + 8, height: slot.h + 30, borderColor: ORANGE, borderWidth: 1.5 });
      page.drawRectangle({ x: slot.x - 4, y: slot.y + slot.h + 8, width: slot.w + 8, height: 18, color: ORANGE });
      page.drawText(ej.nombre.toUpperCase(), { x: slot.x + 4, y: slot.y + slot.h + 12, size: 9, font: fontB, color: BLACK });
      page.drawImage(img, { x: slot.x, y: slot.y - 18, width: slot.w, height: slot.h + 4 });
    } catch(e){ console.warn('chart embed fail:', e); }
  }

  // ─── PÁGINAS 3+: DETALLE DE CADA ENTRENO ───────
  (a.rutina?.entrenos||[]).forEach(en => {
    page = doc.addPage([W_L, H_L]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, `ENTRENAMIENTO ${en.letra}`, pl?.categoria || '', W_L, H_L);
    let y = H_L - 90;

    // Fila de fechas
    const microHeaders = Array.from({length:TOB_NUM_MICRO}, (_,i)=>i+1);
    const colW = 105;
    const startX = 100;
    page.drawText('Fecha', { x: 30, y, size: 9, font: fontB, color: GRAY_DK });
    microHeaders.forEach((mn, i) => {
      const cellX = startX + i*colW;
      const ses = it?.sesiones[mn]?.[en.id];
      page.drawRectangle({ x: cellX, y: y-4, width: colW-4, height: 16, color: rgb(0.97,0.97,0.97) });
      page.drawText(ses?.fecha || '', { x: cellX+5, y, size: 8, font, color: BLACK });
    });
    y -= 24;
    // Microciclo row
    page.drawText('Microciclo', { x: 30, y, size: 9, font: fontB, color: GRAY_DK });
    microHeaders.forEach((mn, i) => {
      const cellX = startX + i*colW;
      page.drawText(`${mn}º`, { x: cellX+5, y, size: 9, font: fontB, color: ORANGE });
    });
    y -= 18;
    // Línea separadora
    page.drawLine({ start:{x:30, y:y+4}, end:{x:W_L-30, y:y+4}, thickness:1, color: ORANGE });
    y -= 8;

    // Ejercicios
    (en.ejercicios||[]).sort((x,y)=>(x.orden||0)-(y.orden||0)).forEach(ej => {
      if(y < 70){
        page = doc.addPage([W_L, H_L]);
        drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, `ENTRENAMIENTO ${en.letra} (cont.)`, pl?.categoria||'', W_L, H_L);
        y = H_L - 90;
      }
      // Header ejercicio
      page.drawRectangle({ x: 24, y: y-4, width: W_L-48, height: 20, color: rgb(0.06,0.06,0.06) });
      page.drawText(ej.nombre.toUpperCase(), { x: 30, y: y+1, size: 10, font: fontB, color: ORANGE });
      if(ej.subtitle) page.drawText('· ' + ej.subtitle, { x: 30 + tobTextWidth(ej.nombre.toUpperCase(),10,fontB) + 8, y: y+2, size: 8, font: fontO, color: rgb(0.85,0.85,0.85) });
      y -= 22;

      // Plan row
      page.drawText('Plan', { x: 30, y, size: 8, font, color: GRAY });
      microHeaders.forEach((mn, i) => {
        const plan = tobPlanFor(ej, mn);
        const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
        page.drawText(`${plan.series}×${reps}`, { x: startX + i*colW + 5, y, size: 8, font, color: GRAY_DK });
      });
      y -= 12;

      // Series/Lineas
      const isCirc = ej.tipo === 'circuito';
      const linesN = isCirc ? (ej.circuitoLineas?.length || 3) : Math.max(...microHeaders.map(mn => tobPlanFor(ej, mn).series));
      const arrName = isCirc ? 'lineas' : 'series';

      for(let s = 0; s < linesN; s++){
        const lbl = isCirc ? (ej.circuitoLineas?.[s] || `${s+1}º`) : `${s+1}ª`;
        page.drawText(lbl.length > 14 ? lbl.slice(0,14)+'…' : lbl, { x: 30, y, size: 8, font: fontB, color: GRAY_DK });
        microHeaders.forEach((mn, i) => {
          const ses = it?.sesiones[mn]?.[en.id];
          const sr = ses?.ejs?.[ej.id]?.[arrName]?.[s];
          const cellX = startX + i*colW;
          // Fondo alternado para legibilidad
          if(s % 2 === 0) page.drawRectangle({ x: cellX-1, y: y-3, width: colW-3, height: 12, color: rgb(0.97,0.97,0.97) });
          if(sr?.kg != null || sr?.reps != null){
            const txt = `${sr.kg ?? '—'} × ${sr.reps ?? '—'}`;
            page.drawText(txt, { x: cellX+5, y, size: 8, font: fontB, color: BLACK });
          }
        });
        y -= 13;
      }
      // Pausa
      page.drawText('Pausa', { x: 30, y, size: 7, font: fontO, color: GRAY });
      microHeaders.forEach((mn, i) => {
        const plan = tobPlanFor(ej, mn);
        page.drawText(plan.pausa || '—', { x: startX + i*colW + 5, y, size: 7, font: fontO, color: GRAY });
      });
      y -= 16;
    });

    // Aeróbica
    if(y > 40){
      page.drawText('Aeróbica', { x: 30, y, size: 8, font: fontB, color: GRAY_DK });
      microHeaders.forEach((mn, i) => {
        const ses = it?.sesiones[mn]?.[en.id];
        const a2 = ses?.aerobica;
        if(a2){
          const txt = [a2.tipo, a2.tiempo, a2.intensidad].filter(Boolean).join(' / ');
          page.drawText(txt, { x: startX + i*colW + 5, y, size: 7, font, color: GRAY_DK });
        }
      });
    }
  });

  // ─── Numerado de páginas ─────────────────────
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${i+1} / ${pages.length}`, { x: W_L - 50, y: 22, size: 8, font, color: GRAY });
  });

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(cli?.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_${(pl?.nombre||'rutina').replace(/[^a-zA-Z0-9]/g,'_')}_it${it?.numero}_completada.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  tobToast('✓ PDF descargado', 'green');
}

function tobCalcItStats(a, it){
  let tonelaje = 0, sesiones = 0;
  const ejSet = new Set();
  Object.values(it?.sesiones||{}).forEach(microSes => {
    Object.entries(microSes).forEach(([entId, s]) => {
      let hasData = false;
      const en = a.rutina?.entrenos.find(e => e.id === entId);
      if(!en) return;
      en.ejercicios.forEach(ej => {
        const ses = s.ejs?.[ej.id];
        if(!ses) return;
        ejSet.add(ej.nombre);
        const arr = ses.series || ses.lineas || [];
        arr.forEach(sr => {
          if(sr.kg != null && sr.reps != null){ tonelaje += sr.kg*sr.reps; hasData = true; }
        });
      });
      if(s.fecha || hasData) sesiones++;
    });
  });
  return { tonelaje: Math.round(tonelaje), sesiones, ejCount: ejSet.size };
}

// Config Chart.js para un ejercicio principal en una asignación: una línea por iteración
function tobBuildEjChartConfig(a, ej, entId){
  const datasets = [];
  const allLabels = new Set();
  a.iteraciones.forEach((it, idx) => {
    const color = TOB_IT_COLORS[idx % TOB_IT_COLORS.length];
    const points = [];
    for(let mn=1; mn<=TOB_NUM_MICRO; mn++){
      const ses = it.sesiones[mn]?.[entId];
      const series = ses?.ejs?.[ej.id]?.series;
      if(!series || !series.length) continue;
      const vol = series.reduce((s,sr) => s + (sr.kg||0)*(sr.reps||0), 0);
      if(vol <= 0) continue;
      const label = ses.fecha ? ses.fecha.split('-').reverse().join('/') : `µ${mn}`;
      points.push({ label, val: vol });
      allLabels.add(label);
    }
    if(points.length){
      datasets.push({
        label: 'It. ' + it.numero, _points: points,
        borderColor: color, backgroundColor: color+'22',
        pointBackgroundColor: color, pointBorderColor: color,
        pointStyle: 'crossRot', pointRadius: 5, pointBorderWidth: 2,
        tension: 0.05, fill: false, borderWidth: 2
      });
    }
  });
  if(!datasets.length) return null;
  const labels = [...allLabels].sort((a,b) => {
    const pa = a.split('/'), pb = b.split('/');
    return new Date(`20${pa[2]}-${pa[1]}-${pa[0]}`).getTime() - new Date(`20${pb[2]}-${pb[1]}-${pb[0]}`).getTime();
  });
  datasets.forEach(ds => {
    const map = {}; ds._points.forEach(p => { map[p.label] = p.val; });
    ds.data = labels.map(l => map[l] != null ? map[l] : null);
    ds.spanGaps = true;
    delete ds._points;
  });
  return {
    type: 'line', data: { labels, datasets },
    options: {
      plugins: {
        legend: { display: false },
        datalabels: window.ChartDataLabels ? {
          color: ctx => ctx.dataset.borderColor, font:{size:10,weight:'700'},
          align: 'top', offset: 4, formatter: v => v == null ? '' : v
        } : undefined
      },
      scales:{
        x:{ ticks:{ color:'#444', font:{size:9}, maxRotation:60, minRotation:45 },
            grid:{ color:'#e4e4e4' }, border:{ color:'#888' } },
        y:{ ticks:{ color:'#444', font:{size:9} }, grid:{ color:'#e4e4e4' },
            beginAtZero:true, border:{ color:'#888' } }
      }
    }
  };
}

// Aprox ancho de texto en puntos (Helvetica)
function tobTextWidth(text, size, fontObj){
  try { return fontObj.widthOfTextAtSize(text, size); } catch(e){ return String(text).length * size * 0.55; }
}

// Helper: dibuja banda superior naranja + título + cliente
function drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, title, subtitle, W, H){
  page.drawRectangle({ x: 0, y: H-50, width: W, height: 50, color: ORANGE });
  page.drawText(title, { x: 24, y: H-32, size: 14, font: fontB, color: BLACK });
  if(subtitle) page.drawText(subtitle, { x: 24, y: H-46, size: 9, font: fontB, color: rgb(0.18,0.18,0.18) });
  page.drawText('FULL TRAINING', { x: W - 130, y: H-32, size: 12, font: fontB, color: BLACK });
}

// ═══ PDF HISTÓRICO ═══════════════════════════════════════════
async function tobGeneratePdfHistorico(){
  if(!tobCurrentFichaId){ tobToast('Abre la ficha del cliente', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli){ tobToast('Cliente no encontrado', 'red'); return; }
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  tobToast('⏳ Generando PDF histórico...', '');
  await tobBuildPdfHistorico(cli).catch(e => { console.error(e); tobToast('Error: ' + e.message, 'red'); });
}

async function tobBuildPdfHistorico(cli){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontO = await doc.embedFont(StandardFonts.HelveticaOblique);
  const ORANGE = rgb(0.96, 0.65, 0.13);
  const BLACK = rgb(0.06, 0.06, 0.06);
  const GRAY = rgb(0.55, 0.55, 0.55);
  const GRAY_DK = rgb(0.25, 0.25, 0.25);
  const W = 842, H = 595;

  // ─── COVER ─────────────────────────────────
  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: 60, height: H, color: ORANGE });
  page.drawText('FULL', { x: 100, y: H-100, size: 60, font: fontB, color: ORANGE });
  page.drawText('TRAINING', { x: 100, y: H-160, size: 60, font: fontB, color: BLACK });
  page.drawText('HISTÓRICO COMPLETO', { x: 100, y: H-185, size: 14, font, color: GRAY });
  page.drawText(cli.nombre || '—', { x: 100, y: H-260, size: 36, font: fontB, color: BLACK });
  const periodo = tobCalcPeriodo(cli);
  page.drawText(`${periodo.desde}  →  ${periodo.hasta}`, { x: 100, y: H-290, size: 14, font, color: GRAY_DK });
  page.drawText(`${(cli.asignaciones||[]).length} rutinas  ·  ${tobCountSesiones(cli)} sesiones`, { x: 100, y: H-312, size: 11, font: fontO, color: GRAY });

  // KPIs globales
  const kpisG = tobCalcGlobalKPIs(cli);
  const kpisCover = [
    ['TONELAJE TOTAL', kpisG.tonelajeTotal.toLocaleString('es-ES'), 'kg'],
    ['RUTINAS', String((cli.asignaciones||[]).length), ''],
    ['COMPLETADAS', String(kpisG.completadas), ''],
    ['SESIONES', String(tobCountSesiones(cli)), '']
  ];
  const kpiW = 160, kpiH = 90, kpiGap = 14, kpiY = 160;
  kpisCover.forEach((kp, i) => {
    const x = 100 + i*(kpiW+kpiGap);
    page.drawRectangle({ x, y: kpiY, width: kpiW, height: kpiH, color: rgb(0.97,0.97,0.97) });
    page.drawRectangle({ x, y: kpiY+kpiH-4, width: kpiW, height: 4, color: ORANGE });
    page.drawText(kp[0], { x: x+12, y: kpiY+kpiH-26, size: 9, font: fontB, color: GRAY });
    page.drawText(kp[1], { x: x+12, y: kpiY+28, size: 26, font: fontB, color: BLACK });
    if(kp[2]) page.drawText(kp[2], { x: x+12+tobTextWidth(kp[1],26,fontB)+6, y: kpiY+28, size: 11, font, color: GRAY });
  });
  page.drawText(`Generado: ${new Date().toLocaleDateString('es-ES')}`, { x: 100, y: 40, size: 9, font, color: GRAY });
  page.drawText('FULL TRAINING · BIIO System', { x: W-240, y: 40, size: 9, font: fontO, color: GRAY });

  // ─── PR POR EJERCICIO ──────────────────────
  page = doc.addPage([W, H]);
  drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, 'PR MÁXIMOS', cli.nombre || '', W, H);
  let y = H - 90;
  page.drawText('Récord absoluto (kg de la mejor serie) por ejercicio principal a lo largo de toda la historia:',
    { x: 30, y, size: 10, font, color: GRAY_DK });
  y -= 26;
  // Tabla simple de PRs
  const prEntries = Object.entries(kpisG.prByEj);
  const colW = 280, rowH = 32;
  prEntries.forEach((pr, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 30 + col * (colW + 30);
    const yy = y - row * rowH;
    page.drawRectangle({ x, y: yy-4, width: colW, height: rowH-4, color: rgb(0.97,0.97,0.97) });
    page.drawRectangle({ x, y: yy-4, width: 4, height: rowH-4, color: ORANGE });
    page.drawText(pr[0], { x: x+14, y: yy+12, size: 11, font: fontB, color: BLACK });
    page.drawText(`${pr[1]} kg`, { x: x+colW-90, y: yy+8, size: 16, font: fontB, color: ORANGE });
  });

  // ─── GRÁFICAS PROGRESIÓN GLOBAL ────────────
  // Para cada ejercicio principal, una página con su gráfica grande
  for(const [ejName] of prEntries.slice(0, 6)){
    page = doc.addPage([W, H]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, `EVOLUCIÓN: ${ejName}`, cli.nombre || '', W, H);
    const cfg = tobBuildGlobalEjChartConfig(cli, ejName);
    if(cfg){
      const png = await tobChartToPng(cfg, 900, 500);
      const img = await doc.embedPng(png);
      page.drawImage(img, { x: 60, y: 80, width: W-120, height: H-180 });
    }
  }

  // ─── RESUMEN POR RUTINA ────────────────────
  page = doc.addPage([W, H]);
  drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, 'RESUMEN DE RUTINAS', cli.nombre || '', W, H);
  y = H - 80;
  const sorted = [...cli.asignaciones].sort((a,b) => (a.fechaInicio||'').localeCompare(b.fechaInicio||''));
  sorted.forEach((a, i) => {
    if(y < 80){
      page = doc.addPage([W, H]);
      drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, 'RESUMEN DE RUTINAS (cont.)', cli.nombre||'', W, H);
      y = H - 80;
    }
    const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
    const stats = tobCalcAsigStats(a);
    // Caja por rutina
    page.drawRectangle({ x: 24, y: y-58, width: W-48, height: 60, color: rgb(0.97,0.97,0.97) });
    page.drawRectangle({ x: 24, y: y-58, width: 4, height: 60, color: ORANGE });
    page.drawText(pl ? pl.nombre : '(plantilla eliminada)', { x: 38, y: y-12, size: 12, font: fontB, color: BLACK });
    if(pl) page.drawText(`${pl.macrociclo || ''} · ${pl.categoria || ''}`, { x: 38, y: y-26, size: 8, font: fontO, color: GRAY });
    const dates = `${a.fechaInicio || '?'} → ${stats.ultimaFecha || '?'}`;
    page.drawText(dates, { x: 38, y: y-40, size: 9, font, color: GRAY_DK });
    page.drawText(a.estado || 'en curso', { x: 38, y: y-52, size: 8, font: fontB, color: a.estado==='completada' ? rgb(0.2,0.6,0.4) : a.estado==='repetir' ? rgb(0.9,0.5,0.2) : GRAY });
    // Stats derecha
    const rx = W - 230;
    page.drawText('Sesiones:', { x: rx, y: y-20, size: 8, font, color: GRAY });
    page.drawText(String(stats.sesiones), { x: rx+60, y: y-20, size: 11, font: fontB, color: BLACK });
    page.drawText('Tonelaje:', { x: rx, y: y-36, size: 8, font, color: GRAY });
    page.drawText(`${stats.tonelaje.toLocaleString('es-ES')} kg`, { x: rx+60, y: y-36, size: 11, font: fontB, color: BLACK });
    page.drawText('Iteraciones:', { x: rx, y: y-52, size: 8, font, color: GRAY });
    page.drawText(String((a.iteraciones||[]).length), { x: rx+60, y: y-52, size: 11, font: fontB, color: BLACK });
    y -= 70;
  });

  // Paginación
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`${i+1} / ${pages.length}`, { x: W-50, y: 22, size: 8, font, color: GRAY }));

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type:'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(cli.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_historico_${new Date().toISOString().slice(0,10)}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  tobToast('✓ Histórico descargado', 'green');
}

function tobCalcPeriodo(cli){
  let desde = '?', hasta = '?';
  const fechas = [];
  (cli.asignaciones||[]).forEach(a => {
    if(a.fechaInicio) fechas.push(a.fechaInicio);
    const st = tobCalcAsigStats(a);
    if(st.ultimaFecha) fechas.push(st.ultimaFecha);
  });
  if(fechas.length){
    fechas.sort();
    desde = fechas[0];
    hasta = fechas[fechas.length-1];
  }
  return { desde, hasta };
}

function tobBuildGlobalEjChartConfig(cli, ejName){
  const points = [];
  (cli.asignaciones||[]).forEach(a => {
    const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
    (a.iteraciones||[]).forEach(it => {
      Object.values(it.sesiones||{}).forEach(microSes => {
        Object.entries(microSes).forEach(([entId, s]) => {
          const en = a.rutina?.entrenos.find(e => e.id === entId);
          const ej = en?.ejercicios.find(x => x.nombre === ejName);
          if(!ej || ej.tipo === 'circuito') return;
          const series = s.ejs?.[ej.id]?.series;
          if(!series || !series.length) return;
          const maxKg = Math.max(0, ...series.map(sr => sr.kg||0));
          if(maxKg <= 0 || !s.fecha) return;
          points.push({ fecha: s.fecha, kg: maxKg, asig: pl?.nombre || '?', it: it.numero });
        });
      });
    });
  });
  if(!points.length) return null;
  points.sort((a,b) => a.fecha.localeCompare(b.fecha));
  // Agrupar por (asig+it)
  const groups = {};
  points.forEach(p => {
    const key = p.asig + '_it' + p.it;
    if(!groups[key]) groups[key] = [];
    groups[key].push(p);
  });
  const labels = points.map(p => p.fecha.split('-').reverse().join('/'));
  const datasets = Object.entries(groups).map(([k, pts], i) => {
    const color = TOB_IT_COLORS[i % TOB_IT_COLORS.length];
    const map = {}; pts.forEach(p => map[p.fecha.split('-').reverse().join('/')] = p.kg);
    return {
      label: k.replace('_it', ' it.'),
      data: labels.map(l => map[l] != null ? map[l] : null),
      borderColor: color, backgroundColor: color+'22',
      pointBackgroundColor: color, pointStyle: 'crossRot',
      pointRadius: 5, pointBorderWidth: 2, tension: 0.1, fill: false, spanGaps: true, borderWidth: 2
    };
  });
  return {
    type:'line', data:{labels, datasets},
    options:{
      plugins:{
        legend:{ labels:{ color:'#222', font:{size:11} }, position:'top' },
        datalabels: window.ChartDataLabels ? {
          color: ctx => ctx.dataset.borderColor, font:{size:10,weight:'700'},
          align:'top', offset:4, formatter: v => v == null ? '' : v + ' kg'
        } : undefined
      },
      scales:{
        x:{ ticks:{ color:'#444', font:{size:10}, maxRotation:60, minRotation:45 }, grid:{ color:'#e4e4e4' } },
        y:{ ticks:{ color:'#444', font:{size:10} }, grid:{ color:'#e4e4e4' }, beginAtZero:true }
      }
    }
  };
}

// Auto-init
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', tobLoad);
} else {
  tobLoad();
}
