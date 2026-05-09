GitHubSync.attach({
  section: 'facturas',
  keys: ['fac_v1']
});
DashboardAuth.gate({ section: 'facturas', title: 'Facturas' });

// Trackeador de última modificación local
(function trackLastModified(){
  const TRACKED = ['fac_v1'];
  const _orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value){
    _orig.call(this, key, value);
    if(this === window.localStorage && TRACKED.indexOf(key) >= 0){
      _orig.call(this, 'lm_fac', String(Date.now()));
    }
  };
})();

const SK = 'fac_v1';
let profiles = [];
let curId = null;
let editingFactura = null;
let editingFacIsNew = false;
let editingClienteId = null;
let editingProfileId = null;
let pinBuf = "", pendingProfileId = null, pinExpectedLen = 4;

const uid = ()=>"id_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,9);
const fmt = n => (n==null||isNaN(n)) ? "—" : n.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
const fmtN = n => (n==null||isNaN(n)) ? "0,00" : n.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2});
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = iso => { if(!iso)return"—"; const d=new Date(iso); return d.toLocaleDateString("es-ES"); };

// Estado de factura: si está marcada como pagada → pagada.
// Si es pendiente y han pasado más de 30 días desde la fecha → vencida.
// En otro caso → pendiente.
const VENCIMIENTO_DIAS = 30;
function getEstado(f){
  if(f.estado === 'pagada') return 'pagada';
  if(f.fecha){
    const d = new Date(f.fecha);
    const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    if(dias > VENCIMIENTO_DIAS) return 'vencida';
  }
  return 'pendiente';
}
const ESTADO_LABELS = { pendiente:'Pendiente', pagada:'Pagada', vencida:'Vencida' };
const ESTADO_EMOJI = { pendiente:'🟡', pagada:'🟢', vencida:'🔴' };

function load(){
  try{ profiles = JSON.parse(localStorage.getItem(SK)||"[]"); }catch{ profiles = []; }
  // Migración: el estilo "minimal" se eliminó. Pasamos a "corporativo".
  let migrated = false;
  profiles.forEach(p => {
    if(p.cfgStyle && p.cfgStyle.id === 'minimal'){
      p.cfgStyle.id = 'corporativo';
      migrated = true;
    }
  });
  if(migrated) save();
}
function save(){ localStorage.setItem(SK, JSON.stringify(profiles)); flashSave(); }
function flashSave(){ const b=document.getElementById("saveBadge"); if(!b)return; b.textContent="✓"; setTimeout(()=>b.textContent="",1500); }
function prof(){ return profiles.find(p=>p.id===curId); }

