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
  // Sync a data.json __ia para que el GitHub Action de Telegram pueda
  // usar tus mismas keys (para AI insight). Se hace en background con
  // feedback visible.
  if(window.GitHubSync && GitHubSync.updateSection && GitHubSync.isLoggedIn()){
    if(typeof toast === 'function') toast('Sincronizando IA APIs a GitHub...', 'info');
    GitHubSync.updateSection('__ia', () => ({
      providers: list,
      updated_at: new Date().toISOString()
    })).then(() => {
      if(typeof toast === 'function') toast('✓ IA APIs sincronizadas (Telegram puede usarlas)');
    }).catch(err => {
      console.warn('[__ia sync]', err);
      if(typeof toast === 'function') toast('⚠ IA sync falló: ' + err.message, 'red');
    });
  }
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
  // También refresca el nuevo panel (apisModal) si existe
  if(typeof _renderIaListV2 === 'function') _renderIaListV2();
  const list = iaLoadProviders();
  const cont = document.getElementById('iaApisList');
  if(!cont) return; // ya no existe el modal viejo si se quitó
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
// MENÚ CONFIGURACIÓN (agrupa: notificaciones, APIs, idioma, resync)
// ════════════════════════════════════════════════════════════════════
function openConfigMenu(){
  document.getElementById('menuScreen').classList.remove('active');
  document.getElementById('configMenuModal').style.display = 'flex';
  _refreshCfgVoiceLangSub();
}
function closeConfigMenu(){
  document.getElementById('configMenuModal').style.display = 'none';
  document.getElementById('menuScreen').classList.add('active');
}
function _refreshCfgVoiceLangSub(){
  const el = document.getElementById('cfgVoiceLangSub');
  if(!el) return;
  const cur = (typeof getVoiceLang === 'function') ? getVoiceLang() : 'es-ES';
  const found = (VOICE_LANGS||[]).find(l => l.code === cur);
  el.textContent = 'Actual: ' + (found ? found.label + ' (' + found.code + ')' : cur);
}

// ════════════════════════════════════════════════════════════════════
// MODAL APIs (sub-pestañas IA y Financieras)
// ════════════════════════════════════════════════════════════════════
function openApisModal(){
  document.getElementById('apisModal').style.display = 'flex';
  switchApisTab('ia');
  // Re-render IA list dentro del nuevo modal
  iaMigrateLegacyKeys();
  _renderIaListV2();
  // Cargar Financieras
  _loadFinApisToForm();
}
function closeApisModal(){
  document.getElementById('apisModal').style.display = 'none';
  // Si venimos del menú config, no volver al config — vuelve al menú
  document.getElementById('menuScreen').classList.add('active');
}
function switchApisTab(tab){
  ['ia','fin'].forEach(t => {
    const btn = document.querySelector(`.apis-tab[data-apis-tab="${t}"]`);
    const panel = document.getElementById('apisTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if(btn){
      const active = (t === tab);
      btn.style.color = active ? '#22d3ee' : '#0e7490';
      btn.style.borderBottomColor = active ? '#22d3ee' : 'transparent';
      btn.classList.toggle('active', active);
    }
    if(panel) panel.style.display = (t === tab) ? 'block' : 'none';
  });
}

