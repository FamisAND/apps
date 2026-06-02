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
    computeKpis();
    if(lastUpd) lastUpd.textContent = '▸ SYNC OK · ' + new Date().toLocaleTimeString('es-ES') + ' ◂';
    if(btn){ btn.textContent = '✓ Sincronizado'; setTimeout(restoreBtn, 1600); }
  } catch(e){
    const is401 = e && (e.status === 401 || e.status === 403);
    if(lastUpd) lastUpd.textContent = is401 ? '⚠ token inválido — vuelve a entrar' : '⚠ error de sync';
    if(btn){ btn.textContent = '⚠ Error'; setTimeout(restoreBtn, 2400); }
  }
}

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
  _notifAuthenticated = false;
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
// Si ya autenticado abre directo; si no, dispara el gate de Notificaciones
// (que actúa como password maestro). Tras pasar el gate, el callback abre lo
// que tocaba (panel config, modal de notif, etc.).
function _requireAuth(callback){
  if(_configAuthenticated){ callback(); return; }
  _authPendingCallback = callback;
  document.getElementById('menuScreen').classList.remove('active');
  const m = document.getElementById('notifModal');
  m.style.display = 'flex';
  document.getElementById('notifGate').style.display = 'block';
  document.getElementById('notifForm').style.display = 'none';
  document.getElementById('notifGateMsg').textContent = '';
  document.getElementById('notifPwd').value = '';
  document.getElementById('notifPwd2').value = '';
}

