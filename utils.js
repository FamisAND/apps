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

})(window);
