function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

document.getElementById('setupBtn').onclick = async function(){
  const repo   = document.getElementById('setupRepo').value.trim();
  const branch = document.getElementById('setupBranch').value.trim() || 'main';
  const token  = document.getElementById('setupToken').value.trim();
  const errEl  = document.getElementById('setupErr');
  errEl.textContent='';

  if(!/^[\w.-]+\/[\w.-]+$/.test(repo)){
    errEl.textContent = 'Formato de repo inválido. Debe ser usuario/repo'; return;
  }
  if(!token){
    errEl.textContent = 'El token es obligatorio'; return;
  }

  this.disabled = true; this.textContent = 'comprobando…';

  try{
    const res = await fetch('https://api.github.com/repos/'+repo, {
      headers: { 'Authorization': 'token '+token, 'Accept':'application/vnd.github.v3+json' }
    });
    if(res.status === 404){ errEl.textContent = 'No encuentro ese repo (o el token no tiene acceso)';
      this.disabled=false; this.textContent='Probar conexión y entrar'; return; }
    if(res.status === 401){ errEl.textContent = 'Token inválido o caducado';
      this.disabled=false; this.textContent='Probar conexión y entrar'; return; }
    if(!res.ok){ errEl.textContent = 'Error de GitHub: '+res.status;
      this.disabled=false; this.textContent='Probar conexión y entrar'; return; }
  } catch(e){
    errEl.textContent = 'Error de red: '+e.message;
    this.disabled=false; this.textContent='Probar conexión y entrar'; return;
  }

  GitHubSync.setupCredentials({ repo, branch, token });
  this.disabled = false; this.textContent='Probar conexión y entrar';
  goLoading();
};

// Enter key avanza por los campos
['setupRepo','setupBranch','setupToken'].forEach((id,i,arr) => {
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('keydown', e => {
    if(e.key === 'Enter'){
      e.preventDefault();
      if(i < arr.length - 1){
        document.getElementById(arr[i+1]).focus();
      } else {
        document.getElementById('setupBtn').click();
      }
    }
  });
});

async function goLoading(){
  show('loadingScreen');
  const msg = document.getElementById('loadingMsg');
  try{
    msg.textContent = 'descargando data.json…';
    const result = await GitHubSync.pullAndApplyAll();
    // Guardar fecha del último JSON remoto como fallback para los ACT
    if(result.lastUpdate){
      localStorage.setItem('gh_last_remote_lastUpdate', result.lastUpdate);
    }
    if(result.fresh){ msg.textContent = 'primer arranque, sin datos remotos'; }
    setTimeout(goMenu, 400);
  } catch(e){
    msg.textContent = 'Error: '+(e.message||'desconocido');
    setTimeout(()=>{
      if(e.status === 401 || e.status === 403){
        if(confirm('Token inválido. ¿Borrar credenciales y empezar de nuevo?')){
          GitHubSync.clearCredentials();
          location.reload();
        }
      }
    }, 1200);
  }
}

async function reSync(){ await goLoading(); }

function goMenu(){
  document.getElementById('menuRepo').textContent     = GitHubSync.getRepo() || '—';
  document.getElementById('menuRepoFull').textContent = GitHubSync.getRepo() || '—';
  computeKpis();
  show('menuScreen');
}

// ── KPIs DEL MENÚ ────────────────────────────────────────
// Lee localStorage de cada app y rellena los KPIs no sensibles.
// Sin importes, sin saldos. Solo: % progreso, nº activas, fecha objetivo, nº clientes.
function computeKpis(){
  computePatKpi();
  computeOptKpi();
  computeFtKpi();
  computeFacKpi();
}

const MO3 = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

// Umbrales de "frescura" (en días)
const STALE_WARN_DAYS = 7;    // ámbar si hace >= 7 días
const STALE_OLD_DAYS  = 30;   // rojo si hace >= 30 días

// Lee la marca de última modificación local de una app (lm_pat, lm_ft, lm_ot, lm_fac).
// Fallback: el lastUpdate global del sync remoto (gh_last_remote_lastUpdate).
function getAppLastModified(appPrefix){
  // 1) Marca local específica
  const local = localStorage.getItem('lm_' + appPrefix);
  if(local){
    const t = parseInt(local, 10);
    if(!isNaN(t)) return new Date(t);
  }
  // 2) Fallback: última fecha del JSON remoto
  const remote = localStorage.getItem('gh_last_remote_lastUpdate');
  if(remote){
    const d = new Date(remote);
    if(!isNaN(d.getTime())) return d;
  }
  return null;
}

// Lee la marca y aplica color en función de la antigüedad
function setUpdFromAppPrefix(elementId, appPrefix){
  const d = getAppLastModified(appPrefix);
  setUpd(elementId, d);
}

