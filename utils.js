/**
 * utils.js — utilidades compartidas por todas las apps
 * Cargar este script ANTES que cualquier otro JS de la app.
 *
 * API expuesta en window:
 *   escapeHtml(s)            — escapa &<>"' para inserción segura en HTML
 *   formatDateShort(d)       — devuelve "DD MMM" si es de este año, "MMM YY" si no
 *   parseNumberSafe(v, def)  — parseFloat con fallback si NaN
 *   toast(msg, type)         — notificación no bloqueante (green/red/info)
 *
 * Nota: si un HTML define su propia función toast() en script inline
 * (patrimonio, full_training), esa override la global por orden de carga.
 */

(function(global){
  'use strict';

  const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ESCAPE_MAP[c]);
  }

  const MONTHS_3 = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  function formatDateShort(d){
    if(!(d instanceof Date) || isNaN(d.getTime())) return '—';
    const now = new Date();
    if(d.getFullYear() === now.getFullYear()){
      return String(d.getDate()).padStart(2,'0') + ' ' + MONTHS_3[d.getMonth()];
    }
    return MONTHS_3[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2);
  }

  function parseNumberSafe(v, def){
    const n = parseFloat(v);
    return isNaN(n) ? (def == null ? 0 : def) : n;
  }

  // Toast universal — auto-crea el elemento si no existe.
  // Tipos: 'green' (default, éxito), 'red' (error), 'info' (azul).
  const TOAST_COLORS = {
    green: { border:'#14532d', color:'#4ade80' },
    red:   { border:'#4c1010', color:'#f87171' },
    info:  { border:'#1e3a5f', color:'#60a5fa' }
  };
  function toast(msg, type){
    const c = TOAST_COLORS[type] || TOAST_COLORS.green;
    let el = document.getElementById('__utils_toast');
    if(!el){
      el = document.createElement('div');
      el.id = '__utils_toast';
      el.style.cssText =
        "position:fixed;bottom:20px;right:20px;" +
        "background:#0f1729;border:1px solid #1e2d4a;border-radius:10px;" +
        "padding:11px 16px;font-size:.85rem;" +
        "font-family:'DM Sans','Segoe UI',sans-serif;" +
        "color:#e2e8f0;z-index:99999;max-width:340px;" +
        "transform:translateY(80px);opacity:0;pointer-events:none;" +
        "transition:transform .25s,opacity .25s;" +
        "box-shadow:0 4px 24px rgba(0,0,0,.4);";
      document.body.appendChild(el);
    }
    el.textContent = String(msg || '');
    el.style.borderColor = c.border;
    el.style.color = c.color;
    // Forzar reflow para reiniciar la transición en toasts consecutivos
    void el.offsetWidth;
    el.style.transform = 'translateY(0)';
    el.style.opacity = '1';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => {
      el.style.transform = 'translateY(80px)';
      el.style.opacity = '0';
    }, 2800);
  }

  global.escapeHtml      = escapeHtml;
  global.formatDateShort = formatDateShort;
  global.parseNumberSafe = parseNumberSafe;
  global.MONTHS_3        = MONTHS_3;
  global.toast           = toast;

  // ─── SERVICE WORKER (PWA) ──────────────────────────────────
  // Registra el SW una vez la página termine de cargar.
  // Para desactivar: ver service-worker.js (cabecera con instrucciones).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(err => {
        console.warn('[SW] No se pudo registrar:', err);
      });
    });
  }

  // ─── RESET ZOOM en charts: doble-click sobre el canvas ──────
  // Funciona con cualquier chart de Chart.js que tenga zoom habilitado.
  document.addEventListener('dblclick', e => {
    if (e.target.tagName !== 'CANVAS') return;
    if (typeof Chart === 'undefined' || !Chart.getChart) return;
    const chart = Chart.getChart(e.target);
    if (chart && typeof chart.resetZoom === 'function') {
      chart.resetZoom();
    }
  });

  // ─── VOICE INPUT (Web Speech API) ───────────────────────────
  // Detecta si el navegador soporta reconocimiento de voz.
  function voiceSupported(){
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }
  function getVoiceLang(){
    return localStorage.getItem('voice_lang') || 'es-ES';
  }
  function setVoiceLang(lang){
    localStorage.setItem('voice_lang', lang);
  }

  /**
   * Captura una frase de voz. Devuelve una promesa con el transcript.
   * @param {object} opts { lang, onStart, onEnd } — callbacks opcionales para feedback visual
   * @returns {Promise<string>} transcript
   */
  function voiceCapture(opts = {}){
    return new Promise((resolve, reject) => {
      if(!voiceSupported()){
        reject(new Error('Tu navegador no soporta voice input. Usa Chrome o Edge.'));
        return;
      }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = opts.lang || getVoiceLang();
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onstart = () => { if(opts.onStart) opts.onStart(); };
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        resolve(text);
      };
      rec.onerror = (e) => {
        const msg = e.error === 'not-allowed' ? 'Permiso de micrófono denegado'
                  : e.error === 'no-speech'   ? 'No te oí, intenta de nuevo'
                  : e.error === 'aborted'     ? 'Cancelado'
                  : ('Error: ' + (e.error || e.message || 'desconocido'));
        reject(new Error(msg));
      };
      rec.onend = () => { if(opts.onEnd) opts.onEnd(); };
      rec.start();
      // Devolver también el objeto rec por si se quiere abortar manualmente
      window._currentVoiceRec = rec;
    });
  }

  /**
   * Crea un botón micrófono que, al pulsar, graba voz y llama a onTranscript con el texto.
   * @param {object} opts
   *   - onTranscript: function(text) - obligatorio
   *   - title: string (default "Pulsa y dicta")
   *   - lang: idioma (default voiceLang)
   *   - className: clase CSS extra (opcional)
   * @returns {HTMLButtonElement}
   */
  function createMicButton(opts = {}){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-mic-btn ' + (opts.className || '');
    btn.title = opts.title || 'Pulsa y dicta';
    btn.innerHTML = '🎤';
    btn.style.cssText = 'background:transparent;border:1px solid #1e3a5f;color:#94a3b8;cursor:pointer;padding:6px 11px;border-radius:6px;font-size:1rem;transition:all .15s;display:inline-flex;align-items:center;gap:4px;';
    btn.onmouseover = () => { if(!btn._listening){ btn.style.borderColor='#60a5fa';btn.style.color='#60a5fa'; } };
    btn.onmouseout  = () => { if(!btn._listening){ btn.style.borderColor='#1e3a5f';btn.style.color='#94a3b8'; } };
    btn._listening = false;
    btn.addEventListener('click', async () => {
      if(btn._listening){
        try { window._currentVoiceRec && window._currentVoiceRec.stop(); } catch(e){}
        return;
      }
      try {
        const text = await voiceCapture({
          lang: opts.lang,
          onStart: () => {
            btn._listening = true;
            btn.style.background='#dc2626';btn.style.borderColor='#dc2626';btn.style.color='#fff';
            btn.innerHTML='⏺ grabando...';
          },
          onEnd: () => {
            btn._listening = false;
            btn.style.background='transparent';btn.style.borderColor='#1e3a5f';btn.style.color='#94a3b8';
            btn.innerHTML='🎤';
          }
        });
        if(opts.onTranscript) opts.onTranscript(text);
      } catch(err){
        toast(err.message, 'red');
        btn._listening = false;
        btn.style.background='transparent';btn.style.borderColor='#1e3a5f';btn.style.color='#94a3b8';
        btn.innerHTML='🎤';
      }
    });
    return btn;
  }

  /**
   * Llama a la IA con prompt+system para parsear texto de voz a JSON estructurado.
   * Usa la cadena de fallback de iaModule (Groq → OpenRouter → Gemini).
   * Devuelve el objeto JSON parseado.
   */
  async function parseVoiceJSON(transcript, systemPrompt){
    if(!window.iaModule || typeof iaModule.loadProviders !== 'function'){
      throw new Error('iaModule no cargado');
    }
    const list = iaModule.loadProviders().filter(p => p.activa);
    if(!list.length) throw new Error('No hay APIs IA configuradas en el inicio');
    const errors = [];
    for(const p of list){
      try {
        const result = await iaModule.callSingle(p, transcript, systemPrompt);
        // Extraer JSON de la respuesta
        const match = result.match(/\{[\s\S]*\}/);
        if(!match) throw new Error('IA no devolvió JSON válido');
        return JSON.parse(match[0]);
      } catch(err){
        errors.push(`[${p.nombre}] ${err.message}`);
      }
    }
    throw new Error('Todas las APIs fallaron: ' + errors.join('; '));
  }

  global.voiceSupported   = voiceSupported;
  global.getVoiceLang     = getVoiceLang;
  global.setVoiceLang     = setVoiceLang;
  global.voiceCapture     = voiceCapture;
  global.createMicButton  = createMicButton;
  global.parseVoiceJSON   = parseVoiceJSON;
})(window);
