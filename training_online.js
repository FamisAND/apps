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

// Versión de las descripciones. Al subirla, el backfill reaplica los textos.
const TOB_DESC_VERSION = 4;

// Descripciones por categoría — lenguaje claro para gente que entrena normal,
// sin jerga de competición ni duración fija (la velocidad depende de cuántos
// días entrene cada persona). Estructura: objetivo, cómo progresa, reps, pesos,
// descansos y consejos.
const TOB_DESC_CATEGORIAS = {
  'Reacondicionamiento':
    'OBJETIVO: Ponerte a punto. Es la rutina para volver al gimnasio tras un parón o para empezar bien una etapa nueva. Recuperas el ritmo, recuerdas cómo se hacen los ejercicios y preparas el cuerpo para entrenamientos más exigentes.\n\n' +
    'CÓMO PROGRESA: La rutina está dividida en 6 microciclos (bloques). Avanzas al siguiente cuando completas las sesiones del bloque actual — no hay duración fija, va a tu ritmo. Cada par de bloques el reto sube un escalón: menos repeticiones pero algo más de peso.\n\n' +
    'REPETICIONES: Empiezas con muchas (15-12-10 en las 3 series). Luego bajan a 12-10-8. Y en los últimos bloques 10-8-6. Bajar repeticiones te deja meter algo más de peso.\n\n' +
    'PESOS: Al principio debe costarte poco — es para coger técnica. En los últimos bloques notarás el esfuerzo, pero siempre pudiendo completar todas las repeticiones con buena forma.\n\n' +
    'DESCANSOS: 1 minuto y medio entre series en los primeros bloques, hasta 2 minutos en los últimos.\n\n' +
    'CONSEJOS: Lo recomendable es entrenar entre 3 y 5 días por semana, alternando los entrenos A y B. Lo importante no es el peso, es hacer los movimientos bien y sin prisa, controlando la bajada.',

  'Preparación fuerza':
    'OBJETIVO: Empezar a ganar fuerza de verdad en los ejercicios básicos (sentadilla, press de banca, peso muerto...). Es el primer paso serio antes de las rutinas de fuerza más duras.\n\n' +
    'CÓMO PROGRESA: 6 microciclos (bloques). Avanzas cuando completas las sesiones del bloque — a tu ritmo, sin calendario fijo. Pocas repeticiones con un peso que te exija. En algunos bloques cambia el número de series para que el cuerpo no se acostumbre y siga mejorando. El último bloque es más suave, de recuperación.\n\n' +
    'REPETICIONES: 5 repeticiones por serie en los ejercicios grandes. En los ejercicios de apoyo, entre 3 y 6 según el bloque.\n\n' +
    'PESOS: Un peso que te cueste, pero con el que puedas mover bien las 5 repeticiones sin que la técnica se rompa.\n\n' +
    'DESCANSOS: 2 a 2 minutos y medio entre series. Aquí hace falta descansar bien para rendir.\n\n' +
    'CONSEJOS: Entrena entre 3 y 5 días por semana, alternando A y B. En algunos ejercicios de apoyo el ejercicio cambia de un bloque a otro para trabajar de forma variada.',

  'Especialización técnica':
    'OBJETIVO: Mejorar CÓMO haces los ejercicios. Hacer los movimientos más limpios y controlados, ahora que ya manejas algo de peso. Pulir los detalles antes de subir más la intensidad.\n\n' +
    'CÓMO PROGRESA: 6 microciclos (bloques). El peso se mantiene parecido, pero bloque a bloque se pide más control: pausas un poco más largas en los puntos clave del movimiento. Avanzas a tu ritmo según completes las sesiones.\n\n' +
    'REPETICIONES: 4 a 6 por serie, 4 series. Las justas para practicar mucho la técnica sin perder la concentración.\n\n' +
    'PESOS: Peso medio-alto. La prioridad es la técnica perfecta — si el movimiento se descontrola, baja el peso.\n\n' +
    'DESCANSOS: 2 a 2 minutos y medio, para llegar a cada serie fresco y poder hacerla bien.\n\n' +
    'CONSEJOS: Entrena entre 3 y 5 días por semana. Harás pausas a mitad del movimiento: 1-2 segundos sentado abajo en la sentadilla, 1-2 segundos con la barra en el pecho en el press. Estas pausas obligan a controlar y eliminan trampas.',

  'Fuerza 1':
    'OBJETIVO: Trabajar la fuerza con pesos altos. En esta rutina, además de levantar, aguantas la posición unos segundos en un punto del movimiento — eso te hace mucho más fuerte y estable.\n\n' +
    'CÓMO PROGRESA: 6 microciclos (bloques). Vas aguantando un poco más las posiciones y subiendo peso de un bloque al siguiente. Avanzas cuando completas las sesiones del bloque, sin prisa de calendario. El último bloque es más suave, de recuperación.\n\n' +
    'REPETICIONES: 3 por serie, 5 series. Pocas, pero muy intensas.\n\n' +
    'PESOS: Peso alto, de los que de verdad cuestan. Siempre con buena técnica.\n\n' +
    'DESCANSOS: 3 minutos entre series. Necesitas recuperarte del todo para rendir en la siguiente.\n\n' +
    'CONSEJOS: Entrena entre 3 y 5 días por semana. En cada ejercicio principal aguantas la posición unos 6 segundos en un punto clave (por ejemplo, a media bajada de la sentadilla o del press). Cuesta, pero es lo que te hace ganar fuerza real.',

  'Fuerza 2':
    'OBJETIVO: Comprobar cuánta fuerza has ganado en todo este tiempo. Al final de la rutina hay un día especial para intentar tu peso máximo en cada ejercicio.\n\n' +
    'CÓMO PROGRESA: 6 microciclos (bloques). Vas subiendo la intensidad bloque a bloque hasta llegar al día de "máximos". Avanzas a tu ritmo según completes las sesiones.\n\n' +
    'REPETICIONES: En los entrenos normales, 5 series de 5 repeticiones. Hay una serie especial de 20 repeticiones en sentadilla (de aguante mental). El día de máximos: 1 sola repetición con el peso más alto que puedas.\n\n' +
    'PESOS: Peso alto en los entrenos. El día de máximos, lo máximo que puedas levantar con técnica correcta.\n\n' +
    'DESCANSOS: 2 minutos y medio a 3 en los entrenos normales. 5-6 minutos antes de cada intento de máximo.\n\n' +
    'CONSEJOS: Entrena entre 3 y 5 días por semana. El día de "Maximales" tiene una hoja aparte con los 6 ejercicios principales. Haz siempre series de calentamiento subiendo peso antes de ir a por tu intento máximo. Nunca vayas a frío.',

  'Hibrido':
    'OBJETIVO: Mezclar lo mejor de dos mundos en la misma sesión: ganar fuerza y ganar músculo a la vez.\n\n' +
    'CÓMO PROGRESA: 6 microciclos (bloques). Se usan "series partidas": en vez de hacer 9 repeticiones seguidas, las haces en 3+3+3 con un respiro muy corto entre cada tanda. Eso te deja mover más peso. Avanzas de bloque cuando completas sus sesiones, a tu ritmo. El último bloque es más suave.\n\n' +
    'REPETICIONES: 9 repeticiones por serie, pero divididas en tres tandas de 3 con una pausa corta en medio.\n\n' +
    'PESOS: Peso alto — el formato partido te permite manejar más kilos sin que la técnica se resienta.\n\n' +
    'DESCANSOS: El respiro corto dentro de la serie es de 15-20 segundos. Entre serie y serie, 3 minutos.\n\n' +
    'CONSEJOS: Entrena entre 3 y 5 días por semana. Partir la serie en tandas es la clave de esta rutina: aguantas buen peso durante las 9 repeticiones sin llegar al agotamiento que descontrola la forma.',

  'Hipertrofia':
    'OBJETIVO: Ganar masa muscular. Que el músculo crezca y se note.\n\n' +
    'CÓMO PROGRESA: 6 microciclos (bloques). Cada bloque cambia un poco el rango de repeticiones para trabajar el músculo de varias formas y que no se estanque. Avanzas cuando completas las sesiones del bloque, sin calendario fijo.\n\n' +
    'REPETICIONES: Entre 8 y 15 por serie según el bloque. Unos bloques más repeticiones con menos peso, otros menos repeticiones con algo más.\n\n' +
    'PESOS: Peso medio. El suficiente para que el músculo trabaje de verdad, pero no tanto como para fallar a las 3 repeticiones.\n\n' +
    'DESCANSOS: 1 minuto y medio a 2. Descansos cortos para mantener el músculo "encendido".\n\n' +
    'CONSEJOS: Entrena entre 3 y 5 días por semana. Aquí no buscas mover mucho peso, buscas SENTIR el músculo trabajar en cada repetición. Técnica estricta y movimiento controlado. La conexión mente-músculo es lo que hace crecer.',

  'Calidad muscular':
    'OBJETIVO: Definir y marcar el músculo. Mantener la fuerza que has ganado mientras afinas y se ve más el trabajo hecho.\n\n' +
    'CÓMO PROGRESA: 6 microciclos (bloques). Alternas dos tipos de día: días de muchas repeticiones (bombeo, sensación de "músculo lleno") y días de peso medio para no perder fuerza. Avanzas a tu ritmo según completes las sesiones de cada bloque.\n\n' +
    'REPETICIONES: En los días de bombeo, 12, 15 o hasta 20 repeticiones. En los días de peso medio, 6 a 10.\n\n' +
    'PESOS: Ligero-medio en los días de bombeo. Medio-alto en los días de fuerza.\n\n' +
    'DESCANSOS: Muy cortos en los días de bombeo (45 segundos a 1 minuto). Un poco más largos en los días de fuerza (1 minuto y medio a 2).\n\n' +
    'CONSEJOS: Entrena entre 3 y 5 días por semana. Es una rutina ideal cuando quieres verte más marcado. En el último ejercicio de cada grupo se hacen "bajadas de peso" (sigues haciendo repeticiones con menos peso) para apurar al máximo.'
};

// Aliases de ejercicios: nombres equivalentes mapeados a un nombre canónico.
// Se aplica en tobLoad() por backfill — preserva IDs (sesiones quedan intactas).
const TOB_EJ_ALIASES = {
  'REMO O SEAL ROW': 'REMO',
  'REMO o SEAL ROW': 'REMO',
  'Remo o Seal Row': 'REMO',
  'DOMINADAS O LAT MACHINE': 'DOMINADAS',
  'DOMINADAS o LAT MACHINE': 'DOMINADAS',
  'Dominadas o Lat Machine': 'DOMINADAS'
};

// Campos de medición (composición corporal — antropometría tipo ISAK,
// formato del informe Full Training). key interna → etiqueta visible.
const TOB_MED_PLECS = [
  ['triceps','Tríceps'], ['subescapular','Subescapular'], ['supraespinal','Supraespinal'],
  ['abdominal','Abdominal'], ['cuixa','Cuixa Mitjana'], ['panxell','Panxell Mitjà']
];
const TOB_MED_PERIM = [
  ['mesoesternal','Mesoesternal'], ['brac','Braç en Tensió'], ['cintura','Cintura'],
  ['malucs','Malucs'], ['cuixa','Cuixa Mitjana'], ['panxell','Panxell Mitjà']
];

let tobDB = { clientes: [], plantillas: [] };
let tobCurrentAsig = null;     // {clienteId, asigId}
let tobCurrentItId = null;
let tobCurrentEntrenoId = null;
let tobCharts = {};             // {ejId: Chart instance}

function tobUid(prefix){ return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }
function tobEsc(s){ return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]); }