// Formatea fecha + aplica clase de antigüedad al elemento
function setUpd(elementId, d){
  const el = document.getElementById(elementId);
  if(!el) return;
  el.textContent = fmtUpd(d);
  // Reset clases
  el.classList.remove('upd-warn','upd-old');
  if(!d || isNaN(d.getTime())) return;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if(days >= STALE_OLD_DAYS) el.classList.add('upd-old');
  else if(days >= STALE_WARN_DAYS) el.classList.add('upd-warn');
}

// Formatea una fecha como "ACT 06 MAY" si es de este año, o "ACT MAY 25" si es de otros años
function fmtUpd(d){
  if(!d || isNaN(d.getTime())) return '— ◂';
  const now = new Date();
  if(d.getFullYear() === now.getFullYear()){
    return 'ACT ' + String(d.getDate()).padStart(2,'0') + ' ' + MO3[d.getMonth()] + ' ◂';
  }
  return 'ACT ' + MO3[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2) + ' ◂';
}

// Devuelve la fecha más reciente de un array de Dates (o null si no hay)
function maxDate(dates){
  let max = null;
  dates.forEach(d => {
    if(d && !isNaN(d.getTime()) && (!max || d > max)) max = d;
  });
  return max;
}

function computePatKpi(){
  try{
    const raw = localStorage.getItem('pat_v5');
    if(!raw) return;
    const profiles = JSON.parse(raw);
    if(!Array.isArray(profiles) || !profiles.length) return;
    const p = profiles[0];
    const ents = (p.entries || []).slice().sort((a,b)=>{
      if(a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
    if(!ents.length) return;

    const calcEnt = e => {
      let t = 0;
      Object.values(e.assets || {}).forEach(v => {
        const n = parseFloat(v);
        if(!isNaN(n)) t += n;
      });
      Object.values(e.debts || {}).forEach(v => {
        const n = parseFloat(v);
        if(!isNaN(n)) t -= n;
      });
      return t;
    };
    const last = ents[ents.length-1];
    const currentPat = calcEnt(last);

    // Buscar primer objetivo de tipo "patrimonio" (o el primero de la lista si no hay del tipo)
    const objs = p.objectives || [];
    const obj = objs.find(o => o.type === 'patrimonio') || objs[0];

    if(obj && obj.target > 0){
      // % de progreso al objetivo (NO % crecimiento)
      const pct = (currentPat / obj.target) * 100;
      const pctClamped = Math.min(100, pct);
      document.getElementById('kpiPatPct').textContent = pct.toFixed(1) + '%';
      document.getElementById('kpiPatBar').style.width = pctClamped + '%';

      // Sub-texto: "Objetivo · DEC 27" o "Objetivo · ∞"
      let sub = 'Objetivo';
      if(obj.deadline){
        const d = new Date(obj.deadline);
        if(!isNaN(d.getTime())){
          sub += ' · ' + MO3[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2);
        } else {
          sub += ' · ∞';
        }
      } else {
        sub += ' · ∞';
      }
      document.getElementById('kpiPatSub').textContent = sub;
    } else {
      // Sin objetivo configurado
      document.getElementById('kpiPatPct').textContent = '—';
      document.getElementById('kpiPatSub').textContent = 'Sin objetivo';
    }

    // Última actualización: buscamos la fecha más reciente entre TODOS los datos del perfil
    const allDates = [];
    // Fechas de entries (último entry registrado del mes)
    ents.forEach(e => {
      if(e.year != null && e.month != null) allDates.push(new Date(e.year, e.month, 28));
    });
    // Fechas de transacciones de gastos
    if(p.gastos && p.gastos.meses){
      Object.values(p.gastos.meses).forEach(mes => {
        (mes.transacciones||[]).forEach(t => {
          if(t.fecha) allDates.push(new Date(t.fecha));
        });
        (mes.archivos||[]).forEach(a => {
          if(a.fechaSubida) allDates.push(new Date(a.fechaSubida));
        });
      });
    }
    setUpdFromAppPrefix('kpiPatUpd', 'pat');
  } catch(e){ console.warn('KPI patrimonio:', e); }
}

function computeOptKpi(){
  try{
    const activasRaw = localStorage.getItem('ot_activas');
    let nActivas = 0;
    let nDteBajos = 0;
    if(activasRaw){
      const arr = JSON.parse(activasRaw);
      if(Array.isArray(arr)){
        nActivas = arr.length;
        const today = new Date();
        today.setHours(0,0,0,0);
        arr.forEach(a => {
          if(!a.exp) return;
          const exp = new Date(a.exp);
          const dte = Math.round((exp - today) / 86400000);
          if(dte >= 0 && dte <= 7) nDteBajos++;
        });
      }
    }
    document.getElementById('kpiOptActivas').textContent = String(nActivas).padStart(2,'0');

    const badgesEl = document.getElementById('kpiOptBadges');
    badgesEl.innerHTML = '';
    if(nDteBajos > 0){
      badgesEl.innerHTML += `<span class="kpi-badge amber">⚠ ${String(nDteBajos).padStart(2,'0')} DTE ≤ 7D</span>`;
    } else if(nActivas > 0){
      badgesEl.innerHTML += `<span class="kpi-badge">DTE OK</span>`;
    }

    // Última actualización: fecha más reciente entre TODO (activas + histórico)
    const allDates = [];
    if(activasRaw){
      const arr = JSON.parse(activasRaw);
      if(Array.isArray(arr)){
        arr.forEach(a => {
          ['apertura','cierre','exp','fechaUltimaActualizacion','fechaActualizacion','lastUpdate'].forEach(k=>{
            if(a[k]) allDates.push(new Date(a[k]));
          });
        });
      }
    }
    const histRaw = localStorage.getItem('ot_hist');
    if(histRaw){
      const hist = JSON.parse(histRaw);
      if(Array.isArray(hist)){
        hist.forEach(h => {
          ['cierre','apertura','fechaUltimaActualizacion','fechaActualizacion','lastUpdate'].forEach(k=>{
            if(h[k]) allDates.push(new Date(h[k]));
          });
        });
      }
    }
    setUpdFromAppPrefix('kpiOptUpd', 'ot');
  } catch(e){ console.warn('KPI options:', e); }
}

function computeFtKpi(){
  try{
    const raw = localStorage.getItem('ft_v4');
    if(!raw) return;
    const db = JSON.parse(raw);
    const clients = db.clients || [];
    const activos = clients.filter(c => c.active).length;
    document.getElementById('kpiFtClientes').textContent = activos;

    // Última actualización: fecha más reciente entre TODOS los datos
    const allDates = [];

    // Fechas dentro de los meses
    if(db.months){
      Object.entries(db.months).forEach(([key, m]) => {
        // Cada mes tiene formato "YYYY-MM"
        const [y, mo] = key.split('-');
        if(y && mo) allDates.push(new Date(parseInt(y), parseInt(mo)-1, 28));
        // También buscar fechas internas: pagos, sesiones, etc.
        if(typeof m === 'object'){
          const scan = (obj) => {
            if(!obj || typeof obj !== 'object') return;
            Object.values(obj).forEach(v => {
              if(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)){
                allDates.push(new Date(v));
              } else if(typeof v === 'object'){
                scan(v);
              }
            });
          };
          scan(m);
        }
      });
    }
    // Fechas en clientes (createdAt, updatedAt, etc.)
    clients.forEach(c => {
      ['createdAt','updatedAt','lastVisit','startDate'].forEach(k => {
        if(c[k]) allDates.push(new Date(c[k]));
      });
    });

    setUpdFromAppPrefix('kpiFtUpd', 'ft');
  } catch(e){ console.warn('KPI full training:', e); }
}

function computeFacKpi(){
  try{
    const raw = localStorage.getItem('fac_v1');
    if(!raw) return;
    const profiles = JSON.parse(raw);
    if(!Array.isArray(profiles)) return;

    let totalFacs = 0;
    const allDates = [];
    profiles.forEach(p => {
      const facs = p.facturas || [];
      totalFacs += facs.length;
      facs.forEach(f => {
        if(f.fecha) allDates.push(new Date(f.fecha));
      });
    });
    document.getElementById('kpiFacTotal').textContent = totalFacs;
    setUpdFromAppPrefix('kpiFacUpd', 'fac');
  } catch(e){ console.warn('KPI facturas:', e); }
}

function askLogout(){
  if(!confirm('Esto borra el token de ESTE dispositivo. Tus datos en GitHub no se tocan. ¿Continuar?')) return;
  GitHubSync.clearCredentials();
  location.reload();
}

// ════════ NEON FX ════════
// Detectar si estamos en mobile (para reducir efectos)
const _isMobile = window.matchMedia('(max-width: 640px)').matches;

// 1) Generar partículas flotantes (menos en mobile)
(function spawnParticles(){
  const cont = document.getElementById('fxParticles');
  if(!cont) return;
  const N = _isMobile ? 8 : 24;  // 24 en desktop, 8 en mobile
  const colors = ['#22d3ee','#22d3ee','#22d3ee','#a855f7','#06b6d4'];
  for(let i=0;i<N;i++){
    const p = document.createElement('div');
    p.className = 'fx-particle';
    const dur = 12 + Math.random()*18;     // 12-30s de vida
    const delay = -Math.random()*dur;      // arrancan en momentos distintos
    const left = Math.random()*100;        // posición horizontal
    const drift = (Math.random()*120)-60;  // deriva lateral durante el viaje
    const size = 1 + Math.random()*2;      // 1-3px
    const color = colors[Math.floor(Math.random()*colors.length)];
    p.style.left = left + 'vw';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.background = color;
    p.style.boxShadow = `0 0 6px ${color},0 0 12px ${color}99`;
    p.style.animationDuration = dur + 's';
    p.style.animationDelay = delay + 's';
    p.style.setProperty('--drift', drift+'px');
    p.style.animationName = 'particleFloat'+(i%3);
    cont.appendChild(p);
  }
})();

// Inyectar variantes de keyframes con drifts distintos (más natural)
(function injectParticleKF(){
  const css = `
    @keyframes particleFloat0{0%{transform:translate(0,100vh) scale(.5);opacity:0}10%{opacity:.85}90%{opacity:.85}100%{transform:translate(40px,-10vh) scale(1.1);opacity:0}}
    @keyframes particleFloat1{0%{transform:translate(0,100vh) scale(.5);opacity:0}10%{opacity:.7}90%{opacity:.7}100%{transform:translate(-50px,-10vh) scale(1.3);opacity:0}}
    @keyframes particleFloat2{0%{transform:translate(0,100vh) scale(.5);opacity:0}10%{opacity:.9}90%{opacity:.9}100%{transform:translate(15px,-10vh) scale(1);opacity:0}}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

// 2) Tilt 3D en menu-cards (solo desktop — en mobile no aporta y consume CPU)
(function setupTilt(){
  if(_isMobile) return;  // Mobile: nada de tilt
  const MAX_TILT = 8; // grados máximos
  function attach(card){
    let rect = null;
    function onMove(e){
      if(!rect) rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width/2;
      const cy = rect.height/2;
      const rotY = ((x - cx)/cx) * MAX_TILT;
      const rotX = -((y - cy)/cy) * MAX_TILT;
      card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(8px)`;
    }
    function onEnter(){ rect = card.getBoundingClientRect(); card.style.transition = 'box-shadow .25s,border-color .25s'; }
    function onLeave(){
      rect = null;
      card.style.transform = '';
      card.style.transition = 'transform .35s ease,box-shadow .25s,border-color .25s';
    }
    card.addEventListener('mouseenter', onEnter);
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', onLeave);
  }
  // Observer para attachear a las cards cuando aparecen (el menú no está visible al inicio)
  const observer = new MutationObserver(()=>{
    document.querySelectorAll('.menu-card:not([data-tilt])').forEach(c=>{
      c.dataset.tilt = '1';
      attach(c);
    });
  });
  observer.observe(document.body, {childList:true,subtree:true,attributes:true});
  // Y attach inicial por si ya están
  document.querySelectorAll('.menu-card').forEach(c=>{
    c.dataset.tilt = '1';
    attach(c);
  });
})();