// Re-render lista IA en el panel embebido (mismo contenido que iaApisModal antiguo)
function _renderIaListV2(){
  const list = iaLoadProviders();
  const cont = document.getElementById('iaApisListV2');
  if(!cont) return;
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
        <button class="ia-api-btn danger" onclick="deleteIaApi('${p.id}'); _renderIaListV2()">DEL</button>
      </div>
    </div>
  `).join('');
  iaSetupDragDropV2();
}

function iaSetupDragDropV2(){
  const items = document.querySelectorAll('#iaApisListV2 .ia-api-item');
  let dragSrc = null;
  items.forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrc = item; item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.id);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      document.querySelectorAll('.ia-api-item').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      if(item !== dragSrc) item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault(); item.classList.remove('drag-over');
      if(!dragSrc || dragSrc === item) return;
      const list = iaLoadProviders();
      const fromIdx = list.findIndex(p => p.id === dragSrc.dataset.id);
      const toIdx   = list.findIndex(p => p.id === item.dataset.id);
      if(fromIdx < 0 || toIdx < 0) return;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      iaSaveProviders(list);
      _renderIaListV2();
    });
  });
}

// Botón explícito "Sync a GitHub" — fuerza el sync de IA a __ia
async function syncIaToGithub(){
  const list = iaLoadProviders();
  if(!list.length){
    if(typeof toast === 'function') toast('No hay APIs IA para sincronizar', 'red');
    return;
  }
  if(!GitHubSync.isLoggedIn()){
    if(typeof toast === 'function') toast('No conectado a GitHub', 'red');
    return;
  }
  try {
    if(typeof toast === 'function') toast('Sincronizando IA a GitHub...', 'info');
    await GitHubSync.updateSection('__ia', () => ({ providers: list, updated_at: new Date().toISOString() }));
    if(typeof toast === 'function') toast('✓ IA sincronizadas — Telegram puede usarlas');
  } catch(err){
    if(typeof toast === 'function') toast('✕ Error: ' + err.message, 'red');
  }
}

// ── APIs FINANCIERAS ──
async function _loadFinApisToForm(){
  let cfg = null;
  try { cfg = await GitHubSync.fetchSection('__fin'); } catch(e){}
  document.getElementById('finApiFinnhub').value = (cfg && cfg.finnhub) || '';
  document.getElementById('finApiAlphaV').value  = (cfg && cfg.alphavantage) || '';
  document.getElementById('finApiTwelve').value  = (cfg && cfg.twelvedata) || '';
}

async function saveFinApis(){
  const cfg = {
    finnhub:      document.getElementById('finApiFinnhub').value.trim(),
    alphavantage: document.getElementById('finApiAlphaV').value.trim(),
    twelvedata:   document.getElementById('finApiTwelve').value.trim(),
    updated_at:   new Date().toISOString()
  };
  _showFinMsg('⏳ Guardando...', '#67e8f9');
  try {
    await GitHubSync.updateSection('__fin', () => cfg);
    _showFinMsg('✓ APIs financieras guardadas en data.json', '#22d3ee');
  } catch(err){
    _showFinMsg('✕ Error: ' + err.message, '#fca5a5');
  }
}

async function testFinnhub(){
  const key = document.getElementById('finApiFinnhub').value.trim();
  if(!key){ _showFinMsg('⚠ Pega la key Finnhub primero', '#fca5a5'); return; }
  _showFinMsg('⏳ Probando Finnhub...', '#67e8f9');
  try {
    // Test simple: quote AAPL
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(key)}`);
    if(!res.ok){ _showFinMsg('✕ HTTP ' + res.status + ': ' + (await res.text()).slice(0,80), '#fca5a5'); return; }
    const d = await res.json();
    if(d.error){ _showFinMsg('✕ Finnhub: ' + d.error, '#fca5a5'); return; }
    if(d.c != null){
      _showFinMsg(`✓ Funciona. AAPL = $${d.c.toFixed(2)} (cambio ${d.dp?.toFixed(2) || '?'}%)`, '#4ade80');
    } else {
      _showFinMsg('? Respuesta inesperada: ' + JSON.stringify(d).slice(0, 120), '#fbbf24');
    }
  } catch(err){
    _showFinMsg('✕ Error de red: ' + err.message, '#fca5a5');
  }
}

function _showFinMsg(text, color){
  const el = document.getElementById('finApiMsg');
  el.style.display = 'block';
  el.style.color = color;
  el.textContent = text;
}

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
  const cur = (typeof getVoiceLang === 'function' ? getVoiceLang() : 'es-ES');
  const found = VOICE_LANGS.find(l => l.code === cur) || VOICE_LANGS[0];
  if(btn){
    btn.textContent = '🌐 ' + found.label;
    btn.title = 'Idioma del voice input: ' + found.code;
  }
  if(typeof _refreshCfgVoiceLangSub === 'function') _refreshCfgVoiceLangSub();
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