// ── Modal de APIs (solo Financieras ya, IA fuera) ──
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
// NOTIFICACIONES (Telegram bot config + master password gate)
// ════════════════════════════════════════════════════════════════════
const NOTIF_HASH_SALT = 'notif_master_v1_';
async function _notifHash(pwd){
  const enc = new TextEncoder().encode(NOTIF_HASH_SALT + pwd);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

let _notifAuthenticated = false;

// Abrir directo el form de Notificaciones desde el menú Config
// (ya estamos autenticados, no se vuelve a pedir password).
async function openNotifModal(){
  _notifAuthenticated = true; // ya pasamos el gate de config
  closeConfigMenu();
  document.getElementById('notifModal').style.display = 'flex';
  document.getElementById('notifGate').style.display = 'none';
  await _notifShowForm();
}

function closeNotifModal(){
  document.getElementById('notifModal').style.display = 'none';
  // Si venimos del menú Configuración, volver allí; si no, al menú principal
  if(_configAuthenticated){
    _showConfigMenuPanel();
  } else {
    document.getElementById('menuScreen').classList.add('active');
  }
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
  } else {
    if(pwd !== pwd2){ msg.textContent = 'Las contraseñas no coinciden'; return; }
    try {
      await GitHubSync.updateSecuritySection(s => { s.notif_pwd = hash; return s; });
    } catch(e){ msg.textContent = 'Error guardando: ' + e.message; return; }
  }
  // Autenticado correctamente
  _configAuthenticated = true;
  _notifAuthenticated = true;
  document.getElementById('notifModal').style.display = 'none';
  // Ejecutar callback pendiente (típicamente abrir menú config)
  if(_authPendingCallback){
    const cb = _authPendingCallback;
    _authPendingCallback = null;
    cb();
  } else {
    _showConfigMenuPanel();
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
    { id: 'profile_id',    label: 'Perfil a usar', type: 'profile', source: 'patrimonio.pat_v5', default: 'all' },
    { id: 'total',         label: 'Total actual',                          default: true  },
    { id: 'delta',         label: 'Δ vs mes anterior (€ y %)',             default: true  },
    { id: 'objetivo',      label: '% del objetivo principal',              default: true  },
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
    { id: 'closed_today',  label: 'Operaciones cerradas hoy',              default: false }
  ]},
  { id: 'training', icon: '💪', label: 'Full Training', items: [
    { id: 'clientes',      label: 'Clientes activos',                      default: true  },
    { id: 'equipo',        label: 'Personas en equipo',                    default: true  },
    { id: 'ingresos_mes',  label: 'Facturado vs cobrado del mes',          default: true  },
    { id: 'ingresos_avg',  label: 'Media facturación mensual (últimos N meses)', default: false },
    { id: 'ingresos_avg_months', label: '↳ N meses', default: 6, type: 'number', min: 2, max: 24 },
    { id: 'impagos',       label: 'Impagos pendientes (todos los meses)',  default: true  },
    { id: 'top_clientes',  label: 'Top 3 clientes (más facturación)',      default: false },
    { id: 'sesiones_hoy',  label: 'Sesiones programadas hoy',              default: false },
    { id: 'stock_critico', label: 'Stock crítico (≤2 unidades)',           default: false }
  ]},
  { id: 'actualidad', icon: '🌍', label: 'Actualidad', items: [
    { id: 'mercados_selected', label: 'Mercados (los que quieras)', type: 'multi', max: 10,
      default: ['spy','eurusd','btcusd'],
      options: [
        { id: 'spy',    label: 'S&P 500 (SPY)' },
        { id: 'qqq',    label: 'Nasdaq 100 (QQQ)' },
        { id: 'dia',    label: 'Dow Jones (DIA)' },
        { id: 'vixy',   label: 'VIX (VIXY proxy)' },
        { id: 'eurusd', label: 'EUR / USD' },
        { id: 'eurchf', label: 'EUR / CHF' },
        { id: 'btcusd', label: 'BTC / USD' },
        { id: 'ethusd', label: 'ETH / USD' },
        { id: 'gld',    label: 'Gold (GLD)' },
        { id: 'uso',    label: 'WTI Oil (USO)' }
      ]
    },
    { id: 'tiempo',           label: 'Tiempo Andorra 3 días (Open-Meteo)',    default: false },
    { id: 'noticias_andorra', label: 'Noticias Andorra (RSS)',                default: false },
    { id: 'noticias_andorra_topics', label: '↳ Temas (1 noticia por tema)', type: 'multi', max: 3,
      default: [],
      options: [
        { id: 'politica',     label: '🏛 Política' },
        { id: 'economia',     label: '💼 Economía' },
        { id: 'sociedad',     label: '👥 Sociedad' },
        { id: 'deporte',      label: '⚽ Deporte' },
        { id: 'cultura',      label: '🎭 Cultura' },
        { id: 'tecnologia',   label: '💻 Tecnología' },
        { id: 'internacional',label: '🌐 Internacional' },
        { id: 'ciencia',      label: '🔬 Ciencia' }
      ]
    },
    { id: 'noticias_mundo',   label: 'Noticias mundial (RSS)',                default: false },
    { id: 'noticias_mundo_topics', label: '↳ Temas (1 noticia por tema)', type: 'multi', max: 3,
      default: [],
      options: [
        { id: 'politica',     label: '🏛 Política' },
        { id: 'economia',     label: '💼 Economía' },
        { id: 'sociedad',     label: '👥 Sociedad' },
        { id: 'deporte',      label: '⚽ Deporte' },
        { id: 'cultura',      label: '🎭 Cultura' },
        { id: 'tecnologia',   label: '💻 Tecnología' },
        { id: 'internacional',label: '🌐 Internacional' },
        { id: 'ciencia',      label: '🔬 Ciencia' }
      ]
    },
    { id: 'custom_feeds',     label: 'Feeds RSS personalizados', type: 'feeds', default: [] }
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

// Orden actual editable por el usuario (drag-and-drop). Si no hay savedOrder
// se usa el orden definido en NOTIF_SECTIONS.
function _renderNotifSections(savedSections, savedOrder, profilesBySource){
  const cont = document.getElementById('notifSections');
  if(!cont) return;
  cont.innerHTML = '';
  profilesBySource = profilesBySource || {};

  // Resolver orden: priorizar savedOrder, completar con secciones nuevas que
  // no estuvieran guardadas (al final), descartar IDs huérfanos.
  const validIds = NOTIF_SECTIONS.map(s => s.id);
  let order = Array.isArray(savedOrder) && savedOrder.length
    ? savedOrder.filter(id => validIds.includes(id))
    : validIds.slice();
  validIds.forEach(id => { if(!order.includes(id)) order.push(id); });

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:.72rem;color:#94a3b8;margin-bottom:8px;display:flex;align-items:center;gap:6px;';
  hint.innerHTML = '<span style="font-size:1rem;">⋮⋮</span> Arrastra para reordenar las secciones en el resumen';
  cont.appendChild(hint);

  order.forEach(secId => {
    const sec = NOTIF_SECTIONS.find(s => s.id === secId);
    if(!sec) return;
    const saved = (savedSections && savedSections[sec.id]) || {};
    const sectionEnabled = saved.enabled !== false;

    const wrap = document.createElement('div');
    wrap.dataset.secId = sec.id;
    wrap.draggable = true;
    wrap.style.cssText = 'border:1px solid #06b6d433;border-radius:6px;margin-bottom:10px;background:#020617;transition:opacity .15s,transform .15s;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #06b6d422;font-weight:600;color:#22d3ee;';
    header.innerHTML = `
      <span class="drag-handle" style="cursor:grab;color:#64748b;font-size:1.1rem;user-select:none;padding:0 4px;" title="Arrastrar">⋮⋮</span>
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
        <input type="checkbox" data-sec-enabled="${sec.id}" ${sectionEnabled?'checked':''} style="accent-color:#22d3ee;width:16px;height:16px;">
        <span>${sec.icon} ${sec.label}</span>
      </label>
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
      } else if(it.type === 'multi'){
        // Multi-select con max items. Renderiza grid de checkboxes con contador.
        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding:4px 0 4px 6px;';
        const selected = Array.isArray(saved[it.id]) ? saved[it.id] : (it.default || []);
        const header = document.createElement('div');
        header.style.cssText = 'font-size:.78rem;color:#67e8f9;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;';
        const hLabel = document.createElement('span'); hLabel.textContent = it.label;
        const hCount = document.createElement('span');
        hCount.style.cssText = 'font-family:DM Mono,monospace;font-size:.7rem;color:#94a3b8;';
        hCount.textContent = `${selected.length}/${it.max}`;
        header.append(hLabel, hCount);
        wrap.appendChild(header);
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;';
        wrap.appendChild(grid);
        const inputs = [];
        const updateState = () => {
          const checks = inputs.filter(i => i.checked);
          hCount.textContent = `${checks.length}/${it.max}`;
          hCount.style.color = checks.length === it.max ? '#22d3ee' : '#94a3b8';
          inputs.forEach(i => {
            i.disabled = !i.checked && checks.length >= it.max;
            i.parentElement.style.opacity = i.disabled ? '.4' : '1';
          });
        };
        it.options.forEach(opt => {
          const lbl = document.createElement('label');
          const isChecked = selected.includes(opt.id);
          lbl.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer;font-size:.74rem;color:#e0f2fe;padding:2px 4px;border-radius:3px;';
          const inp = document.createElement('input');
          inp.type = 'checkbox';
          inp.dataset.multi = `${sec.id}/${it.id}`;
          inp.dataset.multiId = opt.id;
          inp.checked = isChecked;
          inp.style.accentColor = '#22d3ee';
          inp.addEventListener('change', updateState);
          inputs.push(inp);
          lbl.appendChild(inp);
          lbl.appendChild(document.createTextNode(' ' + opt.label));
          grid.appendChild(lbl);
        });
        updateState();
        itemsWrap.appendChild(wrap);
      } else if(it.type === 'profile'){
        // Dropdown con los perfiles disponibles + opción "Todos"
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:.78rem;color:#67e8f9;padding-left:6px;';
        const profiles = profilesBySource[it.source] || [];
        const current = saved[it.id] != null ? saved[it.id] : (it.default || 'all');
        const opts = [`<option value="all" ${current==='all'?'selected':''}>Todos los perfiles</option>`]
          .concat(profiles.map(p =>
            `<option value="${p.id}" ${current===p.id?'selected':''}>${escapeHtml(p.name||p.id)}</option>`
          ));
        const noteEmpty = profiles.length === 0
          ? ` <span style="color:#475569;font-size:.7rem">(sin perfiles aún)</span>`
          : '';
        row.innerHTML = `
          <span style="flex:1">${it.label}${noteEmpty}</span>
          <select data-sec-item="${sec.id}/${it.id}" style="background:#0a0e14;border:1px solid #1e3a5f;color:#e0f2fe;padding:3px 6px;border-radius:4px;font-family:DM Mono,monospace;font-size:.74rem;min-width:140px;">
            ${opts.join('')}
          </select>
        `;
        itemsWrap.appendChild(row);
      } else if(it.type === 'feeds'){
        // Lista editable de RSS feeds personalizados.
        // Cada feed: { url, label, category: 'andorra' | 'mundial' }
        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding:6px 6px 4px;border:1px dashed #1e3a5f;border-radius:5px;margin-top:4px;';
        wrap.dataset.feedsList = `${sec.id}/${it.id}`;
        const title = document.createElement('div');
        title.style.cssText = 'font-size:.74rem;color:#94a3b8;margin-bottom:6px;font-family:DM Mono,monospace;';
        title.textContent = it.label + ' — añade tus propios RSS (se mezclan con Andorra o Mundial según categoría)';
        wrap.appendChild(title);
        const list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:6px;';
        wrap.appendChild(list);
        const initial = Array.isArray(saved[it.id]) ? saved[it.id] : (it.default || []);
        const addRow = (f) => {
          const r = document.createElement('div');
          r.style.cssText = 'display:flex;gap:4px;align-items:center;font-size:.72rem;';
          r.innerHTML = `
            <input type="text" placeholder="https://..." value="${escapeHtml(f.url||'')}" data-feed-url style="flex:2;background:#0a0e14;border:1px solid #1e3a5f;color:#e0f2fe;padding:3px 6px;border-radius:3px;font-family:DM Mono,monospace;font-size:.72rem;">
            <input type="text" placeholder="Etiqueta" value="${escapeHtml(f.label||'')}" data-feed-label style="flex:1;background:#0a0e14;border:1px solid #1e3a5f;color:#e0f2fe;padding:3px 6px;border-radius:3px;font-size:.72rem;">
            <select data-feed-cat style="background:#0a0e14;border:1px solid #1e3a5f;color:#e0f2fe;padding:3px 6px;border-radius:3px;font-size:.72rem;">
              <option value="andorra" ${f.category==='andorra'?'selected':''}>Andorra</option>
              <option value="mundial" ${f.category==='mundial'||!f.category?'selected':''}>Mundial</option>
            </select>
            <button type="button" data-feed-del style="background:transparent;border:1px solid #5a1a1a;color:#fca5a5;padding:2px 7px;border-radius:3px;cursor:pointer;font-size:.7rem;">✕</button>
          `;
          r.querySelector('[data-feed-del]').addEventListener('click', () => r.remove());
          list.appendChild(r);
        };
        initial.forEach(addRow);
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.style.cssText = 'background:transparent;border:1px solid #1e3a5f;color:#67e8f9;padding:3px 9px;border-radius:3px;cursor:pointer;font-size:.72rem;align-self:flex-start;';
        addBtn.textContent = '+ Añadir RSS';
        addBtn.addEventListener('click', () => addRow({}));
        wrap.appendChild(addBtn);
        itemsWrap.appendChild(wrap);
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

  _attachNotifDnD(cont);
}

// Drag-and-drop nativo HTML5 — solo aplica a hijos directos de `cont` con
// `data-sec-id`. Al soltar, el orden se reescribe por el orden DOM.
function _attachNotifDnD(cont){
  let dragEl = null;
  cont.querySelectorAll('[data-sec-id]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      dragEl = el;
      el.style.opacity = '.4';
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.dataset.secId); } catch(_){}
    });
    el.addEventListener('dragend', () => {
      if(dragEl){ dragEl.style.opacity = ''; }
      dragEl = null;
      cont.querySelectorAll('[data-sec-id]').forEach(c => { c.style.borderColor = '#06b6d433'; });
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if(!dragEl || dragEl === el) return;
      const rect = el.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      el.style.borderColor = after ? '#22d3ee' : '#22d3ee';
      el.style.borderWidth = '1px';
      el.style.borderStyle = 'solid';
      el.style.borderTopColor = after ? '#06b6d433' : '#22d3ee';
      el.style.borderBottomColor = after ? '#22d3ee' : '#06b6d433';
    });
    el.addEventListener('dragleave', () => {
      el.style.borderColor = '#06b6d433';
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      if(!dragEl || dragEl === el) return;
      const rect = el.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      if(after) el.parentNode.insertBefore(dragEl, el.nextSibling);
      else      el.parentNode.insertBefore(dragEl, el);
      el.style.borderColor = '#06b6d433';
    });
  });
}

function _readNotifSectionOrder(){
  const cont = document.getElementById('notifSections');
  if(!cont) return null;
  return [...cont.querySelectorAll('[data-sec-id]')].map(el => el.dataset.secId);
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
      if(it.type === 'multi'){
        const checked = [];
        document.querySelectorAll(`#notifSections input[data-multi="${sec.id}/${it.id}"]:checked`).forEach(inp => {
          checked.push(inp.dataset.multiId);
        });
        sections[sec.id][it.id] = checked.slice(0, it.max || checked.length);
        return;
      }
      if(it.type === 'feeds'){
        const list = document.querySelector(`#notifSections [data-feeds-list="${sec.id}/${it.id}"]`);
        const out = [];
        if(list){
          list.querySelectorAll('input[data-feed-url]').forEach(urlInp => {
            const row = urlInp.parentElement;
            const url = urlInp.value.trim();
            if(!url) return;
            out.push({
              url,
              label: row.querySelector('[data-feed-label]').value.trim() || '(sin etiqueta)',
              category: row.querySelector('[data-feed-cat]').value || 'mundial'
            });
          });
        }
        sections[sec.id][it.id] = out;
        return;
      }
      const inp = document.querySelector(`#notifSections [data-sec-item="${sec.id}/${it.id}"]`);
      if(!inp) return;
      if(it.type === 'number') sections[sec.id][it.id] = parseInt(inp.value, 10) || it.default;
      else if(it.type === 'profile') sections[sec.id][it.id] = inp.value || 'all';
      else sections[sec.id][it.id] = inp.checked;
    });
  });
  return {
    bot_token: document.getElementById('notifBotToken').value.trim(),
    chat_id: document.getElementById('notifChatId').value.trim(),
    time: document.getElementById('notifTime').value || '09:00',
    enabled: document.getElementById('notifEnabled').checked,
    days: days,
    sections: sections,
    section_order: _readNotifSectionOrder(),
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
  _renderNotifDays(cfg && cfg.days);

  // Cargar nombres de perfiles disponibles para los dropdowns
  const profilesBySource = {};
  try {
    const full = await GitHubSync.fetchFullData();
    const patP = _pmaybe(full?.patrimonio?.pat_v5);
    if(Array.isArray(patP)) profilesBySource['patrimonio.pat_v5'] = patP.map(p => ({id: p.id, name: p.name}));
    const facP = _pmaybe(full?.facturas?.fac_v1);
    if(Array.isArray(facP)) profilesBySource['facturas.fac_v1'] = facP.map(p => ({id: p.id, name: p.name}));
  } catch(e){ console.warn('No se pudieron cargar perfiles:', e.message); }

  _renderNotifSections(cfg && cfg.sections, cfg && cfg.section_order, profilesBySource);
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

function _esc(s){ return String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[c]); }