// ════════ IA APIs MANAGER (centralizado) ════════
// Storage: localStorage 'ia_providers_v1' = JSON array
//   [{ id, nombre, tipo: 'groq'|'openrouter'|'gemini', key, modelo, activa }]
// Otros HTMLs (patrimonio/options/full_training) leen de aquí y ejecutan la cadena.

const IA_PROVIDERS_STORAGE = 'ia_providers_v1';
const IA_PROVIDER_DEFAULTS = {
  groq:       { modelo: 'llama-3.3-70b-versatile', endpoint: 'https://api.groq.com/openai/v1/chat/completions' },
  openrouter: { modelo: 'meta-llama/llama-3.3-70b-instruct:free', endpoint: 'https://openrouter.ai/api/v1/chat/completions' },
  gemini:     { modelo: 'gemini-2.0-flash', endpoint: '' /* especial */ }
};

let _editingApiId = null;  // null = nueva, string = editando ese id

function iaLoadProviders(){
  try { return JSON.parse(localStorage.getItem(IA_PROVIDERS_STORAGE)) || []; }
  catch { return []; }
}
function iaSaveProviders(list){
  localStorage.setItem(IA_PROVIDERS_STORAGE, JSON.stringify(list));
}
function _uid(){ return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }

// ─── Migración suave: leer keys viejas de cada HTML y sugerir añadir ───
function iaMigrateLegacyKeys(){
  const list = iaLoadProviders();
  if(list.length > 0) return; // ya tiene APIs configuradas, no migra
  const legacy = [
    { storage: 'pat_ia_groq_key', label: 'Groq (de Patrimonio)' },
    { storage: 'ft_ia_groq_key',  label: 'Groq (de Full Training)' },
    { storage: 'ot_ia_groq_key',  label: 'Groq (de Options)' }
  ];
  // Tomar la primera que exista (todas suelen ser la misma key)
  for(const l of legacy){
    const k = localStorage.getItem(l.storage);
    if(k){
      list.push({
        id: _uid(),
        nombre: 'Groq (importada)',
        tipo: 'groq',
        key: k,
        modelo: IA_PROVIDER_DEFAULTS.groq.modelo,
        activa: true
      });
      iaSaveProviders(list);
      return;
    }
  }
}