// ── Esquema de secciones del resumen — single source of truth ──
const NOTIF_DAYS = [
  { code: 'mon', label: 'L' },
  { code: 'tue', label: 'M' },
  { code: 'wed', label: 'X' },
  { code: 'thu', label: 'J' },
  { code: 'fri', label: 'V' },
  { code: 'sat', label: 'S' },
  { code: 'sun', label: 'D' }
];
const NOTIF_SECTIONS = [
  { id: 'patrimonio', icon: '💰', label: 'Patrimonio', items: [
    { id: 'total',         label: 'Total actual',                          default: true  },
    { id: 'delta',         label: 'Δ vs mes anterior (€ y %)',             default: true  },
    { id: 'objetivo',      label: '% del objetivo principal',              default: true  },
    { id: 'sparkline',     label: '📊 Sparkline 12 meses (gráfico ASCII)', default: true  },
    { id: 'gastos_mes',    label: 'Gastos del mes (total + top 3 categorías)', default: true },
    { id: 'gastos_avg',    label: 'Media mensual de gastos (últimos N meses)',  default: false },
    { id: 'gastos_avg_months', label: '↳ N meses', default: 6, type: 'number', min: 2, max: 24 },
    { id: 'ingresos_mes',  label: 'Ingresos del mes',                      default: false },
    { id: 'ingresos_avg',  label: 'Media mensual de ingresos',             default: false },
    { id: 'ingresos_avg_months', label: '↳ N meses', default: 6, type: 'number', min: 2, max: 24 },
    { id: 'distribucion',  label: 'Distribución por sección',              default: false },
    { id: 'top_mover',     label: 'Top mover del mes (mayor Δ asset)',     default: false },
    { id: 'ytd_pct',       label: 'Variación YTD (%)',                     default: false }
  ]},
  { id: 'options', icon: '📈', label: 'Opciones', items: [
    { id: 'count',         label: 'Nº de posiciones activas',              default: true  },
    { id: 'expiring',      label: 'Posiciones expirando ≤ N días',         default: true  },
    { id: 'expiring_days', label: '↳ N (días)', default: 7, type: 'number', min: 1, max: 30 },
    { id: 'lista_activas', label: 'Lista de TODAS activas con P&L unrealized', default: false },
    { id: 'pnl_mes',       label: 'P&L del mes en curso',                  default: true  },
    { id: 'pnl_avg',       label: 'P&L medio mensual (últimos N meses)',   default: false },
    { id: 'pnl_avg_months',label: '↳ N meses', default: 6, type: 'number', min: 2, max: 24 },
    { id: 'win_rate_mes',  label: 'Win rate del mes (W/L)',                default: true  },
    { id: 'best_worst',    label: 'Mejor / peor trade del mes',            default: true  },
    { id: 'risk_total',    label: 'Risk total comprometido',               default: false },
    { id: 'net_liq',       label: 'NAV (último snapshot)',                 default: true  },
    { id: 'closed_today',  label: 'Operaciones cerradas hoy',              default: false },
    { id: 'pnl_sparkline', label: '📊 Sparkline P&L últimos 6 meses',       default: false }
  ]},
  { id: 'training', icon: '💪', label: 'Full Training', items: [
    { id: 'clientes',      label: 'Clientes activos',                      default: true  },
    { id: 'equipo',        label: 'Personas en equipo',                    default: true  },
    { id: 'ingresos_mes',  label: 'Facturado vs cobrado del mes',          default: true  },
    { id: 'ingresos_avg',  label: 'Media facturación mensual (últimos N meses)', default: false },
    { id: 'ingresos_avg_months', label: '↳ N meses', default: 6, type: 'number', min: 2, max: 24 },
    { id: 'impagos',       label: 'Impagos del mes',                       default: true  },
    { id: 'top_servicios', label: 'Top 3 servicios más vendidos',          default: false },
    { id: 'top_clientes',  label: 'Top 3 clientes (más facturación)',      default: false },
    { id: 'sesiones_hoy',  label: 'Sesiones programadas hoy',              default: false },
    { id: 'stock_critico', label: 'Stock crítico (≤2 unidades)',           default: false }
  ]},
  { id: 'facturas', icon: '📄', label: 'Facturas', items: [
    { id: 'pendientes',    label: 'Facturas pendientes',                   default: true  },
    { id: 'vencidas',      label: 'Facturas vencidas',                     default: true  },
    { id: 'total_mes',     label: 'Total facturado este mes',              default: true  },
    { id: 'top_cliente',   label: 'Top cliente del mes',                   default: false }
  ]}
];

function _renderNotifDays(activeDays){
  const cont = document.getElementById('notifDays');
  if(!cont) return;
  cont.innerHTML = '';
  NOTIF_DAYS.forEach(d => {
    const checked = activeDays ? activeDays.includes(d.code) : true;
    const lbl = document.createElement('label');
    lbl.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:#0a1421;border:1px solid #1e2d3d;padding:6px 11px;border-radius:6px;cursor:pointer;font-size:.78rem;color:#67e8f9;font-family:DM Mono,monospace;';
    lbl.innerHTML = `<input type="checkbox" data-day="${d.code}" ${checked?'checked':''} style="accent-color:#22d3ee;"> ${d.label}`;
    cont.appendChild(lbl);
  });
}

function _renderNotifSections(savedSections){
  const cont = document.getElementById('notifSections');
  if(!cont) return;
  cont.innerHTML = '';
  NOTIF_SECTIONS.forEach(sec => {
    const saved = (savedSections && savedSections[sec.id]) || {};
    const sectionEnabled = saved.enabled !== false;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border:1px solid #06b6d433;border-radius:6px;margin-bottom:10px;background:#020617;';
    const header = document.createElement('label');
    header.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid #06b6d422;font-weight:600;color:#22d3ee;';
    header.innerHTML = `
      <input type="checkbox" data-sec-enabled="${sec.id}" ${sectionEnabled?'checked':''} style="accent-color:#22d3ee;width:16px;height:16px;">
      <span>${sec.icon} ${sec.label}</span>
    `;
    wrap.appendChild(header);
    const itemsWrap = document.createElement('div');
    itemsWrap.style.cssText = 'padding:6px 18px 10px;display:flex;flex-direction:column;gap:5px;';
    sec.items.forEach(it => {
      if(it.type === 'number'){
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:.78rem;color:#67e8f9;padding-left:6px;';
        const val = saved[it.id] != null ? saved[it.id] : it.default;
        row.innerHTML = `
          <span style="flex:1">${it.label}</span>
          <input type="number" data-sec-item="${sec.id}/${it.id}" value="${val}" min="${it.min||0}" max="${it.max||999}" style="width:70px;background:#0a0e14;border:1px solid #1e3a5f;color:#e0f2fe;padding:3px 6px;border-radius:4px;font-family:DM Mono,monospace;font-size:.78rem;">
        `;
        itemsWrap.appendChild(row);
      } else {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:.78rem;color:#67e8f9;cursor:pointer;padding-left:6px;';
        const checked = saved[it.id] != null ? saved[it.id] : it.default;
        lbl.innerHTML = `<input type="checkbox" data-sec-item="${sec.id}/${it.id}" ${checked?'checked':''} style="accent-color:#22d3ee;"> ${it.label}`;
        itemsWrap.appendChild(lbl);
      }
    });
    wrap.appendChild(itemsWrap);
    cont.appendChild(wrap);
  });
}