function tobLoad(){
  // Registrar plugin datalabels (idempotente con try/catch)
  if(window.Chart && window.ChartDataLabels){
    try { Chart.register(ChartDataLabels); } catch(e){}
  }
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
  // Backfill: añadir entreno "Maximales" a plantillas Fuerza 2 que no lo tengan
  tobDB.plantillas.forEach(p => {
    if(p.categoria !== 'Fuerza 2') return;
    if((p.entrenos||[]).find(e => e.letra === 'MX')) return;
    const planMax = {};
    for(let mn=1; mn<=TOB_NUM_MICRO; mn++){
      planMax[mn] = { series: 1, repsTarget: [1], pausa: "5'00''" };
    }
    const maxNames = ['BOX SQUAT', 'PRESS BANCA', 'PESO MUERTO', 'PRESS MILITAR', 'REMO', 'DOMINADAS'];
    const ejMax = maxNames.map((n, i) => ({
      id: tobUid('ej'), orden: i, nombre: n,
      subtitle: 'Intento máximo (1RM)',
      tipo: 'normal',
      planByMicro: planMax
    }));
    p.entrenos.push({ id:'MX', letra:'MX', nombre:'Maximales', ejercicios: ejMax });
    backfilled = true;
  });
  // También backfill las asignaciones existentes que tengan plantilla Fuerza 2
  // sin Maximales en su rutina copiada.
  tobDB.clientes.forEach(c => {
    (c.asignaciones||[]).forEach(a => {
      const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
      if(!pl || pl.categoria !== 'Fuerza 2') return;
      if(!a.rutina || !a.rutina.entrenos) return;
      if(a.rutina.entrenos.find(e => e.letra === 'MX')) return;
      const mx = (pl.entrenos||[]).find(e => e.letra === 'MX');
      if(mx){
        a.rutina.entrenos.push(JSON.parse(JSON.stringify(mx)));
        backfilled = true;
      }
    });
  });

  // Backfill: descripciones de categoría. Versionado con _descV: si la plantilla
  // no está en la versión actual, se reaplica el texto. Esto fuerza la actualización
  // cuando subimos TOB_DESC_VERSION (p.ej. al cambiar el tono de los textos).
  tobDB.plantillas.forEach(p => {
    if(!p.categoria || !TOB_DESC_CATEGORIAS[p.categoria]) return;
    if(p._descV !== TOB_DESC_VERSION){
      p.descripcion = TOB_DESC_CATEGORIAS[p.categoria];
      p._descV = TOB_DESC_VERSION;
      backfilled = true;
    }
  });

  // Backfill: normalizar nombres de ejercicios con aliases.
  // Preserva IDs — las sesiones logueadas siguen vinculadas.
  const renameEj = (ej) => {
    const canonical = TOB_EJ_ALIASES[ej.nombre];
    if(canonical && canonical !== ej.nombre){ ej.nombre = canonical; backfilled = true; }
  };
  tobDB.plantillas.forEach(p =>
    (p.entrenos||[]).forEach(en =>
      (en.ejercicios||[]).forEach(renameEj)));
  tobDB.clientes.forEach(c =>
    (c.asignaciones||[]).forEach(a =>
      (a.rutina?.entrenos||[]).forEach(en =>
        (en.ejercicios||[]).forEach(renameEj))));

  // Backfill: todos los clientes tienen array de mediciones
  tobDB.clientes.forEach(c => {
    if(!c.mediciones){ c.mediciones = []; backfilled = true; }
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
      <td style="cursor:pointer;" onclick="tobOpenFicha('${c.id}')" title="Abrir ficha histórica"><strong>${tobEsc(c.nombre)}</strong></td>
      <td><span style="color:var(--mute);font-family:DM Mono,monospace;font-size:.78rem;">${tobEsc(c.contacto||'—')}</span></td>
      <td><span class="tob-badge ${sexoCls}">${sexoTxt}</span></td>
      <td class="num">${(c.asignaciones||[]).length}</td>
      <td>${lastInfo}</td>
      <td class="actions">
        <button class="tob-action" style="padding:5px 10px;" onclick="tobAbrirUltimaRutina('${c.id}')" title="Abrir la última rutina">🏋 Abrir</button>
        <button class="tob-action ghost" style="padding:5px 10px;" onclick="tobOpenFicha('${c.id}')" title="Ficha histórica">📋 Ficha</button>
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
  document.getElementById('tobCliNacimiento').value = cli?.nacimiento || '';
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
    alta: document.getElementById('tobCliAlta').value,
    nacimiento: document.getElementById('tobCliNacimiento').value || ''
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
  // Abre la última rutina (uso común). Para ver el histórico → tobOpenFicha
  tobAbrirUltimaRutina(cliId);
}

function tobAbrirUltimaRutina(cliId){
  const c = tobDB.clientes.find(c => c.id === cliId);
  if(!c) return;
  if(!c.asignaciones || !c.asignaciones.length){
    tobOpenAsignarModal(c);
    return;
  }
  // Ordenar por fechaInicio desc, abrir la última
  const sorted = [...c.asignaciones].sort((a,b) => (b.fechaInicio||'').localeCompare(a.fechaInicio||''));
  tobOpenAsignacion(c.id, sorted[0].id);
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
  document.getElementById('tobPlDescripcion').value = pl?.descripcion || '';
  document.getElementById('tobPlDef').value = pl ? tobPlantillaToText(pl) : '';
  document.getElementById('tobPlantillaModalBg').dataset.editId = pl?.id || '';
  // Mostrar el editor por-ejercicio solo si la plantilla ya existe (tiene id)
  const wrap = document.getElementById('tobPlEjListWrap');
  if(wrap) wrap.style.display = pl ? '' : 'none';
  if(pl) tobRenderPlEjList(pl);
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
  const descripcion = document.getElementById('tobPlDescripcion').value.trim();
  const entrenos = tobParsePlantillaDef(document.getElementById('tobPlDef').value);
  if(!entrenos.length){ tobToast('Define al menos un ejercicio', 'red'); return; }
  const editId = document.getElementById('tobPlantillaModalBg').dataset.editId;
  if(editId){
    const p = tobDB.plantillas.find(p => p.id === editId);
    if(p){
      // PRESERVAR IDs: match por entreno+nombre con los ejercicios antiguos
      const oldMap = {};
      (p.entrenos||[]).forEach(en => {
        (en.ejercicios||[]).forEach(ej => { oldMap[en.letra + ':' + ej.nombre] = ej.id; });
      });
      entrenos.forEach(en => {
        (en.ejercicios||[]).forEach(ej => {
          const key = en.letra + ':' + ej.nombre;
          if(oldMap[key]) ej.id = oldMap[key];
        });
      });
      Object.assign(p, { macrociclo, nombre, categoria, sexo, descripcion, entrenos });
    }
  } else {
    tobDB.plantillas.push({ id: tobUid('pl'), macrociclo, nombre, categoria, sexo, descripcion, entrenos });
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

  // Botón añadir ejercicio (al final de la lista del entreno actual)
  html += `<div style="margin:10px 0 16px;">
    <button class="tob-action ghost" style="font-size:.78rem;" onclick="tobAddEjToEntreno('${en.id}')" title="Añadir un nuevo ejercicio a este entreno">+ Añadir ejercicio</button>
  </div>`;

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
      <button class="tob-action ghost" style="margin-left:auto;padding:4px 10px;font-size:.7rem;" onclick="tobOpenEjEditor('${en.id}','${ej.id}')" title="Editar este ejercicio (renombrar, cambiar plan, eliminar) — preserva los datos registrados">✏️ Editar</button>
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
    const parsed = tobParsePlantillaDef(document.getElementById('tobPlDef').value);
    if(!parsed.length){ tobToast('Sin ejercicios', 'red'); return; }
    // CRÍTICO: preservar IDs existentes de ejercicios (match por entreno+nombre)
    // para no romper las sesiones registradas que usan ej.id.
    const oldMap = {};   // 'A:NOMBRE' → id
    (a.rutina?.entrenos||[]).forEach(en => {
      (en.ejercicios||[]).forEach(ej => {
        oldMap[en.letra + ':' + ej.nombre] = ej.id;
      });
    });
    parsed.forEach(en => {
      (en.ejercicios||[]).forEach(ej => {
        const key = en.letra + ':' + ej.nombre;
        if(oldMap[key]) ej.id = oldMap[key];   // reusar ID antiguo
      });
    });
    a.rutina.entrenos = parsed;
    if(!parsed.find(e => e.id === tobCurrentEntrenoId)) tobCurrentEntrenoId = parsed[0].id;
    document.getElementById('tobPlNombre').disabled = false;
    document.getElementById('tobPlCategoria').disabled = false;
    document.getElementById('tobPlSexo').disabled = false;
    tobSave();
    tobClosePlantillaModal();
    tobRenderEntTabs(); tobRenderEntreno(); tobRenderCharts();
    tobToast('✓ Rutina actualizada (datos previos conservados)', 'green');
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
      { ...ej('REMO', 'Espalda Recta · o Seal Row', planRea), orden: 2 },
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
      { ...ej('DOMINADAS', 'Tocando el Pecho (peso + lastre) · o Lat Machine', planRea), orden: 2 },
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
  const DESC = TOB_DESC_CATEGORIAS;
  // (descripciones detalladas en TOB_DESC_CATEGORIAS arriba)
  // 1. Reacondicionamiento (exacto del PDF)
  out.push({ id: tobUid('pl'), macrociclo: MACRO, nombre:'Reacondicionamiento — Hombre', categoria:'Reacondicionamiento', sexo:'H', descripcion: DESC['Reacondicionamiento'], _descV: TOB_DESC_VERSION, entrenos:[entA_rea(), entB_rea()] });
  out.push({ id: tobUid('pl'), macrociclo: MACRO, nombre:'Reacondicionamiento — Mujer',  categoria:'Reacondicionamiento', sexo:'M', descripcion: DESC['Reacondicionamiento'], _descV: TOB_DESC_VERSION, entrenos:[entA_rea(), entB_rea()] });
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
      const entrenos = makeStandard(cat, plan);
      // Maximales: solo en Fuerza 2. 3º entreno con 6 ejercicios principales,
      // plan 1×1 (intento de 1RM). El cliente apunta el max alcanzado.
      if(cat === 'Fuerza 2'){
        const planMax = {};
        for(let mn=1; mn<=TOB_NUM_MICRO; mn++){
          planMax[mn] = { series: 1, repsTarget: [1], pausa: "5'00''" };
        }
        const maxNames = ['BOX SQUAT', 'PRESS BANCA', 'PESO MUERTO', 'PRESS MILITAR', 'REMO', 'DOMINADAS'];
        const ejMax = maxNames.map((n, i) => ({
          id: tobUid('ej'), orden: i, nombre: n,
          subtitle: 'Intento máximo (1RM)',
          tipo: 'normal',
          planByMicro: planMax
        }));
        entrenos.push({
          id: 'MX', letra: 'MX', nombre: 'Maximales',
          ejercicios: ejMax
        });
      }
      out.push({ id: tobUid('pl'), macrociclo: MACRO, nombre:`${cat} — ${sx==='H'?'Hombre':'Mujer'}`, categoria: cat, sexo: sx, descripcion: DESC[cat] || '', _descV: TOB_DESC_VERSION, entrenos });
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
        [ids['A:REMO']]:                       { series: data.remo[mn-1] },
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
        [ids['B:DOMINADAS']]:                    { series: data.dominadas[mn-1] },
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

  // Destruir todos los charts de la ficha de una vez (rutinas + mediciones)
  Object.values(tobFichaCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  tobFichaCharts = {};

  const hasRutinas = (cli.asignaciones||[]).length > 0;
  const hasMediciones = (cli.mediciones||[]).length > 0;

  document.getElementById('tobFichaNombre').textContent = cli.nombre + (cli.sexo==='M'?' ♀':cli.sexo==='H'?' ♂':'');
  const totalSes = tobCountSesiones(cli);
  const metaParts = [`Cliente desde ${cli.alta || '—'}`];
  if(hasRutinas) metaParts.push(`${(cli.asignaciones||[]).length} rutinas`, `${totalSes} sesiones`);
  if(hasMediciones) metaParts.push(`${cli.mediciones.length} mediciones`);
  if(cli.contacto) metaParts.push(cli.contacto);
  document.getElementById('tobFichaMeta').textContent = metaParts.join('  ·  ');

  // ── KPIs adaptativos: rutinas, mediciones, o ambas ──
  const kpiCards = [];
  if(hasRutinas){
    const kpis = tobCalcGlobalKPIs(cli);
    kpiCards.push(`<div class="tob-kpi ses"><div class="lbl">Sesiones totales</div><div class="val">${totalSes}</div></div>`);
    kpiCards.push(`<div class="tob-kpi"><div class="lbl">Rutinas completadas</div><div class="val">${kpis.completadas}<span class="unit"> / ${(cli.asignaciones||[]).length}</span></div></div>`);
    Object.entries(kpis.prByEj).slice(0, hasMediciones ? 3 : 6).forEach(([n, kg]) =>
      kpiCards.push(`<div class="tob-kpi pr"><div class="lbl">PR ${tobEsc(n)}</div><div class="val">${kg}<span class="unit"> kg</span></div></div>`));
  }
  if(hasMediciones){
    const mk = tobCalcMedKPIs(cli);
    kpiCards.push(`<div class="tob-kpi med"><div class="lbl">Mediciones</div><div class="val">${mk.count}</div></div>`);
    kpiCards.push(`<div class="tob-kpi med"><div class="lbl">Peso actual</div><div class="val">${mk.pes}<span class="unit"> kg</span></div>${mk.pesDelta}</div>`);
    kpiCards.push(`<div class="tob-kpi med"><div class="lbl">Σ Pliegues</div><div class="val">${mk.sum}<span class="unit"> mm</span></div>${mk.sumDelta}</div>`);
    kpiCards.push(`<div class="tob-kpi med"><div class="lbl">Cintura</div><div class="val">${mk.cintura}<span class="unit"> cm</span></div>${mk.cinturaDelta}</div>`);
  }
  document.getElementById('tobFichaKpis').innerHTML = kpiCards.join('') ||
    '<div style="color:var(--mute2);padding:8px;font-size:.85rem;">Sin datos todavía.</div>';

  // ── Bloques adaptativos ──
  document.getElementById('tobFichaEmptyBoth').style.display = (!hasRutinas && !hasMediciones) ? '' : 'none';
  document.getElementById('tobFichaRutinasBlock').style.display = hasRutinas ? '' : 'none';
  document.getElementById('tobFichaMedicionesBlock').style.display = hasMediciones ? '' : 'none';

  if(hasRutinas){
    tobRenderTimeline(cli);
    tobRenderFichaCharts(cli);
  }
  if(hasMediciones){
    tobRenderFichaMediciones(cli);
  }
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
    const nombreShort = pl ? pl.nombre.replace(/\s*—\s*(Hombre|Mujer|Unisex)\s*$/i, '') : '(plantilla eliminada)';
    const topPrs = Object.entries(stats.maxByEj).slice(0, 3);
    const prBoxes = topPrs.length
      ? topPrs.map(([n, kg]) => {
          const ejShort = n.length > 10 ? n.slice(0,9)+'…' : n;
          return `<div class="tl-prbox" title="${tobEsc(n)}: ${kg} kg">
            <div class="ej">${tobEsc(ejShort)}</div>
            <div class="v">${kg}<span class="u"> kg</span></div>
          </div>`;
        }).join('')
      : `<div style="color:var(--mute2);font-size:.72rem;font-style:italic;align-self:center;">Sin datos registrados</div>`;
    return `<div class="tob-tl-item ${a.estado||''}" onclick="tobOpenAsignacion('${cli.id}','${a.id}')">
      <div class="tl-left">
        <div class="tl-hdr">
          <span class="tl-fechas">${tobEsc(a.fechaInicio||'?')} → ${tobEsc(fechaFin)}</span>
          <span class="tl-name">${tobEsc(nombreShort)}</span>
          <span class="tob-badge ${a.estado||'en_curso'}">${a.estado||'en curso'}</span>
        </div>
        <div class="tl-meta">${pl ? tobEsc(pl.macrociclo||'') + ' · ' + tobEsc(pl.categoria||'') : ''}  ·  ${(a.iteraciones||[]).length} iteración${(a.iteraciones||[]).length===1?'':'es'}</div>
        <div class="tl-kpi">
          <span><strong>${stats.sesiones}</strong>sesiones</span>
        </div>
      </div>
      <div class="tl-right">${prBoxes}</div>
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

// Construye datos consolidados para ficha: PR por ejercicio y tabla rutina×ejercicio
function tobBuildFichaData(cli){
  // Recolectar todos los ejercicios principales únicos
  const ejNames = new Set();
  (cli.asignaciones||[]).forEach(a => {
    (a.rutina?.entrenos||[]).forEach(en => {
      (en.ejercicios||[]).forEach(ej => {
        if(ej.tipo !== 'circuito') ejNames.add(ej.nombre);
      });
    });
  });
  // Para cada ejercicio: lista de {kg, fecha, asigLabel} de cada rutina-iteración
  const ejHistory = {};
  // También: por rutina-iteración → ejercicio → kg max
  const matrix = {};   // { rutinaKey: { ejName: maxKg } }
  const rutinaLabels = []; // ordenadas crono

  // Ordenar asignaciones por fechaInicio
  const sortedAsigs = [...(cli.asignaciones||[])].sort((a,b) => (a.fechaInicio||'').localeCompare(b.fechaInicio||''));
  sortedAsigs.forEach(a => {
    const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
    const baseLabel = pl ? pl.nombre.replace(' — Hombre','').replace(' — Mujer','') : 'Rutina';
    a.iteraciones.forEach(it => {
      const ejMaxIt = {};
      let lastFecha = '';
      Object.values(it.sesiones||{}).forEach(microSes => {
        Object.entries(microSes).forEach(([entId, s]) => {
          const en = a.rutina?.entrenos.find(e => e.id === entId);
          if(!en) return;
          en.ejercicios.forEach(ej => {
            if(ej.tipo === 'circuito') return;
            const series = s.ejs?.[ej.id]?.series;
            if(!series) return;
            series.forEach(sr => {
              if((sr.kg||0) > (ejMaxIt[ej.nombre]||0)) ejMaxIt[ej.nombre] = sr.kg;
            });
          });
          if(s.fecha && s.fecha > lastFecha) lastFecha = s.fecha;
        });
      });
      const itLabel = (a.iteraciones.length > 1) ? `${baseLabel} it.${it.numero}` : baseLabel;
      const fechaR = lastFecha || a.fechaInicio || '';
      const rutinaKey = `${itLabel}__${fechaR}`;
      rutinaLabels.push({ key: rutinaKey, label: itLabel, fecha: fechaR });
      matrix[rutinaKey] = ejMaxIt;
      Object.entries(ejMaxIt).forEach(([n, kg]) => {
        if(!ejHistory[n]) ejHistory[n] = [];
        ejHistory[n].push({ kg, fecha: fechaR, asigLabel: itLabel });
      });
    });
  });
  return { ejNames: [...ejNames], ejHistory, matrix, rutinaLabels };
}

// Mini line charts (uno por ejercicio principal) + tabla comparativa
function tobRenderFichaCharts(cli){
  const chartsGrid = document.getElementById('tobFichaCharts');
  const tableCont = document.getElementById('tobFichaCmpTable');
  if(!chartsGrid || !tableCont) return;
  // Nota: los charts ya se destruyen en tobRenderFicha (rutinas + mediciones a la vez)

  const data = tobBuildFichaData(cli);

  if(!data.ejNames.length){
    chartsGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--mute2);padding:30px;">Sin datos de ejercicios principales aún.</div>';
    tableCont.innerHTML = '';
    return;
  }

  // ─── Mini line charts ─────
  chartsGrid.innerHTML = data.ejNames.map(name => `
    <div class="tob-chart-card">
      <div class="hdr">${tobEsc(name)}</div>
      <div class="body"><canvas id="tobFichaChart_${tobSlug(name)}"></canvas></div>
    </div>
  `).join('');

  if(window.ChartDataLabels && Chart.register){ try { Chart.register(ChartDataLabels); } catch(e){} }

  data.ejNames.forEach(name => {
    const canvas = document.getElementById('tobFichaChart_' + tobSlug(name));
    if(!canvas) return;
    const points = (data.ejHistory[name]||[]).slice().sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));
    if(!points.length){
      canvas.getContext('2d').fillStyle = '#5a5240';
      canvas.getContext('2d').font = '12px DM Mono';
      canvas.getContext('2d').textAlign = 'center';
      canvas.getContext('2d').fillText('Sin datos', canvas.width/2, canvas.height/2);
      return;
    }
    // Calcular delta y resaltar PR
    const maxKg = Math.max(...points.map(p => p.kg));
    const labels = points.map(p => p.asigLabel);
    const values = points.map(p => p.kg);
    // Colores: punto naranja si es PR (max), gris si no
    const pointColors = values.map(v => v === maxKg ? '#f5a623' : '#94a3b8');
    const pointSizes = values.map(v => v === maxKg ? 7 : 5);
    tobFichaCharts[name] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'kg PR',
          data: values,
          borderColor: '#f5a623',
          backgroundColor: 'rgba(245,166,35,.12)',
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: pointSizes,
          pointHoverRadius: 8,
          borderWidth: 2.5,
          tension: 0.2,
          fill: true,
          spanGaps: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: ctx => `${ctx.parsed.y} kg`,
            afterLabel: ctx => points[ctx.dataIndex].fecha ? '📅 ' + points[ctx.dataIndex].fecha : ''
          } },
          datalabels: {
            color: ctx => values[ctx.dataIndex] === maxKg ? '#f5a623' : '#cbd5e1',
            font: ctx => ({ size: values[ctx.dataIndex] === maxKg ? 12 : 10, weight: values[ctx.dataIndex] === maxKg ? '800' : '600' }),
            align: 'top', offset: 6,
            formatter: v => v + ' kg'
          }
        },
        scales: {
          x: { ticks: { color:'#7a96b8', font:{size:9}, maxRotation:30, minRotation:0,
                callback: function(val){ const l = this.getLabelForValue(val); return l.length > 14 ? l.slice(0,12)+'…' : l; } },
               grid: { color:'#1e1810', drawBorder:false } },
          y: { ticks: { color:'#7a96b8', font:{size:9} }, grid:{ color:'#1e1810' }, beginAtZero:false,
               title: { display:true, text:'kg', color:'#5a7a9a', font:{size:9} } }
        }
      }
    });
  });

  // ─── Tabla comparativa (igual que antes) ─────
  const colHeaders = data.rutinaLabels.map(r => `<th title="${tobEsc(r.fecha)}">${tobEsc(r.label)}</th>`).join('');
  const rows = data.ejNames.map(name => {
    const cells = data.rutinaLabels.map(r => {
      const kg = data.matrix[r.key]?.[name];
      return kg != null ? `<td data-kg="${kg}">${kg}</td>` : `<td class="empty">—</td>`;
    }).join('');
    return `<tr><td class="ej-name">${tobEsc(name)}</td>${cells}</tr>`;
  }).join('');
  tableCont.innerHTML = `<table class="tob-cmp">
    <thead><tr><th class="ej-col">Ejercicio</th>${colHeaders}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  tableCont.querySelectorAll('tbody tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td[data-kg]')];
    if(!cells.length) return;
    let maxKg = -Infinity;
    cells.forEach(td => { const v = +td.dataset.kg; if(v > maxKg) maxKg = v; });
    cells.forEach(td => { if(+td.dataset.kg === maxKg) td.classList.add('best'); });
  });
}

function tobSlug(s){ return String(s).replace(/[^a-zA-Z0-9]/g,'_'); }

// ═════════════════════════════════════════════════════════════════
// MEDICIONES — composición corporal (pliegues, perímetros, peso)
// ═════════════════════════════════════════════════════════════════
function tobMedsSorted(cli){
  return [...(cli?.mediciones||[])].sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));
}
function tobMedSum(med){
  return TOB_MED_PLECS.reduce((s,[k]) => s + (parseFloat(med?.plecs?.[k])||0), 0);
}
function tobMedRatios(med){
  const cintura = parseFloat(med?.perimetres?.cintura);
  const malucs  = parseFloat(med?.perimetres?.malucs);
  const pes     = parseFloat(med?.pes);
  const sum     = tobMedSum(med);
  return {
    cinturaCadera: (malucs > 0 && !isNaN(cintura)) ? cintura/malucs : null,
    plecsPes:      (pes > 0) ? sum/pes : null
  };
}
function tobMedAge(cli, fecha){
  if(!cli?.nacimiento || !fecha) return null;
  const n = new Date(cli.nacimiento), f = new Date(fecha);
  if(isNaN(n) || isNaN(f)) return null;
  let age = f.getFullYear() - n.getFullYear();
  const m = f.getMonth() - n.getMonth();
  if(m < 0 || (m === 0 && f.getDate() < n.getDate())) age--;
  return (age >= 0 && age < 130) ? age : null;
}
function tobMedShortLabel(fecha){
  const [y,mo] = String(fecha||'').split('-');
  return (mo && y) ? `${mo}/${y.slice(2)}` : (fecha || '?');
}