// ─── Modal: lista ───
function openIaApisModal(){
  iaMigrateLegacyKeys();
  document.getElementById('menuScreen').classList.remove('active');
  document.getElementById('iaApisModal').style.display = 'flex';
  document.getElementById('iaTestResult').style.display = 'none';
  iaRenderApisList();
}
function closeIaApisModal(){
  document.getElementById('iaApisModal').style.display = 'none';
  document.getElementById('menuScreen').classList.add('active');
}

function iaRenderApisList(){
  const list = iaLoadProviders();
  const cont = document.getElementById('iaApisList');
  if(!list.length){
    cont.innerHTML = '<div class="ia-api-empty">No hay APIs configuradas todavía.<br>Añade una pulsando "+ Añadir API"</div>';
    return;
  }
  const tipoLabels = { groq:'GROQ', openrouter:'OPENROUTER', gemini:'GEMINI' };
  cont.innerHTML = list.map((p, idx) => `
    <div class="ia-api-item" draggable="true" data-id="${p.id}">
      <div class="ia-api-handle" title="Arrastra para reordenar">⋮⋮</div>
      <div class="ia-api-info">
        <div class="ia-api-name">${idx+1}. ${escapeHtml(p.nombre || '(sin nombre)')}</div>
        <div class="ia-api-meta">${tipoLabels[p.tipo]||p.tipo} · ${escapeHtml(p.modelo||'')} · key ****${(p.key||'').slice(-4)}</div>
      </div>
      <div class="ia-api-status ${p.activa ? 'on' : 'off'}">${p.activa ? 'ACTIVA' : 'INACTIVA'}</div>
      <div class="ia-api-actions">
        <button class="ia-api-btn" onclick="openIaApiEditor('${p.id}')">EDIT</button>
        <button class="ia-api-btn danger" onclick="deleteIaApi('${p.id}')">DEL</button>
      </div>
    </div>
  `).join('');
  // Activar drag & drop
  iaSetupDragDrop();
}

