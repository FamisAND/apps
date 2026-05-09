/**
 * ia-module.js — Lógica compartida del módulo IA para los 3 dashboards
 * (Patrimonio, Full Training, Options).
 *
 * Cada HTML llama a iaModule.init(config) con:
 *   - instructionsKey:    string (storage key de las instrucciones)
 *   - systemPromptPrefix: string base del system prompt
 *   - buildDataset:       función (meses, plantilla?) → object | null
 *   - plantillas:         array de { icon, label, q, scope? }
 *                         scope opcional = lista de keys del dataset a incluir
 *   - promptAnalisis:     función (dataset) → string
 *   - promptLibre:        función (dataset, pregunta) → string
 *   - datasetIsEmpty:     función (dataset) → bool
 *   - datasetEmptyMsg:    string
 *   - previewText:        opcional (dataset, meses) → string
 *   - preguntaInfoText:   opcional () → string
 *
 * IDs del HTML necesarios:
 *   iaNoKey, iaInitial, iaSelectorMeses, iaPregunta, iaLoading, iaResultado, iaError
 *   iaPlantillas, iaPreguntaTxt, iaPreguntaInfo, iaMesesPreview, iaAnalizarBtn
 *   iaLoadingDetail, iaResultadoTxt, iaResultadoMeta, iaErrorMsg
 *   iaConfigModal, iaInstructionsInput, iaInstructionsCount
 *
 * Botones onclick="iaModule.xxx()"
 */