// Genera el resumen en cliente (mirror de telegram-summary.js)
const _NOTIF_DEFAULT_ORDER = ['actualidad','patrimonio','options','training'];

function _buildSummaryClient(data, cfg){
  const S = (cfg && cfg.sections) || {};
  const monthKey = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Madrid', year:'numeric', month:'2-digit'
  }).format(new Date()).slice(0, 7);
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date());
  const today0 = new Date(todayStr + 'T00:00:00Z'); today0.setUTCHours(0,0,0,0);
  const [yNow, mNow] = monthKey.split('-').map(n => parseInt(n,10));
  const dPrev = new Date(Date.UTC(yNow, mNow - 1, 1)); dPrev.setUTCMonth(dPrev.getUTCMonth() - 1);
  const ftMonthKey = `${dPrev.getUTCFullYear()}-${String(dPrev.getUTCMonth()+1).padStart(2,'0')}`;
  const monthsAgo = (mk) => {
    if (!mk || !/^\d{4}-\d{2}$/.test(mk)) return null;
    const [py, pm] = mk.split('-').map(Number);
    return (yNow - py) * 12 + (mNow - pm);
  };
  const ctx = { monthKey, todayStr, today0, ftMonthKey, monthsAgo };

  const sections = {
    actualidad: _previewActualidad(ctx, data, S.actualidad || {}),
    patrimonio: _previewPatrimonio(ctx, data, S.patrimonio || {}),
    options:    _previewOptions   (ctx, data, S.options    || {}),
    training:   _previewTraining  (ctx, data, S.training   || {})
    // facturas: eliminado de notificaciones a petición del usuario (2026-05)
  };
  const urgent = _previewUrgent(ctx, data);

  // Render en el mismo orden que el script
  const lines = [];
  const dt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date());
  lines.push(`<b>📊 Resumen — ${dt}</b>`);

  if(urgent.length){
    lines.push('');
    lines.push('━━━━━━━━━━━━━');
    lines.push('');
    lines.push('⚠ <b>URGENTE</b>');
    urgent.forEach(u => lines.push(`   ${u}`));
  }

  const order = (cfg && Array.isArray(cfg.section_order) && cfg.section_order.length)
    ? cfg.section_order
    : _NOTIF_DEFAULT_ORDER;

  let firstBody = true;
  order.forEach(secId => {
    const blk = sections[secId];
    if(!blk || !blk.length) return;
    lines.push('');
    if(firstBody){ lines.push('━━━━━━━━━━━━━'); lines.push(''); firstBody = false; }
    lines.push(...blk);
  });

  lines.push('');
  lines.push('<i>Auto-generado · mis-dashboards</i>');
  return lines.join('\n');
}

