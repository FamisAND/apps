/* ════════════════════════════════════════════════════════════════════
   DASHBOARD AUTH — gate de PIN por dashboard
   ════════════════════════════════════════════════════════════════════
   Cómo se usa desde un dashboard (después de cargar github-sync.js):

      DashboardAuth.gate({
        section: 'patrimonio',
        title:   'Patrimonio',
      }).then(() => {
        // aquí el dashboard puede arrancar normal
      });

   Comportamiento:
   - Oculta visualmente el body hasta que el usuario pase el gate
   - Si la sección no tiene PIN configurado, le pide crear uno
   - Si tiene PIN, le pide el PIN para entrar
   - Si entra OK, muestra el body y resuelve la promesa
   - Si pulsa "← Volver al inicio" en el gate, va a index.html

   Para cambiar el PIN desde dentro del dashboard:
      DashboardAuth.changePin('patrimonio')
   ════════════════════════════════════════════════════════════════════ */

(function(){
'use strict';

const HASH_SALT = 'dashboards_pin_v2_';

// ── Hash del PIN (NO criptográfico fuerte, pero suficiente para que
// alguien que vea el data.json no pueda leer el PIN en claro) ──
async function hashPin(section, pin){
  const enc = new TextEncoder().encode(HASH_SALT + section + ':' + pin);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ── CSS del gate (autoinyectado) ──
const GATE_CSS = `
#dashAuthGate{position:fixed;inset:0;background:#080d1a;z-index:99999;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:24px;font-family:'DM Sans','Segoe UI',sans-serif;color:#e2e8f0;}
#dashAuthGate *{box-sizing:border-box;}
.dag-logo{display:flex;align-items:center;gap:12px;margin-bottom:30px;}
.dag-icon{width:46px;height:46px;background:linear-gradient(135deg,#1d4ed8,#6366f1);
  border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;}
.dag-name{font-weight:700;font-size:1.4rem;letter-spacing:-.02em;}
.dag-sub{font-size:.78rem;color:#475569;font-family:'DM Mono',monospace;margin-top:2px;}
.dag-card{background:#0f1729;border:1px solid #1e2d4a;border-radius:18px;padding:26px;
  width:100%;max-width:380px;}
.dag-title{font-weight:700;font-size:1.05rem;margin-bottom:5px;text-align:center;}
.dag-info{font-size:.78rem;color:#94a3b8;line-height:1.55;margin-bottom:18px;text-align:center;}
.dag-lbl{font-size:.72rem;color:#94a3b8;margin-bottom:5px;letter-spacing:.02em;}
.dag-inp{background:#0a1120;border:1px solid #1e3a5f;border-radius:8px;color:#e2e8f0;
  padding:11px 12px;font-size:1rem;font-family:'DM Mono',monospace;width:100%;outline:none;
  transition:border-color .15s;letter-spacing:.05em;}
.dag-inp:focus{border-color:#60a5fa;}
.dag-inp+.dag-lbl{margin-top:14px;}
.dag-btn{background:linear-gradient(135deg,#1d4ed8,#6366f1);color:#fff;border:none;
  padding:11px 22px;border-radius:9px;font-family:inherit;font-size:.92rem;font-weight:600;
  cursor:pointer;width:100%;margin-top:18px;transition:filter .15s;}
.dag-btn:hover{filter:brightness(1.1);}
.dag-btn:disabled{opacity:.5;cursor:not-allowed;}
.dag-btn-ghost{background:#0a1120;border:1px solid #1e3a5f;color:#94a3b8;margin-top:8px;}
.dag-btn-ghost:hover{border-color:#3b82f6;color:#60a5fa;filter:none;}
.dag-err{color:#f87171;font-size:.8rem;min-height:18px;text-align:center;margin:10px 0 0;}
.dag-show{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;
  color:#475569;cursor:pointer;font-size:1rem;padding:4px;}
.dag-show:hover{color:#94a3b8;}
.dag-pwrap{position:relative;}
`;

function injectCSS(){
  if(document.getElementById('dashAuthGateCSS')) return;
  const s = document.createElement('style');
  s.id = 'dashAuthGateCSS';
  s.textContent = GATE_CSS;
  document.head.appendChild(s);
}

// ── Construye la pantalla del gate ──
function buildGateUI(opts){
  injectCSS();
  // Ocultamos el body para que no se vea nada del dashboard hasta que entre
  document.body.style.visibility = 'hidden';

  const gate = document.createElement('div');
  gate.id = 'dashAuthGate';
  gate.style.visibility = 'visible';
  gate.innerHTML = `
    <div class="dag-logo">
      <div class="dag-icon">🔒</div>
      <div>
        <div class="dag-name">${opts.title || opts.section}</div>
        <div class="dag-sub">acceso protegido</div>
      </div>
    </div>
    <div class="dag-card">
      <div class="dag-title" id="dagTitle">—</div>
      <div class="dag-info" id="dagInfo"></div>
      <div id="dagFields"></div>
      <div class="dag-err" id="dagErr"></div>
      <button class="dag-btn" id="dagPrimary">Continuar</button>
      <button class="dag-btn dag-btn-ghost" id="dagBack">← Volver al inicio</button>
    </div>
  `;
  document.body.appendChild(gate);
  return gate;
}

function destroyGate(gate){
  if(gate && gate.parentNode) gate.parentNode.removeChild(gate);
  document.body.style.visibility = '';
}

// Field maker
function pinField(id, placeholder){
  return `
    <div class="dag-lbl">${placeholder}</div>
    <div class="dag-pwrap">
      <input class="dag-inp" id="${id}" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="dag-show" type="button" data-target="${id}" tabindex="-1">👁</button>
    </div>
  `;
}

function wireShowButtons(root){
  root.querySelectorAll('.dag-show').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = root.querySelector('#'+btn.dataset.target);
      if(!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      btn.textContent = inp.type === 'password' ? '👁' : '🙈';
    });
  });
}