function showScreen(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function openModal(id){ document.getElementById(id).classList.add("open"); }
function closeModal(id){ document.getElementById(id).classList.remove("open"); }

function renderProfiles(){
  showScreen("profileScreen");
  const g = document.getElementById("profilesGrid");
  g.innerHTML = "";
  profiles.forEach(p=>{
    const d = document.createElement("div");
    d.className = "p-card";
    d.innerHTML = `
      <div class="p-avatar" style="background:${p.color}22;border:2px solid ${p.color}66;">${p.emoji||'📄'}</div>
      <div class="p-name">${p.name}</div>
      <div class="p-hint">${p.pin?"PIN requerido":"Sin PIN"}</div>
    `;
    d.onclick = ()=>selectProfile(p.id);
    g.appendChild(d);
  });
  const a = document.createElement("div");
  a.className = "p-add";
  a.innerHTML = `<div style="font-size:1.7rem;margin-bottom:7px">＋</div><div style="font-size:.85rem;font-weight:600">Nuevo perfil</div>`;
  a.onclick = ()=>openProfileModal();
  g.appendChild(a);
}

function openProfileModal(id){
  editingProfileId = id || null;
  if(id){
    const p = profiles.find(x=>x.id===id);
    document.getElementById("profileModalTitle").textContent = "Editar perfil";
    document.getElementById("pm_name").value = p.name||"";
    document.getElementById("pm_emoji").value = p.emoji||"📄";
    document.getElementById("pm_color").value = p.color||"#3b82f6";
    document.getElementById("pm_pin").value = p.pin||"";
  } else {
    document.getElementById("profileModalTitle").textContent = "Nuevo perfil";
    document.getElementById("pm_name").value = "";
    document.getElementById("pm_emoji").value = "📄";
    document.getElementById("pm_color").value = "#3b82f6";
    document.getElementById("pm_pin").value = "";
  }
  openModal("profileModal");
}

function saveProfile(){
  const name = document.getElementById("pm_name").value.trim();
  if(!name){ toast("El nombre es obligatorio", 'red'); return; }
  const emoji = document.getElementById("pm_emoji").value || "📄";
  const color = document.getElementById("pm_color").value;
  const pin = document.getElementById("pm_pin").value.trim();
  if(pin && !/^\d{4,6}$/.test(pin)){ toast("El PIN debe tener entre 4 y 6 dígitos", 'red'); return; }

  if(editingProfileId){
    const p = profiles.find(x=>x.id===editingProfileId);
    p.name = name; p.emoji = emoji; p.color = color; p.pin = pin;
  } else {
    profiles.push({
      id: uid(), name, emoji, color, pin,
      emisor: { name:"", nrt:"", addr:"", city:"", email:"", tel:"", iban:"" },
      logo: null,
      cfg: { prefix: "F-", next: 1, igi: 4.5 },
      cfgStyle: { id:'corporativo', textos: {}, lang:'ca' }, // estilo activo + overrides + idioma
      clientes: [],
      facturas: [],
      plantillas: []
    });
  }
  save();
  closeModal("profileModal");
  renderProfiles();
}

function selectProfile(id){
  const p = profiles.find(x=>x.id===id);
  if(!p) return;
  if(p.pin){ pendingProfileId = id; openPin(p.name); }
  else enterApp(id);
}

function enterApp(id){
  curId = id;
  const p = prof();

  // Auto-rotación de prefijo: si el prefijo actual son 2 dígitos numéricos
  // y NO coincide con el año actual, ofrecemos rotar.
  const yy = String(new Date().getFullYear()).slice(-2);
  if(p.cfg && /^\d{2}$/.test(p.cfg.prefix||"") && p.cfg.prefix !== yy){
    if(confirm(`Estamos en ${20+''}${yy}. El prefijo actual es "${p.cfg.prefix}".\n\n¿Cambiar prefijo a "${yy}" y reiniciar contador a 1?\n\n(Las facturas anteriores no se tocan, solo cambia la numeración para las próximas.)`)){
      p.cfg.prefix = yy;
      p.cfg.next = 1;
      save();
    }
  }

  document.getElementById("hdrProfile").textContent = (p.emoji||'📄') + " " + p.name;
  showScreen("appScreen");
  showTab("facturas");
}

function logout(){
  curId = null; editingFactura = null;
  renderProfiles();
}

function deleteProfile(){
  if(!confirm("¿Eliminar este perfil con TODOS sus datos? Esta acción no se puede deshacer.")) return;
  profiles = profiles.filter(p=>p.id!==curId);
  save();
  curId = null;
  renderProfiles();
}

function openPin(name){
  pinBuf = "";
  const p = profiles.find(x=>x.id===pendingProfileId);
  pinExpectedLen = p && p.pin ? p.pin.length : 4;
  document.getElementById("pinSub").textContent = "Perfil: " + (name||"");
  document.getElementById("pinTitle").textContent = "Introduce PIN";
  document.getElementById("pinErr").textContent = "";
  renderPinDots();
  renderPinPad();
  showScreen("pinScreen");
}

function renderPinDots(){
  const dots = document.getElementById("pinDots");
  dots.innerHTML = "";
  // Mostramos exactamente la longitud del PIN del perfil (4, 5 o 6)
  for(let i=0;i<pinExpectedLen;i++){
    const d = document.createElement("div");
    d.className = "pin-dot" + (i<pinBuf.length ? " filled" : "");
    dots.appendChild(d);
  }
}

function renderPinPad(){
  const pad = document.getElementById("pinPad");
  pad.innerHTML = "";
  // Layout: 1 2 3 / 4 5 6 / 7 8 9 / ← 0 OK
  const keys = ["1","2","3","4","5","6","7","8","9","←","0","OK"];
  keys.forEach(k=>{
    const b = document.createElement("button");
    b.className = "pin-key" + (k==="←"||k==="OK" ? " special" : "");
    b.textContent = k;
    b.onclick = ()=>onPinKey(k);
    pad.appendChild(b);
  });
}

function onPinKey(k){
  if(k==="←"){
    if(pinBuf.length === 0){ logout(); return; } // si vacío, vuelve al selector
    pinBuf = pinBuf.slice(0,-1);
    renderPinDots();
    return;
  }
  if(k==="OK"){
    if(pinBuf.length >= 4) checkPin();
    else {
      document.getElementById("pinErr").textContent = "Mínimo 4 dígitos";
    }
    return;
  }
  if(pinBuf.length>=6) return;
  pinBuf += k;
  renderPinDots();
  // Auto-check si ya alcanza la longitud esperada
  if(pinBuf.length === pinExpectedLen) setTimeout(checkPin, 100);
}

function checkPin(){
  const p = profiles.find(x=>x.id===pendingProfileId);
  if(!p) return;
  if(pinBuf===p.pin){ enterApp(pendingProfileId); }
  else {
    document.getElementById("pinErr").textContent = "PIN incorrecto";
    pinBuf = ""; renderPinDots();
  }
}

function showTab(tab){
  document.querySelectorAll(".tab-content").forEach(t=>t.style.display="none");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
  const el = document.getElementById("tab-"+tab);
  if(el) el.style.display = "block";
  document.querySelectorAll(`.nav-btn[data-tab="${tab}"]`).forEach(b=>b.classList.add("active"));
  const titles = { facturas:"Facturas", clientes:"Clientes", emisor:"Mis datos", ajustes:"Ajustes", editor:"Editor de factura" };
  document.getElementById("tabTitle").textContent = titles[tab] || tab;

  if(tab==="facturas") renderFacList();
  if(tab==="clientes") renderCliList();
  if(tab==="emisor")   renderEmisor();
  if(tab==="ajustes")  renderAjustes();
}

function renderEmisor(){
  const p = prof(); if(!p) return;
  const e = p.emisor || {};
  document.getElementById("em_name").value  = e.name||"";
  document.getElementById("em_nrt").value   = e.nrt||"";
  document.getElementById("em_addr").value  = e.addr||"";
  document.getElementById("em_city").value  = e.city||"";
  document.getElementById("em_email").value = e.email||"";
  document.getElementById("em_tel").value   = e.tel||"";
  document.getElementById("em_iban").value  = e.iban||"";
  renderLogo();
}

function emSave(){
  const p = prof(); if(!p) return;
  p.emisor = {
    name: document.getElementById("em_name").value.trim(),
    nrt:  document.getElementById("em_nrt").value.trim(),
    addr: document.getElementById("em_addr").value.trim(),
    city: document.getElementById("em_city").value.trim(),
    email:document.getElementById("em_email").value.trim(),
    tel:  document.getElementById("em_tel").value.trim(),
    iban: document.getElementById("em_iban").value.trim()
  };
  save();
}

function renderLogo(){
  const p = prof(); if(!p) return;
  const div = document.getElementById("logoPreview");
  if(p.logo){ div.innerHTML = `<img src="${p.logo}" style="max-width:100%;max-height:100%;">`; }
  else { div.innerHTML = "Sin logo"; }
}

function onLogoChange(ev){
  const file = ev.target.files[0];
  if(!file) return;
  if(file.size > 300*1024){
    if(!confirm("La imagen pesa más de 300KB y va a saturar el JSON. ¿Continuar igualmente?")) return;
  }
  const reader = new FileReader();
  reader.onload = e=>{
    const p = prof(); if(!p) return;
    p.logo = e.target.result;
    save();
    renderLogo();
  };
  reader.readAsDataURL(file);
}

function removeLogo(){
  const p = prof(); if(!p) return;
  p.logo = null;
  save();
  renderLogo();
}

function renderAjustes(){
  const p = prof(); if(!p) return;
  if(!p.cfg) p.cfg = { prefix:"F-", next:1, igi:4.5 };
  if(!p.cfgStyle) p.cfgStyle = { id:'corporativo', textos:{}, lang:'ca' };
  document.getElementById("cfg_prefix").value = p.cfg.prefix||"";
  document.getElementById("cfg_next").value = p.cfg.next||1;
  document.getElementById("cfg_igi").value = p.cfg.igi!=null ? p.cfg.igi : 4.5;
  updateCfgPreview();
  renderEstilos();
  renderPlantillas();
}

// ── Plantillas de líneas frecuentes ──
function renderPlantillas(){
  const p = prof(); if(!p) return;
  if(!p.plantillas) p.plantillas = [];
  const el = document.getElementById("plantillasList");
  if(!el) return;
  if(!p.plantillas.length){
    el.innerHTML = `<div style="font-size:.75rem;color:var(--mute2);padding:10px 0;">Aún no hay plantillas.</div>`;
    return;
  }
  let h = "";
  p.plantillas.forEach((pl, i) => {
    h += `<div style="display:grid;grid-template-columns:3fr 1fr 1fr 28px;gap:8px;align-items:center;margin-bottom:6px;">
      <input class="inp" placeholder="Descripción" value="${(pl.desc||'').replace(/"/g,'&quot;')}" oninput="plantillaUpd(${i},'desc',this.value)">
      <input class="inp" type="number" step="0.01" placeholder="Precio" value="${pl.precio||''}" oninput="plantillaUpd(${i},'precio',this.value)" style="text-align:right;">
      <input class="inp" type="number" step="0.5" placeholder="IGI %" value="${pl.igi||''}" oninput="plantillaUpd(${i},'igi',this.value)" style="text-align:right;">
      <button class="fac-x" onclick="removePlantilla(${i})" title="Eliminar plantilla">×</button>
    </div>`;
  });
  el.innerHTML = h;
}

function addPlantilla(){
  const p = prof(); if(!p) return;
  if(!p.plantillas) p.plantillas = [];
  p.plantillas.push({ desc:"", precio:0, igi: p.cfg?.igi||4.5 });
  save();
  renderPlantillas();
}

function plantillaUpd(i, field, val){
  const p = prof(); if(!p) return;
  if(!p.plantillas[i]) return;
  if(field==="desc") p.plantillas[i].desc = val;
  else p.plantillas[i][field] = parseFloat(val)||0;
  save();
}

function removePlantilla(i){
  const p = prof(); if(!p) return;
  if(!confirm("¿Eliminar esta plantilla?")) return;
  p.plantillas.splice(i,1);
  save();
  renderPlantillas();
}

// ── Selector de estilo de factura ──
function renderEstilos(){
  const p = prof(); if(!p) return;
  if(!p.cfgStyle) p.cfgStyle = { id:'corporativo', textos:{}, lang:'ca' };
  if(!p.cfgStyle.lang) p.cfgStyle.lang = 'ca';
  const cur = p.cfgStyle.id || 'corporativo';

  // Botones de idioma activos
  const lang = p.cfgStyle.lang;
  ['ca','es'].forEach(l => {
    const btn = document.getElementById(`lang_${l}_btn`);
    if(!btn) return;
    if(l === lang){
      btn.style.borderColor = 'var(--acc)';
      btn.style.color = 'var(--acc2)';
    } else {
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  });

  const el = document.getElementById("estilosGrid");
  if(!el) return;
  let h = "";
  Object.entries(STYLE_TEMPLATES).forEach(([id, tpl]) => {
    const active = id === cur;
    h += `<div onclick="setEstilo('${id}')" style="cursor:pointer;border:2px solid ${active?'var(--acc)':'var(--bd)'};background:${active?'var(--card2)':'var(--card)'};border-radius:8px;padding:14px;transition:all .15s;">
      <div style="font-weight:600;font-size:.88rem;margin-bottom:4px;color:${active?'var(--acc2)':'var(--fg)'};">${active?'✓ ':''}${tpl.name}</div>
      <div style="font-size:.7rem;color:var(--mute2);line-height:1.4;">${tpl.desc}</div>
    </div>`;
  });
  el.innerHTML = h;

  // Si el panel de preview está abierto, refrescar
  if(document.getElementById("estiloPreview").style.display === 'block'){
    renderEstiloPreview();
  }
  // Si el panel de textos está abierto, refrescar
  if(document.getElementById("estiloTextosPanel").style.display === 'block'){
    renderEstiloTextos();
  }
}

function setEstilo(id){
  const p = prof(); if(!p) return;
  if(!p.cfgStyle) p.cfgStyle = { id:'corporativo', textos:{}, lang:'ca' };
  p.cfgStyle.id = id;
  // Al cambiar de estilo, los textos override quedan, pero solo aplican
  // a las claves que tengan sentido en el nuevo template (las extra se ignoran).
  save();
  renderEstilos();
}

function setLang(lang){
  const p = prof(); if(!p) return;
  if(!p.cfgStyle) p.cfgStyle = { id:'corporativo', textos:{}, lang:'ca' };

  // Si el usuario tiene textos personalizados (overrides), preguntar antes
  // de cambiar idioma porque podrían quedar inconsistentes (mezcla de idiomas)
  const overrides = p.cfgStyle.textos || {};
  if(Object.keys(overrides).length > 0){
    if(!confirm("Tens textos personalitzats. Vols mantenir-los o esborrar-los per usar els textos per defecte de l'idioma?\n\nAccepta = mantenir-los\nCancel·la = esborrar-los")){
      p.cfgStyle.textos = {};
    }
  }

  p.cfgStyle.lang = lang;
  save();
  renderEstilos();
}

function toggleEstiloPreview(){
  const el = document.getElementById("estiloPreview");
  const btn = document.getElementById("estiloPreviewBtn");
  if(el.style.display === 'block'){
    el.style.display = 'none';
    btn.textContent = '👁️ Veure vista prèvia';
  } else {
    el.style.display = 'block';
    btn.textContent = '👁️ Ocultar vista prèvia';
    renderEstiloPreview();
  }
}

function renderEstiloPreview(){
  const p = prof(); if(!p) return;
  // Construimos una factura DEMO con datos de ejemplo + datos reales del emisor
  const styleId = p.cfgStyle?.id || 'corporativo';
  const tpl = STYLE_TEMPLATES[styleId] || STYLE_TEMPLATES.corporativo;
  const textos = getTextosTemplate(p, styleId);

  // Demo factura
  const demoFac = {
    numero: (p.cfg?.prefix||'') + String(p.cfg?.next||1).padStart(4,'0'),
    fecha: todayISO(),
    clienteId: '__demo__',
    notas: 'Forma de pagament: transferència bancària.',
    style: styleId,
    lineas: [
      { desc:'Servei de consultoria', cant:1, precio:500, igi:4.5 },
      { desc:'Disseny gràfic', cant:2, precio:150, igi:4.5 },
    ],
    totales: { subtotal:800, igi:36, total:836 }
  };
  // Cliente demo (no se guarda)
  const demoP = {
    ...p,
    clientes: [...(p.clientes||[]), { id:'__demo__', name:'Client d\'exemple', nrt:'X-000000-A', addr:'Carrer Demo 1', city:'AD500 Andorra', email:'demo@email.cat' }]
  };
  const tempEditingFactura = editingFactura;
  const tempCurId = curId;
  // Hack: usamos buildPrintHTML pero pasamos demoP/demoFac. Como es global, hacemos swap temporal.
  editingFactura = demoFac;
  // Sustituimos prof() temporalmente: la forma más simple es swap de profiles
  const origProfiles = profiles;
  profiles = profiles.map(x => x.id===p.id ? demoP : x);
  const html = buildPrintHTML();
  profiles = origProfiles;
  editingFactura = tempEditingFactura;
  curId = tempCurId;

  document.getElementById("estiloPreview").innerHTML = html;
}

function toggleEstiloTextos(){
  const el = document.getElementById("estiloTextosPanel");
  const btn = document.getElementById("estiloTextosBtn");
  if(el.style.display === 'block'){
    el.style.display = 'none';
    btn.textContent = '✎ Editar textos';
  } else {
    el.style.display = 'block';
    btn.textContent = '✎ Tancar editor de textos';
    renderEstiloTextos();
  }
}

function renderEstiloTextos(){
  const p = prof(); if(!p) return;
  const styleId = p.cfgStyle?.id || 'corporativo';
  const lang = p.cfgStyle?.lang || 'ca';
  const baseTextos = (LANG_PACKS[lang] && LANG_PACKS[lang][styleId]) || LANG_PACKS.ca[styleId] || {};
  const overrides = p.cfgStyle?.textos || {};
  const cont = document.getElementById("estiloTextosFields");
  if(!cont) return;
  const labelMap = {
    titulo:'Títol principal',
    labelNum:'Etiqueta número',
    labelFecha:'Etiqueta data',
    labelDe:'Encapçalament emissor',
    labelPara:'Encapçalament client',
    colDesc:'Columna descripció',
    colCant:'Columna quantitat',
    colPrecio:'Columna preu',
    colIgi:'Columna IGI',
    colTotal:'Columna total',
    labelSubtotal:'Etiqueta subtotal',
    labelIgi:'Etiqueta IGI',
    labelTotal:'Etiqueta total',
    labelNotas:'Encapçalament notes / pagament',
    labelIban:'Etiqueta IBAN',
    footer:'Text peu de pàgina'
  };
  let h = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">`;
  Object.entries(baseTextos).forEach(([key, defVal]) => {
    const cur = overrides[key] != null ? overrides[key] : '';
    h += `<div>
      <label class="fld-lbl">${labelMap[key]||key}</label>
      <input class="inp" data-textkey="${key}" value="${(cur||'').replace(/"/g,'&quot;')}" placeholder="${(defVal||'').replace(/"/g,'&quot;')}" oninput="onEstiloTextChange('${key}',this.value)">
    </div>`;
  });
  h += `</div>`;
  cont.innerHTML = h;
}

function onEstiloTextChange(key, val){
  const p = prof(); if(!p) return;
  if(!p.cfgStyle) p.cfgStyle = { id:'corporativo', textos:{}, lang:'ca' };
  if(!p.cfgStyle.textos) p.cfgStyle.textos = {};
  if(val.trim() === ''){
    delete p.cfgStyle.textos[key];
  } else {
    p.cfgStyle.textos[key] = val;
  }
  save();
  // Refrescar preview si está visible
  if(document.getElementById("estiloPreview").style.display === 'block'){
    renderEstiloPreview();
  }
}

function resetEstiloTextos(){
  const p = prof(); if(!p) return;
  if(!confirm("Restaurar tots els textos al valor per defecte d'aquest estil?")) return;
  if(!p.cfgStyle) p.cfgStyle = { id:'corporativo', textos:{}, lang:'ca' };
  p.cfgStyle.textos = {};
  save();
  renderEstiloTextos();
  if(document.getElementById("estiloPreview").style.display === 'block'){
    renderEstiloPreview();
  }
}

function cfgSave(){
  const p = prof(); if(!p) return;
  p.cfg = {
    prefix: document.getElementById("cfg_prefix").value,
    next: parseInt(document.getElementById("cfg_next").value)||1,
    igi: parseFloat(document.getElementById("cfg_igi").value)||0
  };
  save();
  updateCfgPreview();
}

function updateCfgPreview(){
  const p = prof(); if(!p) return;
  const num = (p.cfg.prefix||"") + String(p.cfg.next||1).padStart(4,"0");
  const el = document.getElementById("cfgPreview");
  if(el) el.textContent = num;
}

function renderCliList(){
  const p = prof(); if(!p) return;
  const list = p.clientes || [];
  document.getElementById("cliCount").textContent = list.length + (list.length===1?" cliente":" clientes");
  const el = document.getElementById("cliList");
  if(!list.length){
    el.innerHTML = `<div class="card empty"><div class="empty-ic">👥</div>Aún no hay clientes. Crea uno para usarlo en tus facturas.</div>`;
    return;
  }
  let h = `<div class="card"><div class="tbl-wrap"><table><thead><tr>
    <th>Nombre</th><th>NRT</th><th>Email</th><th>Tel</th><th class="td-c"></th>
  </tr></thead><tbody>`;
  list.forEach(c=>{
    h += `<tr>
      <td><strong>${c.name||""}</strong>${c.city?`<div style="font-size:.7rem;color:var(--mute2);">${c.city}</div>`:""}</td>
      <td class="td-num">${c.nrt||"—"}</td>
      <td>${c.email||"—"}</td>
      <td>${c.tel||"—"}</td>
      <td class="td-c"><button class="btn-sec" onclick="openCliente('${c.id}')">✎ Editar</button></td>
    </tr>`;
  });
  h += `</tbody></table></div></div>`;
  el.innerHTML = h;
}

function openCliente(id){
  editingClienteId = id || null;
  const p = prof();
  if(id){
    const c = p.clientes.find(x=>x.id===id);
    document.getElementById("cliModalTitle").textContent = "Editar cliente";
    document.getElementById("cl_name").value = c.name||"";
    document.getElementById("cl_nrt").value = c.nrt||"";
    document.getElementById("cl_addr").value = c.addr||"";
    document.getElementById("cl_city").value = c.city||"";
    document.getElementById("cl_email").value = c.email||"";
    document.getElementById("cl_tel").value = c.tel||"";
    document.getElementById("cl_notes").value = c.notes||"";
    document.getElementById("cl_del_btn").style.display = "inline-block";
  } else {
    document.getElementById("cliModalTitle").textContent = "Nuevo cliente";
    ["cl_name","cl_nrt","cl_addr","cl_city","cl_email","cl_tel","cl_notes"].forEach(f=>document.getElementById(f).value="");
    document.getElementById("cl_del_btn").style.display = "none";
  }
  openModal("clienteModal");
}

function saveCliente(){
  const p = prof();
  const name = document.getElementById("cl_name").value.trim();
  if(!name){ toast("El nombre es obligatorio", 'red'); return; }
  const data = {
    name, nrt: document.getElementById("cl_nrt").value.trim(),
    addr: document.getElementById("cl_addr").value.trim(),
    city: document.getElementById("cl_city").value.trim(),
    email: document.getElementById("cl_email").value.trim(),
    tel: document.getElementById("cl_tel").value.trim(),
    notes: document.getElementById("cl_notes").value.trim()
  };
  if(editingClienteId){
    const c = p.clientes.find(x=>x.id===editingClienteId);
    Object.assign(c, data);
  } else {
    p.clientes.push({ id: uid(), ...data });
  }
  save();
  closeModal("clienteModal");
  renderCliList();
}

function deleteCliente(){
  if(!editingClienteId) return;
  if(!confirm("¿Eliminar este cliente?")) return;
  const p = prof();
  p.clientes = p.clientes.filter(c=>c.id!==editingClienteId);
  save();
  closeModal("clienteModal");
  renderCliList();
}

// Filtro de listado de facturas (estado y cliente). Memoria mientras la app esté abierta.
let _facFilter = { estado:'', clienteId:'' };

function renderFacList(){
  const p = prof(); if(!p) return;
  const allList = (p.facturas||[]).slice().sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));

  // Aplicar filtro
  let list = allList;
  if(_facFilter.estado) list = list.filter(f => getEstado(f) === _facFilter.estado);
  if(_facFilter.clienteId) list = list.filter(f => f.clienteId === _facFilter.clienteId);

  // Contadores por estado (sobre TODAS, no filtrado)
  let nPag=0, nPen=0, nVen=0, totPen=0, totVen=0;
  allList.forEach(f => {
    const e = getEstado(f);
    if(e==='pagada') nPag++;
    else if(e==='pendiente'){ nPen++; totPen += f.totales?.total||0; }
    else if(e==='vencida'){ nVen++; totVen += f.totales?.total||0; }
  });

  document.getElementById("facCount").textContent = list.length + (list.length===1?" factura":" facturas") + (list.length !== allList.length ? ` (de ${allList.length})` : "");

  const el = document.getElementById("facList");

  // Cards de resumen
  let summary = "";
  if(allList.length){
    summary = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px;">
      <div class="card" style="margin:0;padding:12px 14px;cursor:pointer;${_facFilter.estado===''?'border-color:var(--acc);':''}" onclick="setFacFilter('estado','')">
        <div style="font-size:.65rem;color:var(--mute2);text-transform:uppercase;letter-spacing:.06em;">Total</div>
        <div style="font-size:1.4rem;font-weight:700;font-family:'DM Mono',monospace;">${allList.length}</div>
      </div>
      <div class="card" style="margin:0;padding:12px 14px;cursor:pointer;${_facFilter.estado==='pagada'?'border-color:#15803d;':''}" onclick="setFacFilter('estado','pagada')">
        <div style="font-size:.65rem;color:#86efac;text-transform:uppercase;letter-spacing:.06em;">🟢 Pagadas</div>
        <div style="font-size:1.4rem;font-weight:700;font-family:'DM Mono',monospace;">${nPag}</div>
      </div>
      <div class="card" style="margin:0;padding:12px 14px;cursor:pointer;${_facFilter.estado==='pendiente'?'border-color:#92400e;':''}" onclick="setFacFilter('estado','pendiente')">
        <div style="font-size:.65rem;color:#fbbf24;text-transform:uppercase;letter-spacing:.06em;">🟡 Pendientes</div>
        <div style="font-size:1.4rem;font-weight:700;font-family:'DM Mono',monospace;">${nPen}</div>
        <div style="font-size:.7rem;color:var(--mute2);">${fmt(totPen)}</div>
      </div>
      <div class="card" style="margin:0;padding:12px 14px;cursor:pointer;${_facFilter.estado==='vencida'?'border-color:#991b1b;':''}" onclick="setFacFilter('estado','vencida')">
        <div style="font-size:.65rem;color:#fca5a5;text-transform:uppercase;letter-spacing:.06em;">🔴 Vencidas</div>
        <div style="font-size:1.4rem;font-weight:700;font-family:'DM Mono',monospace;">${nVen}</div>
        <div style="font-size:.7rem;color:var(--mute2);">${fmt(totVen)}</div>
      </div>
    </div>`;
  }

  if(!list.length){
    el.innerHTML = summary + `<div class="card empty"><div class="empty-ic">📄</div>${allList.length ? "No hay facturas con ese filtro." : "Aún no hay facturas. Crea la primera con + Nueva factura."}</div>`;
    return;
  }

  let h = summary + `<div class="card"><div class="tbl-wrap"><table><thead><tr>
    <th>Número</th><th>Estado</th><th>Fecha</th><th>Cliente</th><th class="td-r">Total</th><th class="td-c" style="min-width:240px;">Acciones</th>
  </tr></thead><tbody>`;
  list.forEach(f=>{
    const cli = (p.clientes||[]).find(c=>c.id===f.clienteId);
    const cliName = cli ? cli.name : "—";
    const est = getEstado(f);
    const isPagada = est === 'pagada';
    h += `<tr>
      <td><strong>${f.numero}</strong></td>
      <td><span class="badge ${est}">${ESTADO_EMOJI[est]} ${ESTADO_LABELS[est]}</span></td>
      <td>${fmtDate(f.fecha)}</td>
      <td>${cliName}</td>
      <td class="td-r td-num">${fmt(f.totales?.total)}</td>
      <td class="td-c" style="white-space:nowrap;">
        <button class="btn-sec" onclick="toggleEstado('${f.id}')" title="${isPagada?'Marcar como pendiente':'Marcar como pagada'}">${isPagada?'↺':'✓'}</button>
        <button class="btn-sec" onclick="editFactura('${f.id}')" title="Abrir y editar">📂</button>
        <button class="btn-sec" onclick="duplicateFactura('${f.id}')" title="Duplicar">📋</button>
        <button class="btn-sec" onclick="quickPDF('${f.id}')" title="Descargar PDF">📥</button>
        <button class="btn-sec" onclick="quickShareEmail('${f.id}')" title="Enviar por email">✉️</button>
        <button class="btn-sec" onclick="deleteFactura('${f.id}')" title="Borrar factura" style="color:#f87171;border-color:#3a1818;">🗑</button>
      </td>
    </tr>`;
  });
  h += `</tbody></table></div></div>`;
  el.innerHTML = h;
}

function setFacFilter(field, val){
  // Toggle: si se hace click en el filtro ya activo, se desactiva
  if(_facFilter[field] === val) _facFilter[field] = '';
  else _facFilter[field] = val;
  renderFacList();
}

function toggleEstado(id){
  const p = prof();
  const f = p.facturas.find(x => x.id === id);
  if(!f) return;
  const est = getEstado(f);
  if(est === 'pagada'){
    f.estado = 'pendiente';
    delete f.fechaPago;
  } else {
    f.estado = 'pagada';
    f.fechaPago = new Date().toISOString().slice(0,10);
  }
  save();
  renderFacList();
}

function duplicateFactura(id){
  const p = prof();
  const orig = p.facturas.find(x => x.id === id);
  if(!orig) return;
  // Crear copia con nuevo número, fecha de hoy, y estado pendiente
  const num = (p.cfg.prefix||"") + String(p.cfg.next||1).padStart(4,"0");
  editingFactura = {
    ...JSON.parse(JSON.stringify(orig)),
    id: uid(),
    numero: num,
    fecha: todayISO(),
    estado: 'pendiente',
    fechaPago: undefined
  };
  delete editingFactura.fechaPago;
  editingFacIsNew = true;
  showEditor();
}

function quickShareEmail(id){
  const p = prof();
  const f = p.facturas.find(x => x.id === id);
  if(!f) return;
  const cli = (p.clientes||[]).find(c => c.id === f.clienteId);
  const to = cli?.email || '';
  const subject = `Factura ${f.numero} - ${p.emisor?.name||''}`;
  const body = `Hola${cli?.name?' '+cli.name:''},\n\nAdjunto te envío la factura ${f.numero} con fecha ${fmtDate(f.fecha)} por importe de ${fmt(f.totales?.total)}.\n\n${p.emisor?.iban?'Datos para el pago:\nIBAN: '+p.emisor.iban+'\n\n':''}Quedo a tu disposición para cualquier consulta.\n\nUn saludo,\n${p.emisor?.name||''}`;
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  // Abrir en nueva pestaña para no perder el estado de la app
  window.location.href = url;
}

// Acciones rápidas desde el listado (sin entrar al editor)
function quickPDF(id){
  const p = prof();
  const f = p.facturas.find(x => x.id === id);
  if(!f) return;
  editingFactura = JSON.parse(JSON.stringify(f));
  downloadPDF();
  // editingFactura se limpia tras el PDF? lo mantenemos por si acaso
}

function quickPrint(id){
  const p = prof();
  const f = p.facturas.find(x => x.id === id);
  if(!f) return;
  editingFactura = JSON.parse(JSON.stringify(f));
  printFactura();
}

function deleteFactura(id){
  const p = prof();
  const f = p.facturas.find(x => x.id === id);
  if(!f) return;
  if(!confirm(`¿Borrar la factura ${f.numero} (${fmt(f.totales?.total)})?\n\nEsta acción no se puede deshacer.`)) return;
  p.facturas = p.facturas.filter(x => x.id !== id);
  save();
  renderFacList();
}

function newFactura(){
  const p = prof();
  if(!p.emisor || !p.emisor.name){
    if(confirm("Aún no has configurado tus datos de emisor. ¿Ir a configurar ahora?")){
      showTab("emisor"); return;
    }
  }
  const num = (p.cfg.prefix||"") + String(p.cfg.next||1).padStart(4,"0");
  editingFactura = {
    id: uid(),
    numero: num,
    fecha: todayISO(),
    clienteId: null,
    notas: "",
    estado: 'pendiente',
    style: (p.cfgStyle?.id) || 'corporativo',
    lineas: [{ desc:"", cant:1, precio:0, igi: p.cfg.igi||4.5 }],
    totales: { subtotal:0, igi:0, total:0 }
  };
  editingFacIsNew = true;
  showEditor();
}

function editFactura(id){
  const p = prof();
  editingFactura = JSON.parse(JSON.stringify(p.facturas.find(f=>f.id===id)));
  editingFacIsNew = false;
  showEditor();
}

function showEditor(){
  document.querySelectorAll(".tab-content").forEach(t=>t.style.display="none");
  document.getElementById("tab-editor").style.display = "block";
  document.getElementById("tabTitle").textContent = "Editor: " + editingFactura.numero;
  // Mostrar botón borrar solo si la factura ya existe (no es nueva)
  document.getElementById("ed_del_btn").style.display = editingFacIsNew ? "none" : "inline-block";
  renderEditor();
}

function deleteCurrentFactura(){
  if(!editingFactura || editingFacIsNew) return;
  const f = editingFactura;
  if(!confirm(`¿Borrar la factura ${f.numero} (${fmt(f.totales?.total)})?\n\nEsta acción no se puede deshacer.`)) return;
  const p = prof();
  p.facturas = (p.facturas||[]).filter(x => x.id !== f.id);
  save();
  editingFactura = null;
  showTab("facturas");
}

function cancelEdit(){
  if(editingFactura){
    if(!confirm("Salir sin guardar los cambios?")) return;
  }
  editingFactura = null;
  showTab("facturas");
}

function renderEditor(){
  const p = prof();
  const f = editingFactura;
  const cli = (p.clientes||[]).find(c=>c.id===f.clienteId);

  let cliOpts = `<option value="">— Selecciona cliente —</option>`;
  (p.clientes||[]).forEach(c=>{
    cliOpts += `<option value="${c.id}" ${c.id===f.clienteId?"selected":""}>${c.name}</option>`;
  });

  // Estado actual visual
  const est = getEstado(f);
  const estLabel = ESTADO_EMOJI[est] + ' ' + ESTADO_LABELS[est];

  let h = `
  <!-- ── HERO con número grande y estado ── -->
  <div class="card" style="background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);padding:22px 24px;border:1px solid var(--bd);">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;">
      <div>
        <div style="font-size:.7rem;color:var(--mute2);text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Número de factura</div>
        <div class="fac-num" style="margin-top:2px;">${f.numero}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:.7rem;color:var(--mute2);text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:6px;">Estado</div>
        <span class="badge ${est}" style="font-size:.78rem;padding:5px 12px;">${estLabel}</span>
      </div>
    </div>
  </div>

  <!-- ── Datos de la factura ── -->
  <div class="card">
    <div class="card-title">📋 Datos de la factura</div>
    <div class="row-3">
      <div>
        <label class="fld-lbl">Número</label>
        <input class="inp" id="ed_num" value="${f.numero}" oninput="edBaseUpd()">
      </div>
      <div>
        <label class="fld-lbl">Fecha</label>
        <input class="inp" type="date" id="ed_fecha" value="${f.fecha}" oninput="edBaseUpd()">
      </div>
      <div>
        <label class="fld-lbl">Estado</label>
        <select class="sel" id="ed_estado" onchange="edBaseUpd();renderEditor();">
          <option value="pendiente" ${(f.estado||'pendiente')==='pendiente'?'selected':''}>🟡 Pendiente</option>
          <option value="pagada" ${f.estado==='pagada'?'selected':''}>🟢 Pagada</option>
        </select>
      </div>
    </div>
  </div>

  <!-- ── Cliente ── -->
  <div class="card">
    <div class="card-title">👥 Cliente</div>
    <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:14px;align-items:start;">
      <div>
        <label class="fld-lbl">Selecciona cliente</label>
        <select class="sel" id="ed_cli" onchange="edClienteChange()">${cliOpts}</select>
        <div style="margin-top:8px;">
          <a href="#" onclick="event.preventDefault();if(confirm('Salir del editor para ir a Clientes? Los cambios sin guardar se perderán.'))showTab('clientes')" style="font-size:.7rem;color:var(--acc2);text-decoration:none;">+ Crear cliente nuevo</a>
        </div>
      </div>
      <div id="ed_cli_info">${cli ? cliInfoHTML(cli) : `<div style="font-size:.75rem;color:var(--mute2);background:var(--bg2);border:1px dashed var(--bd2);border-radius:6px;padding:14px;text-align:center;">Selecciona un cliente para ver sus datos.</div>`}</div>
    </div>
  </div>

  <!-- ── Líneas ── -->
  <div class="card">
    <div class="card-title">📝 Líneas de factura</div>
    <div class="fac-line-head">
      <div>Descripción</div><div class="td-r">Cantidad</div><div class="td-r">Precio €</div><div class="td-r">IGI %</div><div></div>
    </div>
    <div id="ed_lines"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;">
      <button class="fac-add" onclick="edAddLine()">+ Añadir línea</button>
      <select class="sel" id="ed_plantilla_sel" onchange="edInsertPlantilla(this.value);this.value='';" style="max-width:240px;font-size:.78rem;padding:6px 8px;">
        <option value="">📋 Insertar plantilla...</option>
      </select>
    </div>
  </div>

  <!-- ── Totales destacados ── -->
  <div class="card" style="background:linear-gradient(135deg,#0a1120 0%,#13203a 100%);">
    <div class="card-title" style="margin-bottom:10px;">💶 Totales</div>
    <div class="fac-totals" style="background:transparent;padding:6px 4px;">
      <div class="fac-tot-row" style="font-size:.95rem;"><span style="color:var(--mute);">Subtotal</span><span id="ed_subt" class="td-num">0,00 €</span></div>
      <div class="fac-tot-row" style="font-size:.95rem;"><span style="color:var(--mute);">IGI</span><span id="ed_igi" class="td-num">0,00 €</span></div>
      <div class="fac-tot-row tot" style="font-size:1.2rem;border-top:1px solid var(--bd);padding-top:10px;margin-top:8px;"><span>Total</span><span id="ed_tot" class="td-num" style="color:var(--acc2);">0,00 €</span></div>
    </div>
  </div>

  <!-- ── Notas ── -->
  <div class="card">
    <div class="card-title">📌 Notas <span style="font-size:.7rem;color:var(--mute2);font-weight:400;">(opcional)</span></div>
    <textarea class="inp" id="ed_notes" rows="3" placeholder="Forma de pago, condiciones, agradecimientos...">${f.notas||""}</textarea>
  </div>`;

  document.getElementById("editorContainer").innerHTML = h;
  renderEdLines();
  recalcTotales();
}

function cliInfoHTML(cli){
  return `<div style="background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:14px 16px;line-height:1.6;">
    <div style="font-weight:600;color:var(--fg);font-size:.95rem;margin-bottom:6px;">${cli.name||""}</div>
    <div style="font-size:.78rem;color:var(--mute);">
      ${cli.nrt?`<div><strong style="color:var(--mute2);">NRT:</strong> ${cli.nrt}</div>`:""}
      ${cli.addr?`<div>${cli.addr}</div>`:""}
      ${cli.city?`<div>${cli.city}</div>`:""}
      ${cli.email?`<div style="color:var(--acc2);margin-top:4px;">${cli.email}</div>`:""}
      ${cli.tel?`<div>${cli.tel}</div>`:""}
    </div>
  </div>`;
}

function edBaseUpd(){
  const f = editingFactura;
  f.fecha = document.getElementById("ed_fecha").value;
  f.numero = document.getElementById("ed_num").value;
  const estadoEl = document.getElementById("ed_estado");
  if(estadoEl){
    const newEstado = estadoEl.value;
    if(newEstado === 'pagada' && f.estado !== 'pagada'){
      f.fechaPago = todayISO();
    } else if(newEstado === 'pendiente'){
      delete f.fechaPago;
    }
    f.estado = newEstado;
  }
}

function edClienteChange(){
  const f = editingFactura;
  f.clienteId = document.getElementById("ed_cli").value || null;
  const p = prof();
  const cli = (p.clientes||[]).find(c=>c.id===f.clienteId);
  document.getElementById("ed_cli_info").innerHTML = cli ? cliInfoHTML(cli) : `<div style="font-size:.7rem;color:var(--mute2);">Selecciona un cliente o <a href="#" onclick="event.preventDefault();showTab('clientes')" style="color:var(--acc2);">crea uno nuevo</a>.</div>`;
}

function renderEdLines(){
  const cont = document.getElementById("ed_lines");
  cont.innerHTML = "";
  editingFactura.lineas.forEach((l,i)=>{
    const row = document.createElement("div");
    row.className = "fac-line";
    row.innerHTML = `
      <input class="inp" placeholder="Descripción" value="${l.desc||""}" oninput="edLineChange(${i},'desc',this.value)">
      <input class="inp" type="number" step="0.01" value="${l.cant}" oninput="edLineChange(${i},'cant',this.value)" style="text-align:right;">
      <input class="inp" type="number" step="0.01" value="${l.precio}" oninput="edLineChange(${i},'precio',this.value)" style="text-align:right;">
      <input class="inp" type="number" step="0.5" value="${l.igi}" oninput="edLineChange(${i},'igi',this.value)" style="text-align:right;">
      <button class="fac-x" onclick="edRemoveLine(${i})" title="Eliminar línea">×</button>
    `;
    cont.appendChild(row);
  });
  populatePlantillaSelect();
}

function populatePlantillaSelect(){
  const sel = document.getElementById("ed_plantilla_sel");
  if(!sel) return;
  const p = prof();
  const plantillas = (p && p.plantillas) || [];
  sel.innerHTML = `<option value="">📋 Insertar plantilla...</option>`;
  plantillas.forEach((pl, i) => {
    if(!pl.desc) return; // omitir vacías
    const label = `${pl.desc} — ${pl.precio||0}€${pl.igi?` (IGI ${pl.igi}%)`:''}`;
    sel.innerHTML += `<option value="${i}">${label}</option>`;
  });
}

function edInsertPlantilla(idx){
  if(idx === "" || idx == null) return;
  const p = prof();
  const pl = (p.plantillas||[])[parseInt(idx)];
  if(!pl) return;
  // Si la última línea está vacía, la reemplazamos. Si no, añadimos.
  const last = editingFactura.lineas[editingFactura.lineas.length-1];
  if(last && !last.desc && (!last.precio || last.precio === 0)){
    editingFactura.lineas[editingFactura.lineas.length-1] = {
      desc: pl.desc, cant: 1, precio: pl.precio||0, igi: pl.igi||p.cfg.igi||4.5
    };
  } else {
    editingFactura.lineas.push({
      desc: pl.desc, cant: 1, precio: pl.precio||0, igi: pl.igi||p.cfg.igi||4.5
    });
  }
  renderEdLines();
  recalcTotales();
}

function edLineChange(i, field, val){
  const f = editingFactura;
  if(field==="desc"){ f.lineas[i].desc = val; }
  else { f.lineas[i][field] = parseFloat(val)||0; }
  recalcTotales();
}

function edAddLine(){
  const p = prof();
  editingFactura.lineas.push({ desc:"", cant:1, precio:0, igi: p.cfg.igi||4.5 });
  renderEdLines();
  recalcTotales();
}

function edRemoveLine(i){
  if(editingFactura.lineas.length===1){
    editingFactura.lineas[0] = { desc:"", cant:1, precio:0, igi: prof().cfg.igi||4.5 };
  } else {
    editingFactura.lineas.splice(i,1);
  }
  renderEdLines();
  recalcTotales();
}

function recalcTotales(){
  const f = editingFactura;
  let subt = 0, igi = 0;
  f.lineas.forEach(l=>{
    const base = (l.cant||0) * (l.precio||0);
    subt += base;
    igi += base * ((l.igi||0)/100);
  });
  f.totales = { subtotal: subt, igi: igi, total: subt+igi };
  document.getElementById("ed_subt").textContent = fmt(subt);
  document.getElementById("ed_igi").textContent = fmt(igi);
  document.getElementById("ed_tot").textContent = fmt(subt+igi);
}

function saveFactura(){
  const p = prof();
  const f = editingFactura;
  f.notas = document.getElementById("ed_notes").value;
  edBaseUpd();
  if(!f.clienteId){ if(!confirm("No has seleccionado cliente. ¿Guardar igualmente?")) return; }

  // ── Histórico inmutable: congelar style + textos al guardar ──
  // Si la factura no tiene style aún, se le pone el del perfil.
  if(!f.style) f.style = (p.cfgStyle?.id) || 'corporativo';
  // Congelar los textos efectivos (idioma actual + overrides) en la factura.
  // Así, si cambias el idioma o los textos en Ajustes después, esta factura mantiene los suyos.
  f.textosFreezed = getTextosTemplate(p, f.style);
  f.langFreezed = p.cfgStyle?.lang || 'ca';

  if(editingFacIsNew){
    p.facturas = p.facturas || [];
    p.facturas.push(f);
    p.cfg.next = (p.cfg.next||1) + 1;
    editingFacIsNew = false;
  } else {
    const idx = p.facturas.findIndex(x=>x.id===f.id);
    if(idx>=0) p.facturas[idx] = f;
  }
  save();
  toast("✓ Factura guardada");
  editingFactura = null;
  showTab("facturas");
}

// ╔══════════════════════════════════════════════════════════════╗
// ║ PAQUETES DE IDIOMA PARA LOS TEMPLATES                        ║
// ╚══════════════════════════════════════════════════════════════╝
const LANG_PACKS = {
  ca: {
    corporativo: {
      titulo:'FACTURA', labelNum:'Núm. factura', labelFecha:'Data',
      labelDe:'De', labelPara:'Per a',
      colDesc:'Descripció', colCant:'Quant.', colPrecio:'P. unitari', colIgi:'IGI', colTotal:'Total',
      labelSubtotal:'Subtotal', labelIgi:'IGI', labelTotal:'TOTAL',
      labelNotas:'Notes', labelIban:'IBAN',
      footer:'Gràcies per la seva confiança'
    },
    editorial: {
      titulo:'FACTURA', labelNum:'Núm:', labelFecha:'Data:',
      labelDe:'DADES DE L\'EMPRESA', labelPara:'DADES DEL CLIENT',
      colDesc:'Detall', colCant:'Quantitat', colPrecio:'Preu', colIgi:'IGI', colTotal:'Total',
      labelSubtotal:'Subtotal', labelIgi:'IGI', labelTotal:'TOTAL',
      labelNotas:'INFORMACIÓ DE PAGAMENT', labelIban:'IBAN',
      footer:''
    },
    dark: {
      titulo:'FACTURA', labelNum:'Núm.', labelFecha:'Data',
      labelDe:'Emissor', labelPara:'Dades client',
      colDesc:'Descripció', colCant:'Quant.', colPrecio:'Base', colIgi:'IGI', colTotal:'Total',
      labelSubtotal:'Base imposable', labelIgi:'IGI', labelTotal:'Total',
      labelNotas:'', labelIban:'IBAN',
      footer:'El pagament es realitzarà mitjançant transferència bancària'
    }
  },
  es: {
    corporativo: {
      titulo:'FACTURA', labelNum:'Nº factura', labelFecha:'Fecha',
      labelDe:'De', labelPara:'Para',
      colDesc:'Descripción', colCant:'Cant.', colPrecio:'P. unitario', colIgi:'IGI', colTotal:'Total',
      labelSubtotal:'Subtotal', labelIgi:'IGI', labelTotal:'TOTAL',
      labelNotas:'Notas', labelIban:'IBAN',
      footer:'Gracias por su confianza'
    },
    editorial: {
      titulo:'FACTURA', labelNum:'Nº:', labelFecha:'Fecha:',
      labelDe:'DATOS DE LA EMPRESA', labelPara:'DATOS DEL CLIENTE',
      colDesc:'Detalle', colCant:'Cantidad', colPrecio:'Precio', colIgi:'IGI', colTotal:'Total',
      labelSubtotal:'Subtotal', labelIgi:'IGI', labelTotal:'TOTAL',
      labelNotas:'INFORMACIÓN DE PAGO', labelIban:'IBAN',
      footer:''
    },
    dark: {
      titulo:'FACTURA', labelNum:'Nº', labelFecha:'Fecha',
      labelDe:'Emisor', labelPara:'Datos cliente',
      colDesc:'Descripción', colCant:'Cant.', colPrecio:'Base', colIgi:'IGI', colTotal:'Total',
      labelSubtotal:'Base imponible', labelIgi:'IGI', labelTotal:'Total',
      labelNotas:'', labelIban:'IBAN',
      footer:'El pago se realizará mediante transferencia bancaria'
    }
  }
};

const LANG_LABELS = { ca:'Català', es:'Castellano' };

// Helper: textos efectivos = LANG_PACKS[lang][styleId] + overrides del usuario
function getTextosTemplate(p, styleId){
  const lang = p.cfgStyle?.lang || 'ca';
  const base = (LANG_PACKS[lang] && LANG_PACKS[lang][styleId]) || LANG_PACKS.ca[styleId] || {};
  const overrides = p.cfgStyle?.textos || {};
  return { ...base, ...overrides };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║ SISTEMA DE TEMPLATES DE FACTURA                              ║
// ╚══════════════════════════════════════════════════════════════╝

const STYLE_TEMPLATES = {
  // ── 1. CORPORATIU BLAU ───────────────────────────────────────
  corporativo: {
    name: 'Corporatiu',
    desc: 'Capçalera neta amb logo i totals destacats en blau',
    build: (p, f, t) => {
      const cli = (p.clientes||[]).find(c=>c.id===f.clienteId);
      const e = p.emisor || {};
      let lines = "";
      f.lineas.forEach((l,i)=>{
        const base = (l.cant||0)*(l.precio||0);
        const igi = base * ((l.igi||0)/100);
        const bg = i % 2 === 1 ? "background:#fafbfc;" : "";
        lines += `<tr style="${bg}">
          <td style="padding:11px 14px;border-bottom:1px solid #eef0f3;font-size:12.5px;color:#1f2937;">${l.desc||""}</td>
          <td style="padding:11px 14px;text-align:right;border-bottom:1px solid #eef0f3;font-size:12.5px;color:#1f2937;">${fmtN(l.cant)}</td>
          <td style="padding:11px 14px;text-align:right;border-bottom:1px solid #eef0f3;font-size:12.5px;color:#1f2937;">${fmtN(l.precio)} €</td>
          <td style="padding:11px 14px;text-align:right;border-bottom:1px solid #eef0f3;font-size:12.5px;color:#94a3b8;">${l.igi||0}%</td>
          <td style="padding:11px 14px;text-align:right;border-bottom:1px solid #eef0f3;font-size:12.5px;color:#1f2937;font-weight:600;">${fmtN(base+igi)} €</td>
        </tr>`;
      });
      return `<div class="fac-print" style="background:#fff;color:#1f2937;padding:42px 44px;font-family:'DM Sans','Segoe UI',sans-serif;font-size:13px;line-height:1.5;max-width:800px;margin:0 auto;">

        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;gap:24px;">
          <div style="display:flex;align-items:center;gap:18px;">
            ${p.logo ? `<div style="width:64px;height:64px;border-radius:10px;overflow:hidden;background:#f8fafc;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <img src="${p.logo}" style="max-width:100%;max-height:100%;object-fit:contain;">
            </div>` : ``}
            <div>
              <div style="font-weight:700;font-size:18px;color:#0f172a;letter-spacing:-.01em;">${e.name||"—"}</div>
              <div style="font-size:11.5px;color:#64748b;margin-top:2px;">${e.city||""}</div>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;padding-top:6px;">
            <div style="font-size:38px;font-weight:800;color:#1d4ed8;letter-spacing:-.03em;line-height:.95;">${t.titulo}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px;">
          <div style="background:#f8fafc;border-left:3px solid #1d4ed8;padding:14px 16px;border-radius:0 8px 8px 0;">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;font-weight:600;">${t.labelDe}</div>
            <div style="font-weight:700;color:#0f172a;margin-bottom:4px;">${e.name||""}</div>
            <div style="font-size:11.5px;color:#475569;line-height:1.6;">
              ${e.nrt?`NRT: ${e.nrt}<br>`:""}
              ${e.addr||""}${e.city?"<br>"+e.city:""}
              ${e.email?"<br>"+e.email:""}
              ${e.tel?" · "+e.tel:""}
            </div>
          </div>
          <div style="background:#fef9f3;border-left:3px solid #f59e0b;padding:14px 16px;border-radius:0 8px 8px 0;">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;font-weight:600;">${t.labelPara}</div>
            ${cli ? `<div style="font-weight:700;color:#0f172a;margin-bottom:4px;">${cli.name||""}</div>
              <div style="font-size:11.5px;color:#475569;line-height:1.6;">
                ${cli.nrt?`NRT: ${cli.nrt}<br>`:""}
                ${cli.addr||""}${cli.city?"<br>"+cli.city:""}
                ${cli.email?"<br>"+cli.email:""}
              </div>` : `<div style="color:#94a3b8;">—</div>`}
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;margin-bottom:14px;border-bottom:1.5px solid #e2e8f0;">
          <div>
            <span style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">${t.labelNum}</span>
            <span style="font-size:18px;font-weight:700;color:#1d4ed8;font-family:'DM Mono',monospace;margin-left:10px;">${f.numero}</span>
          </div>
          <div style="font-size:12px;color:#64748b;">
            <span style="text-transform:uppercase;letter-spacing:.05em;font-weight:600;">${t.labelFecha}:</span>
            <span style="color:#1f2937;margin-left:6px;font-weight:500;">${fmtDate(f.fecha)}</span>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:12.5px;">
          <thead>
            <tr style="background:#1d4ed8;color:#fff;">
              <th style="text-align:left;padding:10px 14px;font-weight:600;">${t.colDesc}</th>
              <th style="text-align:right;padding:10px 14px;font-weight:600;width:65px;">${t.colCant}</th>
              <th style="text-align:right;padding:10px 14px;font-weight:600;width:90px;">${t.colPrecio}</th>
              <th style="text-align:right;padding:10px 14px;font-weight:600;width:60px;">${t.colIgi}</th>
              <th style="text-align:right;padding:10px 14px;font-weight:600;width:100px;">${t.colTotal}</th>
            </tr>
          </thead>
          <tbody>${lines}</tbody>
        </table>

        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-top:8px;">
          <div style="flex:1;font-size:11.5px;color:#475569;background:#f8fafc;padding:12px 16px;border-radius:8px;line-height:1.6;">
            ${f.notas ? `<strong style="color:#1f2937;">${t.labelNotas}</strong><br>${f.notas.replace(/\n/g,"<br>")}` : ""}
            ${e.iban ? `${f.notas?"<br><br>":""}<strong style="color:#1f2937;">${t.labelIban}:</strong> <span style="font-family:'DM Mono',monospace;">${e.iban}</span>` : ""}
          </div>
          <div style="min-width:260px;flex-shrink:0;">
            <div style="display:flex;justify-content:space-between;padding:5px 12px;font-size:13px;color:#475569;"><span>${t.labelSubtotal}</span><span>${fmtN(f.totales.subtotal)} €</span></div>
            <div style="display:flex;justify-content:space-between;padding:5px 12px;font-size:13px;color:#475569;"><span>${t.labelIgi}</span><span>${fmtN(f.totales.igi)} €</span></div>
            <div style="display:flex;justify-content:space-between;padding:12px 16px;background:#1d4ed8;color:#fff;border-radius:8px;margin-top:10px;font-size:16px;font-weight:700;"><span>${t.labelTotal}</span><span style="font-family:'DM Mono',monospace;">${fmtN(f.totales.total)} €</span></div>
          </div>
        </div>

        ${t.footer ? `<div style="text-align:center;font-size:10.5px;color:#94a3b8;margin-top:30px;padding-top:16px;border-top:1px solid #f0f0f0;">${t.footer}</div>` : ""}
      </div>`;
    }
  },

  // ── 2. EDITORIAL (fons blanc, FACTURA gran a l'esquerra, logo dreta) ──
  editorial: {
    name: 'Editorial',
    desc: 'Fons blanc, tipografia gran, logo a la dreta',
    build: (p, f, t) => {
      const cli = (p.clientes||[]).find(c=>c.id===f.clienteId);
      const e = p.emisor || {};
      let lines = "";
      f.lineas.forEach(l => {
        const base = (l.cant||0)*(l.precio||0);
        const igi = base * ((l.igi||0)/100);
        lines += `<tr>
          <td style="padding:13px 4px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#1f2937;">${l.desc||""}</td>
          <td style="padding:13px 4px;text-align:center;border-bottom:1px solid #e5e7eb;font-size:13px;color:#1f2937;">${fmtN(l.cant)}</td>
          <td style="padding:13px 4px;text-align:right;border-bottom:1px solid #e5e7eb;font-size:13px;color:#1f2937;">${fmtN(l.precio)} €</td>
          <td style="padding:13px 4px;text-align:right;border-bottom:1px solid #e5e7eb;font-size:13px;color:#9ca3af;">${l.igi||0}%</td>
          <td style="padding:13px 4px;text-align:right;border-bottom:1px solid #e5e7eb;font-size:13px;color:#1f2937;font-weight:600;">${fmtN(base+igi)} €</td>
        </tr>`;
      });
      return `<div class="fac-print" style="background:#fff;color:#1f2937;padding:48px 52px;font-family:'DM Sans','Segoe UI',sans-serif;font-size:13px;line-height:1.5;max-width:800px;margin:0 auto;">

        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:34px;gap:24px;">
          <div>
            <div style="font-size:58px;font-weight:800;letter-spacing:-.04em;line-height:.9;color:#0f172a;">${t.titulo}</div>
            <div style="display:inline-block;border:1.5px solid #0f172a;padding:6px 16px;margin-top:18px;font-size:13px;font-weight:600;letter-spacing:.02em;">${t.labelNum} ${f.numero}</div>
            <div style="font-size:12.5px;color:#475569;margin-top:8px;">${t.labelFecha} ${fmtDate(f.fecha)}</div>
          </div>
          <div style="flex-shrink:0;">
            ${p.logo ? `<div style="width:120px;height:120px;display:flex;align-items:center;justify-content:center;">
              <img src="${p.logo}" style="max-width:100%;max-height:100%;object-fit:contain;">
            </div>` : ``}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1px 1fr;gap:28px;margin-bottom:34px;padding-top:20px;border-top:1px solid #e5e7eb;">
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:.06em;margin-bottom:10px;color:#0f172a;">${t.labelPara}</div>
            ${cli ? `<div style="font-size:13px;color:#374151;line-height:1.7;">
              <div style="font-weight:600;color:#0f172a;">${cli.name||""}</div>
              ${cli.email?cli.email+"<br>":""}
              ${cli.tel?cli.tel+"<br>":""}
              ${cli.addr||""}${cli.city?"<br>"+cli.city:""}
              ${cli.nrt?`<br>NRT: ${cli.nrt}`:""}
            </div>` : `<div style="color:#9ca3af;">—</div>`}
          </div>
          <div style="background:#0f172a;width:1px;"></div>
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:.06em;margin-bottom:10px;color:#0f172a;">${t.labelDe}</div>
            <div style="font-size:13px;color:#374151;line-height:1.7;">
              <div style="font-weight:600;color:#0f172a;">${e.name||""}</div>
              ${e.email?e.email+"<br>":""}
              ${e.tel?e.tel+"<br>":""}
              ${e.addr||""}${e.city?"<br>"+e.city:""}
              ${e.nrt?`<br>NRT: ${e.nrt}`:""}
            </div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:10px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#0f172a;border-bottom:2px solid #0f172a;text-transform:uppercase;">${t.colDesc}</th>
              <th style="text-align:center;padding:10px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#0f172a;border-bottom:2px solid #0f172a;width:80px;text-transform:uppercase;">${t.colCant}</th>
              <th style="text-align:right;padding:10px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#0f172a;border-bottom:2px solid #0f172a;width:90px;text-transform:uppercase;">${t.colPrecio}</th>
              <th style="text-align:right;padding:10px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#0f172a;border-bottom:2px solid #0f172a;width:60px;text-transform:uppercase;">${t.colIgi}</th>
              <th style="text-align:right;padding:10px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#0f172a;border-bottom:2px solid #0f172a;width:100px;text-transform:uppercase;">${t.colTotal}</th>
            </tr>
          </thead>
          <tbody>${lines}</tbody>
        </table>

        <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
          <div style="min-width:300px;">
            <div style="display:flex;justify-content:space-between;padding:6px 8px;font-size:13px;color:#475569;"><span>${t.labelSubtotal}</span><span>${fmtN(f.totales.subtotal)} €</span></div>
            <div style="display:flex;justify-content:space-between;padding:6px 8px;font-size:13px;color:#475569;"><span>${t.labelIgi}</span><span>${fmtN(f.totales.igi)} €</span></div>
            <div style="display:flex;justify-content:space-between;padding:12px 18px;border:1.5px solid #0f172a;margin-top:10px;font-size:16px;font-weight:700;color:#0f172a;"><span>${t.labelTotal}</span><span>${fmtN(f.totales.total)} €</span></div>
          </div>
        </div>

        ${(e.iban || f.notas) ? `<div style="border:1.5px solid #0f172a;padding:14px 18px;font-size:12px;color:#374151;line-height:1.7;max-width:380px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.06em;margin-bottom:6px;color:#0f172a;">${t.labelNotas}</div>
          ${f.notas ? f.notas.replace(/\n/g,"<br>")+"<br>" : ""}
          ${e.iban ? `${t.labelIban}: <span style="font-family:'DM Mono',monospace;">${e.iban}</span>` : ""}
        </div>` : ""}

        ${t.footer ? `<div style="text-align:center;font-size:11px;color:#9ca3af;margin-top:32px;padding-top:14px;border-top:1px solid #e5e7eb;">${t.footer}</div>` : ""}
      </div>`;
    }
  },

  // ── 3. DARK ELEGANT (logo a l'esquerra, serif premium) ───────
  dark: {
    name: 'Dark elegant',
    desc: 'Fons fosc, tipografia serif gran, logo a l\'esquerra',
    build: (p, f, t) => {
      const cli = (p.clientes||[]).find(c=>c.id===f.clienteId);
      const e = p.emisor || {};
      let lines = "";
      f.lineas.forEach(l => {
        const base = (l.cant||0)*(l.precio||0);
        const igi = base * ((l.igi||0)/100);
        lines += `<tr>
          <td style="padding:14px 4px;font-size:12.5px;color:#d4cfb8;border-bottom:1px solid #2a2a2a;">${l.desc||""}</td>
          <td style="padding:14px 4px;text-align:center;font-size:12.5px;color:#d4cfb8;border-bottom:1px solid #2a2a2a;">${fmtN(l.cant)}</td>
          <td style="padding:14px 4px;text-align:right;font-size:12.5px;color:#d4cfb8;border-bottom:1px solid #2a2a2a;">${fmtN(l.cant*l.precio)} €</td>
          <td style="padding:14px 4px;text-align:right;font-size:12.5px;color:#d4cfb8;border-bottom:1px solid #2a2a2a;">${fmtN(igi)} €</td>
          <td style="padding:14px 4px;text-align:right;font-size:12.5px;color:#f5efde;font-weight:600;border-bottom:1px solid #2a2a2a;">${fmtN(base+igi)} €</td>
        </tr>`;
      });
      return `<div class="fac-print" style="background:#1a1a1a;color:#f5efde;padding:48px 52px;font-family:'DM Sans','Segoe UI',sans-serif;font-size:13px;line-height:1.5;max-width:800px;margin:0 auto;">

        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:34px;gap:24px;">
          <div style="flex-shrink:0;">
            ${p.logo ? `<div style="width:110px;height:110px;display:flex;align-items:center;justify-content:center;background:#f5efde;border-radius:10px;padding:10px;">
              <img src="${p.logo}" style="max-width:100%;max-height:100%;object-fit:contain;">
            </div>` : ``}
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;color:#a09a85;margin-bottom:6px;letter-spacing:.04em;">${t.labelFecha}: ${fmtDate(f.fecha)}</div>
            <div style="font-family:Georgia,serif;font-size:54px;font-weight:400;letter-spacing:.04em;line-height:1;color:#f5efde;">${t.titulo}</div>
            <div style="font-size:13px;font-weight:700;margin-top:10px;color:#f5efde;">${t.labelNum}: ${f.numero}</div>
          </div>
        </div>

        <div style="border-top:1px solid #3a3a3a;border-bottom:1px solid #3a3a3a;padding:22px 0;margin-bottom:30px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;">
            <div>
              <div style="font-size:11px;color:#a09a85;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">${t.labelDe}</div>
              <div style="font-size:12.5px;color:#a09a85;line-height:1.7;">
                <div style="color:#f5efde;font-weight:600;font-size:14px;">${e.name||""}</div>
                ${e.addr||""}${e.city?"<br>"+e.city:""}
                ${e.email?"<br>"+e.email:""}
                ${e.tel?"<br>"+e.tel:""}
                ${e.nrt?`<br>NRT: ${e.nrt}`:""}
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px;color:#a09a85;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">${t.labelPara}</div>
              ${cli ? `<div style="font-size:12.5px;color:#a09a85;line-height:1.7;">
                <div style="color:#f5efde;font-weight:600;font-size:14px;">${cli.name||""}</div>
                ${cli.addr||""}${cli.city?"<br>"+cli.city:""}
                ${cli.email?"<br>"+cli.email:""}
                ${cli.nrt?`<br>NRT: ${cli.nrt}`:""}
              </div>` : `<div style="color:#666;">—</div>`}
            </div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:10px 4px;font-size:11px;color:#a09a85;font-weight:600;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #3a3a3a;">${t.colDesc}</th>
              <th style="text-align:center;padding:10px 4px;font-size:11px;color:#a09a85;font-weight:600;width:70px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #3a3a3a;">${t.colCant}</th>
              <th style="text-align:right;padding:10px 4px;font-size:11px;color:#a09a85;font-weight:600;width:90px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #3a3a3a;">${t.colPrecio}</th>
              <th style="text-align:right;padding:10px 4px;font-size:11px;color:#a09a85;font-weight:600;width:80px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #3a3a3a;">${t.colIgi}</th>
              <th style="text-align:right;padding:10px 4px;font-size:11px;color:#a09a85;font-weight:600;width:100px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #3a3a3a;">${t.colTotal}</th>
            </tr>
          </thead>
          <tbody>${lines}</tbody>
        </table>

        <div style="display:flex;justify-content:flex-end;margin:30px 0;">
          <div style="min-width:300px;">
            <div style="display:flex;justify-content:space-between;padding:6px 4px;font-size:12.5px;color:#a09a85;"><span>${t.labelSubtotal}</span><span style="color:#f5efde;">${fmtN(f.totales.subtotal)} €</span></div>
            <div style="display:flex;justify-content:space-between;padding:6px 4px;font-size:12.5px;color:#a09a85;border-bottom:1px solid #3a3a3a;margin-bottom:10px;"><span>${t.labelIgi}</span><span style="color:#f5efde;">${fmtN(f.totales.igi)} €</span></div>
            <div style="display:flex;justify-content:space-between;padding:10px 4px;font-size:18px;font-weight:700;color:#f5efde;"><span>${t.labelTotal}</span><span style="font-family:Georgia,serif;letter-spacing:.02em;">${fmtN(f.totales.total)} €</span></div>
          </div>
        </div>

        ${(e.iban || f.notas || t.footer) ? `<div style="border-top:1px solid #3a3a3a;padding-top:20px;font-size:11.5px;color:#a09a85;line-height:1.7;">
          ${e.iban ? `${t.labelIban}: <span style="font-family:'DM Mono',monospace;color:#d4cfb8;">${e.iban}</span><br>` : ""}
          ${f.notas ? f.notas.replace(/\n/g,"<br>")+"<br>" : ""}
          ${t.footer || ""}
        </div>` : ""}
      </div>`;
    }
  }
};

// Helper: obtiene el HTML de la factura usando su style (o el del perfil si es nueva)
function buildPrintHTML(){
  const p = prof();
  const f = editingFactura;
  if(!f) return "";
  // Determinar style: prioridad factura.style > perfil.cfgStyle.id > corporativo
  const styleId = f.style || (p.cfgStyle?.id) || 'corporativo';
  const tpl = STYLE_TEMPLATES[styleId] || STYLE_TEMPLATES.corporativo;
  // Si la factura tiene textos congelados, usarlos (histórico inmutable).
  // Si no, usar idioma del perfil + overrides.
  const textos = f.textosFreezed
    ? f.textosFreezed
    : getTextosTemplate(p, styleId);
  return tpl.build(p, f, textos);
}

function printFactura(){
  const html = buildPrintHTML();
  const styles = document.querySelector("style").textContent;
  const win = window.open("", "_blank", "width=800,height=900");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Factura ${editingFactura.numero}</title>
    <style>${styles}</style></head>
    <body style="background:#fff;color:#000;padding:0;margin:0;">${html}
    <scr` + `ipt>setTimeout(()=>{window.print();},400);</scr` + `ipt>
    </body></html>`);
  win.document.close();
}