// — ACTUALIDAD (preview) —
// La preview no llama a Finnhub ni RSS (evita exponer claves y latencia).
// Solo muestra qué se enviará en el resumen real.
function _previewActualidad(ctx, data, sec){
  if(sec.enabled === false) return [];
  const out = ['🌍 <b>Actualidad</b>'];
  if(Array.isArray(sec.mercados_selected) && sec.mercados_selected.length){
    const labels = {
      spy:'SPY', qqq:'QQQ', dia:'DIA', vixy:'VIXY',
      eurusd:'EUR/USD', eurchf:'EUR/CHF',
      btcusd:'BTC', ethusd:'ETH', gld:'GLD', uso:'USO'
    };
    const tickers = sec.mercados_selected.map(id => labels[id] || id).join(', ');
    out.push(`   💱 Mercados: <i>(${tickers} — fetch al enviar)</i>`);
  }
  if(sec.tiempo === true){
    out.push(`   🌤 Tiempo Andorra: <i>(Open-Meteo al enviar)</i>`);
  }
  if(sec.noticias_andorra === true){
    const t = Array.isArray(sec.noticias_andorra_topics) ? sec.noticias_andorra_topics : [];
    const tStr = t.length ? `temas: ${t.join(', ')}` : 'sin filtro';
    out.push(`   📰 Andorra: <i>(${tStr} — RSS BonDia/Forum/Periòdic al enviar)</i>`);
  }
  if(sec.noticias_mundo === true){
    const t = Array.isArray(sec.noticias_mundo_topics) ? sec.noticias_mundo_topics : [];
    const tStr = t.length ? `temas: ${t.join(', ')}` : 'sin filtro';
    out.push(`   🌐 Mundial: <i>(${tStr} — El País/DW/Vanguardia/BBC/Guardian al enviar)</i>`);
  }
  return out.length > 1 ? out : [];
}