// ──────────────────────────────────────────────────────────────────
// FLUJO PRINCIPAL
// ──────────────────────────────────────────────────────────────────

async function gate(opts){
  if(!window.GitHubSync || !window.GitHubSync.isLoggedIn()){
    window.location.href = 'index.html';
    return new Promise(()=>{}); // never resolves
  }

  const section = opts.section;
  const title   = opts.title || section;
  const ui = buildGateUI({ section, title });

  // Bajar la sección __security para saber si hay PIN
  let security;
  try {
    security = await window.GitHubSync.fetchSecuritySection();
  } catch(err){
    showError(ui, 'No pude conectar con GitHub: '+(err.message||'')+'. ¿Token caducado?');
    wireBackButton(ui);
    // Ofrecer continuar sin sync no es buena idea, así que bloqueamos
    return new Promise(()=>{});
  }

  const hasPin = !!security[section];

  if(!hasPin){
    return await flowFirstPin(ui, section);
  } else {
    return await flowEnterPin(ui, section, security[section]);
  }
}

function showError(ui, msg){
  ui.querySelector('#dagErr').textContent = msg;
}

function wireBackButton(ui){
  ui.querySelector('#dagBack').onclick = () => { window.location.href = 'index.html'; };
}

// Primera vez: crear PIN
function flowFirstPin(ui, section){
  return new Promise((resolve) => {
    ui.querySelector('#dagTitle').textContent = 'Crear PIN para este dashboard';
    ui.querySelector('#dagInfo').innerHTML = 'Aún no tiene PIN. Elige uno (al menos 4 caracteres). Te lo pedirá la próxima vez.';
    ui.querySelector('#dagFields').innerHTML =
      pinField('dagPin1', 'Nuevo PIN') +
      pinField('dagPin2', 'Repite el PIN');
    wireShowButtons(ui);
    wireBackButton(ui);

    const inp1 = ui.querySelector('#dagPin1');
    const inp2 = ui.querySelector('#dagPin2');
    setTimeout(() => inp1.focus(), 50);
    inp1.onkeydown = (e) => { if(e.key === 'Enter') inp2.focus(); };
    inp2.onkeydown = (e) => { if(e.key === 'Enter') ui.querySelector('#dagPrimary').click(); };

    ui.querySelector('#dagPrimary').onclick = async () => {
      const a = inp1.value;
      const b = inp2.value;
      if(a.length < 4){ showError(ui, 'El PIN tiene que tener al menos 4 caracteres'); return; }
      if(a !== b){ showError(ui, 'Los dos PINs no coinciden'); inp1.value=''; inp2.value=''; inp1.focus(); return; }

      ui.querySelector('#dagPrimary').disabled = true;
      ui.querySelector('#dagPrimary').textContent = 'guardando…';
      try {
        const hash = await hashPin(section, a);
        await window.GitHubSync.updateSecuritySection(sec => {
          sec[section] = hash;
          return sec;
        });
        if(window.GitHubSync.enableAutoPush) window.GitHubSync.enableAutoPush();
        destroyGate(ui);
        resolve();
      } catch(err){
        showError(ui, 'Error al guardar: '+(err.message||''));
        ui.querySelector('#dagPrimary').disabled = false;
        ui.querySelector('#dagPrimary').textContent = 'Continuar';
      }
    };
  });
}