// ─── Drag & drop reorder ───
function iaSetupDragDrop(){
  const items = document.querySelectorAll('#iaApisList .ia-api-item');
  let dragSrc = null;
  items.forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrc = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.id);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      document.querySelectorAll('.ia-api-item').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if(item !== dragSrc) item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if(!dragSrc || dragSrc === item) return;
      const list = iaLoadProviders();
      const fromId = dragSrc.dataset.id;
      const toId = item.dataset.id;
      const fromIdx = list.findIndex(p => p.id === fromId);
      const toIdx = list.findIndex(p => p.id === toId);
      if(fromIdx < 0 || toIdx < 0) return;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      iaSaveProviders(list);
      iaRenderApisList();
    });
  });
}

// ─── Editor ───
function openIaApiEditor(id){
  _editingApiId = id || null;
  document.getElementById('iaApiEditorTitle').textContent = id ? '// EDITAR API' : '// NUEVA API';
  document.getElementById('iaApiEditorMsg').style.display = 'none';
  if(id){
    const p = iaLoadProviders().find(x => x.id === id);
    if(p){
      document.getElementById('iaApiName').value = p.nombre || '';
      document.getElementById('iaApiProvider').value = p.tipo || 'groq';
      document.getElementById('iaApiModel').value = p.modelo || '';
      document.getElementById('iaApiKey').value = p.key || '';
      document.getElementById('iaApiActive').checked = p.activa !== false;
    }
  } else {
    document.getElementById('iaApiName').value = '';
    document.getElementById('iaApiProvider').value = 'groq';
    document.getElementById('iaApiModel').value = IA_PROVIDER_DEFAULTS.groq.modelo;
    document.getElementById('iaApiKey').value = '';
    document.getElementById('iaApiActive').checked = true;
  }
  document.getElementById('iaApiEditorModal').style.display = 'flex';
  setTimeout(() => document.getElementById('iaApiName').focus(), 50);
}
function closeIaApiEditor(){ document.getElementById('iaApiEditorModal').style.display = 'none'; _editingApiId = null; }