// — PATRIMONIO (preview) —
function _previewPatrimonio(ctx, data, sec){
  if(sec.enabled === false) return [];
  try {
    const profiles = _pmaybe(data?.patrimonio?.pat_v5);
    if(!Array.isArray(profiles) || !profiles.length) return [];
    const p = profiles[0];
    const ents = [...(p.entries||[])].sort((a,b)=>(a.year-b.year)||(a.month-b.month));
    if(!ents.length) return [];
    const last = ents[ents.length-1];
    const prev = ents.length >= 2 ? ents[ents.length-2] : null;
    const totalNow = _calcPat(last);
    const totalPrev = prev ? _calcPat(prev) : null;

    const out = ['💰 <b>Patrimonio</b>'];
    if(sec.total !== false) out.push(`   Total: €${_fnum(totalNow)}`);
    if(sec.delta !== false && totalPrev != null){
      const diff = totalNow - totalPrev;
      const pct = totalPrev ? (diff/totalPrev*100) : 0;
      out.push(`   ${diff>=0?'↑':'↓'} ${diff>=0?'+':''}€${_fnum(Math.abs(diff))} (${pct>=0?'+':''}${pct.toFixed(1)}%) vs mes anterior`);
    }
    if(sec.objetivo !== false){
      const obj = (p.objectives||[]).find(o=>o.type==='patrimonio') || (p.objectives||[])[0];
      if(obj && obj.target > 0){
        const pct = (totalNow/obj.target*100).toFixed(1);
        out.push(`   🎯 ${pct}% del objetivo (€${_fnum(obj.target)})`);
      }
    }
    if(sec.ytd_pct === true){
      const yearStart = ents.find(e => e.year === last.year && e.month === 0)
                    || ents.find(e => e.year === last.year);
      if(yearStart){
        const t0 = _calcPat(yearStart);
        if(t0){
          const ytd = ((totalNow - t0) / t0 * 100);
          out.push(`   📅 YTD: ${ytd>=0?'+':''}${ytd.toFixed(1)}%`);
        }
      }
    }
    if(sec.gastos_mes === true){
      const r = _patGastosMes(p?.gastos?.meses?.[ctx.monthKey]);
      if(r && r.nReal > 0){
        const cats = p?.gastos?.categorias || [];
        const catMap = {}; cats.forEach(c => catMap[c.id] = c);
        catMap['sin_cat'] = { name: 'Sin categorizar' };
        const top3 = Object.entries(r.porCat).sort((a,b)=>b[1]-a[1]).slice(0,3);
        out.push('');
        out.push(`   💸 Gastos ${ctx.monthKey}: €${_fnum(r.total)} <i>(${r.nReal} mov · mi parte)</i>`);
        top3.forEach(([cid,amt]) => {
          const cat = catMap[cid] || { name: cid };
          out.push(`     • ${_esc(cat.name)}: €${_fnum(amt)}`);
        });
      }
    }
    if(sec.ingresos_mes === true){
      const ingSec = (p.sections||[]).find(s => s.id === 's_ingresos' || s.type === 'ingresos');
      if(ingSec){
        let total = 0;
        (ingSec.assets||[]).forEach(a => {
          const v = parseFloat(last.assets?.[a.id]) || 0;
          if(v > 0) total += v;
        });
        if(total > 0){ out.push(''); out.push(`   💵 Ingresos ${ctx.monthKey}: €${_fnum(total)}`); }
      }
    }
    if(sec.distribucion === true){
      out.push('');
      out.push(`   📊 Distribución:`);
      (p.sections||[]).forEach(s => {
        if(s.id === 's_ingresos' || s.type === 'ingresos') return;
        let secTotal = 0;
        (s.assets||[]).forEach(a => {
          const v = parseFloat(last.assets?.[a.id]);
          if(!isNaN(v)) secTotal += v;
        });
        if(secTotal > 0 && totalNow > 0){
          const pct = (secTotal/totalNow*100).toFixed(0);
          const name = s.title || s.name || s.id || 'Sección';
          out.push(`     • ${_esc(name)}: €${_fnum(secTotal)} (${pct}%)`);
        }
      });
    }
    if(sec.top_mover === true && prev){
      let bestDiff = 0, bestName = '';
      (p.sections||[]).forEach(s => {
        (s.assets||[]).forEach(a => {
          const cur = parseFloat(last.assets?.[a.id]) || 0;
          const pre = parseFloat(prev.assets?.[a.id]) || 0;
          const diff = cur - pre;
          if(Math.abs(diff) > Math.abs(bestDiff)){ bestDiff = diff; bestName = a.name; }
        });
      });
      if(bestName) out.push(`   ⭐ Top mover: ${_esc(bestName)} ${bestDiff>=0?'+':''}€${_fnum(Math.abs(bestDiff))}`);
    }
    return out.length > 1 ? out : [];
  } catch(e){ console.warn('preview patrimonio:', e); return []; }
}

function _patGastosMes(monthMd){
  if(!monthMd || !monthMd.transacciones) return null;
  const archMap = {};
  (monthMd.archivos||[]).forEach(a => archMap[a.id] = a);
  let total = 0; const porCat = {}; let nReal = 0;
  (monthMd.transacciones||[]).forEach(t => {
    if(t.excluido) return;
    const imp = parseFloat(t.importe);
    if(!Number.isFinite(imp) || imp >= 0) return;
    nReal++;
    const tipo = archMap[t.archivoId]?.tipo || 'individual';
    const part = (tipo === 'comun') ? Math.abs(imp)/2 : Math.abs(imp);
    total += part;
    const cid = t.categoriaId || 'sin_cat';
    porCat[cid] = (porCat[cid]||0) + part;
  });
  return { total, porCat, nReal };
}