// Ya hay PIN: pedirlo
function flowEnterPin(ui, section, expectedHash){
  return new Promise((resolve) => {
    ui.querySelector('#dagTitle').textContent = 'Introduce el PIN';
    ui.querySelector('#dagInfo').textContent = '';
    ui.querySelector('#dagFields').innerHTML = pinField('dagPin1', 'PIN');
    wireShowButtons(ui);
    wireBackButton(ui);

    const inp = ui.querySelector('#dagPin1');
    setTimeout(() => inp.focus(), 50);
    inp.onkeydown = (e) => { if(e.key === 'Enter') ui.querySelector('#dagPrimary').click(); };

    ui.querySelector('#dagPrimary').onclick = async () => {
      const v = inp.value;
      if(!v){ showError(ui, 'Introduce el PIN'); return; }
      ui.querySelector('#dagPrimary').disabled = true;
      ui.querySelector('#dagPrimary').textContent = 'comprobando…';
      try {
        const hash = await hashPin(section, v);
        if(hash !== expectedHash){
          showError(ui, 'PIN incorrecto');
          inp.value = ''; inp.focus();
          ui.querySelector('#dagPrimary').disabled = false;
          ui.querySelector('#dagPrimary').textContent = 'Continuar';
          return;
        }
        if(window.GitHubSync.enableAutoPush) window.GitHubSync.enableAutoPush();
        destroyGate(ui);
        resolve();
      } catch(err){
        showError(ui, 'Error: '+(err.message||''));
        ui.querySelector('#dagPrimary').disabled = false;
        ui.querySelector('#dagPrimary').textContent = 'Continuar';
      }
    };
  });
}

// ──────────────────────────────────────────────────────────────────
// CAMBIO DE PIN (desde dentro del dashboard)
// ──────────────────────────────────────────────────────────────────

async function changePin(section, title){
  injectCSS();
  // Guardamos el estado de visibility del body por si justo en este momento
  // alguien llama desde el dashboard cargado
  const prevVis = document.body.style.visibility;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'dashAuthGate';
    overlay.style.visibility = 'visible';
    overlay.innerHTML = `
      <div class="dag-logo">
        <div class="dag-icon">🔑</div>
        <div>
          <div class="dag-name">Cambiar PIN</div>
          <div class="dag-sub">${title || section}</div>
        </div>
      </div>
      <div class="dag-card">
        <div class="dag-title">Cambiar el PIN de ${title || section}</div>
        <div class="dag-info">Introduce el PIN actual y el nuevo (al menos 4 caracteres).</div>
        ${pinField('cpOld', 'PIN actual')}
        ${pinField('cpNew1', 'Nuevo PIN')}
        ${pinField('cpNew2', 'Repite el nuevo')}
        <div class="dag-err" id="cpErr"></div>
        <button class="dag-btn" id="cpOk">Cambiar PIN</button>
        <button class="dag-btn dag-btn-ghost" id="cpCancel">Cancelar</button>
      </div>
    `;
    document.body.appendChild(overlay);
    wireShowButtons(overlay);

    const cleanup = () => {
      if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.body.style.visibility = prevVis;
    };

    const oldI = overlay.querySelector('#cpOld');
    const new1 = overlay.querySelector('#cpNew1');
    const new2 = overlay.querySelector('#cpNew2');
    setTimeout(() => oldI.focus(), 50);
    oldI.onkeydown = e => { if(e.key === 'Enter') new1.focus(); };
    new1.onkeydown = e => { if(e.key === 'Enter') new2.focus(); };
    new2.onkeydown = e => { if(e.key === 'Enter') overlay.querySelector('#cpOk').click(); };

    overlay.querySelector('#cpCancel').onclick = () => { cleanup(); resolve({cancelled:true}); };

    overlay.querySelector('#cpOk').onclick = async () => {
      const errEl = overlay.querySelector('#cpErr');
      errEl.textContent = '';
      const a = oldI.value;
      const b = new1.value;
      const c = new2.value;
      if(b.length < 4){ errEl.textContent = 'El nuevo PIN debe tener al menos 4 caracteres'; return; }
      if(b !== c){ errEl.textContent = 'Los dos PINs nuevos no coinciden'; new1.value=''; new2.value=''; new1.focus(); return; }
      overlay.querySelector('#cpOk').disabled = true;
      overlay.querySelector('#cpOk').textContent = 'comprobando…';
      try {
        const sec = await window.GitHubSync.fetchSecuritySection();
        const expected = sec[section];
        if(!expected){ errEl.textContent = 'No hay PIN configurado para esta sección'; return; }
        const oldHash = await hashPin(section, a);
        if(oldHash !== expected){
          errEl.textContent = 'El PIN actual no es correcto';
          oldI.value=''; oldI.focus();
          overlay.querySelector('#cpOk').disabled = false;
          overlay.querySelector('#cpOk').textContent = 'Cambiar PIN';
          return;
        }
        const newHash = await hashPin(section, b);
        await window.GitHubSync.updateSecuritySection(s => {
          s[section] = newHash;
          return s;
        });
        cleanup();
        alert('✓ PIN cambiado correctamente');
        resolve({changed:true});
      } catch(err){
        errEl.textContent = 'Error: '+(err.message||'');
        overlay.querySelector('#cpOk').disabled = false;
        overlay.querySelector('#cpOk').textContent = 'Cambiar PIN';
      }
    };
  });
}

// ──────────────────────────────────────────────────────────────────
// PUBLIC API
// ──────────────────────────────────────────────────────────────────

window.DashboardAuth = { gate, changePin };

})();