function onProviderChange(){
  const tipo = document.getElementById('iaApiProvider').value;
  const def = IA_PROVIDER_DEFAULTS[tipo];
  // Solo auto-rellena si está vacío o si es el modelo por defecto de OTRO proveedor
  const modelInput = document.getElementById('iaApiModel');
  const allDefaults = Object.values(IA_PROVIDER_DEFAULTS).map(d => d.modelo);
  if(!modelInput.value || allDefaults.includes(modelInput.value)){
    modelInput.value = def.modelo;
  }
}

function saveIaApi(){
  const nombre = document.getElementById('iaApiName').value.trim() || 'Sin nombre';
  const tipo = document.getElementById('iaApiProvider').value;
  const modelo = document.getElementById('iaApiModel').value.trim() || IA_PROVIDER_DEFAULTS[tipo].modelo;
  const key = document.getElementById('iaApiKey').value.trim();
  const activa = document.getElementById('iaApiActive').checked;
  if(!key){ _showApiEditorMsg('⚠ Falta la API key', '#fca5a5'); return; }

  const list = iaLoadProviders();
  if(_editingApiId){
    const idx = list.findIndex(p => p.id === _editingApiId);
    if(idx >= 0) list[idx] = { ...list[idx], nombre, tipo, modelo, key, activa };
  } else {
    list.push({ id: _uid(), nombre, tipo, modelo, key, activa });
  }
  iaSaveProviders(list);
  closeIaApiEditor();
  iaRenderApisList();
}

function deleteIaApi(id){
  if(!confirm('¿Eliminar esta API de la cadena?')) return;
  const list = iaLoadProviders().filter(p => p.id !== id);
  iaSaveProviders(list);
  iaRenderApisList();
}