// — OPCIONES (preview) —
function _previewComputeEntry(e){
  if(!e) return e;
  const contracts = e.contracts || 1;
  const _deb = e.pDebito != null ? Math.abs(e.pDebito) : 0;
  const _pNetoPerCtr = e.pCredito != null ? (e.pCredito - _deb - (e.pCierre || 0)) * 100 : null;
  const totalNeto = e.totalNetoOvr != null ? e.totalNetoOvr :
    (_pNetoPerCtr != null ? _pNetoPerCtr * contracts - (e.comi || 0) / 100 : null);
  return { ...e, totalNeto };
}
const _RISK_STRATS = ['NP','PCS','CC','CCS','DPS','IC','BWB','JL','112','0DTE','PMCC'];

function _stockTotal(p){
  if(p.hasVariants) return Object.values(p.sizes||{}).reduce((s,n) => s + (parseInt(n)||0), 0);
  return parseInt(p.stock) || 0;
}
function _calcUnrealized(a){
  const ctr = parseInt(a.contracts) || 1;
  if(a.priceCurrent == null) return null;
  if(a.strat === 'ACC'){
    if(a.precioCompra == null) return null;
    return (parseFloat(a.priceCurrent) - parseFloat(a.precioCompra)) * ctr;
  }
  if(a.pCredito == null) return null;
  const pc_share = (parseFloat(a.pCredito)||0) * 100;
  const pd_share = Math.abs(parseFloat(a.pDebito)||0) * 100;
  return ((pc_share - pd_share - (parseFloat(a.priceCurrent)||0)) * 100 * ctr);
}

function _previewOptions(ctx, data, sec){
  if(sec.enabled === false) return [];
  try {
    const arr = _pmaybe(data?.options?.ot_activas);
    const histRaw = _pmaybe(data?.options?.ot_hist);
    const snaps = _pmaybe(data?.options?.ot_snaps);
    const hist = Array.isArray(histRaw) ? histRaw.map(_previewComputeEntry) : null;
    if(!Array.isArray(arr)) return [];
    const out = ['📈 <b>Opciones</b>'];
    if(sec.count !== false) out.push(`   ${arr.length} posiciones activas`);
    if(sec.net_liq === true && Array.isArray(snaps) && snaps.length){
      const sorted = [...snaps].sort((a,b) => (a.date||'').localeCompare(b.date||''));
      const latest = sorted[sorted.length-1];
      if(latest) out.push(`   💵 NAV ${latest.date}: $${_fnum(latest.val)}`);
    }
    if(sec.expiring !== false){
      const dteLimit = sec.expiring_days || 7;
      const exp = arr.filter(a => {
        if(!a.exp) return false;
        const d = Math.round((new Date(a.exp + 'T00:00:00Z') - ctx.today0) / 86400000);
        return d >= 0 && d <= dteLimit;
      });
      if(exp.length){
        out.push('');
        out.push(`   ⚠ ${exp.length} expira/n en ≤${dteLimit}d:`);
        exp.slice(0,6).forEach(a => {
          const d = Math.round((new Date(a.exp + 'T00:00:00Z') - ctx.today0) / 86400000);
          out.push(`     • <code>${_esc(a.activo||'?')}</code> ${a.strat||''} · ${d}d`);
        });
      }
    }
    if(sec.lista_activas === true && arr.length){
      out.push('');
      out.push(`   📋 Posiciones:`);
      arr.slice(0, 12).forEach(a => {
        const ctr = parseInt(a.contracts) || 1;
        const dte = a.exp ? Math.round((new Date(a.exp + 'T00:00:00Z') - ctx.today0) / 86400000) : null;
        const u = _calcUnrealized(a);
        const pnlStr = u != null ? ` · P&L ${u>=0?'+':''}$${_fnum(Math.abs(u))}` : '';
        const dteStr = (a.strat === 'ACC') ? '' : (dte != null ? ` · ${dte}d DTE` : '');
        const ctrStr = ctr > 1 ? ` x${ctr}` : '';
        out.push(`     • <code>${_esc(a.activo||'?')}</code> ${a.strat||''}${ctrStr}${dteStr}${pnlStr}`);
      });
      if(arr.length > 12) out.push(`     ... y ${arr.length-12} más`);
    }
    const mesHist = Array.isArray(hist) ? hist.filter(h => (h.cierre||'').startsWith(ctx.monthKey)) : [];
    if(sec.pnl_mes === true && mesHist.length){
      const pnl = mesHist.reduce((s,h) => s + (parseFloat(h.totalNeto)||0), 0) * 100;
      out.push('');
      out.push(`   💵 P&L ${ctx.monthKey}: ${pnl>=0?'+':''}$${_fnum(pnl)} <i>(${mesHist.length} ops)</i>`);
    }
    if(sec.win_rate_mes === true && mesHist.length){
      const wins = mesHist.filter(h => (parseFloat(h.totalNeto)||0) > 0).length;
      const losses = mesHist.length - wins;
      const wr = (wins/mesHist.length*100).toFixed(0);
      out.push(`   📊 WR ${ctx.monthKey}: ${wr}% <i>(${wins}W / ${losses}L)</i>`);
    }
    // Best/Worst — siempre muestra ambos aunque sean del mismo signo
    if(sec.best_worst === true && mesHist.length){
      const sorted = [...mesHist].sort((a,b) => (parseFloat(b.totalNeto)||0) - (parseFloat(a.totalNeto)||0));
      const best = sorted[0], worst = sorted[sorted.length-1];
      if(best){
        const v = (parseFloat(best.totalNeto)||0) * 100;
        out.push(`   🏆 Mejor: <code>${_esc(best.activo||'?')}</code> ${best.strat||''} ${v>=0?'+':''}$${_fnum(Math.abs(v))}`);
      }
      if(worst && worst !== best){
        const v = (parseFloat(worst.totalNeto)||0) * 100;
        out.push(`   📉 Peor: <code>${_esc(worst.activo||'?')}</code> ${worst.strat||''} ${v>=0?'+':''}$${_fnum(Math.abs(v))}`);
      }
    }
    if(sec.risk_total === true){
      let riskTot = 0;
      arr.forEach(a => { if(_RISK_STRATS.includes(a.strat)) riskTot += parseFloat(a.maxRisk)||0; });
      if(riskTot > 0) out.push(`   💼 Risk total: $${_fnum(riskTot)}`);
    }
    if(sec.closed_today === true && Array.isArray(hist)){
      const closed = hist.filter(h => h.cierre === ctx.todayStr);
      if(closed.length){
        out.push('');
        out.push(`   ✔ Cerradas hoy: ${closed.length}`);
        closed.slice(0,4).forEach(h => {
          const pnl = (parseFloat(h.totalNeto)||0) * 100;
          out.push(`     • ${_esc(h.activo||'?')} ${h.strat||''} ${pnl>=0?'+':''}$${_fnum(pnl)}`);
        });
      }
    }
    return out.length > 1 ? out : [];
  } catch(e){ console.warn('preview options:', e); return []; }
}