function tobCalcMedKPIs(cli){
  const meds = tobMedsSorted(cli);
  const first = meds[0], last = meds[meds.length-1];
  const r1 = v => (v == null ? '—' : Math.round(v*10)/10);
  const deltaHtml = (cur, prev, unit) => {
    if(cur == null || prev == null) return '';
    const d = cur - prev;
    if(Math.abs(d) < 0.05) return `<div class="delta">= sin cambio vs inicio</div>`;
    return `<div class="delta">${d>0?'+':''}${Math.round(d*10)/10} ${unit} vs inicio</div>`;
  };
  const pesA = last?.pes != null ? +last.pes : null;
  const pesF = first?.pes != null ? +first.pes : null;
  const sumA = last ? tobMedSum(last) : null;
  const sumF = first ? tobMedSum(first) : null;
  const cinA = last?.perimetres?.cintura != null ? +last.perimetres.cintura : null;
  const cinF = first?.perimetres?.cintura != null ? +first.perimetres.cintura : null;
  return {
    count: meds.length,
    pes: r1(pesA),     pesDelta: deltaHtml(pesA, pesF, 'kg'),
    sum: r1(sumA),     sumDelta: deltaHtml(sumA, sumF, 'mm'),
    cintura: r1(cinA), cinturaDelta: deltaHtml(cinA, cinF, 'cm')
  };
}

// ── Modal medición ──
function tobOpenMedicionModal(medId){
  if(!tobCurrentFichaId){ tobToast('Abre la ficha de un cliente primero', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  const meds = tobMedsSorted(cli);
  const med = medId ? (cli.mediciones||[]).find(m => m.id === medId) : null;
  const lastMed = meds[meds.length-1];
  document.getElementById('tobMedicionModalTitle').textContent = med ? 'Editar medición' : 'Nueva medición';
  document.getElementById('tobMedFecha').value = med?.fecha || new Date().toISOString().slice(0,10);
  document.getElementById('tobMedPes').value = med?.pes ?? '';
  document.getElementById('tobMedEstatura').value = med?.estatura ?? lastMed?.estatura ?? '';
  document.getElementById('tobMedNotas').value = med?.notas || '';
  document.getElementById('tobMedPlecsRow').innerHTML = TOB_MED_PLECS.map(([k,label]) =>
    `<div><label class="tob-lbl">${label}</label><input class="tob-input" type="number" step="0.1" id="tobMedPlec_${k}" value="${med?.plecs?.[k] ?? ''}" placeholder="mm"></div>`
  ).join('');
  document.getElementById('tobMedPerimRow').innerHTML = TOB_MED_PERIM.map(([k,label]) =>
    `<div><label class="tob-lbl">${label}</label><input class="tob-input" type="number" step="0.1" id="tobMedPerim_${k}" value="${med?.perimetres?.[k] ?? ''}" placeholder="cm"></div>`
  ).join('');
  document.getElementById('tobMedDelBtn').style.display = med ? '' : 'none';
  document.getElementById('tobMedicionModalBg').dataset.editId = med?.id || '';
  document.getElementById('tobMedicionModalBg').classList.add('on');
}
function tobCloseMedicionModal(){ document.getElementById('tobMedicionModalBg').classList.remove('on'); }

function tobSaveMedicion(){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli){ tobToast('Sin cliente', 'red'); return; }
  const fecha = document.getElementById('tobMedFecha').value;
  const pes = parseFloat(document.getElementById('tobMedPes').value);
  if(!fecha){ tobToast('Falta la fecha', 'red'); return; }
  if(isNaN(pes)){ tobToast('Falta el peso', 'red'); return; }
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? null : v; };
  const plecs = {}; TOB_MED_PLECS.forEach(([k]) => plecs[k] = num('tobMedPlec_'+k));
  const perimetres = {}; TOB_MED_PERIM.forEach(([k]) => perimetres[k] = num('tobMedPerim_'+k));
  const data = {
    fecha, pes,
    estatura: num('tobMedEstatura'),
    plecs, perimetres,
    notas: document.getElementById('tobMedNotas').value.trim()
  };
  if(!cli.mediciones) cli.mediciones = [];
  const editId = document.getElementById('tobMedicionModalBg').dataset.editId;
  if(editId){
    const m = cli.mediciones.find(m => m.id === editId);
    if(m) Object.assign(m, data);
  } else {
    data.id = tobUid('med');
    cli.mediciones.push(data);
  }
  tobSave();
  tobCloseMedicionModal();
  tobRenderFicha();
  tobToast('✓ Medición guardada', 'green');
}
function tobDelMedicionFromModal(){
  const editId = document.getElementById('tobMedicionModalBg').dataset.editId;
  if(editId) tobDelMedicion(editId);
}
function tobDelMedicion(medId){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  tobConfirm('¿Eliminar medición?', 'Se borra esta medición. No se puede deshacer.', () => {
    cli.mediciones = (cli.mediciones||[]).filter(m => m.id !== medId);
    tobSave();
    tobCloseMedicionModal();
    tobRenderFicha();
    tobToast('Eliminada', 'green');
  });
}

