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

// Sincronización manual desde el menú (sin pasar por la loadingScreen).
// Baja data.json del remoto y lo aplica a localStorage → así, al entrar
// desde otro ordenador, primero te traes lo último ANTES de tocar nada y
// no machacas con datos viejos lo que guardaste en el otro PC.
async function syncNow(btn){
  if(!GitHubSync.isLoggedIn()){ return; }
  const lastUpd = document.getElementById('lastUpd');
  const restoreBtn = () => { if(btn){ btn.textContent = btn._orig; btn.disabled = false; } };
  if(btn){ btn._orig = btn.textContent; btn.disabled = true; btn.textContent = '↻ Sincronizando…'; }
  if(lastUpd) lastUpd.textContent = '↻ sincronizando…';
  try {
    const result = await GitHubSync.pullAndApplyAll();
    if(result && result.lastUpdate){
      localStorage.setItem('gh_last_remote_lastUpdate', result.lastUpdate);
    }
    await loadDashboardVisibilityConfig({ force: true });
    computeKpis();
    applyDashboardVisibility();
    if(lastUpd) lastUpd.textContent = '▸ SYNC OK · ' + new Date().toLocaleTimeString('es-ES') + ' ◂';
    if(btn){ btn.textContent = '✓ Sincronizado'; setTimeout(restoreBtn, 1600); }
  } catch(e){
    const is401 = e && (e.status === 401 || e.status === 403);
    if(lastUpd) lastUpd.textContent = is401 ? '⚠ token inválido — vuelve a entrar' : '⚠ error de sync';
    if(btn){ btn.textContent = '⚠ Error'; setTimeout(restoreBtn, 2400); }
  }
}