// — FT (preview) —
function _ftMonthMetrics(mv){
  if(!mv) return null;
  let fact = 0, cobr = 0;
  (mv.entries||[]).forEach(e => {
    const p = parseFloat(e.price) || 0;
    fact += p;
    if(e.paid === 'pagado' || e.paid === true) cobr += p;
  });
  const gastos = (mv.gastos||[])
    .filter(g => g.cat !== 'dividendos')
    .reduce((s,g) => s + (parseFloat(g.amount)||0), 0);
  return { fact, cobr, gastos, beneficio: fact - gastos };
}

function _previewTraining(ctx, data, sec){
  if(sec.enabled === false) return [];
  try {
    const ft = _pmaybe(data?.training?.ft_v4);
    if(!ft) return [];
    const out = ['💪 <b>Full Training</b>'];
    const activos = (ft.clients||[]).filter(c => c.active).length;
    const equipo  = (ft.team||[]).filter(t => t.active !== false).length;
    const parts = [];
    if(sec.clientes !== false) parts.push(`${activos} clientes`);
    if(sec.equipo !== false)   parts.push(`${equipo} en equipo`);
    if(parts.length) out.push(`   ${parts.join(' · ')}`);

    // Pendiente del mes actual en rojo
    const mNow = _ftMonthMetrics(ft.months?.[ctx.monthKey]);
    if(mNow){
      const pendNow = mNow.fact - mNow.cobr;
      if(pendNow > 0){
        out.push(`   🔴 <b>Pendiente ${ctx.monthKey}: €${_fnum(pendNow)}</b> <i>(de €${_fnum(mNow.fact)} facturados)</i>`);
      }
    }

    const mPrev = _ftMonthMetrics(ft.months?.[ctx.ftMonthKey]);
    if(sec.ingresos_mes !== false && mPrev){
      out.push('');
      out.push(`   <i>Métricas del mes cerrado anterior (${ctx.ftMonthKey}):</i>`);
      if(mPrev.fact > 0)   out.push(`   💵 Facturación: €${_fnum(mPrev.fact)}`);
      if(mPrev.gastos > 0) out.push(`   💸 Gastos: €${_fnum(mPrev.gastos)}`);
      if(mPrev.fact > 0 || mPrev.gastos > 0){
        const sign = mPrev.beneficio >= 0 ? '+' : '-';
        out.push(`   📊 Beneficio: ${sign}€${_fnum(Math.abs(mPrev.beneficio))}`);
      }
    }
    // Impagos — solo MESES CERRADOS (mk <= ftMonthKey).
    // Agrupados por cliente, con TODOS los meses pendientes detallados.
    if(sec.impagos !== false){
      const cliMap = {};
      (ft.clients||[]).forEach(c => cliMap[c.id] = c.name);
      const byCli = {}; let totalAll = 0; let countAll = 0;
      for(const [mk, mv] of Object.entries(ft.months||{})){
        if(mk > ctx.monthKey) continue; // incluir mes actual, excluir futuros
        (mv.entries||[]).forEach(e => {
          if(e.paid === 'pagado' || e.paid === true) return;
          const pr = parseFloat(e.price) || 0;
          if(pr <= 0) return;
          const cli = cliMap[e.clientId] || e.clientId || '?';
          if(!byCli[cli]) byCli[cli] = { total: 0, byMonth: {} };
          byCli[cli].total += pr;
          byCli[cli].byMonth[mk] = (byCli[cli].byMonth[mk] || 0) + pr;
          totalAll += pr; countAll++;
        });
      }
      const grouped = Object.entries(byCli).sort((a,b) => b[1].total - a[1].total);
      if(grouped.length){
        out.push('');
        out.push(`   🔴 <b>${countAll} impagos · €${_fnum(totalAll)}</b> <i>(${grouped.length} cliente${grouped.length===1?'':'s'})</i>`);
        grouped.forEach(([cli, d]) => {
          const months = Object.entries(d.byMonth).sort((a,b) => b[0].localeCompare(a[0]));
          out.push(`     ${_esc(cli)} · €${_fnum(d.total)}:`);
          months.forEach(([mk, amt]) => out.push(`       • ${mk}: €${_fnum(amt)}`));
        });
      }
    }
    if(sec.sesiones_hoy === true){
      const monthM = ft.months?.[ctx.monthKey] || ft.months?.[ctx.ftMonthKey];
      if(monthM){
        let sesHoy = 0;
        (monthM.masajes||[]).forEach(mas => { if(mas.fecha === ctx.todayStr) sesHoy++; });
        (monthM.entries||[]).forEach(e => { if(e.fecha === ctx.todayStr) sesHoy++; });
        if(sesHoy > 0) out.push(`   📅 ${sesHoy} sesion${sesHoy===1?'':'es'} hoy`);
      }
    }
    if(sec.stock_critico === true){
      const critico = (ft.stock||[]).filter(s => {
        const t = _stockTotal(s);
        return t > 0 && t <= 2;
      });
      if(critico.length){
        out.push('');
        out.push(`   📦 ${critico.length} con stock ≤2:`);
        critico.slice(0,3).forEach(s => out.push(`     • ${_esc(s.name)} (${_stockTotal(s)} uds)`));
      }
    }
    return out.length > 2 ? out : [];
  } catch(e){ console.warn('preview ft:', e); return []; }
}