// ── Tabla + gráficas de mediciones en la ficha ──
function tobRenderFichaMediciones(cli){
  const tableCont = document.getElementById('tobFichaMedTable');
  if(!tableCont) return;
  const meds = tobMedsSorted(cli);
  if(!meds.length){
    tableCont.innerHTML = '<div style="color:var(--mute2);padding:14px;">Sin mediciones. Añade la primera con <strong>+ Añadir medición</strong>.</div>';
  } else {
    const deltaSpan = (cur, prev, dec) => {
      if(prev == null || cur == null) return '';
      const d = cur - prev;
      if(Math.abs(d) < 0.05) return '';
      const f = Math.round(d * Math.pow(10,dec)) / Math.pow(10,dec);
      return ` <span class="tob-med-d">${d>0?'+':''}${f}</span>`;
    };
    const rows = meds.map((m, i) => {
      const prev = i > 0 ? meds[i-1] : null;
      return { m, prev, sum: tobMedSum(m), prevSum: prev ? tobMedSum(prev) : null, ratios: tobMedRatios(m) };
    }).reverse().map(({m, prev, sum, prevSum, ratios}) => {
      const cintura = m.perimetres?.cintura;
      return `<tr>
        <td><strong>${tobEsc(m.fecha || '—')}</strong></td>
        <td>${m.pes ?? '—'}${deltaSpan(m.pes!=null?+m.pes:null, prev?.pes!=null?+prev.pes:null, 1)}</td>
        <td>${sum.toFixed(1)}${deltaSpan(sum, prevSum, 1)}</td>
        <td>${cintura ?? '—'}${deltaSpan(cintura!=null?+cintura:null, prev?.perimetres?.cintura!=null?+prev.perimetres.cintura:null, 1)}</td>
        <td>${ratios.cinturaCadera != null ? ratios.cinturaCadera.toFixed(2) : '—'}</td>
        <td>${ratios.plecsPes != null ? ratios.plecsPes.toFixed(2) : '—'}</td>
        <td class="actions">
          <button class="tob-action ghost" style="padding:4px 9px;" onclick="tobOpenMedicionModal('${m.id}')">✏️</button>
          <button class="tob-action danger" style="padding:4px 9px;" onclick="tobDelMedicion('${m.id}')">🗑</button>
        </td>
      </tr>`;
    }).join('');
    tableCont.innerHTML = `<table class="tob-table">
      <thead><tr>
        <th>Fecha</th><th>Peso (kg)</th><th>Σ Pliegues (mm)</th>
        <th>Cintura (cm)</th><th>Cintura/Cadera</th><th>Pliegues/Peso</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
  tobRenderMedCharts(cli);
}

// Configs Chart.js de mediciones (reutilizadas por la ficha y el PDF).
// forPdf=true → colores oscuros sobre fondo blanco.
function tobBuildMedChartConfigs(cli, forPdf){
  const meds = tobMedsSorted(cli);
  if(!meds.length) return {};
  const labels = meds.map(m => tobMedShortLabel(m.fecha));
  const ACC = '#f5a623';
  const txtCol  = forPdf ? '#444444' : '#7a96b8';
  const txtCol2 = forPdf ? '#222222' : '#cbd5e1';
  const gridCol = forPdf ? '#dddddd' : '#1e1810';
  const lineChart = (label, data, color) => ({
    type: 'line',
    data: { labels, datasets: [{
      label, data, borderColor: color, backgroundColor: color + '22',
      pointBackgroundColor: color, pointRadius: 4, pointHoverRadius: 7,
      borderWidth: 2.5, tension: 0.25, fill: true, spanGaps: true
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          color: txtCol2, font: { size: 9, weight: '700' }, align: 'top', offset: 5,
          formatter: v => (v == null ? '' : v)
        }
      },
      scales: {
        x: { ticks: { color: txtCol, font: { size: 9 }, maxRotation: 40 }, grid: { color: gridCol } },
        y: { ticks: { color: txtCol, font: { size: 9 } }, grid: { color: gridCol }, beginAtZero: false }
      }
    }
  });
  const first = meds[0], last = meds[meds.length-1];
  const cfgs = {};
  cfgs.peso  = lineChart('Peso (kg)',       meds.map(m => m.pes != null ? +m.pes : null), ACC);
  cfgs.plecs = lineChart('Σ Pliegues (mm)', meds.map(m => +tobMedSum(m).toFixed(1)), '#60a5fa');
  cfgs.cc    = lineChart('Cintura/Cadera',  meds.map(m => { const r = tobMedRatios(m).cinturaCadera; return r != null ? +r.toFixed(3) : null; }), '#3fb68b');
  cfgs.pp    = lineChart('Pliegues/Peso',   meds.map(m => { const r = tobMedRatios(m).plecsPes; return r != null ? +r.toFixed(3) : null; }), '#a78bfa');
  cfgs.perim = {
    type: 'bar',
    data: {
      labels: TOB_MED_PERIM.map(([,l]) => l),
      datasets: [
        { label: 'Inicio (' + (first.fecha||'') + ')', data: TOB_MED_PERIM.map(([k]) => first.perimetres?.[k] ?? null), backgroundColor: (forPdf ? '#cfc9b8' : '#5a524077'), borderColor: '#8a7f6a', borderWidth: 1 },
        { label: 'Actual (' + (last.fecha||'') + ')',  data: TOB_MED_PERIM.map(([k]) => last.perimetres?.[k] ?? null),  backgroundColor: ACC + (forPdf ? '' : 'cc'), borderColor: ACC, borderWidth: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { labels: { color: txtCol2, font: { size: 9 } } }, datalabels: { display: false } },
      scales: {
        x: { ticks: { color: txtCol, font: { size: 9 } }, grid: { color: gridCol }, beginAtZero: true },
        y: { ticks: { color: txtCol2, font: { size: 9 } }, grid: { color: gridCol } }
      }
    }
  };
  cfgs.radar = {
    type: 'radar',
    data: {
      labels: TOB_MED_PLECS.map(([,l]) => l),
      datasets: [
        { label: 'Inicio', data: TOB_MED_PLECS.map(([k]) => first.plecs?.[k] ?? null), borderColor: '#8a7f6a', backgroundColor: (forPdf ? 'rgba(138,127,106,.18)' : '#5a524033'), pointBackgroundColor: '#8a7f6a', borderWidth: 2 },
        { label: 'Actual', data: TOB_MED_PLECS.map(([k]) => last.plecs?.[k] ?? null),  borderColor: ACC, backgroundColor: ACC + '33', pointBackgroundColor: ACC, borderWidth: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: txtCol2, font: { size: 9 } } }, datalabels: { display: false } },
      scales: { r: {
        angleLines: { color: forPdf ? '#cccccc' : '#2a2620' },
        grid: { color: forPdf ? '#dddddd' : '#2a2620' },
        pointLabels: { color: txtCol2, font: { size: 9 } },
        ticks: { color: txtCol, backdropColor: 'transparent', font: { size: 8 } },
        beginAtZero: true
      } }
    }
  };
  return cfgs;
}

function tobRenderMedCharts(cli){
  const grid = document.getElementById('tobFichaMedCharts');
  if(!grid) return;
  const cfgs = tobBuildMedChartConfigs(cli, false);
  if(!Object.keys(cfgs).length){
    grid.innerHTML = '<div style="grid-column:1/-1;color:var(--mute2);padding:20px;text-align:center;">Sin mediciones aún.</div>';
    return;
  }
  const order = [
    ['peso',  'Peso corporal'],
    ['plecs', 'Σ Pliegues cutáneos'],
    ['perim', 'Perímetros · inicio vs actual'],
    ['radar', 'Pliegues · inicio vs actual'],
    ['cc',    'Ratio Cintura / Cadera'],
    ['pp',    'Ratio Pliegues / Peso']
  ];
  grid.innerHTML = order.map(([k,title]) => `
    <div class="tob-chart-card">
      <div class="hdr">${title}</div>
      <div class="body"><canvas id="tobMedChart_${k}"></canvas></div>
    </div>`).join('');
  if(window.ChartDataLabels && Chart.register){ try { Chart.register(ChartDataLabels); } catch(e){} }
  order.forEach(([k]) => {
    const canvas = document.getElementById('tobMedChart_' + k);
    if(!canvas || !cfgs[k]) return;
    tobFichaCharts['med_' + k] = new Chart(canvas, cfgs[k]);
  });
}

// ═══ PDF EVOLUCIÓN — informe de composición corporal ═══════════
async function tobGeneratePdfMediciones(){
  if(!tobCurrentFichaId){ tobToast('Abre la ficha del cliente', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli){ tobToast('Cliente no encontrado', 'red'); return; }
  if(!(cli.mediciones||[]).length){ tobToast('Este cliente no tiene mediciones', 'red'); return; }
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  tobToast('⏳ Generando PDF de evolución...', '');
  await tobBuildPdfMediciones(cli).catch(e => { console.error(e); tobToast('Error: ' + e.message, 'red'); });
}

async function tobBuildPdfMediciones(cli){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font  = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontO = await doc.embedFont(StandardFonts.HelveticaOblique);
  const ORANGE = rgb(0.96, 0.65, 0.13);
  const BLACK = rgb(0.06, 0.06, 0.06);
  const GRAY = rgb(0.55, 0.55, 0.55);
  const GRAY_DK = rgb(0.25, 0.25, 0.25);
  const GREEN = rgb(0.18, 0.6, 0.4);
  const RED = rgb(0.85, 0.25, 0.25);
  const W = 842, H = 595;
  const meds = tobMedsSorted(cli);
  const first = meds[0], last = meds[meds.length-1];

  // ─── COVER ───
  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: 60, height: H, color: ORANGE });
  page.drawText('FULL', { x: 100, y: H-100, size: 56, font: fontB, color: ORANGE });
  page.drawText('TRAINING', { x: 100, y: H-156, size: 56, font: fontB, color: BLACK });
  page.drawText("INFORME D'EVOLUCIO - COMPOSICIO CORPORAL", { x: 100, y: H-180, size: 12, font, color: GRAY });
  page.drawText(cli.nombre || '-', { x: 100, y: H-240, size: 32, font: fontB, color: BLACK });
  page.drawText(`Periode: ${first.fecha || '?'}  -  ${last.fecha || '?'}`, { x: 100, y: H-268, size: 13, font, color: GRAY_DK });
  const pesDelta = (last.pes != null && first.pes != null) ? (+last.pes - +first.pes) : null;
  const sumDelta = tobMedSum(last) - tobMedSum(first);
  const kpisCover = [
    ['MEDICIONS', String(meds.length), ''],
    ['PES ACTUAL', (last.pes != null ? last.pes : '-') + ' kg', pesDelta != null ? `${pesDelta>=0?'+':''}${(+pesDelta.toFixed(1))} kg` : ''],
    ['SUMA 6 PLECS', tobMedSum(last).toFixed(1) + ' mm', `${sumDelta>=0?'+':''}${sumDelta.toFixed(1)} mm`]
  ];
  const kpiW = 200, kpiH = 88, kpiGap = 16, kpiY = 165;
  kpisCover.forEach((kp, i) => {
    const x = 100 + i*(kpiW+kpiGap);
    page.drawRectangle({ x, y: kpiY, width: kpiW, height: kpiH, color: rgb(0.97,0.97,0.97) });
    page.drawRectangle({ x, y: kpiY+kpiH-4, width: kpiW, height: 4, color: ORANGE });
    page.drawText(kp[0], { x: x+14, y: kpiY+kpiH-26, size: 9, font: fontB, color: GRAY });
    page.drawText(kp[1], { x: x+14, y: kpiY+32, size: 24, font: fontB, color: BLACK });
    if(kp[2]) page.drawText(kp[2] + ' vs inici', { x: x+14, y: kpiY+14, size: 8, font, color: GRAY });
  });
  page.drawText('FULL TRAINING - BIIO System', { x: W-230, y: 40, size: 9, font: fontO, color: GRAY });

  // ─── PÁGINA EVOLUCIÓN: 4 line charts 2×2 ───
  const cfgs = tobBuildMedChartConfigs(cli, true);
  page = doc.addPage([W, H]);
  drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, "EVOLUCIO", cli.nombre || '', W, H);
  {
    const chW = 380, chH = 215, gapX = 30, gapY = 24;
    const ox = (W - (chW*2 + gapX)) / 2;
    const oy = H - 80;
    const slots = [
      ['peso',  'PES CORPORAL (kg)'],
      ['plecs', 'SUMATORI DE PLECS (mm)'],
      ['cc',    'RATIO CINTURA / MALUC'],
      ['pp',    'RATIO PLECS / PES']
    ];
    for(let i = 0; i < slots.length; i++){
      const [k, title] = slots[i];
      const col = i % 2, row = Math.floor(i / 2);
      const x = ox + col*(chW+gapX);
      const yTop = oy - row*(chH+gapY);
      page.drawText(title, { x, y: yTop + 4, size: 9, font: fontB, color: GRAY_DK });
      try {
        const png = await tobChartToPng(cfgs[k], 760, 430);
        page.drawImage(await doc.embedPng(png), { x, y: yTop - chH, width: chW, height: chH });
      } catch(e){ console.warn('chart', k, e); page.drawText('(grafica no disponible)', { x, y: yTop - chH/2, size: 9, font: fontO, color: GRAY }); }
    }
  }

  // ─── PÁGINA COMPOSICIÓN: perim bar + radar plecs ───
  page = doc.addPage([W, H]);
  drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, 'COMPOSICIO - INICI vs ACTUAL', cli.nombre || '', W, H);
  {
    const chW = 380, chH = 380, gapX = 30;
    const ox = (W - (chW*2 + gapX)) / 2;
    const yTop = H - 90;
    page.drawText('PERIMETRES (cm)', { x: ox, y: yTop + 4, size: 9, font: fontB, color: GRAY_DK });
    page.drawText('PLECS CUTANIS (mm)', { x: ox + chW + gapX, y: yTop + 4, size: 9, font: fontB, color: GRAY_DK });
    try {
      const png1 = await tobChartToPng(cfgs.perim, 700, 700);
      page.drawImage(await doc.embedPng(png1), { x: ox, y: yTop - chH, width: chW, height: chH });
    } catch(e){ console.warn(e); }
    try {
      const png2 = await tobChartToPng(cfgs.radar, 700, 700);
      page.drawImage(await doc.embedPng(png2), { x: ox + chW + gapX, y: yTop - chH, width: chW, height: chH });
    } catch(e){ console.warn(e); }
  }

  // ─── PÁGINAS DETALLE: una por medición (más reciente primero) ───
  const sexoTxt = cli.sexo === 'M' ? 'Dona' : cli.sexo === 'H' ? 'Home' : '-';
  for(let idx = meds.length - 1; idx >= 0; idx--){
    const m = meds[idx];
    const prev = idx > 0 ? meds[idx-1] : null;
    page = doc.addPage([W, H]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, 'COMPOSICIO CORPORAL', `${cli.nombre || ''}  -  ${m.fecha || ''}`, W, H);

    let yy = H - 78;
    page.drawRectangle({ x: 30, y: yy-66, width: W-60, height: 66, color: rgb(0.97,0.97,0.97) });
    page.drawRectangle({ x: 30, y: yy-4, width: W-60, height: 4, color: ORANGE });
    const edat = tobMedAge(cli, m.fecha);
    const dadesA = [['Nom', cli.nombre || '-'], ['Edat', edat != null ? String(edat) : '-'], ['Sexe', sexoTxt]];
    const pesTxt = (m.pes != null ? m.pes : '-') + (prev && m.pes!=null && prev.pes!=null ? `   (${(+m.pes - +prev.pes)>=0?'+':''}${(+(m.pes - prev.pes)).toFixed(1)})` : '');
    const dadesB = [['Pes (kg)', pesTxt], ['Estatura (cm)', m.estatura != null ? m.estatura : '-'], ['Data de medicio', m.fecha || '-']];
    dadesA.forEach((d, i) => {
      page.drawText(d[0], { x: 48, y: yy-22-i*16, size: 8, font: fontB, color: GRAY });
      page.drawText(String(d[1]), { x: 135, y: yy-22-i*16, size: 9, font, color: BLACK });
    });
    dadesB.forEach((d, i) => {
      page.drawText(d[0], { x: 440, y: yy-22-i*16, size: 8, font: fontB, color: GRAY });
      page.drawText(String(d[1]), { x: 560, y: yy-22-i*16, size: 9, font, color: BLACK });
    });

    yy -= 92;
    const tableTop = yy;
    const colW = (W - 90) / 2;
    const drawMetricTable = (x, w, title, defs, valObj, prevObj, sumRow) => {
      page.drawRectangle({ x, y: tableTop-2, width: w, height: 18, color: ORANGE });
      page.drawText(title, { x: x+10, y: tableTop+3, size: 9, font: fontB, color: BLACK });
      let ry = tableTop - 18;
      defs.forEach(([k, label], i) => {
        if(i % 2 === 1) page.drawRectangle({ x, y: ry-4, width: w, height: 15, color: rgb(0.96,0.96,0.96) });
        const cur = valObj?.[k];
        const pv  = prevObj?.[k];
        page.drawText(label, { x: x+10, y: ry, size: 8.5, font, color: GRAY_DK });
        page.drawText(cur != null ? String(cur) : '-', { x: x+w-95, y: ry, size: 9, font: fontB, color: BLACK });
        if(cur != null && pv != null){
          const d = +(cur - pv).toFixed(1);
          if(Math.abs(d) >= 0.05) page.drawText(`${d>0?'+':''}${d}`, { x: x+w-48, y: ry, size: 8, font: fontB, color: d>0?RED:GREEN });
        }
        ry -= 15;
      });
      if(sumRow){
        page.drawLine({ start:{x, y:ry+8}, end:{x:x+w, y:ry+8}, thickness: 1, color: ORANGE });
        page.drawText(sumRow[0], { x: x+10, y: ry-5, size: 9, font: fontB, color: BLACK });
        page.drawText(sumRow[1], { x: x+w-95, y: ry-5, size: 10, font: fontB, color: BLACK });
        if(sumRow[2] != null && Math.abs(sumRow[2]) >= 0.05)
          page.drawText(`${sumRow[2]>0?'+':''}${sumRow[2]}`, { x: x+w-48, y: ry-5, size: 8, font: fontB, color: sumRow[2]>0?RED:GREEN });
        ry -= 18;
      }
      return ry;
    };
    const sum = tobMedSum(m), prevSum = prev ? tobMedSum(prev) : null;
    drawMetricTable(30, colW, 'PLECS (mm)', TOB_MED_PLECS, m.plecs, prev?.plecs,
      ['Suma 6 Plecs', sum.toFixed(1), prevSum != null ? +(sum - prevSum).toFixed(1) : null]);
    drawMetricTable(30 + colW + 30, colW, 'PERIMETRES (cm)', TOB_MED_PERIM, m.perimetres, prev?.perimetres, null);

    const r = tobMedRatios(m);
    const rTxt = `Ratio Cintura/Maluc: ${r.cinturaCadera != null ? r.cinturaCadera.toFixed(2) : '-'}        Ratio Plecs/Pes: ${r.plecsPes != null ? r.plecsPes.toFixed(2) : '-'}`;
    page.drawText(rTxt, { x: 30, y: 58, size: 9, font: fontB, color: GRAY_DK });
    if(m.notas) page.drawText('Notes: ' + tobTrunc(m.notas, 120), { x: 30, y: 42, size: 8, font: fontO, color: GRAY });
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`${i+1} / ${pages.length}`, { x: W-50, y: 22, size: 8, font, color: GRAY }));

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(cli.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_evolucion_${new Date().toISOString().slice(0,10)}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  tobToast('✓ PDF de evolución descargado', 'green');
}

// ═══ PDF RESUMEN — solo la última rutina (para entregar resultados) ═══
async function tobGeneratePdfUltimaRutina(){
  if(!tobCurrentFichaId){ tobToast('Abre la ficha del cliente', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli){ tobToast('Cliente no encontrado', 'red'); return; }
  const asigs = [...(cli.asignaciones||[])].sort((a,b) => (a.fechaInicio||'').localeCompare(b.fechaInicio||''));
  const a = asigs[asigs.length-1];
  if(!a){ tobToast('Este cliente no tiene rutinas', 'red'); return; }
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  tobToast('⏳ Generando resumen de la última rutina...', '');
  await tobBuildPdfResumenRutina(cli, a, pl).catch(e => { console.error(e); tobToast('Error: ' + e.message, 'red'); });
}

async function tobGeneratePdfResumenActual(){
  const a = tobAsig(); if(!a){ tobToast('Sin rutina abierta', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  tobToast('⏳ Generando resumen de la rutina...', '');
  await tobBuildPdfResumenRutina(cli, a, pl).catch(e => { console.error(e); tobToast('Error: ' + e.message, 'red'); });
}

async function tobBuildPdfResumenRutina(cli, a, pl){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font  = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontO = await doc.embedFont(StandardFonts.HelveticaOblique);
  const ORANGE = rgb(0.96, 0.65, 0.13);
  const BLACK = rgb(0.06, 0.06, 0.06);
  const GRAY = rgb(0.55, 0.55, 0.55);
  const GRAY_DK = rgb(0.25, 0.25, 0.25);
  const W = 842, H = 595;
  const rutinaShort = (pl?.nombre || '(plantilla eliminada)').replace(/\s*-\s*(Hombre|Mujer|Unisex)\s*$/i, '');
  const stats = tobCalcAsigStats(a);

  // ─── COVER ───
  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: 50, height: H, color: ORANGE });
  const LX = 80;
  page.drawText('FULL', { x: LX, y: H-95, size: 48, font: fontB, color: ORANGE });
  page.drawText('TRAINING', { x: LX, y: H-143, size: 48, font: fontB, color: BLACK });
  page.drawText('RESUM DE LA RUTINA', { x: LX, y: H-165, size: 12, font, color: GRAY });
  page.drawText(cli?.nombre || '-', { x: LX, y: H-220, size: 30, font: fontB, color: BLACK });
  page.drawText(rutinaShort, { x: LX, y: H-246, size: 14, font, color: GRAY_DK });
  if(pl) page.drawText(`${pl.macrociclo || ''}${pl.macrociclo ? ' - ' : ''}${pl.categoria || ''}`, { x: LX, y: H-264, size: 10, font: fontO, color: GRAY });
  page.drawText(`Periode: ${a.fechaInicio || '?'}  -  ${stats.ultimaFecha || '?'}`, { x: LX, y: H-282, size: 10, font, color: GRAY_DK });

  const kpis = [
    ['SESSIONS', String(stats.sesiones)],
    ['ITERACIONS', String((a.iteraciones||[]).length)],
    ['ESTAT', (a.estado || 'en curs').replace('_',' ').toUpperCase()]
  ];
  const kpiW = 180, kpiH = 84, kpiGap = 16, kpiY = 170;
  kpis.forEach((kp, i) => {
    const x = LX + i*(kpiW+kpiGap);
    page.drawRectangle({ x, y: kpiY, width: kpiW, height: kpiH, color: rgb(0.97,0.97,0.97) });
    page.drawRectangle({ x, y: kpiY+kpiH-4, width: kpiW, height: 4, color: ORANGE });
    page.drawText(kp[0], { x: x+14, y: kpiY+kpiH-26, size: 9, font: fontB, color: GRAY });
    page.drawText(kp[1], { x: x+14, y: kpiY+28, size: kp[1].length > 9 ? 15 : 28, font: fontB, color: BLACK });
  });

  const prs = Object.entries(stats.maxByEj).slice(0, 6);
  if(prs.length){
    page.drawText('RECORDS DE LA RUTINA', { x: W-330, y: H-95, size: 10, font: fontB, color: ORANGE });
    prs.forEach((pr, i) => {
      const py = H-118 - i*20;
      page.drawText(tobTrunc(pr[0], 26), { x: W-330, y: py, size: 9, font, color: GRAY_DK });
      page.drawText(`${pr[1]} kg`, { x: W-115, y: py, size: 10, font: fontB, color: BLACK });
    });
  }
  page.drawText('FULL TRAINING - BIIO System', { x: LX, y: 40, size: 9, font: fontO, color: GRAY });

  // ─── GRÁFICAS — volumen por ejercicio (una línea por iteración) ───
  const mainEjs = [];
  (a.rutina?.entrenos||[]).forEach(en => {
    (en.ejercicios||[]).forEach(ej => { if(ej.tipo !== 'circuito') mainEjs.push({ ej, entId: en.id }); });
  });
  const chartItems = [];
  mainEjs.forEach(({ ej, entId }) => {
    const cfg = tobBuildEjChartConfig(a, ej, entId);
    if(cfg){
      cfg.options.responsive = false;
      cfg.options.plugins.legend = { display: true, labels: { color: '#444444', font: { size: 9 }, boxWidth: 14 } };
      chartItems.push({ name: ej.nombre, cfg });
    }
  });

  if(!chartItems.length){
    page = doc.addPage([W, H]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, 'PROGRES PER EXERCICI', rutinaShort, W, H);
    page.drawText('Encara no hi ha sessions amb dades registrades en aquesta rutina.', { x: 30, y: H-90, size: 11, font: fontO, color: GRAY });
  } else {
    const perPage = 4, chW = 380, chH = 215, gapX = 30, gapY = 26;
    for(let p = 0; p < chartItems.length; p += perPage){
      page = doc.addPage([W, H]);
      drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY,
        p === 0 ? 'PROGRES PER EXERCICI - VOLUM (kg x reps)' : 'PROGRES PER EXERCICI (cont.)', rutinaShort, W, H);
      const slice = chartItems.slice(p, p+perPage);
      const ox = (W - (chW*2 + gapX)) / 2;
      const oy = H - 78;
      for(let i = 0; i < slice.length; i++){
        const col = i % 2, row = Math.floor(i / 2);
        const x = ox + col*(chW+gapX);
        const yTop = oy - row*(chH+gapY);
        page.drawText(slice[i].name.toUpperCase(), { x, y: yTop + 4, size: 9, font: fontB, color: GRAY_DK });
        try {
          const png = await tobChartToPng(slice[i].cfg, 760, 430);
          page.drawImage(await doc.embedPng(png), { x, y: yTop - chH, width: chW, height: chH });
        } catch(e){ console.warn('chart', slice[i].name, e); page.drawText('(grafica no disponible)', { x, y: yTop - chH/2, size: 9, font: fontO, color: GRAY }); }
      }
    }
  }

  if(a.notas){
    page = doc.addPage([W, H]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, 'NOTES DE LENTRENADOR', rutinaShort, W, H);
    let ny = H - 90;
    tobWrapText(a.notas, font, 11, W-80).forEach(l => { page.drawText(l, { x: 40, y: ny, size: 11, font, color: GRAY_DK }); ny -= 16; });
  }

  const pages = doc.getPages();
  pages.forEach((pg, i) => pg.drawText(`${i+1} / ${pages.length}`, { x: W-50, y: 22, size: 8, font, color: GRAY }));

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(cli?.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_resumen_${rutinaShort.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  tobToast('✓ Resumen de la rutina descargado', 'green');
}

// ═════════════════════════════════════════════════════════════════
// PDF BONITO — rutina completada actual + histórico
// ═════════════════════════════════════════════════════════════════

// Render Chart.js a PNG Uint8Array. Usa doble requestAnimationFrame para
// garantizar que Chart.js complete layout antes de toBase64Image.
// Importante: usar spread (no JSON.stringify) para preservar funciones
// (formatter de datalabels, callbacks, etc).
function tobChartToPng(config, w, h){
  return new Promise((resolve, reject) => {
    if(!window.Chart){ reject(new Error('Chart.js no cargado')); return; }
    const canvas = document.createElement('canvas');
    canvas.width = w || 800; canvas.height = h || 380;
    canvas.style.position = 'fixed'; canvas.style.left = '-9999px'; canvas.style.top = '0';
    document.body.appendChild(canvas);
    let chart = null, settled = false;
    const cleanup = () => {
      if(chart) try { chart.destroy(); } catch(_){}
      canvas.remove();
    };
    const capture = () => {
      if(settled) return;
      settled = true;
      try {
        const dataUrl = chart.toBase64Image('image/png', 1.0);
        if(!dataUrl || !dataUrl.startsWith('data:image/png')){
          throw new Error('Chart no produjo PNG válido');
        }
        const base64 = dataUrl.split(',')[1] || '';
        if(!base64) throw new Error('Base64 vacío');
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for(let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
        cleanup();
        resolve(bytes);
      } catch(e){ cleanup(); reject(e); }
    };
    try {
      // Shallow override de options sin perder funciones (formatter, callbacks)
      const cfg = {
        ...config,
        options: {
          ...(config.options || {}),
          animation: false,
          responsive: false,
          maintainAspectRatio: false
        }
      };
      chart = new Chart(canvas, cfg);
      // Esperar a que Chart.js complete el layout. rAF doble es lo ideal, pero
      // si está limitado (pestaña en segundo plano) caemos a setTimeout para
      // que el PDF nunca se quede colgado. El primero que dispare, captura.
      requestAnimationFrame(() => requestAnimationFrame(capture));
      setTimeout(capture, 150);
    } catch(e){ cleanup(); reject(e); }
  });
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
  const form = doc.getForm();   // ← PDF EDITABLE
  const ORANGE = rgb(0.96, 0.65, 0.13);
  const BLACK = rgb(0.06, 0.06, 0.06);
  const GRAY = rgb(0.55, 0.55, 0.55);
  const GRAY_DK = rgb(0.25, 0.25, 0.25);
  const GRAY_MD = rgb(0.4, 0.4, 0.4);

  const W_L = 842, H_L = 595;  // landscape

  // Nombre rutina sin sufijo "— Hombre"/"— Mujer"
  const rutinaShort = (pl?.nombre || '').replace(/\s*—\s*(Hombre|Mujer|Unisex)\s*$/i, '');

  // ─── PÁGINA 1: COVER en 2 columnas ─────
  // Izquierda: logo + cliente + rutina + KPI. Derecha: descripción completa.
  let page = doc.addPage([W_L, H_L]);
  page.drawRectangle({ x: 0, y: 0, width: 50, height: H_L, color: ORANGE });

  // ── Columna izquierda ──
  const LX = 80;
  page.drawText('FULL', { x: LX, y: H_L - 95, size: 48, font: fontB, color: ORANGE });
  page.drawText('TRAINING', { x: LX, y: H_L - 143, size: 48, font: fontB, color: BLACK });
  page.drawText((pl?.categoria || '').toUpperCase(), { x: LX, y: H_L - 165, size: 12, font, color: GRAY });

  page.drawText(cli?.nombre || '—', { x: LX, y: H_L - 230, size: 30, font: fontB, color: BLACK });
  page.drawText(rutinaShort, { x: LX, y: H_L - 256, size: 14, font, color: GRAY_DK });
  page.drawText(`Iteración ${it?.numero || 1}  ·  Inicio: ${a.fechaInicio || ''}`, { x: LX, y: H_L - 274, size: 10, font: fontO, color: GRAY });

  // KPI sesiones
  const statsIt = tobCalcItStats(a, it);
  const kpiX = LX, kpiY = 180, kpiW = 230, kpiH = 100;
  page.drawRectangle({ x: kpiX, y: kpiY, width: kpiW, height: kpiH, color: rgb(0.97,0.97,0.97) });
  page.drawRectangle({ x: kpiX, y: kpiY + kpiH - 4, width: kpiW, height: 4, color: ORANGE });
  page.drawText('SESIONES REGISTRADAS', { x: kpiX+16, y: kpiY+kpiH-28, size: 10, font: fontB, color: GRAY });
  page.drawText(String(statsIt.sesiones), { x: kpiX+16, y: kpiY+30, size: 40, font: fontB, color: BLACK });
  page.drawText(`de 12 (6 microciclos × 2 entrenos)`, { x: kpiX+16, y: kpiY+16, size: 8, font, color: GRAY });

  page.drawText('FULL TRAINING · BIIO System', { x: LX, y: 40, size: 9, font: fontO, color: GRAY });

  // ── Columna derecha: descripción ──
  if(pl?.descripcion){
    const RX = 360;
    const rightW = W_L - RX - 50;
    page.drawRectangle({ x: RX - 20, y: 50, width: 1.5, height: H_L - 130, color: rgb(0.88,0.88,0.88) });
    page.drawText('LA RUTINA', { x: RX, y: H_L - 70, size: 16, font: fontB, color: ORANGE });
    let dy = H_L - 100;
    dy = tobRenderDescription(page, pl.descripcion, RX, dy, rightW, font, fontB, ORANGE, GRAY_DK, rgb);
  }

  // ─── PÁGINAS DETALLE POR ENTRENO (con FORM FIELDS editables) ───
  (a.rutina?.entrenos||[]).forEach(en => {
    page = doc.addPage([W_L, H_L]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, `ENTRENAMIENTO ${en.letra}${en.nombre && en.nombre !== ('Entreno '+en.letra) ? ' — ' + en.nombre : ''}`, rutinaShort, W_L, H_L);
    let y = H_L - 90;

    const microHeaders = Array.from({length:TOB_NUM_MICRO}, (_,i)=>i+1);
    const colW = 105;
    const startX = 110;
    const tableRight = startX + colW * TOB_NUM_MICRO;

    // Fila Fecha (form field editable)
    page.drawText('Fecha', { x: 30, y, size: 9, font: fontB, color: GRAY_DK });
    microHeaders.forEach((mn, i) => {
      const cellX = startX + i*colW;
      const ses = it?.sesiones[mn]?.[en.id];
      const tf = form.createTextField(`fecha_${en.id}_${mn}`);
      if(ses?.fecha) tf.setText(ses.fecha);
      tf.addToPage(page, { x: cellX, y: y-4, width: colW-4, height: 16, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
    });
    y -= 24;

    // Fila Microciclo
    page.drawText('Microciclo', { x: 30, y, size: 9, font: fontB, color: GRAY_DK });
    microHeaders.forEach((mn, i) => {
      const cellX = startX + i*colW;
      page.drawText(`${mn}º`, { x: cellX+5, y, size: 11, font: fontB, color: ORANGE });
    });
    y -= 16;

    // Líneas separadoras verticales entre microciclos
    const drawVertSeparators = (yTop, yBottom) => {
      for(let i=0; i<=TOB_NUM_MICRO; i++){
        const lx = startX + i*colW - 2;
        page.drawLine({ start:{x:lx, y:yTop}, end:{x:lx, y:yBottom}, thickness:0.5, color: rgb(0.85,0.85,0.85) });
      }
    };
    const separatorTop = y + 6;

    page.drawLine({ start:{x:30, y:y+4}, end:{x:tableRight, y:y+4}, thickness:1.2, color: ORANGE });
    y -= 8;

    const blockTop = y + 6;

    // Ejercicios
    (en.ejercicios||[]).sort((x,y)=>(x.orden||0)-(y.orden||0)).forEach(ej => {
      if(y < 80){
        page = doc.addPage([W_L, H_L]);
        drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, `ENTRENAMIENTO ${en.letra} (cont.)`, rutinaShort, W_L, H_L);
        y = H_L - 90;
      }
      // Header ejercicio
      page.drawRectangle({ x: 24, y: y-5, width: W_L-48, height: 22, color: rgb(0.08,0.08,0.08) });
      page.drawText(ej.nombre.toUpperCase(), { x: 30, y: y+2, size: 11, font: fontB, color: ORANGE });
      if(ej.subtitle){
        const nameWidth = tobTextWidth(ej.nombre.toUpperCase(), 11, fontB);
        page.drawText('· ' + ej.subtitle, { x: 30 + nameWidth + 10, y: y+3, size: 8, font: fontO, color: rgb(0.85,0.85,0.85) });
      }
      // Plan info en la derecha del header (mejor que línea "Plan" aparte)
      const planTxt = microHeaders.map(mn => {
        const p = tobPlanFor(ej, mn);
        const reps = Array.isArray(p.repsTarget) ? p.repsTarget.join('/') : p.repsTarget;
        return `${mn}º: ${p.series}×${reps}`;
      }).join('  ·  ');
      // Esto puede ser muy largo, lo omitimos del header y lo dejamos solo en la fila Plan abajo (compacta)
      y -= 24;

      // Fila plan (compacta, sin texto "Plan" — la celda misma es la info)
      microHeaders.forEach((mn, i) => {
        const plan = tobPlanFor(ej, mn);
        const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
        page.drawRectangle({ x: startX + i*colW - 1, y: y-3, width: colW-3, height: 13, color: rgb(0.97,0.94,0.85) });
        page.drawText(`${plan.series} × ${reps}`, { x: startX + i*colW + 5, y, size: 9, font: fontB, color: rgb(0.6,0.4,0.05) });
      });
      y -= 16;

      // Cabecera Kg/Reps por columna
      page.drawText('Series', { x: 30, y, size: 7, font: fontB, color: GRAY_MD });
      microHeaders.forEach((mn, i) => {
        const cellX = startX + i*colW;
        page.drawText('Kg', { x: cellX+8, y, size: 7, font: fontB, color: GRAY_MD });
        page.drawText('Reps', { x: cellX+55, y, size: 7, font: fontB, color: GRAY_MD });
      });
      y -= 10;

      // Series con form fields editables
      const isCirc = ej.tipo === 'circuito';
      const linesN = isCirc ? (ej.circuitoLineas?.length || 3) : Math.max(...microHeaders.map(mn => tobPlanFor(ej, mn).series));
      const arrName = isCirc ? 'lineas' : 'series';

      for(let s = 0; s < linesN; s++){
        const lbl = isCirc ? (ej.circuitoLineas?.[s] || `${s+1}º`) : `${s+1}ª Serie`;
        page.drawText(lbl.length > 18 ? lbl.slice(0,16)+'…' : lbl, { x: 30, y, size: 8, font: fontB, color: GRAY_DK });
        microHeaders.forEach((mn, i) => {
          const cellX = startX + i*colW;
          const ses = it?.sesiones[mn]?.[en.id];
          const sr = ses?.ejs?.[ej.id]?.[arrName]?.[s];
          // Cuadrito kg
          const kgF = form.createTextField(`ej_${ej.id}_${mn}_${en.id}_${arrName}_${s}_kg`);
          if(sr?.kg != null) kgF.setText(String(sr.kg));
          kgF.addToPage(page, { x: cellX+3, y: y-3, width: 44, height: 12, borderColor: rgb(0.55,0.55,0.55), borderWidth: 0.7 });
          // Cuadrito reps
          const rpF = form.createTextField(`ej_${ej.id}_${mn}_${en.id}_${arrName}_${s}_reps`);
          if(sr?.reps != null) rpF.setText(String(sr.reps));
          rpF.addToPage(page, { x: cellX+50, y: y-3, width: 44, height: 12, borderColor: rgb(0.55,0.55,0.55), borderWidth: 0.7 });
        });
        y -= 16;
      }

      // Pausa (color visible, NO gris claro)
      page.drawText('Descanso', { x: 30, y, size: 8, font: fontB, color: rgb(0.6,0.4,0.05) });
      microHeaders.forEach((mn, i) => {
        const plan = tobPlanFor(ej, mn);
        page.drawText(plan.pausa || '—', { x: startX + i*colW + 5, y, size: 8, font: fontB, color: BLACK });
      });
      y -= 18;

      // Línea separadora entre ejercicios
      page.drawLine({ start:{x:24, y:y+4}, end:{x:W_L-24, y:y+4}, thickness:0.3, color: rgb(0.8,0.8,0.8) });
      y -= 4;
    });

    // Separadores verticales entre microciclos (cubren toda la tabla del entreno)
    drawVertSeparators(blockTop, y + 12);

    // Aeróbica con form fields
    if(y > 40){
      ['Tipo', 'Tiempo', 'Intensidad'].forEach((label, fi) => {
        if(y < 30) return;
        page.drawText(fi === 0 ? 'Aeróbica · ' + label : '         · ' + label, { x: 30, y, size: 8, font: fontB, color: GRAY_DK });
        const field = ['tipo','tiempo','intensidad'][fi];
        microHeaders.forEach((mn, i) => {
          const cellX = startX + i*colW;
          const ses = it?.sesiones[mn]?.[en.id];
          const tf = form.createTextField(`aer_${en.id}_${mn}_${field}`);
          if(ses?.aerobica?.[field]) tf.setText(String(ses.aerobica[field]));
          tf.addToPage(page, { x: cellX+3, y: y-3, width: colW-7, height: 11, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
        });
        y -= 13;
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

// Trunca texto con elipsis para que quepa
function tobTrunc(s, max){
  const str = String(s||'');
  return str.length > max ? str.slice(0, max-1) + '…' : str;
}

// Renderiza una descripción multi-párrafo en el PDF. Respeta los \n del texto.
// Detecta encabezados tipo "OBJETIVO:" y los pinta en naranja negrita.
// Devuelve la coordenada Y final (por si quieres seguir dibujando debajo).
function tobRenderDescription(page, text, x, yStart, maxW, font, fontB, ORANGE, GRAY_DK, rgb){
  let dy = yStart;
  const size = 8.5;
  const lineH = 11;
  String(text||'').split('\n').forEach(para => {
    const t = para.trim();
    if(t === ''){ dy -= 5; return; }
    // ¿Empieza con "ENCABEZADO:" en mayúsculas?
    const hm = t.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{2,}):\s*(.*)$/);
    if(hm){
      const headerTxt = hm[1] + ': ';
      const headerW = tobTextWidth(headerTxt, size, fontB);
      page.drawText(hm[1] + ':', { x, y: dy, size, font: fontB, color: ORANGE });
      const rest = hm[2] || '';
      if(rest){
        // Wrap del resto: primera línea empieza tras el header
        const words = rest.split(/\s+/);
        let line = '', isFirst = true;
        const flush = () => {
          page.drawText(line, { x: isFirst ? x + headerW : x, y: dy, size, font, color: GRAY_DK });
          dy -= lineH; isFirst = false; line = '';
        };
        words.forEach(w => {
          const test = line ? line + ' ' + w : w;
          const avail = isFirst ? (maxW - headerW) : maxW;
          if(tobTextWidth(test, size, font) <= avail){ line = test; }
          else { flush(); line = w; }
        });
        if(line) flush();
      } else {
        dy -= lineH;
      }
    } else {
      // Párrafo normal o sub-item (·)
      const indent = t.startsWith('·') ? 8 : 0;
      const wrapped = tobWrapText(t, font, size, maxW - indent);
      wrapped.forEach(l => {
        page.drawText(l, { x: x + indent, y: dy, size, font, color: GRAY_DK });
        dy -= lineH;
      });
    }
    dy -= 3;
  });
  return dy;
}

// Wrap text en líneas que quepan en un ancho dado
function tobWrapText(text, fontObj, size, maxWidth){
  const words = String(text||'').split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach(w => {
    const test = current ? current + ' ' + w : w;
    if(tobTextWidth(test, size, fontObj) <= maxWidth){
      current = test;
    } else {
      if(current) lines.push(current);
      current = w;
    }
  });
  if(current) lines.push(current);
  return lines;
}

// Helper: dibuja banda superior naranja + título + cliente
function drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, title, subtitle, W, H){
  const { rgb } = PDFLib;   // PDFLib es global desde el CDN
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

  // ─── COVER (sin tonelaje/completadas/generado) ────
  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: 60, height: H, color: ORANGE });
  page.drawText('FULL', { x: 100, y: H-100, size: 56, font: fontB, color: ORANGE });
  page.drawText('TRAINING', { x: 100, y: H-156, size: 56, font: fontB, color: BLACK });
  page.drawText('HISTÓRICO COMPLETO', { x: 100, y: H-180, size: 13, font, color: GRAY });
  page.drawText(cli.nombre || '—', { x: 100, y: H-240, size: 32, font: fontB, color: BLACK });
  const periodo = tobCalcPeriodo(cli);
  page.drawText(`Período: ${periodo.desde}  —  ${periodo.hasta}`, { x: 100, y: H-268, size: 13, font, color: GRAY_DK });

  // Solo 2 KPIs: Rutinas + Sesiones
  const kpisCover = [
    ['RUTINAS REGISTRADAS', String((cli.asignaciones||[]).length), ''],
    ['SESIONES TOTALES',    String(tobCountSesiones(cli)),         '']
  ];
  const kpiW = 220, kpiH = 90, kpiGap = 20, kpiY = 180;
  kpisCover.forEach((kp, i) => {
    const x = 100 + i*(kpiW+kpiGap);
    page.drawRectangle({ x, y: kpiY, width: kpiW, height: kpiH, color: rgb(0.97,0.97,0.97) });
    page.drawRectangle({ x, y: kpiY+kpiH-4, width: kpiW, height: 4, color: ORANGE });
    page.drawText(kp[0], { x: x+14, y: kpiY+kpiH-28, size: 10, font: fontB, color: GRAY });
    page.drawText(kp[1], { x: x+14, y: kpiY+28, size: 36, font: fontB, color: BLACK });
  });
  page.drawText('FULL TRAINING · BIIO System', { x: W-240, y: 40, size: 9, font: fontO, color: GRAY });

  // ─── PR CARDS con contexto (rutina donde se hizo el PR y delta vs inicio) ─
  page = doc.addPage([W, H]);
  drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, 'RÉCORDS PERSONALES', cli.nombre || '', W, H);
  page.drawText('PR máximo alcanzado por ejercicio · comparado con la primera rutina del histórico',
    { x: 30, y: H - 70, size: 9, font: fontO, color: GRAY });
  const fichaData = tobBuildFichaData(cli);
  const cardW = 240, cardH = 150, gap = 20;
  const totalW = 3*cardW + 2*gap;
  const startX = (W - totalW) / 2;
  const startY = H - 100;
  let cardIdx = 0;
  fichaData.ejNames.slice(0, 6).forEach(name => {
    const points = (fichaData.ejHistory[name]||[]).slice().sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));
    if(!points.length) return;
    const col = cardIdx % 3;
    const row = Math.floor(cardIdx / 3);
    const x = startX + col * (cardW + gap);
    const yy = startY - row * (cardH + gap);
    const firstPoint = points[0];
    const lastPoint = points[points.length-1];
    const maxIdx = points.reduce((iMax, p, i) => p.kg > points[iMax].kg ? i : iMax, 0);
    const maxPoint = points[maxIdx];
    const deltaKg = lastPoint.kg - firstPoint.kg;
    const deltaPct = firstPoint.kg > 0 ? (deltaKg / firstPoint.kg * 100) : 0;
    // Caja
    page.drawRectangle({ x, y: yy - cardH, width: cardW, height: cardH, color: rgb(0.98,0.98,0.98) });
    page.drawRectangle({ x, y: yy - 5, width: cardW, height: 5, color: ORANGE });
    // Nombre ejercicio
    page.drawText(name.toUpperCase(), { x: x + 14, y: yy - 26, size: 9, font: fontB, color: rgb(0.4,0.3,0.1) });
    // Número grande
    page.drawText(`${maxPoint.kg}`, { x: x + 14, y: yy - 72, size: 36, font: fontB, color: BLACK });
    page.drawText('kg PR', { x: x + 14 + tobTextWidth(`${maxPoint.kg}`, 36, fontB) + 6, y: yy - 62, size: 11, font, color: GRAY });
    // Contexto: en qué rutina se hizo el PR
    page.drawText(`en ${tobTrunc(maxPoint.asigLabel, 28)}`,
      { x: x + 14, y: yy - 90, size: 8, font: fontO, color: GRAY_DK });
    // Delta vs primera rutina
    const deltaColor = deltaKg > 0 ? rgb(0.18, 0.6, 0.4) : deltaKg < 0 ? rgb(0.85, 0.25, 0.25) : GRAY;
    const arrow = deltaKg > 0 ? '+' : deltaKg < 0 ? '-' : '=';
    page.drawText(`${arrow} ${deltaKg>=0?'+':''}${(+deltaKg.toFixed(1))} kg  (${deltaPct>=0?'+':''}${deltaPct.toFixed(0)}%)`,
      { x: x + 14, y: yy - 110, size: 9, font: fontB, color: deltaColor });
    page.drawText(`vs ${tobTrunc(firstPoint.asigLabel, 22)} (${firstPoint.kg} kg)`,
      { x: x + 14, y: yy - 124, size: 7, font, color: GRAY });
    // Última fecha
    page.drawText(`Última: ${lastPoint.fecha || '—'}`,
      { x: x + 14, y: yy - 138, size: 7, font, color: GRAY });
    cardIdx++;
  });

  // (Tabla comparativa eliminada — la info está en las PR cards y el historial visual)

  // ─── RESUMEN POR RUTINA — más visual y útil ──
  page = doc.addPage([W, H]);
  drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, 'HISTORIAL DE RUTINAS', cli.nombre || '', W, H);
  page.drawText('Línea de tiempo cronológica · cada rutina con sus PRs principales',
    { x: 30, y: H - 70, size: 9, font: fontO, color: GRAY });
  y = H - 90;
  const sorted = [...cli.asignaciones].sort((a,b) => (a.fechaInicio||'').localeCompare(b.fechaInicio||''));

  sorted.forEach((a, i) => {
    if(y < 95){
      page = doc.addPage([W, H]);
      drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, 'HISTORIAL DE RUTINAS (cont.)', cli.nombre||'', W, H);
      y = H - 90;
    }
    const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
    const stats = tobCalcAsigStats(a);
    const itN = (a.iteraciones||[]).length;
    const rutinaShort = (pl?.nombre || '(plantilla eliminada)').replace(/\s*—\s*(Hombre|Mujer|Unisex)\s*$/i, '');
    const cardH = 80;

    // Caja
    page.drawRectangle({ x: 24, y: y-cardH, width: W-48, height: cardH, color: rgb(0.98,0.98,0.98) });
    // Barra lateral coloreada por estado
    const sideColor = a.estado === 'completada' ? rgb(0.18,0.6,0.4)
                   : a.estado === 'repetir' ? rgb(0.9,0.5,0.2)
                   : ORANGE;
    page.drawRectangle({ x: 24, y: y-cardH, width: 5, height: cardH, color: sideColor });

    // Nº de rutina (índice)
    page.drawText(String(i+1).padStart(2,'0'), { x: 40, y: y-30, size: 22, font: fontB, color: rgb(0.85,0.85,0.85) });

    // Datos rutina
    page.drawText(rutinaShort, { x: 80, y: y-22, size: 12, font: fontB, color: BLACK });
    if(pl){
      page.drawText(`${pl.macrociclo || ''}${pl.macrociclo ? ' · ' : ''}${pl.categoria || ''}`,
        { x: 80, y: y-36, size: 8, font: fontO, color: GRAY });
    }
    const dates = `${a.fechaInicio || '?'}  —  ${stats.ultimaFecha || '?'}`;
    page.drawText(dates, { x: 80, y: y-52, size: 9, font, color: GRAY_DK });
    // Badge estado
    const estLbl = (a.estado || 'en curso').toUpperCase();
    page.drawText(estLbl, { x: 80, y: y-66, size: 8, font: fontB, color: sideColor });

    // Stats medio: sesiones + iteraciones
    const midX = 360;
    page.drawText('Sesiones', { x: midX, y: y-20, size: 7, font, color: GRAY });
    page.drawText(String(stats.sesiones), { x: midX, y: y-38, size: 18, font: fontB, color: BLACK });
    page.drawText('Iteraciones', { x: midX + 80, y: y-20, size: 7, font, color: GRAY });
    page.drawText(String(itN), { x: midX + 80, y: y-38, size: 18, font: fontB, color: BLACK });

    // PRs top 3 de esa rutina
    const prsArr = Object.entries(stats.maxByEj).slice(0, 3);
    if(prsArr.length){
      page.drawText('PRS DE LA RUTINA', { x: W - 280, y: y-20, size: 7, font: fontB, color: ORANGE });
      prsArr.forEach((pr, j) => {
        const px = W - 280, py = y - 36 - j*14;
        const ejAbbr = (pr[0].length > 18 ? pr[0].slice(0,17)+'…' : pr[0]);
        page.drawText(ejAbbr, { x: px, y: py, size: 9, font, color: GRAY_DK });
        page.drawText(`${pr[1]} kg`, { x: px + 165, y: py, size: 9, font: fontB, color: BLACK });
      });
    }
    y -= (cardH + 10);
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

// ═══════════════════════════════════════════════════════════════
// EDITOR INLINE DE EJERCICIO — preserva ID (no rompe sesiones)
// Funciona en dos contextos: asignación (rutina del cliente) o plantilla.
// ═══════════════════════════════════════════════════════════════
let _tobEditingEj = null;   // { context, plantillaId?, entrenoId, ejId, isNew }

function tobOpenEjEditor(entrenoId, ejId){
  // Contexto: asignación
  const a = tobAsig(); if(!a) return;
  const en = a.rutina.entrenos.find(e => e.id === entrenoId); if(!en) return;
  let ej = ejId ? en.ejercicios.find(x => x.id === ejId) : null;
  _tobEditingEj = { context: 'asig', entrenoId, ejId: ej?.id || null, isNew: !ej };
  _tobFillEjEditorForm(ej, en);
}

function tobOpenEjEditorPlantilla(plantillaId, entrenoId, ejId){
  // Contexto: plantilla
  const pl = tobDB.plantillas.find(p => p.id === plantillaId); if(!pl) return;
  const en = pl.entrenos.find(e => e.id === entrenoId); if(!en) return;
  let ej = ejId ? en.ejercicios.find(x => x.id === ejId) : null;
  _tobEditingEj = { context: 'plantilla', plantillaId, entrenoId, ejId: ej?.id || null, isNew: !ej };
  _tobFillEjEditorForm(ej, en);
}

function _tobFillEjEditorForm(ej, en){
  document.getElementById('tobEjEditorTitle').textContent = ej ? `Editar: ${ej.nombre}` : `Añadir ejercicio a Entreno ${en.letra}`;
  document.getElementById('tobEjEditName').value = ej?.nombre || '';
  document.getElementById('tobEjEditTipo').value = ej?.tipo || 'normal';
  document.getElementById('tobEjEditSub').value = ej?.subtitle || '';
  const plan = ej ? tobPlanFor(ej, 1) : { series: 3, repsTarget: [10], pausa: '' };
  document.getElementById('tobEjEditSeries').value = plan.series || 3;
  document.getElementById('tobEjEditReps').value = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : (plan.repsTarget || '');
  document.getElementById('tobEjEditPausa').value = plan.pausa || '';
  document.getElementById('tobEjEditCircLineas').value = (ej?.circuitoLineas || []).join('\n');
  tobEjEditorTipoChange();
  document.getElementById('tobEjEditorBg').classList.add('on');
}

function tobCloseEjEditor(){
  _tobEditingEj = null;
  document.getElementById('tobEjEditorBg').classList.remove('on');
}

function tobEjEditorTipoChange(){
  const tipo = document.getElementById('tobEjEditTipo').value;
  document.getElementById('tobEjEditCircWrap').style.display = (tipo === 'circuito') ? '' : 'none';
}

// Obtiene el entreno actual según contexto (asig | plantilla)
function _tobGetEditingEntreno(){
  if(!_tobEditingEj) return null;
  if(_tobEditingEj.context === 'plantilla'){
    const pl = tobDB.plantillas.find(p => p.id === _tobEditingEj.plantillaId);
    return pl?.entrenos.find(e => e.id === _tobEditingEj.entrenoId);
  }
  const a = tobAsig();
  return a?.rutina.entrenos.find(e => e.id === _tobEditingEj.entrenoId);
}

function tobSaveEj(){
  if(!_tobEditingEj) return;
  const en = _tobGetEditingEntreno();
  if(!en){ tobToast('Entreno no encontrado', 'red'); return; }
  const nombre = document.getElementById('tobEjEditName').value.trim();
  if(!nombre){ tobToast('Falta el nombre', 'red'); return; }
  const tipo = document.getElementById('tobEjEditTipo').value;
  const subtitle = document.getElementById('tobEjEditSub').value.trim();
  const series = parseInt(document.getElementById('tobEjEditSeries').value) || 3;
  const repsRaw = document.getElementById('tobEjEditReps').value.trim();
  const repsTarget = repsRaw.split('/').map(s => s.trim()).filter(Boolean);
  const pausa = document.getElementById('tobEjEditPausa').value.trim();
  const circLineas = tipo === 'circuito'
    ? document.getElementById('tobEjEditCircLineas').value.split('\n').map(s => s.trim()).filter(Boolean)
    : null;

  const planByMicro = {};
  for(let mn=1; mn<=TOB_NUM_MICRO; mn++){
    planByMicro[mn] = { series, repsTarget, pausa };
  }

  if(_tobEditingEj.isNew){
    en.ejercicios.push({
      id: tobUid('ej'),
      orden: en.ejercicios.length,
      nombre, subtitle, tipo,
      circuitoLineas: circLineas || undefined,
      planByMicro
    });
    tobToast('✓ Ejercicio añadido', 'green');
  } else {
    const ej = en.ejercicios.find(x => x.id === _tobEditingEj.ejId); if(!ej) return;
    ej.nombre = nombre;
    ej.subtitle = subtitle;
    ej.tipo = tipo;
    if(tipo === 'circuito') ej.circuitoLineas = circLineas; else delete ej.circuitoLineas;
    ej.planByMicro = planByMicro;
    delete ej.planBase;
    tobToast('✓ Ejercicio actualizado', 'green');
  }
  tobSave();
  const ctx = _tobEditingEj.context;
  const plId = _tobEditingEj.plantillaId;
  tobCloseEjEditor();
  // Re-render según contexto
  if(ctx === 'plantilla'){
    const pl = tobDB.plantillas.find(p => p.id === plId);
    if(pl){ tobRenderPlEjList(pl); }
    tobRenderPlantillas();
  } else {
    tobRenderEntreno(); tobRenderCharts();
  }
}

function tobDeleteCurrentEj(){
  if(!_tobEditingEj || _tobEditingEj.isNew){ tobCloseEjEditor(); return; }
  const en = _tobGetEditingEntreno();
  if(!en){ tobCloseEjEditor(); return; }
  const ej = en.ejercicios.find(x => x.id === _tobEditingEj.ejId); if(!ej) return;
  const ctxNote = _tobEditingEj.context === 'plantilla'
    ? '\n\nEsto solo afecta a la plantilla. Las asignaciones ya creadas con esta plantilla NO se ven afectadas (tienen su propia copia).'
    : '\n\nNota: los datos registrados en sesiones se mantienen en el archivo pero ya no se mostrarán.';
  if(!confirm(`¿Eliminar "${ej.nombre}"?${ctxNote}`)){ return; }
  en.ejercicios = en.ejercicios.filter(x => x.id !== ej.id);
  en.ejercicios.forEach((x, i) => x.orden = i);
  tobSave();
  const ctx = _tobEditingEj.context;
  const plId = _tobEditingEj.plantillaId;
  tobCloseEjEditor();
  if(ctx === 'plantilla'){
    const pl = tobDB.plantillas.find(p => p.id === plId);
    if(pl){ tobRenderPlEjList(pl); }
    tobRenderPlantillas();
  } else {
    tobRenderEntreno(); tobRenderCharts();
  }
  tobToast('Ejercicio eliminado', 'green');
}

function tobAddEjToEntreno(entrenoId){
  tobOpenEjEditor(entrenoId, null);
}

function tobAddEjToPlantilla(plantillaId, entrenoId){
  tobOpenEjEditorPlantilla(plantillaId, entrenoId, null);
}

// Render lista de ejercicios dentro del modal de plantilla
function tobRenderPlEjList(pl){
  const cont = document.getElementById('tobPlEjList');
  if(!cont) return;
  if(!pl || !pl.entrenos || !pl.entrenos.length){
    cont.innerHTML = '<div style="color:var(--mute2);font-style:italic;padding:10px;">Aún no hay entrenos. Guarda primero con la definición textarea de arriba para crearlos.</div>';
    return;
  }
  cont.innerHTML = pl.entrenos.map(en => `
    <div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;border-bottom:1px solid var(--border);padding-bottom:4px;">
        <span style="font-family:DM Mono,monospace;color:var(--acc);font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;font-weight:700;">ENTRENO ${en.letra}</span>
        <span style="color:var(--mute);font-size:.72rem;">${tobEsc(en.nombre||'')}</span>
        <button class="tob-action ghost" style="margin-left:auto;font-size:.7rem;padding:3px 9px;" onclick="tobAddEjToPlantilla('${pl.id}','${en.id}')">+ Añadir ejercicio</button>
      </div>
      ${(en.ejercicios||[]).sort((a,b)=>(a.orden||0)-(b.orden||0)).map(ej => {
        const plan = tobPlanFor(ej, 1);
        const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
        const tipoBadge = ej.tipo === 'circuito' ? '<span style="font-size:.65rem;color:var(--acc2);margin-left:6px;">CIRCUITO</span>' : '';
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 12px;background:#0e0d0a;border:1px solid var(--border);border-radius:3px;margin-bottom:4px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:.85rem;color:var(--text);">${tobEsc(ej.nombre)}${tipoBadge}</div>
            <div style="font-size:.7rem;color:var(--mute);font-family:DM Mono,monospace;margin-top:2px;">${plan.series} × ${tobEsc(reps)}${plan.pausa?` · pausa ${tobEsc(plan.pausa)}`:''}${ej.subtitle?` · ${tobEsc(ej.subtitle)}`:''}</div>
          </div>
          <button class="tob-action ghost" style="padding:4px 10px;font-size:.72rem;" onclick="tobOpenEjEditorPlantilla('${pl.id}','${en.id}','${ej.id}')" title="Editar este ejercicio (preserva ID)">✏️ Editar</button>
        </div>`;
      }).join('') || '<div style="color:var(--mute2);font-style:italic;padding:6px;font-size:.78rem;">Sin ejercicios en este entreno</div>'}
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════
// RESETEAR JEAN — borra y recrea desde cero
// ═══════════════════════════════════════════════════════════════
function tobResetJean(){
  const jean = tobDB.clientes.find(c => c.nombre.toLowerCase() === 'jean');
  if(!jean){
    if(confirm('Jean no existe. ¿Crearlo ahora con los datos demo?')){
      tobSeedJean();
    }
    return;
  }
  if(!confirm('⚠ Esto BORRA todos los datos de Jean (8 rutinas, sesiones, iteraciones) y los recrea desde cero con los valores del PDF + datos inventados.\n\n¿Continuar?')){ return; }
  tobDB.clientes = tobDB.clientes.filter(c => c.id !== jean.id);
  tobSave();
  tobSeedJean();
  tobToast('✓ Jean reseteado', 'green');
}

function tobShareWhatsAppFicha(){
  if(!tobCurrentFichaId){ tobToast('Abre la ficha del cliente', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  const stats = tobCalcGlobalKPIs(cli);
  const extra = `Tienes ${(cli.asignaciones||[]).length} rutinas registradas con ${stats.completadas} completadas. Te paso el PDF — recuerda adjuntarlo manualmente cuando se abra el chat.`;
  tobShareWhatsApp(cli, 'historico', extra);
}

function tobShareWhatsAppRutina(){
  const a = tobAsig(); if(!a){ tobToast('Sin rutina abierta', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  const it = tobIt();
  const stats = tobCalcItStats(a, it);
  const extra = `Rutina: ${pl?.nombre || ''}${a.iteraciones.length > 1 ? ` (it.${it?.numero})` : ''}. ${stats.sesiones} sesiones registradas.`;
  tobShareWhatsApp(cli, 'rutina', extra);
}

// ═══ WhatsApp share core ════════════════════════════════════
function tobShareWhatsApp(cli, kind, extraText){
  if(!cli){ tobToast('Sin cliente', 'red'); return; }
  const phone = (cli.contacto || '').replace(/[^\d+]/g, '').replace(/^\+/,'');
  let msg;
  if(kind === 'historico'){
    msg = `Hola ${cli.nombre}! Aquí tu histórico de entrenamientos. ${extraText||''} 💪`;
  } else if(kind === 'rutina'){
    msg = `Hola ${cli.nombre}! Aquí tu rutina completada. ${extraText||''} ¡Buen trabajo! 💪`;
  } else {
    msg = `Hola ${cli.nombre}! ${extraText||''}`;
  }
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
  if(!phone) tobToast('Sin contacto guardado — abre WhatsApp y elige destinatario', '');
}

// Auto-init
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', tobLoad);
} else {
  tobLoad();
}
