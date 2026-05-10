// telegram-summary.js
// Generador del resumen diario de "Mis Dashboards" para Telegram.
//
// Ejecución: GitHub Actions (ver .github/workflows/telegram-daily.yml)
// Requiere: env var APPDATA_PAT con un Personal Access Token que tenga
//           permiso de lectura sobre el repo privado famisand/appdata.
//
// Lógica:
//   1. Lee data.json de appdata vía API de GitHub (con APPDATA_PAT).
//   2. Lee __notif para token Telegram, chat_id, hora configurada, enabled.
//   3. Si la hora actual de Madrid coincide con la hora configurada (o
//      FORCE=true), genera resumen y lo envía vía Telegram Bot API.
//   4. Si no toca, sale sin hacer nada.

const APPDATA_REPO = 'famisand/appdata';
const FILE = 'data.json';

async function main() {
  const PAT = process.env.APPDATA_PAT;
  const FORCE = process.env.FORCE === 'true';
  if (!PAT) { console.error('Falta APPDATA_PAT secret'); process.exit(1); }

  // 1. Fetch data.json
  const res = await fetch(`https://api.github.com/repos/${APPDATA_REPO}/contents/${FILE}?_=${Date.now()}`, {
    headers: { Authorization: `token ${PAT}`, Accept: 'application/vnd.github.v3+json' }
  });
  if (!res.ok) {
    console.error('Fetch data.json fallo:', res.status, await res.text());
    process.exit(1);
  }
  const fileMeta = await res.json();
  let raw;
  if (fileMeta.content) {
    raw = Buffer.from(fileMeta.content, 'base64').toString('utf-8');
  } else if (fileMeta.sha) {
    // Archivo grande, fetch del blob
    const blobRes = await fetch(`https://api.github.com/repos/${APPDATA_REPO}/git/blobs/${fileMeta.sha}`, {
      headers: { Authorization: `token ${PAT}`, Accept: 'application/vnd.github.v3+json' }
    });
    const blob = await blobRes.json();
    raw = Buffer.from(blob.content, 'base64').toString('utf-8');
  } else {
    console.error('No se pudo obtener content del archivo');
    process.exit(1);
  }
  const data = JSON.parse(raw);

  // 2. __notif config
  const notif = data.__notif;
  if (!notif || !notif.enabled || !notif.bot_token || !notif.chat_id) {
    console.log('__notif no configurado o desactivado. Salida limpia.');
    return;
  }

  // 3. Comprobar hora de Madrid
  if (!FORCE) {
    const now = new Date();
    const madridStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(now); // "09:42"
    const madridHour = parseInt(madridStr.split(':')[0], 10);
    const cfgHour = parseInt((notif.time || '09:00').split(':')[0], 10);
    if (madridHour !== cfgHour) {
      console.log(`Hora Madrid ${madridStr} != notif.time ${notif.time}. Salida limpia.`);
      return;
    }
  }

  // 4. Generar resumen
  const summary = generateSummary(data);

  // 5. Enviar Telegram
  const sendRes = await fetch(`https://api.telegram.org/bot${notif.bot_token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: notif.chat_id,
      text: summary,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  const sendData = await sendRes.json();
  if (!sendData.ok) {
    console.error('Telegram error:', sendData);
    process.exit(1);
  }
  console.log('✓ Resumen enviado a Telegram. message_id:', sendData.result.message_id);
}

// ─── Generación de resumen ─────────────────────────────────────────
function generateSummary(data) {
  const lines = [];
  const dt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date());
  lines.push(`<b>📊 Resumen diario — ${dt}</b>`);
  lines.push('');

  // ── PATRIMONIO ──
  try {
    const profiles = parseMaybe(data?.patrimonio?.pat_v5);
    if (profiles) {
      if (Array.isArray(profiles) && profiles.length) {
        const p = profiles[0];
        const ents = [...(p.entries || [])].sort((a,b) => (a.year-b.year) || (a.month-b.month));
        if (ents.length) {
          const last = ents[ents.length - 1];
          const totalNow = calcPat(last);
          lines.push(`💰 <b>Patrimonio</b>: €${fmt(totalNow)}`);
          if (ents.length >= 2) {
            const prev = ents[ents.length - 2];
            const totalPrev = calcPat(prev);
            const diff = totalNow - totalPrev;
            const pct = totalPrev ? (diff / totalPrev * 100) : 0;
            const arrow = diff >= 0 ? '↑' : '↓';
            lines.push(`   ${arrow} ${diff >= 0 ? '+' : ''}€${fmt(Math.abs(diff))} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%) vs mes anterior`);
          }
          const obj = (p.objectives || []).find(o => o.type === 'patrimonio') || (p.objectives || [])[0];
          if (obj && obj.target > 0) {
            const pct = (totalNow / obj.target * 100).toFixed(1);
            lines.push(`   🎯 ${pct}% del objetivo (€${fmt(obj.target)})`);
          }
        }
      }
    }
  } catch (e) { console.error('Patrimonio:', e.message); }

  // ── OPCIONES ──
  try {
    const arr = parseMaybe(data?.options?.ot_activas);
    if (Array.isArray(arr)) {
        const today = new Date(); today.setHours(0,0,0,0);
        const expiringSoon = arr.filter(a => {
          if (!a.exp) return false;
          const dte = Math.round((new Date(a.exp) - today) / 86400000);
          return dte >= 0 && dte <= 7;
        });
        lines.push('');
        lines.push(`📈 <b>Opciones</b>: ${arr.length} activas`);
        if (expiringSoon.length) {
          lines.push(`   ⚠ ${expiringSoon.length} expira/n en ≤7 días:`);
          expiringSoon.slice(0, 6).forEach(a => {
            const dte = Math.round((new Date(a.exp) - today) / 86400000);
            const strat = a.strat || '';
            lines.push(`     • <code>${escape(a.activo || '?')}</code> ${strat} · ${dte}d`);
          });
        }
    }
  } catch (e) { console.error('Options:', e.message); }

  // ── FULL TRAINING ──
  try {
    const ft = parseMaybe(data?.training?.ft_v4);
    if (ft) {
      const activos = (ft.clients || []).filter(c => c.active).length;
      const equipo = (ft.team || []).filter(t => t.active !== false).length;
      lines.push('');
      lines.push(`💪 <b>Full Training</b>: ${activos} clientes · ${equipo} en equipo`);
      // Impagos: clientes con ultima sesion >30 dias y sin pago reciente
      // (cálculo simple, refinar si hace falta)
      const monthKeys = Object.keys(ft.months || {}).sort();
      const lastKey = monthKeys[monthKeys.length - 1];
      if (lastKey) {
        const m = ft.months[lastKey];
        const impagos = (m.entries || []).filter(e => e.paid === false).length;
        if (impagos > 0) lines.push(`   ⚠ ${impagos} impagos en ${lastKey}`);
      }
    }
  } catch (e) { console.error('FT:', e.message); }

  // ── FACTURAS ──
  try {
    const profiles = parseMaybe(data?.facturas?.fac_v1);
    if (Array.isArray(profiles)) {
        let pend = 0;
        let venc = 0;
        profiles.forEach(p => {
          (p.facturas || []).forEach(f => {
            if (f.estado === 'pendiente') pend++;
            if (f.estado === 'vencida')   venc++;
          });
        });
        if (pend + venc > 0) {
          lines.push('');
          let line = `📄 <b>Facturas</b>: `;
          if (pend) line += `${pend} pendientes`;
          if (pend && venc) line += ` · `;
          if (venc) line += `<b>${venc} vencidas</b>`;
          lines.push(line);
        }
    }
  } catch (e) { console.error('Facturas:', e.message); }

  lines.push('');
  lines.push('<i>Auto-generado por mis-dashboards</i>');
  return lines.join('\n');
}

// data.json puede tener los valores como string (vía localStorage en web)
// o como objetos parseados (más común). Esta helper acepta ambos.
function parseMaybe(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (e) { return null; }
  }
  return null;
}

function calcPat(entry) {
  let t = 0;
  Object.values(entry.assets || {}).forEach(v => {
    const n = parseFloat(v); if (!isNaN(n)) t += n;
  });
  Object.values(entry.debts || {}).forEach(v => {
    const n = parseFloat(v); if (!isNaN(n)) t -= n;
  });
  return t;
}

function fmt(n) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n);
}

function escape(s) {
  return String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[c]);
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