function _readNotifFormConfig(){
  const days = [];
  document.querySelectorAll('#notifDays input[data-day]').forEach(inp => {
    if(inp.checked) days.push(inp.dataset.day);
  });
  const sections = {};
  NOTIF_SECTIONS.forEach(sec => {
    const enabledInp = document.querySelector(`#notifSections input[data-sec-enabled="${sec.id}"]`);
    sections[sec.id] = { enabled: enabledInp ? enabledInp.checked : true };
    sec.items.forEach(it => {
      const inp = document.querySelector(`#notifSections [data-sec-item="${sec.id}/${it.id}"]`);
      if(!inp) return;
      sections[sec.id][it.id] = (it.type === 'number') ? (parseInt(inp.value, 10) || it.default) : inp.checked;
    });
  });
  return {
    bot_token: document.getElementById('notifBotToken').value.trim(),
    chat_id: document.getElementById('notifChatId').value.trim(),
    time: document.getElementById('notifTime').value || '09:00',
    enabled: document.getElementById('notifEnabled').checked,
    days: days,
    sections: sections,
    ai_insight: document.getElementById('notifAiInsight').checked,
    weekly_enabled: document.getElementById('notifWeeklyEnabled').checked,
    weekly_day: document.getElementById('notifWeeklyDay').value || 'mon',
    weekly_time: document.getElementById('notifWeeklyTime').value || '09:00',
    tz: 'Europe/Madrid',
    updated_at: new Date().toISOString()
  };
}

async function _notifShowForm(){
  document.getElementById('notifGate').style.display = 'none';
  document.getElementById('notifForm').style.display = 'block';
  let cfg = null;
  try { cfg = await GitHubSync.fetchSection('__notif'); } catch(e){}
  document.getElementById('notifBotToken').value = (cfg && cfg.bot_token) || '';
  document.getElementById('notifChatId').value = (cfg && cfg.chat_id) || '';
  document.getElementById('notifTime').value = (cfg && cfg.time) || '09:00';
  document.getElementById('notifEnabled').checked = cfg ? cfg.enabled !== false : true;
  document.getElementById('notifAiInsight').checked = cfg ? !!cfg.ai_insight : false;
  document.getElementById('notifWeeklyEnabled').checked = cfg ? !!cfg.weekly_enabled : false;
  document.getElementById('notifWeeklyDay').value = (cfg && cfg.weekly_day) || 'mon';
  document.getElementById('notifWeeklyTime').value = (cfg && cfg.weekly_time) || '09:00';
  _renderNotifDays(cfg && cfg.days);
  _renderNotifSections(cfg && cfg.sections);
}

async function saveNotifConfig(){
  if(!_notifAuthenticated){ toast('Sesión expirada. Vuelve a entrar.', 'red'); return; }
  const cfg = _readNotifFormConfig();
  if(!cfg.bot_token){ _showNotifMsg('⚠ Falta el bot token', '#fca5a5'); return; }
  if(!cfg.chat_id){ _showNotifMsg('⚠ Falta el chat_id', '#fca5a5'); return; }
  if(!cfg.days.length){ _showNotifMsg('⚠ Selecciona al menos 1 día de envío', '#fca5a5'); return; }
  _showNotifMsg('⏳ Guardando...', '#67e8f9');
  try {
    await GitHubSync.updateSection('__notif', () => cfg);
    _showNotifMsg('✓ Configuración guardada en data.json', '#22d3ee');
  } catch(err){
    _showNotifMsg('✕ Error: ' + err.message, '#fca5a5');
  }
}

// Preview en pantalla del mensaje que se enviaría con la config actual
async function previewNotifMessage(){
  const cfg = _readNotifFormConfig();
  _showNotifMsg('⏳ Generando preview...', '#67e8f9');
  try {
    const fullData = await GitHubSync.fetchFullData();
    const text = _buildSummaryClient(fullData, cfg);
    const el = document.getElementById('notifFormMsg');
    el.style.display = 'block';
    el.style.color = '#67e8f9';
    el.style.whiteSpace = 'pre-wrap';
    el.style.maxHeight = '300px';
    el.style.overflowY = 'auto';
    el.style.background = '#0a1421';
    el.style.border = '1px solid #1e2d3d';
    el.style.padding = '10px 12px';
    el.style.borderRadius = '4px';
    el.textContent = text.replace(/<[^>]+>/g, '');
  } catch(err){
    _showNotifMsg('✕ Error preview: ' + err.message, '#fca5a5');
  }
}