function downloadPDF(){
  if(window.jspdf && window.html2canvas){ doPDF(); return; }
  const btn = event ? event.target : null;
  if(btn){ btn.disabled = true; btn.textContent = "⏳ Cargando..."; }
  loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", ()=>{
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", ()=>{
      if(btn){ btn.disabled = false; btn.textContent = "📥 PDF"; }
      doPDF();
    });
  });
}

function loadScript(src, cb){
  const s = document.createElement("script");
  s.src = src; s.onload = cb;
  document.head.appendChild(s);
}

function doPDF(){
  const tmp = document.createElement("div");
  tmp.style.cssText = "position:fixed;top:-9999px;left:0;width:794px;background:#fff;";
  tmp.innerHTML = buildPrintHTML();
  document.body.appendChild(tmp);
  const printEl = tmp.querySelector(".fac-print");
  html2canvas(printEl, { scale:2, backgroundColor:"#fff" }).then(canvas=>{
    const img = canvas.toDataURL("image/png");
    const pdf = new jspdf.jsPDF({ unit:"mm", format:"a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.height / canvas.width;
    const w = pageW - 20;
    const h = w * ratio;
    if(h > pageH-20){
      const w2 = (pageH-20) / ratio;
      pdf.addImage(img, "PNG", (pageW-w2)/2, 10, w2, pageH-20);
    } else {
      pdf.addImage(img, "PNG", 10, 10, w, h);
    }
    pdf.save(`Factura-${editingFactura.numero}.pdf`);
    document.body.removeChild(tmp);
  });
}

function exportData(){
  const p = prof(); if(!p) return;
  const blob = new Blob([JSON.stringify(p, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `facturas-${p.name.replace(/\s+/g,"_")}-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAllProfiles(){
  const blob = new Blob([JSON.stringify(profiles, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `facturas-todos-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importProfileFile(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const data = JSON.parse(e.target.result);
      if(Array.isArray(data)){
        if(!confirm("Reemplazar todos los perfiles actuales por los del archivo?")) return;
        profiles = data;
      } else if(data.id && data.name){
        data.id = uid();
        profiles.push(data);
      } else {
        toast("Formato no reconocido", 'red'); return;
      }
      save();
      renderProfiles();
      toast("✓ Importado");
    } catch(err){ toast("Error al leer el archivo: "+err.message, 'red'); }
  };
  reader.readAsText(file);
  ev.target.value = "";
}

// ── Soporte de teclado físico para el PIN ──
document.addEventListener('keydown', e => {
  // Solo si la pantalla de PIN está activa
  const pinScreen = document.getElementById('pinScreen');
  if(!pinScreen || !pinScreen.classList.contains('active')) return;

  // Números: 0-9
  if(/^[0-9]$/.test(e.key)){
    e.preventDefault();
    onPinKey(e.key);
    return;
  }
  // Backspace o Delete: borrar último dígito
  if(e.key === 'Backspace' || e.key === 'Delete'){
    e.preventDefault();
    onPinKey('←');
    return;
  }
  // Enter: validar (equivalente al botón OK)
  if(e.key === 'Enter'){
    e.preventDefault();
    onPinKey('OK');
    return;
  }
  // Escape: salir y volver al selector
  if(e.key === 'Escape'){
    e.preventDefault();
    logout();
    return;
  }
});

load();
renderProfiles();