// — FACTURAS (preview) —
function _getEstadoFactura(f){
  if(f.estado === 'pagada') return 'pagada';
  if(f.fecha){
    const dias = Math.round((Date.now() - new Date(f.fecha).getTime()) / 86400000);
    if(dias > 30) return 'vencida';
  }
  return 'pendiente';
}

function _previewFacturas(ctx, data, sec){
  if(sec.enabled === false) return [];
  try {
    const profiles = _pmaybe(data?.facturas?.fac_v1);
    if(!Array.isArray(profiles)) return [];
    let pend=0, venc=0, totalMes=0, pendMes=0, totalAll=0;
    const byClienteMes = {}; const vencDet = []; let lastFac = null;
    profiles.forEach(p => {
      const cliMap = {}; (p.clientes||[]).forEach(c => cliMap[c.id] = c.name);
      (p.facturas||[]).forEach(f => {
        totalAll++;
        const estado = _getEstadoFactura(f);
        const t = parseFloat(f.totales?.total) || parseFloat(f.total) || 0;
        const cliName = cliMap[f.clienteId] || f.clienteName || '?';
        if(estado === 'pendiente') pend++;
        if(estado === 'vencida'){ venc++; vencDet.push({ cli: cliName, total: t, fecha: f.fecha }); }
        if(f.fecha && f.fecha.startsWith(ctx.monthKey)){
          totalMes += t;
          if(estado !== 'pagada') pendMes += t;
          byClienteMes[cliName] = (byClienteMes[cliName]||0) + t;
        }
        if(!lastFac || (f.fecha||'') > (lastFac.fecha||'')){
          lastFac = { ...f, cliName, total: t, estado };
        }
      });
    });
    if(totalAll === 0) return [];
    const out = ['📄 <b>Facturas</b>'];
    const parts = [];
    if(sec.pendientes !== false) parts.push(pend ? `${pend} pendiente${pend===1?'':'s'}` : `0 pendientes ✓`);
    if(sec.vencidas   !== false && venc) parts.push(`🔴 <b>${venc} vencidas</b>`);
    if(parts.length) out.push(`   ${parts.join(' · ')}`);
    if(sec.vencidas !== false && vencDet.length){
      vencDet.slice(0,4).forEach(v => out.push(`     • ${_esc(v.cli)} · €${_fnum(v.total)} <i>(${v.fecha})</i>`));
      if(vencDet.length > 4) out.push(`     ... y ${vencDet.length-4} más`);
    }
    if(sec.total_mes !== false){
      if(totalMes > 0){
        out.push(`   💶 Facturado ${ctx.monthKey}: €${_fnum(totalMes)}`);
        if(pendMes > 0) out.push(`   🔴 Pendiente de ese mes: €${_fnum(pendMes)}`);
      } else {
        out.push(`   <i>Sin facturas emitidas en ${ctx.monthKey}</i>`);
      }
    }
    if(sec.top_cliente === true){
      const top = Object.entries(byClienteMes).sort((a,b) => b[1]-a[1])[0];
      if(top) out.push(`   👤 Top del mes: ${_esc(top[0])} (€${_fnum(top[1])})`);
    }
    if(lastFac){
      const e = lastFac.estado === 'pagada' ? '✓' : lastFac.estado === 'vencida' ? '🔴' : '🟡';
      out.push(`   📅 Última: ${lastFac.fecha} · ${_esc(lastFac.cliName)} · €${_fnum(lastFac.total)} ${e}`);
    }
    return out;
  } catch(e){ console.warn('preview facturas:', e); return []; }
}

// — URGENTE (preview) —
function _previewUrgent(ctx, data){
  const out = [];
  // Facturas eliminadas de notificaciones (incluidas las alertas urgentes) — 2026-05
  try {
    const arr = _pmaybe(data?.options?.ot_activas);
    if(Array.isArray(arr)){
      const inminentes = arr.filter(a => {
        if(!a.exp) return false;
        const d = Math.round((new Date(a.exp + 'T00:00:00Z') - ctx.today0) / 86400000);
        return d >= 0 && d <= 1;
      });
      if(inminentes.length){
        const tickers = inminentes.slice(0,3).map(a => a.activo).join(', ');
        const more = inminentes.length > 3 ? ` +${inminentes.length-3}` : '';
        out.push(`📈 ${inminentes.length} opci${inminentes.length===1?'ón':'ones'} expira${inminentes.length===1?'':'n'} ≤1d: ${_esc(tickers)}${more}`);
      }
    }
  } catch(e){}
  try {
    const ft = _pmaybe(data?.training?.ft_v4);
    if(ft){
      const cliMap = {}; (ft.clients||[]).forEach(c => cliMap[c.id] = c.name);
      const viejos = {}; let cnt = 0; let tot = 0;
      for(const [mk, mv] of Object.entries(ft.months||{})){
        if(mk > ctx.monthKey) continue; // incluir mes actual, excluir futuros // solo meses cerrados
        const age = ctx.monthsAgo(mk);
        if(age == null || age < 3) continue;
        (mv.entries||[]).forEach(e => {
          if(e.paid === 'pagado' || e.paid === true) return;
          const pr = parseFloat(e.price) || 0;
          if(pr <= 0) return;
          const cli = cliMap[e.clientId] || '?';
          viejos[cli] = (viejos[cli]||0) + pr;
          cnt++; tot += pr;
        });
      }
      if(cnt){
        const top = Object.entries(viejos).sort((a,b) => b[1]-a[1])[0];
        out.push(`💪 ${cnt} impago${cnt===1?'':'s'} FT >3m antiguos · €${_fnum(tot)}${top?` (top: ${_esc(top[0])} €${_fnum(top[1])})`:''}`);
      }
      const agotados = (ft.stock||[]).filter(s => _stockTotal(s) === 0);
      if(agotados.length){
        const names = agotados.slice(0,2).map(s => s.name).join(', ');
        const more = agotados.length > 2 ? ` +${agotados.length-2}` : '';
        out.push(`📦 ${agotados.length} producto${agotados.length===1?'':'s'} AGOTADO${agotados.length===1?'':'S'}: ${_esc(names)}${more}`);
      }
    }
  } catch(e){}
  return out;
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