// Sparkline ASCII (8 niveles)
function _spark(values){
  const v = values.filter(x => x!=null && !isNaN(x));
  if(v.length < 2) return '';
  const blocks = '▁▂▃▄▅▆▇█';
  const min = Math.min(...v), max = Math.max(...v), range = max - min || 1;
  return v.map(x => blocks[Math.round((x-min)/range*7)]).join('');
}
function _esc(s){ return String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[c]); }

// Genera el resumen en cliente (mirror de telegram-summary.js)
function _buildSummaryClient(data, cfg){
  const lines = [];
  const dt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date());
  lines.push(`<b>📊 Resumen — ${dt}</b>`);
  lines.push('');
  const S = (cfg && cfg.sections) || {};
  const monthKey = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Madrid', year:'numeric', month:'2-digit'
  }).format(new Date()).slice(0, 7);
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date());
  const today0 = new Date(todayStr + 'T00:00:00Z');

  // PATRIMONIO
  const patSec = S.patrimonio || {};
  if(patSec.enabled !== false){
    try {
      const profiles = _pmaybe(data?.patrimonio?.pat_v5);
      if(Array.isArray(profiles) && profiles.length){
        const p = profiles[0];
        const ents = [...(p.entries||[])].sort((a,b)=>(a.year-b.year)||(a.month-b.month));
        if(ents.length){
          const last = ents[ents.length-1];
          const totalNow = _calcPat(last);
          const block = [];
          if(patSec.total !== false) block.push(`💰 <b>Patrimonio</b>: €${_fnum(totalNow)}`);
          if(patSec.delta !== false && ents.length >= 2){
            const prev = ents[ents.length-2], totalPrev = _calcPat(prev);
            const diff = totalNow - totalPrev;
            const pct = totalPrev ? (diff/totalPrev*100) : 0;
            block.push(`   ${diff>=0?'↑':'↓'} ${diff>=0?'+':''}€${_fnum(Math.abs(diff))} (${pct>=0?'+':''}${pct.toFixed(1)}%) vs mes anterior`);
          }
          if(patSec.objetivo !== false){
            const obj = (p.objectives||[]).find(o=>o.type==='patrimonio') || (p.objectives||[])[0];
            if(obj && obj.target > 0){
              const pct = (totalNow/obj.target*100).toFixed(1);
              block.push(`   🎯 ${pct}% del objetivo (€${_fnum(obj.target)})`);
            }
          }
          if(patSec.sparkline === true && ents.length >= 2){
            const last12 = ents.slice(-12).map(e => _calcPat(e));
            const spark = _spark(last12);
            if(spark) block.push(`   <code>${spark}</code> últimos ${last12.length}m`);
          }
          if(patSec.ytd_pct === true){
            const yearStart = ents.find(e => e.year === last.year && e.month === 0)
                          || ents.find(e => e.year === last.year);
            if(yearStart){
              const t0 = _calcPat(yearStart);
              if(t0){
                const ytd = ((totalNow - t0) / t0 * 100);
                block.push(`   📅 YTD: ${ytd>=0?'+':''}${ytd.toFixed(1)}%`);
              }
            }
          }
          if(patSec.gastos_mes === true){
            const txs = p?.gastos?.meses?.[monthKey]?.transacciones || [];
            if(txs.length){
              const total = txs.reduce((s,t) => s + Math.abs(parseFloat(t.importe)||0), 0);
              const byCat = {};
              txs.forEach(t => {
                const cid = t.categoriaId || '_sin';
                byCat[cid] = (byCat[cid]||0) + Math.abs(parseFloat(t.importe)||0);
              });
              const cats = p?.gastos?.categorias || [];
              const top3 = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,3);
              block.push(`   💸 Gastos ${monthKey}: €${_fnum(total)} (${txs.length} mov)`);
              top3.forEach(([cid,amt]) => {
                const cat = cats.find(c => c.id === cid);
                block.push(`     • ${_esc(cat?cat.name:'Sin categoría')}: €${_fnum(amt)}`);
              });
            }
          }
          if(patSec.ingresos_mes === true){
            const ingSec = (p.sections||[]).find(s => s.id === 's_ingresos' || s.type === 'ingresos');
            if(ingSec){
              let total = 0;
              (ingSec.assets||[]).forEach(a => {
                const v = parseFloat(last.assets?.[a.id]) || 0;
                if(v > 0) total += v;
              });
              if(total > 0) block.push(`   💵 Ingresos ${monthKey}: €${_fnum(total)}`);
            }
          }
          if(patSec.distribucion === true){
            (p.sections||[]).forEach(sec => {
              if(sec.id === 's_ingresos' || sec.type === 'ingresos') return;
              let secTotal = 0;
              (sec.assets||[]).forEach(a => {
                const v = parseFloat(last.assets?.[a.id]);
                if(!isNaN(v)) secTotal += v;
              });
              if(secTotal > 0 && totalNow > 0){
                const pct = (secTotal/totalNow*100).toFixed(0);
                block.push(`     ${_esc(sec.name)}: €${_fnum(secTotal)} (${pct}%)`);
              }
            });
          }
          if(patSec.top_mover === true && ents.length >= 2){
            const prev = ents[ents.length-2];
            let bestDiff = 0, bestName = '';
            (p.sections||[]).forEach(sec => {
              (sec.assets||[]).forEach(a => {
                const cur = parseFloat(last.assets?.[a.id]) || 0;
                const pre = parseFloat(prev.assets?.[a.id]) || 0;
                const diff = cur - pre;
                if(Math.abs(diff) > Math.abs(bestDiff)){
                  bestDiff = diff; bestName = a.name;
                }
              });
            });
            if(bestName) block.push(`   ⭐ Top mover: ${_esc(bestName)} ${bestDiff>=0?'+':''}€${_fnum(Math.abs(bestDiff))}`);
          }
          if(block.length) lines.push(...block);
        }
      }
    } catch(e){ console.warn('preview patrimonio:', e); }
  }

  // OPCIONES
  const optSec = S.options || {};
  if(optSec.enabled !== false){
    try {
      const arr = _pmaybe(data?.options?.ot_activas);
      const hist = _pmaybe(data?.options?.ot_hist);
      const snaps = _pmaybe(data?.options?.ot_snaps);
      if(Array.isArray(arr)){
        const block = [];
        if(optSec.count !== false) block.push(`📈 <b>Opciones</b>: ${arr.length} activas`);
        if(optSec.net_liq === true && Array.isArray(snaps) && snaps.length){
          const sorted = [...snaps].sort((a,b) => (a.date||'').localeCompare(b.date||''));
          const latest = sorted[sorted.length-1];
          if(latest) block.push(`   💵 NAV ${latest.date}: $${_fnum(latest.val)}`);
        }
        if(optSec.expiring !== false){
          const dteLimit = optSec.expiring_days || 7;
          const exp = arr.filter(a => {
            if(!a.exp) return false;
            const d = Math.round((new Date(a.exp + 'T00:00:00Z') - today0) / 86400000);
            return d >= 0 && d <= dteLimit;
          });
          if(exp.length){
            block.push(`   ⚠ ${exp.length} expira/n en ≤${dteLimit}d:`);
            exp.slice(0,6).forEach(a => {
              const d = Math.round((new Date(a.exp + 'T00:00:00Z') - today0) / 86400000);
              block.push(`     • <code>${_esc(a.activo||'?')}</code> ${a.strat||''} · ${d}d`);
            });
          }
        }
        if(optSec.lista_activas === true && arr.length){
          block.push(`   📋 Posiciones activas:`);
          arr.slice(0, 12).forEach(a => {
            const ctr = parseInt(a.contracts) || 1;
            const dte = a.exp ? Math.round((new Date(a.exp + 'T00:00:00Z') - today0) / 86400000) : null;
            const pIn  = (parseFloat(a.pCredito)||0) * 100;
            const pAct = a.priceCurrent != null ? parseFloat(a.priceCurrent) * 100 : null;
            let pnlStr = '';
            if(pAct != null){
              const unrealized = (pIn - pAct) * ctr;
              pnlStr = ` · ${unrealized>=0?'+':''}$${_fnum(Math.abs(unrealized))}`;
            }
            const dteStr = dte != null ? ` ${dte}d` : '';
            const ctrStr = ctr > 1 ? ` x${ctr}` : '';
            block.push(`     • <code>${_esc(a.activo||'?')}</code> ${a.strat||''}${ctrStr}${dteStr}${pnlStr}`);
          });
          if(arr.length > 12) block.push(`     ... y ${arr.length-12} más`);
        }
        const mesHist = Array.isArray(hist) ? hist.filter(h => (h.cierre||'').startsWith(monthKey)) : [];
        if(optSec.pnl_mes === true && mesHist.length){
          const pnl = mesHist.reduce((s,h) => s + (parseFloat(h.totalNeto)||0), 0) * 100;
          block.push(`   💵 P&L ${monthKey}: ${pnl>=0?'+':''}$${_fnum(pnl)} (${mesHist.length} ops)`);
        }
        if(optSec.win_rate_mes === true && mesHist.length){
          const wins = mesHist.filter(h => (parseFloat(h.totalNeto)||0) > 0).length;
          const losses = mesHist.length - wins;
          const wr = (wins/mesHist.length*100).toFixed(0);
          block.push(`   📊 WR ${monthKey}: ${wr}% (${wins}W / ${losses}L)`);
        }
        if(optSec.best_worst === true && mesHist.length){
          const sorted = [...mesHist].sort((a,b) => (parseFloat(b.totalNeto)||0) - (parseFloat(a.totalNeto)||0));
          const best = sorted[0], worst = sorted[sorted.length-1];
          if(best && (parseFloat(best.totalNeto)||0) > 0){
            const v = (parseFloat(best.totalNeto)||0) * 100;
            block.push(`   🏆 Best: <code>${_esc(best.activo||'?')}</code> ${best.strat||''} +$${_fnum(v)}`);
          }
          if(worst && worst !== best && (parseFloat(worst.totalNeto)||0) < 0){
            const v = Math.abs((parseFloat(worst.totalNeto)||0) * 100);
            block.push(`   📉 Worst: <code>${_esc(worst.activo||'?')}</code> ${worst.strat||''} -$${_fnum(v)}`);
          }
        }
        if(optSec.risk_total === true){
          let riskTot = 0;
          arr.forEach(a => { riskTot += parseFloat(a.maxRisk)||0; });
          if(riskTot > 0) block.push(`   💼 Risk total: $${_fnum(riskTot)}`);
        }
        if(optSec.closed_today === true && Array.isArray(hist)){
          const closedToday = hist.filter(h => h.cierre === todayStr);
          if(closedToday.length){
            block.push(`   ✔ Cerradas hoy: ${closedToday.length}`);
            closedToday.slice(0,4).forEach(h => {
              const pnl = (parseFloat(h.totalNeto)||0) * 100;
              block.push(`     • ${_esc(h.activo||'?')} ${h.strat||''} ${pnl>=0?'+':''}$${_fnum(pnl)}`);
            });
          }
        }
        if(optSec.pnl_sparkline === true && Array.isArray(hist)){
          const pnlByMonth = {};
          hist.forEach(h => {
            const k = (h.cierre||'').slice(0,7);
            if(!k) return;
            pnlByMonth[k] = (pnlByMonth[k]||0) + (parseFloat(h.totalNeto)||0);
          });
          const last6 = Object.keys(pnlByMonth).sort().slice(-6).map(k => pnlByMonth[k] * 100);
          if(last6.length >= 2){
            const spark = _spark(last6);
            if(spark) block.push(`   <code>${spark}</code> P&L últimos ${last6.length}m`);
          }
        }
        if(block.length){ lines.push(''); lines.push(...block); }
      }
    } catch(e){ console.warn('preview options:', e); }
  }

  // FT
  const ftSec = S.training || {};
  if(ftSec.enabled !== false){
    try {
      const ft = _pmaybe(data?.training?.ft_v4);
      if(ft){
        const block = [];
        const activos = (ft.clients||[]).filter(c => c.active).length;
        const equipo  = (ft.team||[]).filter(t => t.active !== false).length;
        const parts = [];
        if(ftSec.clientes !== false) parts.push(`${activos} clientes`);
        if(ftSec.equipo !== false)   parts.push(`${equipo} en equipo`);
        if(parts.length) block.push(`💪 <b>Full Training</b>: ${parts.join(' · ')}`);
        const m = ft.months?.[monthKey];
        if(ftSec.ingresos_mes === true && m){
          let totalFact = 0, totalCobr = 0;
          (m.entries||[]).forEach(e => {
            let entryTotal = 0;
            (e.lines||[]).forEach(l => { entryTotal += (parseFloat(l.qty)||0) * (parseFloat(l.price)||0); });
            totalFact += entryTotal;
            if(e.paid) totalCobr += entryTotal;
          });
          (m.masajes||[]).forEach(mas => {
            const t = (parseFloat(mas.qty)||0) * (parseFloat(mas.price)||0);
            totalFact += t;
            if(mas.paid) totalCobr += t;
          });
          if(totalFact > 0){
            const pctCobr = totalFact ? (totalCobr/totalFact*100).toFixed(0) : 0;
            block.push(`   💵 Facturado ${monthKey}: €${_fnum(totalFact)} (€${_fnum(totalCobr)} cobrado · ${pctCobr}%)`);
          }
        }
        if(ftSec.impagos !== false && m){
          const imp = (m.entries||[]).filter(e => e.paid === false).length;
          if(imp > 0) block.push(`   ⚠ ${imp} impagos en ${monthKey}`);
        }
        if(ftSec.top_servicios === true && m){
          const services = ft.services || [];
          const byService = {};
          (m.entries||[]).forEach(e => {
            (e.lines||[]).forEach(l => {
              const lt = (parseFloat(l.qty)||0) * (parseFloat(l.price)||0);
              byService[l.serviceId] = (byService[l.serviceId]||0) + lt;
            });
          });
          const topSrv = Object.entries(byService).sort((a,b) => b[1]-a[1]).slice(0,3);
          if(topSrv.length){
            block.push(`   🏆 Top servicios:`);
            topSrv.forEach(([sid,total]) => {
              const svc = services.find(s => s.id === sid);
              block.push(`     • ${_esc(svc?svc.name:sid)}: €${_fnum(total)}`);
            });
          }
        }
        if(ftSec.top_clientes === true && m){
          const clients = ft.clients || [];
          const byClient = {};
          (m.entries||[]).forEach(e => {
            let entryTotal = 0;
            (e.lines||[]).forEach(l => { entryTotal += (parseFloat(l.qty)||0) * (parseFloat(l.price)||0); });
            byClient[e.clientId] = (byClient[e.clientId]||0) + entryTotal;
          });
          const top = Object.entries(byClient).sort((a,b) => b[1]-a[1]).slice(0,3);
          if(top.length){
            block.push(`   👥 Top clientes:`);
            top.forEach(([cid,total]) => {
              const cli = clients.find(c => c.id === cid);
              block.push(`     • ${_esc(cli?cli.name:cid)}: €${_fnum(total)}`);
            });
          }
        }
        if(ftSec.sesiones_hoy === true){
          const monthM = ft.months?.[monthKey];
          if(monthM){
            let sesHoy = 0;
            (monthM.masajes||[]).forEach(mas => { if(mas.fecha === todayStr) sesHoy++; });
            (monthM.entries||[]).forEach(e => { if(e.fecha === todayStr) sesHoy++; });
            if(sesHoy > 0) block.push(`   📅 ${sesHoy} sesion${sesHoy===1?'':'es'} hoy`);
          }
        }
        if(ftSec.stock_critico === true){
          const critico = (ft.stock||[]).filter(s => {
            const total = Object.values(s.sizes||{}).reduce((sum,n) => sum + (parseInt(n)||0), 0);
            return total > 0 && total <= 2;
          });
          if(critico.length){
            block.push(`   📦 ${critico.length} producto${critico.length===1?'':'s'} con stock ≤2`);
            critico.slice(0,3).forEach(s => {
              const total = Object.values(s.sizes||{}).reduce((sum,n) => sum + (parseInt(n)||0), 0);
              block.push(`     • ${_esc(s.name)} (${total} uds)`);
            });
          }
        }
        if(block.length){ lines.push(''); lines.push(...block); }
      }
    } catch(e){ console.warn('preview ft:', e); }
  }

  // FACTURAS
  const facSec = S.facturas || {};
  if(facSec.enabled !== false){
    try {
      const profiles = _pmaybe(data?.facturas?.fac_v1);
      if(Array.isArray(profiles)){
        let pend=0, venc=0, totalMes=0;
        const byClienteMes = {};
        profiles.forEach(p => (p.facturas||[]).forEach(f => {
          if(f.estado==='pendiente') pend++;
          if(f.estado==='vencida')   venc++;
          if(f.fecha && f.fecha.startsWith(monthKey)){
            const t = parseFloat(f.total)||0;
            totalMes += t;
            const cn = f.clienteName || f.clienteId || '?';
            byClienteMes[cn] = (byClienteMes[cn]||0) + t;
          }
        }));
        const block = [];
        const parts = [];
        if(facSec.pendientes !== false && pend) parts.push(`${pend} pendientes`);
        if(facSec.vencidas   !== false && venc) parts.push(`<b>${venc} vencidas</b>`);
        if(parts.length) block.push(`📄 <b>Facturas</b>: ${parts.join(' · ')}`);
        if(facSec.total_mes !== false && totalMes > 0) block.push(`   💶 Facturado ${monthKey}: €${_fnum(totalMes)}`);
        if(facSec.top_cliente === true){
          const top = Object.entries(byClienteMes).sort((a,b) => b[1]-a[1])[0];
          if(top) block.push(`   👤 Top cliente: ${_esc(top[0])} (€${_fnum(top[1])})`);
        }
        if(block.length){ lines.push(''); lines.push(...block); }
      }
    } catch(e){ console.warn('preview facturas:', e); }
  }

  if(cfg.ai_insight){
    lines.push('');
    lines.push('🤖 <i>(AI insight aparecerá aquí en el envío real, usando tus IA APIs configuradas en el inicio. La preview no llama a la IA.)</i>');
  }
  lines.push('');
  lines.push('<i>Auto-generado por mis-dashboards</i>');
  return lines.join('\n');
}

function _pmaybe(v){
  if(v == null) return null;
  if(typeof v === 'object') return v;
  if(typeof v === 'string'){ try { return JSON.parse(v); } catch(e){ return null; } }
  return null;
}
function _calcPat(entry){
  let t = 0;
  Object.values(entry.assets||{}).forEach(v => { const n = parseFloat(v); if(!isNaN(n)) t += n; });
  Object.values(entry.debts||{}).forEach(v => { const n = parseFloat(v); if(!isNaN(n)) t -= n; });
  return t;
}
function _fnum(n){ return new Intl.NumberFormat('es-ES',{maximumFractionDigits:0}).format(n); }

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