// ─── Exportar / Importar config completa ───
function exportIaConfig(){
  // Exporta APIs + las 3 instrucciones por app, todo en un único JSON
  const config = {
    schema: 'mis-dashboards-ia-config',
    version: 1,
    exportedAt: new Date().toISOString(),
    providers: iaLoadProviders(),
    instructions: {
      pat: localStorage.getItem('pat_ia_instructions') || '',
      ft:  localStorage.getItem('ft_ia_instructions') || '',
      ot:  localStorage.getItem('ot_ia_instructions') || ''
    }
  };
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().slice(0,10);  // YYYY-MM-DD
  a.download = `ia-config-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  // Feedback en la zona de test result
  const resBox = document.getElementById('iaTestResult');
  if(resBox){
    resBox.style.display = 'block';
    resBox.style.color = '#22d3ee';
    resBox.textContent = `✓ Configuración exportada: ${config.providers.length} API(s) + instrucciones`;
    setTimeout(() => { resBox.style.display = 'none'; }, 4000);
  }
}

function importIaConfig(event){
  const file = event.target.files?.[0];
  // Resetear el input para que permita re-importar el mismo archivo después
  event.target.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const config = JSON.parse(e.target.result);
      // Validación mínima
      if(config.schema !== 'mis-dashboards-ia-config'){
        if(!confirm('Este archivo no parece ser una config exportada por esta app. ¿Importarlo de todas formas?')) return;
      }
      const providers = Array.isArray(config.providers) ? config.providers : [];
      const instr = config.instructions || {};
      // Avisar si va a sobrescribir
      const current = iaLoadProviders();
      if(current.length > 0){
        if(!confirm(`Ya tienes ${current.length} API(s) configurada(s).\n\n¿Reemplazarlas con las ${providers.length} del archivo?\n\n(Si cancelas, no se importa nada.)`)) return;
      }
      // Aplicar
      iaSaveProviders(providers);
      if(typeof instr.pat === 'string'){
        if(instr.pat) localStorage.setItem('pat_ia_instructions', instr.pat);
        else localStorage.removeItem('pat_ia_instructions');
      }
      if(typeof instr.ft === 'string'){
        if(instr.ft) localStorage.setItem('ft_ia_instructions', instr.ft);
        else localStorage.removeItem('ft_ia_instructions');
      }
      if(typeof instr.ot === 'string'){
        if(instr.ot) localStorage.setItem('ot_ia_instructions', instr.ot);
        else localStorage.removeItem('ot_ia_instructions');
      }
      iaRenderApisList();
      const resBox = document.getElementById('iaTestResult');
      if(resBox){
        resBox.style.display = 'block';
        resBox.style.color = '#22d3ee';
        resBox.textContent = `✓ Configuración importada: ${providers.length} API(s) + instrucciones`;
        setTimeout(() => { resBox.style.display = 'none'; }, 4000);
      }
    } catch(err){
      toast('Error al leer el archivo: ' + err.message, 'red');
    }
  };
  reader.onerror = () => toast('No se pudo leer el archivo', 'red');
  reader.readAsText(file);
}

function _showApiEditorMsg(text, color){
  const el = document.getElementById('iaApiEditorMsg');
  el.style.display = 'block';
  el.style.color = color;
  el.textContent = text;
}

// ─── Probar API: hace ping con prompt corto ───
async function testIaApi(){
  const tipo = document.getElementById('iaApiProvider').value;
  const modelo = document.getElementById('iaApiModel').value.trim() || IA_PROVIDER_DEFAULTS[tipo].modelo;
  const key = document.getElementById('iaApiKey').value.trim();
  if(!key){ _showApiEditorMsg('⚠ Pega la key primero', '#fca5a5'); return; }
  _showApiEditorMsg('⏳ Probando...', '#67e8f9');
  try {
    const txt = await iaModule.callSingle({ tipo, modelo, key }, 'Responde "OK" si me oyes, una sola palabra.');
    _showApiEditorMsg(`✓ Respuesta: ${(txt||'').slice(0,80)}`, '#22d3ee');
  } catch(err){
    _showApiEditorMsg(`✕ Error: ${err.message}`, '#fca5a5');
  }
}

// La lógica de llamada a providers vive en ia-module.js (cargado antes que
// este script en index.html). Aquí solo usamos iaModule.callSingle() para
// el botón "Probar" — el resto de HTMLs usa iaModule.callLLM() para la
// cadena con fallback.

// ════════════════════════════════════════════════════════════════════
// VOICE LANGUAGE TOGGLE (boton 🌐 — afecta a todos los voice inputs)
// ════════════════════════════════════════════════════════════════════
const VOICE_LANGS = [
  { code: 'es-ES', label: 'ES' },
  { code: 'ca-ES', label: 'CA' },
  { code: 'en-US', label: 'EN' }
];
function _refreshVoiceLangBtn(){
  const btn = document.getElementById('voiceLangBtn');
  if(!btn) return;
  const cur = (typeof getVoiceLang === 'function' ? getVoiceLang() : 'es-ES');
  const found = VOICE_LANGS.find(l => l.code === cur) || VOICE_LANGS[0];
  btn.textContent = '🌐 ' + found.label;
  btn.title = 'Idioma del voice input: ' + found.code;
}
function cycleVoiceLang(){
  const cur = getVoiceLang();
  const idx = VOICE_LANGS.findIndex(l => l.code === cur);
  const next = VOICE_LANGS[(idx + 1) % VOICE_LANGS.length];
  setVoiceLang(next.code);
  _refreshVoiceLangBtn();
  if(typeof toast === 'function') toast('Voice input: ' + next.label);
}

// ════════════════════════════════════════════════════════════════════
// NOTIFICACIONES (Telegram bot config + master password gate)
// ════════════════════════════════════════════════════════════════════
const NOTIF_HASH_SALT = 'notif_master_v1_';
async function _notifHash(pwd){
  const enc = new TextEncoder().encode(NOTIF_HASH_SALT + pwd);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

let _notifAuthenticated = false;

async function openNotifModal(){
  // Reset state
  _notifAuthenticated = false;
  document.getElementById('menuScreen').classList.remove('active');
  document.getElementById('notifModal').style.display = 'flex';
  document.getElementById('notifGate').style.display = 'block';
  document.getElementById('notifForm').style.display = 'none';
  document.getElementById('notifGateMsg').textContent = '';
  document.getElementById('notifPwd').value = '';
  document.getElementById('notifPwd2').value = '';

  // Comprobar si ya hay password configurada
  let sec = null;
  try {
    sec = await GitHubSync.fetchSecuritySection();
  } catch(e){
    document.getElementById('notifGateMsg').textContent = 'Error al leer __security: ' + e.message;
    document.getElementById('notifGateMsg').style.color = '#fca5a5';
    return;
  }
  const hasPwd = sec && sec.notif_pwd;
  const info = document.getElementById('notifGateInfo');
  const pwd2Lbl = document.getElementById('notifPwd2Lbl');
  const pwd2 = document.getElementById('notifPwd2');
  const btn = document.getElementById('notifGateBtn');
  if(hasPwd){
    info.textContent = 'Introduce la contraseña maestra para configurar Telegram.';
    pwd2Lbl.style.display = 'none';
    pwd2.style.display = 'none';
    btn.textContent = 'Entrar';
  } else {
    info.textContent = 'Primera vez. Crea una contraseña maestra (mínimo 6 caracteres). Solo tú la sabrás. Si la pierdes, la recuperas editando data.json en GitHub.';
    pwd2Lbl.style.display = 'block';
    pwd2.style.display = 'block';
    btn.textContent = 'Crear';
  }
  setTimeout(() => document.getElementById('notifPwd').focus(), 50);
}

function closeNotifModal(){
  document.getElementById('notifModal').style.display = 'none';
  document.getElementById('menuScreen').classList.add('active');
}

async function notifGateSubmit(){
  const pwd = document.getElementById('notifPwd').value;
  const pwd2 = document.getElementById('notifPwd2').value;
  const msg = document.getElementById('notifGateMsg');
  msg.style.color = '#fca5a5';
  if(pwd.length < 6){ msg.textContent = 'Mínimo 6 caracteres'; return; }
  let sec = null;
  try { sec = await GitHubSync.fetchSecuritySection(); }
  catch(e){ msg.textContent = 'Error: ' + e.message; return; }
  const hasPwd = sec && sec.notif_pwd;
  const hash = await _notifHash(pwd);
  if(hasPwd){
    if(hash !== sec.notif_pwd){ msg.textContent = 'Contraseña incorrecta'; return; }
    _notifAuthenticated = true;
    await _notifShowForm();
  } else {
    if(pwd !== pwd2){ msg.textContent = 'Las contraseñas no coinciden'; return; }
    try {
      await GitHubSync.updateSecuritySection(s => { s.notif_pwd = hash; return s; });
    } catch(e){ msg.textContent = 'Error guardando: ' + e.message; return; }
    _notifAuthenticated = true;
    msg.style.color = '#4ade80';
    msg.textContent = '✓ Contraseña creada';
    setTimeout(() => _notifShowForm(), 600);
  }
}

async function _notifShowForm(){
  document.getElementById('notifGate').style.display = 'none';
  document.getElementById('notifForm').style.display = 'block';
  // Cargar config actual si existe
  let cfg = null;
  try { cfg = await GitHubSync.fetchSection('__notif'); } catch(e){}
  document.getElementById('notifBotToken').value = (cfg && cfg.bot_token) || '';
  document.getElementById('notifChatId').value = (cfg && cfg.chat_id) || '';
  document.getElementById('notifTime').value = (cfg && cfg.time) || '09:00';
  document.getElementById('notifEnabled').checked = cfg ? cfg.enabled !== false : true;
}

async function saveNotifConfig(){
  if(!_notifAuthenticated){ alert('Sesión expirada. Vuelve a entrar.'); return; }
  const cfg = {
    bot_token: document.getElementById('notifBotToken').value.trim(),
    chat_id: document.getElementById('notifChatId').value.trim(),
    time: document.getElementById('notifTime').value || '09:00',
    enabled: document.getElementById('notifEnabled').checked,
    tz: 'Europe/Madrid',
    updated_at: new Date().toISOString()
  };
  if(!cfg.bot_token){ _showNotifMsg('⚠ Falta el bot token', '#fca5a5'); return; }
  if(!cfg.chat_id){ _showNotifMsg('⚠ Falta el chat_id', '#fca5a5'); return; }
  _showNotifMsg('⏳ Guardando...', '#67e8f9');
  try {
    await GitHubSync.updateSection('__notif', () => cfg);
    _showNotifMsg('✓ Configuración guardada en data.json', '#22d3ee');
  } catch(err){
    _showNotifMsg('✕ Error: ' + err.message, '#fca5a5');
  }
}

async function testNotifBot(){
  const token = document.getElementById('notifBotToken').value.trim();
  const chatId = document.getElementById('notifChatId').value.trim();
  if(!token || !chatId){ _showNotifMsg('⚠ Pega el token y el chat_id antes de probar', '#fca5a5'); return; }
  _showNotifMsg('⏳ Enviando mensaje de prueba...', '#67e8f9');
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🤖 ¡Funciona! Tu bot de Mis Dashboards está conectado.\n\nA partir de ahora recibirás aquí el resumen diario.',
        parse_mode: 'HTML'
      })
    });
    const data = await res.json();
    if(data.ok){
      _showNotifMsg('✓ Mensaje enviado. Comprueba Telegram.', '#4ade80');
    } else {
      _showNotifMsg('✕ Telegram dijo: ' + (data.description || 'error desconocido'), '#fca5a5');
    }
  } catch(err){
    _showNotifMsg('✕ Error de red: ' + err.message, '#fca5a5');
  }
}

function _showNotifMsg(text, color){
  const el = document.getElementById('notifFormMsg');
  el.style.display = 'block';
  el.style.color = color;
  el.textContent = text;
}

(function init(){
  if(!GitHubSync.isLoggedIn()){
    show('setupScreen');
    setTimeout(()=>document.getElementById('setupRepo').focus(), 100);
    return;
  }
  goLoading();
  // Refrescar el botón de idioma al cargar
  setTimeout(_refreshVoiceLangBtn, 100);
})();
