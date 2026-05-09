/**
 * utils.js — utilidades compartidas por todas las apps
 * Cargar este script ANTES que cualquier otro JS de la app.
 *
 * API expuesta en window:
 *   escapeHtml(s)            — escapa &<>"' para inserción segura en HTML
 *   formatDateShort(d)       — devuelve "DD MMM" si es de este año, "MMM YY" si no
 *   parseNumberSafe(v, def)  — parseFloat con fallback si NaN
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

  global.escapeHtml      = escapeHtml;
  global.formatDateShort = formatDateShort;
  global.parseNumberSafe = parseNumberSafe;
  global.MONTHS_3        = MONTHS_3;
})(window);