(function(global){
  'use strict';

  const IA_PROVIDERS_STORAGE = 'ia_providers_v1';
  const IA_PROVIDER_DEFAULTS = {
    groq:       { endpoint: 'https://api.groq.com/openai/v1/chat/completions' },
    openrouter: { endpoint: 'https://openrouter.ai/api/v1/chat/completions' },
    gemini:     { endpoint: '' /* especial */ }
  };

  const state = {
    config: null,
    selectedMeses: null,
    currentResult: ''
  };

  // ════════ STORAGE ════════
  function loadProviders(){
    try { return JSON.parse(localStorage.getItem(IA_PROVIDERS_STORAGE)) || []; }
    catch { return []; }
  }
  function hasProviders(){ return loadProviders().filter(p => p.activa).length > 0; }
  function getInstructions(){
    if(!state.config) return '';
    return localStorage.getItem(state.config.instructionsKey) || '';
  }
  function setInstructions(text){
    if(!state.config) return;
    const k = state.config.instructionsKey;
    if(text && text.trim()) localStorage.setItem(k, text);
    else localStorage.removeItem(k);
  }

  // ════════ CALL A UN PROVIDER ════════
  async function _callSingle(provider, prompt, systemMsg){
    const messages = [];
    if(systemMsg) messages.push({ role:'system', content: systemMsg });
    messages.push({ role:'user', content: prompt });

    if(provider.tipo === 'gemini'){
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.modelo}:generateContent?key=${encodeURIComponent(provider.key)}`;
      const body = { contents:[{ parts:[{ text: prompt }] }], generationConfig:{ temperature:0.4, maxOutputTokens:2048 } };
      if(systemMsg) body.systemInstruction = { parts:[{ text: systemMsg }] };
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if(!res.ok){
        const t = await res.text(); let m = `HTTP ${res.status}`;
        try { const j = JSON.parse(t); m = j.error?.message || m; } catch(_){}
        throw new Error(m);
      }
      const data = await res.json();
      const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if(!txt) throw new Error('Respuesta vacía de Gemini');
      return txt;
    }

    // Groq y OpenRouter — formato OpenAI-compatible
    const endpoint = provider.tipo === 'openrouter'
      ? IA_PROVIDER_DEFAULTS.openrouter.endpoint
      : IA_PROVIDER_DEFAULTS.groq.endpoint;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.key}`
    };
    if(provider.tipo === 'openrouter'){
      headers['HTTP-Referer'] = window.location.origin || 'https://famisand.github.io';
      headers['X-Title'] = 'Mis Dashboards';
    }
    const res = await fetch(endpoint, {
      method:'POST', headers,
      body: JSON.stringify({ model: provider.modelo, messages, temperature:0.4, max_tokens:2048 })
    });
    if(!res.ok){
      const t = await res.text(); let m = `HTTP ${res.status}`;
      try { const j = JSON.parse(t); m = j.error?.message || j.error?.code || m; } catch(_){}
      throw new Error(m);
    }
    const data = await res.json();
    const txt = data.choices?.[0]?.message?.content;
    if(!txt) throw new Error('Respuesta vacía del modelo');
    return txt;
  }

  // ════════ FALLBACK CHAIN ════════
  async function callLLM(prompt){
    const list = loadProviders().filter(p => p.activa);
    if(!list.length){
      throw new Error('No hay APIs configuradas. Ve al index → 🤖 IA APIs.');
    }
    const userInstr = getInstructions().trim();
    let systemMsg = null;
    if(userInstr){
      const prefix = state.config?.systemPromptPrefix || 'Tienes el siguiente contexto del usuario:';
      systemMsg = `${prefix}\n\n${userInstr}\n\nRespeta estas instrucciones por encima de cualquier otro criterio salvo si entran en conflicto con la verdad de los datos que se te proporcionen.`;
    }
    const errors = [];
    for(const p of list){
      try {
        const result = await _callSingle(p, prompt, systemMsg);
        console.log(`[IA] Respuesta vía: ${p.nombre} (${p.tipo})`);
        return { result, provider: p };
      } catch(err){
        console.warn(`[IA] Fallo en ${p.nombre}: ${err.message}`);
        errors.push(`[${p.nombre}] ${err.message}`);
      }
    }
    throw new Error('Todas las APIs configuradas fallaron:\n\n' + errors.join('\n'));
  }

  // ════════ HELPERS ════════
  function _hide(id){ const el = document.getElementById(id); if(el) el.classList.add('hidden'); }
  function _show(id){ const el = document.getElementById(id); if(el) el.classList.remove('hidden'); }
  function _hideAll(){
    ['iaNoKey','iaInitial','iaSelectorMeses','iaPregunta','iaLoading','iaResultado','iaError'].forEach(_hide);
  }
  // escapeHtml viene de utils.js (cargado antes que este script en cada HTML)
  const escapeHtml = global.escapeHtml || (s => String(s||''));

  // ════════ ESTADOS ════════
  function showTab(){
    _hideAll();
    if(!hasProviders()){
      _show('iaNoKey');
    } else {
      _show('iaInitial');
      renderPlantillas();
    }
  }

  function renderPlantillas(){
    const cont = document.getElementById('iaPlantillas');
    if(!cont || !state.config?.plantillas) return;
    cont.innerHTML = state.config.plantillas.map((p,i) => `
      <button class="ia-plantilla-btn" onclick="iaModule.runPlantilla(${i})" title="${escapeHtml(p.q).replace(/"/g,'&quot;')}">
        <span class="plt-icon">${p.icon}</span>
        <span class="plt-label">${escapeHtml(p.label)}</span>
      </button>
    `).join('');
  }

  function selectMode(mode){
    _hide('iaInitial');
    if(mode === 'analisis'){
      _show('iaSelectorMeses');
      updateMesesPreview();
    } else if(mode === 'libre'){
      _show('iaPregunta');
      updatePreguntaInfo();
      setTimeout(() => document.getElementById('iaPreguntaTxt')?.focus(), 50);
    }
  }

  function setMeses(meses){
    state.selectedMeses = meses;
    document.querySelectorAll('.ia-meses-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.meses === String(meses));
    });
    const btn = document.getElementById('iaAnalizarBtn');
    if(btn) btn.disabled = false;
    updateMesesPreview();
  }

  function _previewFromDataset(ds, meses){
    if(state.config?.previewText){
      try { return state.config.previewText(ds, meses); }
      catch { /* fallback a defaults */ }
    }
    if(!ds) return '⚠ No hay datos.';
    if(ds.n_meses != null){
      return `${ds.n_meses} mes${ds.n_meses===1?'':'es'} · ${ds.periodo||''}`;
    }
    if(ds.historial_mensual?.length){
      const n = ds.historial_mensual.length;
      const periodo = ds.contexto_temporal?.periodo || ds.periodo || '';
      return `${n} mes${n===1?'':'es'} · ${periodo}`;
    }
    return ds.periodo || ds.contexto_temporal?.periodo || '✓ Datos preparados';
  }

  function updateMesesPreview(){
    const el = document.getElementById('iaMesesPreview');
    if(!el || !state.config?.buildDataset) return;
    try {
      const ds = state.config.buildDataset(state.selectedMeses);
      if(state.config.datasetIsEmpty?.(ds)){
        el.textContent = '⚠ ' + (state.config.datasetEmptyMsg || 'No hay datos.');
      } else {
        el.textContent = _previewFromDataset(ds, state.selectedMeses);
      }
    } catch(err){
      el.textContent = '⚠ Error preparando datos: ' + err.message;
    }
  }

  function updatePreguntaInfo(){
    const el = document.getElementById('iaPreguntaInfo');
    if(!el) return;
    if(state.config?.preguntaInfoText){
      try { el.textContent = state.config.preguntaInfoText(); return; }
      catch { /* fallback */ }
    }
    el.textContent = 'Se enviarán los datos disponibles como contexto.';
  }

  function back(){ showTab(); }

  function showLoading(detail){
    _hideAll();
    _show('iaLoading');
    const d = document.getElementById('iaLoadingDetail');
    if(d) d.textContent = detail || '';
  }

  function showResult(text, meta){
    _hide('iaLoading');
    state.currentResult = text;
    const html = (typeof marked !== 'undefined' && marked.parse) ? marked.parse(text) : String(text).replace(/\n/g,'<br>');
    const txt = document.getElementById('iaResultadoTxt');
    if(txt) txt.innerHTML = html;
    const m = document.getElementById('iaResultadoMeta');
    if(m) m.textContent = meta || '';
    _show('iaResultado');
  }

  function showError(msg){
    _hide('iaLoading');
    const e = document.getElementById('iaErrorMsg');
    if(e) e.textContent = msg;
    _show('iaError');
  }

  function copyResult(){
    if(!state.currentResult) return;
    navigator.clipboard.writeText(state.currentResult).then(() => {
      if(typeof toast === 'function') toast('✓ Copiado al portapapeles');
      else alert('✓ Copiado');
    }).catch(() => {
      if(typeof toast === 'function') toast('No se pudo copiar', 'red');
    });
  }

  // ════════ EJECUCIÓN ════════
  async function runAnalisis(){
    if(state.selectedMeses == null){
      alert('Selecciona los meses primero'); return;
    }
    let dataset;
    try {
      dataset = state.config.buildDataset(state.selectedMeses);
    } catch(err){
      alert('Error preparando los datos: ' + err.message); return;
    }
    if(state.config.datasetIsEmpty?.(dataset)){
      alert(state.config.datasetEmptyMsg || 'No hay datos.'); return;
    }
    const previewLine = _previewFromDataset(dataset, state.selectedMeses);
    showLoading(`Analizando: ${previewLine}`);
    try {
      const prompt = state.config.promptAnalisis(dataset);
      const { result, provider } = await callLLM(prompt);
      showResult(result, `Análisis · ${previewLine} · vía ${provider.nombre}`);
    } catch(err){
      showError(err.message);
    }
  }

  async function runPregunta(){
    const input = document.getElementById('iaPreguntaTxt');
    const pregunta = (input?.value || '').trim();
    if(!pregunta){ alert('Escribe una pregunta'); return; }
    let dataset;
    try {
      dataset = state.config.buildDataset('todos');
    } catch(err){
      alert('Error preparando los datos: ' + err.message); return;
    }
    if(state.config.datasetIsEmpty?.(dataset)){
      alert(state.config.datasetEmptyMsg || 'No hay datos.'); return;
    }
    showLoading('Pensando la respuesta...');
    try {
      const prompt = state.config.promptLibre(dataset, pregunta);
      const { result, provider } = await callLLM(prompt);
      showResult(result, `Pregunta libre · vía ${provider.nombre}`);
    } catch(err){
      showError(err.message);
    }
  }

  async function runPlantilla(idx){
    const plt = state.config?.plantillas?.[idx];
    if(!plt) return;
    let dataset;
    try {
      const fullDs = state.config.buildDataset('todos', plt);
      dataset = plt.scope ? _filterDataset(fullDs, plt.scope) : fullDs;
    } catch(err){
      alert('Error preparando los datos: ' + err.message); return;
    }
    if(state.config.datasetIsEmpty?.(dataset)){
      alert(state.config.datasetEmptyMsg || 'No hay datos.'); return;
    }
    showLoading(`${plt.icon} ${plt.label}...`);
    try {
      const prompt = state.config.promptLibre(dataset, plt.q);
      const { result, provider } = await callLLM(prompt);
      showResult(result, `${plt.icon} ${plt.label} · vía ${provider.nombre}`);
    } catch(err){
      showError(err.message);
    }
  }

  /**
   * Filtra el dataset según scope declarado por la plantilla.
   * Conserva siempre algunos campos baratos de contexto.
   */
  function _filterDataset(ds, scope){
    if(!ds || !Array.isArray(scope) || scope.includes('*')) return ds;
    const KEEP_ALWAYS = ['glosario','contexto_temporal','catalogo_trainers','periodo','n_meses','metricas_globales'];
    const allowed = new Set([...KEEP_ALWAYS, ...scope]);
    const filtered = {};
    Object.keys(ds).forEach(k => {
      if(allowed.has(k)) filtered[k] = ds[k];
    });
    return filtered;
  }

  // ════════ MODAL DE INSTRUCCIONES ════════
  function openConfig(){
    const modal = document.getElementById('iaConfigModal');
    const instr = document.getElementById('iaInstructionsInput');
    if(instr){
      instr.value = getInstructions();
      updateInstrCount();
    }
    if(modal) modal.classList.remove('hidden');
    setTimeout(() => instr && instr.focus(), 50);
  }
  function closeConfig(){
    const modal = document.getElementById('iaConfigModal');
    if(modal) modal.classList.add('hidden');
  }
  function updateInstrCount(){
    const instr = document.getElementById('iaInstructionsInput');
    const count = document.getElementById('iaInstructionsCount');
    if(!instr || !count) return;
    const n = instr.value.length;
    count.textContent = n ? `${n} caracteres · se enviarán en cada llamada` : 'Sin contexto personalizado (opcional)';
  }
  function saveInstructionsHandler(){
    const instr = document.getElementById('iaInstructionsInput');
    setInstructions(instr?.value || '');
    closeConfig();
    if(typeof toast === 'function') toast('✓ Instrucciones guardadas', 'green');
    showTab();
  }
  function deleteInstructionsHandler(){
    if(!confirm('¿Borrar las instrucciones personalizadas?')) return;
    setInstructions('');
    closeConfig();
    if(typeof toast === 'function') toast('Instrucciones borradas', 'red');
    showTab();
  }

  // ════════ INIT ════════
  function init(config){
    state.config = config;
    state.selectedMeses = null;
    state.currentResult = '';
    setTimeout(() => {
      const instr = document.getElementById('iaInstructionsInput');
      if(instr && !instr._iaListenerAdded){
        instr._iaListenerAdded = true;
        instr.addEventListener('input', updateInstrCount);
      }
      const modal = document.getElementById('iaConfigModal');
      if(modal && !modal._iaListenerAdded){
        modal._iaListenerAdded = true;
        modal.addEventListener('click', e => { if(e.target === modal) closeConfig(); });
      }
    }, 100);
  }

  // ════════ API PÚBLICA ════════
  global.iaModule = {
    init,
    showTab,
    selectMode,
    setMeses,
    back,
    runAnalisis,
    runPregunta,
    runPlantilla,
    copyResult,
    openConfig,
    closeConfig,
    saveInstructions: saveInstructionsHandler,
    deleteInstructions: deleteInstructionsHandler,
    callLLM,
    loadProviders,
    hasProviders,
    getInstructions
  };
})(window);