async function goMenu(){
  document.getElementById('menuRepo').textContent     = GitHubSync.getRepo() || '—';
  document.getElementById('menuRepoFull').textContent = GitHubSync.getRepo() || '—';
  await loadDashboardVisibilityConfig();
  computeKpis();
  applyDashboardVisibility();
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
  computeToKpi();
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
    // Bug-fix: usar només entrades "completes" (amb almenys un actiu d'inversió/banc
    // amb valor > 0, ignorant ingressos). Si tens moviments registrats per al mes
    // en curs però encara no has posat el saldo de cap broker, aquell mes no compta
    // i continuem mostrant el patrimoni del darrer mes tancat.
    const ingSec = (p.sections||[]).find(s => s.id === 's_ingresos' || s.type === 'ingresos' || /ingreso/i.test(s.title||''));
    const ingIds = new Set(ingSec ? (ingSec.assets||[]).map(a=>a.id) : []);
    const isComplete = e => Object.entries(e.assets || {}).some(([id, v]) => {
      if(ingIds.has(id)) return false;
      const n = parseFloat(v);
      return !isNaN(n) && n > 0;
    });
    const completeEnts = ents.filter(isComplete);
    if(!completeEnts.length) return;   // no hi ha cap mes tancat encara
    const last = completeEnts[completeEnts.length-1];
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

function computeToKpi(){
  try{
    const raw = localStorage.getItem('tob_online_v2');
    if(!raw) return;
    const db = JSON.parse(raw);
    const nClientes = Array.isArray(db.clientes) ? db.clientes.length : 0;
    const el = document.getElementById('kpiToClientes');
    if(el) el.textContent = nClientes;
    setUpdFromAppPrefix('kpiToUpd', 'to');
  } catch(e){ console.warn('KPI consulta:', e); }
}

function askLogout(){
  if(!confirm('Esto borra el token de ESTE dispositivo. Tus datos en GitHub no se tocan. ¿Continuar?')) return;
  // Reset flags de autenticación
  _configAuthenticated = false;
  _authPendingCallback = null;
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

// ════════ MENÚ DE CONFIGURACIÓN (puerta única) ════════
// Cuando el user pulsa "⚙ Configuración" en menuScreen.
// Si ya hay sesión autenticada (_configAuthenticated) abre directo.
// Si no, pasa por el gate de contraseña, y al pasar muestra el panel.
let _configAuthenticated = false;
let _authPendingCallback = null;

function openConfigMenu(){
  _requireAuth(() => _showConfigMenuPanel());
}
function closeConfigMenu(){
  document.getElementById('configMenuModal').style.display = 'none';
  document.getElementById('menuScreen').classList.add('active');
}
function _showConfigMenuPanel(){
  document.getElementById('menuScreen').classList.remove('active');
  document.getElementById('configMenuModal').style.display = 'flex';
}
function _requireAuth(callback){ callback(); }
// ── Modal de APIs (solo Financieras ya, IA fuera) ──
const DASHBOARD_VIS_SECTION = '__dashboard_config';
const DASHBOARD_VIS_LOCAL_KEY = 'dashboard_visibility_v1';
const DASHBOARD_APPS = [
  { id:'patrimonio', label:'Patrimonio', file:'patrimonio.html' },
  { id:'options', label:'Opciones', file:'options.html' },
  { id:'full_training', label:'Full Training', file:'full_training.html' },
  { id:'facturas', label:'Facturas', file:'facturas.html' },
  { id:'consulta', label:'Consulta', file:'consulta.html' }
];
let _dashboardVisibilityLoaded = false;
let _dashboardVisibility = { hidden: [] };

function getDashboardVisibility(){
  try {
    const cfg = JSON.parse(localStorage.getItem(DASHBOARD_VIS_LOCAL_KEY) || '{}');
    return { hidden: Array.isArray(cfg.hidden) ? cfg.hidden : [] };
  } catch(e){
    return { hidden: [] };
  }
}

function setDashboardVisibility(cfg){
  _dashboardVisibility = { hidden: Array.isArray(cfg && cfg.hidden) ? cfg.hidden : [] };
  localStorage.setItem(DASHBOARD_VIS_LOCAL_KEY, JSON.stringify(_dashboardVisibility));
}

async function loadDashboardVisibilityConfig(opts){
  if(_dashboardVisibilityLoaded && !(opts && opts.force)) return _dashboardVisibility;
  _dashboardVisibility = getDashboardVisibility();
  if(window.GitHubSync && GitHubSync.isLoggedIn() && GitHubSync.fetchSection){
    try {
      const remote = await GitHubSync.fetchSection(DASHBOARD_VIS_SECTION);
      if(remote && remote.dashboardVisibility){
        setDashboardVisibility(remote.dashboardVisibility);
      }
    } catch(e){
      console.warn('[dashboard visibility] fetch failed:', e.message);
    }
  }
  _dashboardVisibilityLoaded = true;
  return _dashboardVisibility;
}

function applyDashboardVisibility(){
  const hidden = new Set((getDashboardVisibility().hidden || []).map(String));
  document.querySelectorAll('.menu-card[data-dashboard-id]').forEach(card => {
    const id = card.getAttribute('data-dashboard-id');
    card.style.display = hidden.has(id) ? 'none' : '';
  });
}

async function openDashboardVisibilityModal(){
  await loadDashboardVisibilityConfig();
  const cfg = getDashboardVisibility();
  const hidden = new Set(cfg.hidden || []);
  const list = document.getElementById('dashboardVisibilityList');
  const msg = document.getElementById('dashboardVisibilityMsg');
  if(msg) msg.style.display = 'none';
  if(list){
    list.innerHTML = DASHBOARD_APPS.map(app => `
      <label style="display:flex;align-items:center;gap:10px;background:#020617;border:1px solid #06b6d433;padding:12px 14px;color:#67e8f9;cursor:pointer;">
        <input type="checkbox" data-dashboard-toggle="${app.id}" ${hidden.has(app.id) ? '' : 'checked'} style="accent-color:#22d3ee;">
        <div style="flex:1">
          <div style="font-weight:600;letter-spacing:.05em">${app.label}</div>
          <div style="font-size:.68rem;color:#0e7490;font-family:'DM Mono',monospace">${app.file}</div>
        </div>
      </label>
    `).join('');
  }
  document.getElementById('menuScreen').classList.remove('active');
  document.getElementById('dashboardVisibilityModal').style.display = 'flex';
}

function closeDashboardVisibilityModal(){
  document.getElementById('dashboardVisibilityModal').style.display = 'none';
  if(_configAuthenticated) _showConfigMenuPanel();
  else document.getElementById('menuScreen').classList.add('active');
}

async function saveDashboardVisibility(){
  const checked = new Set(Array.from(document.querySelectorAll('[data-dashboard-toggle]'))
    .filter(el => el.checked)
    .map(el => el.getAttribute('data-dashboard-toggle')));
  const hidden = DASHBOARD_APPS.map(app => app.id).filter(id => !checked.has(id));
  const cfg = { hidden };
  const msg = document.getElementById('dashboardVisibilityMsg');
  const showMsg = (text, color) => {
    if(!msg) return;
    msg.style.display = 'block';
    msg.style.color = color;
    msg.textContent = text;
  };
  if(hidden.length >= DASHBOARD_APPS.length){
    showMsg('Deja al menos un HTML visible.', '#fca5a5');
    return;
  }
  setDashboardVisibility(cfg);
  applyDashboardVisibility();
  showMsg('Guardando...', '#67e8f9');
  try {
    if(window.GitHubSync && GitHubSync.isLoggedIn() && GitHubSync.updateSection){
      await GitHubSync.updateSection(DASHBOARD_VIS_SECTION, current => ({
        ...(current || {}),
        dashboardVisibility: cfg,
        updated_at: new Date().toISOString()
      }));
    }
    showMsg('Guardado', '#22d3ee');
    setTimeout(closeDashboardVisibilityModal, 500);
  } catch(e){
    showMsg('Guardado local. Sync fallido: ' + e.message, '#fbbf24');
  }
}

function openApisModal(){
  closeConfigMenu();
  document.getElementById('apisModal').style.display = 'flex';
  _loadFinApisToForm();
}
function closeApisModal(){
  document.getElementById('apisModal').style.display = 'none';
  if(_configAuthenticated){
    _showConfigMenuPanel();
  } else {
    document.getElementById('menuScreen').classList.add('active');
  }
}

// ── APIs FINANCIERAS (lista flexible) ──
const FIN_PROVIDERS_LOCAL_KEY = 'fin_providers_v1';
let _editingFinId = null;

function finLoadProviders(){
  try { return JSON.parse(localStorage.getItem(FIN_PROVIDERS_LOCAL_KEY)) || []; }
  catch { return []; }
}
function finSaveProviders(list){
  localStorage.setItem(FIN_PROVIDERS_LOCAL_KEY, JSON.stringify(list));
  // Sync a data.json __fin (para que el script Action las pueda usar)
  if(window.GitHubSync && GitHubSync.updateSection && GitHubSync.isLoggedIn()){
    if(typeof toast === 'function') toast('Sincronizando APIs financieras...', 'info');
    GitHubSync.updateSection('__fin', () => ({
      providers: list,
      updated_at: new Date().toISOString()
    })).then(() => {
      if(typeof toast === 'function') toast('✓ Financieras sincronizadas');
    }).catch(err => {
      console.warn('[__fin sync]', err);
      if(typeof toast === 'function') toast('⚠ Sync falló: ' + err.message, 'red');
    });
  }
}

async function _loadFinFromGithub(){
  // Intenta cargar de data.json __fin si en local no hay nada
  if(finLoadProviders().length) return;
  try {
    const cfg = await GitHubSync.fetchSection('__fin');
    if(cfg && Array.isArray(cfg.providers)){
      localStorage.setItem(FIN_PROVIDERS_LOCAL_KEY, JSON.stringify(cfg.providers));
    }
  } catch(e){}
}

async function _renderFinList(){
  await _loadFinFromGithub();
  const list = finLoadProviders();
  const cont = document.getElementById('finApisList');
  if(!cont) return;
  if(!list.length){
    cont.innerHTML = '<div class="ia-api-empty">No hay APIs financieras todavía.<br>Añade una pulsando "+ Añadir API"</div>';
    return;
  }
  const labels = { finnhub:'FINNHUB', alphavantage:'ALPHA VANTAGE', twelvedata:'TWELVE DATA',
                   polygon:'POLYGON', marketstack:'MARKETSTACK', iex:'IEX', otra:'OTRA' };
  cont.innerHTML = list.map((p, idx) => `
    <div class="ia-api-item" data-id="${p.id}">
      <div class="ia-api-info">
        <div class="ia-api-name">${idx+1}. ${escapeHtml(p.nombre || '(sin nombre)')}</div>
        <div class="ia-api-meta">${labels[p.tipo]||p.tipo} · key ****${(p.key||'').slice(-4)}</div>
      </div>
      <div class="ia-api-status ${p.activa ? 'on' : 'off'}">${p.activa ? 'ACTIVA' : 'INACTIVA'}</div>
      <div class="ia-api-actions">
        <button class="ia-api-btn" onclick="openFinApiEditor('${p.id}')">EDIT</button>
        <button class="ia-api-btn danger" onclick="deleteFinApi('${p.id}')">DEL</button>
      </div>
    </div>
  `).join('');
}

function openFinApiEditor(id){
  _editingFinId = id || null;
  document.getElementById('finApiEditorTitle').textContent = id ? '// EDITAR API FINANCIERA' : '// NUEVA API FINANCIERA';
  document.getElementById('finApiEditorMsg').style.display = 'none';
  if(id){
    const p = finLoadProviders().find(x => x.id === id);
    if(p){
      document.getElementById('finApiName').value   = p.nombre || '';
      document.getElementById('finApiTipo').value   = p.tipo   || 'finnhub';
      document.getElementById('finApiKey').value    = p.key    || '';
      document.getElementById('finApiActiva').checked = p.activa !== false;
    }
  } else {
    document.getElementById('finApiName').value = '';
    document.getElementById('finApiTipo').value = 'finnhub';
    document.getElementById('finApiKey').value  = '';
    document.getElementById('finApiActiva').checked = true;
  }
  document.getElementById('finApiEditorModal').style.display = 'flex';
  setTimeout(() => document.getElementById('finApiName').focus(), 50);
}

function closeFinApiEditor(){
  document.getElementById('finApiEditorModal').style.display = 'none';
  _editingFinId = null;
}

function saveFinApi(){
  const nombre = document.getElementById('finApiName').value.trim() || 'Sin nombre';
  const tipo   = document.getElementById('finApiTipo').value;
  const key    = document.getElementById('finApiKey').value.trim();
  const activa = document.getElementById('finApiActiva').checked;
  if(!key){ _showFinEditorMsg('⚠ Falta la API key', '#fca5a5'); return; }
  const list = finLoadProviders();
  if(_editingFinId){
    const idx = list.findIndex(p => p.id === _editingFinId);
    if(idx >= 0) list[idx] = { ...list[idx], nombre, tipo, key, activa };
  } else {
    list.push({ id: 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2,7), nombre, tipo, key, activa });
  }
  finSaveProviders(list);
  closeFinApiEditor();
  _renderFinList();
}

function deleteFinApi(id){
  if(!confirm('¿Eliminar esta API financiera?')) return;
  const list = finLoadProviders().filter(p => p.id !== id);
  finSaveProviders(list);
  _renderFinList();
}

async function testFinApi(){
  const tipo = document.getElementById('finApiTipo').value;
  const key  = document.getElementById('finApiKey').value.trim();
  if(!key){ _showFinEditorMsg('⚠ Pega la key primero', '#fca5a5'); return; }
  _showFinEditorMsg('⏳ Probando...', '#67e8f9');
  try {
    let url, parser;
    switch(tipo){
      case 'finnhub':
        url = `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(key)}`;
        parser = d => d.c != null ? `AAPL = $${d.c.toFixed(2)}` : null;
        break;
      case 'alphavantage':
        url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${encodeURIComponent(key)}`;
        parser = d => d['Global Quote']?.['05. price'] ? `AAPL = $${parseFloat(d['Global Quote']['05. price']).toFixed(2)}` : null;
        break;
      case 'twelvedata':
        url = `https://api.twelvedata.com/quote?symbol=AAPL&apikey=${encodeURIComponent(key)}`;
        parser = d => d.close ? `AAPL = $${parseFloat(d.close).toFixed(2)}` : null;
        break;
      case 'polygon':
        url = `https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${encodeURIComponent(key)}`;
        parser = d => d.results?.[0]?.c ? `AAPL = $${d.results[0].c.toFixed(2)}` : null;
        break;
      default:
        _showFinEditorMsg('? No tengo test para "' + tipo + '" — guarda y úsala desde tu integración', '#fbbf24');
        return;
    }
    const res = await fetch(url);
    if(!res.ok){ _showFinEditorMsg(`✕ HTTP ${res.status}: ${(await res.text()).slice(0,80)}`, '#fca5a5'); return; }
    const d = await res.json();
    const ok = parser(d);
    if(ok) _showFinEditorMsg(`✓ Funciona. ${ok}`, '#4ade80');
    else _showFinEditorMsg(`? Respuesta inesperada: ${JSON.stringify(d).slice(0,120)}`, '#fbbf24');
  } catch(err){
    _showFinEditorMsg('✕ Error de red: ' + err.message, '#fca5a5');
  }
}

function _showFinEditorMsg(text, color){
  const el = document.getElementById('finApiEditorMsg');
  el.style.display = 'block';
  el.style.color = color;
  el.textContent = text;
}

function _showFinMsg(text, color){
  const el = document.getElementById('finApiMsg');
  if(!el) return;
  el.style.display = 'block';
  el.style.color = color;
  el.textContent = text;
}

async function syncFinToGithub(){
  const list = finLoadProviders();
  if(!list.length){ _showFinMsg('No hay APIs financieras para sincronizar', '#fca5a5'); return; }
  if(!GitHubSync.isLoggedIn()){ _showFinMsg('No conectado a GitHub', '#fca5a5'); return; }
  _showFinMsg('⏳ Sincronizando...', '#67e8f9');
  try {
    await GitHubSync.updateSection('__fin', () => ({ providers: list, updated_at: new Date().toISOString() }));
    _showFinMsg('✓ Sincronizadas a GitHub (data.json __fin)', '#22d3ee');
  } catch(err){
    _showFinMsg('✕ Error: ' + err.message, '#fca5a5');
  }
}

// Reemplazar la carga antigua del form con render de la lista
async function _loadFinApisToForm(){
  await _renderFinList();
}

// ════════════════════════════════════════════════════════════════════
// ── Badge global de sync (consistencia con los dashboards) ──
// El badge bottom-right pulsa rojo hasta que se sincroniza, luego se queda
// verde. Click → manualResync (flush si hay push pendiente, pull y reload).
GitHubSync.setStatusElement(document.getElementById('ghSyncBadge'));
(function wireGhBadge(){
  const b = document.getElementById('ghSyncBadge');
  if(b) b.addEventListener('click', GitHubSync.manualResync);
})();

(function init(){
  if(!GitHubSync.isLoggedIn()){
    show('setupScreen');
    setTimeout(()=>document.getElementById('setupRepo').focus(), 100);
    return;
  }
  goLoading();
})();
