// telegram-summary.js — generador del resumen diario de Telegram.
//
// Honra la config en data.json __notif:
//   - days: ['mon','tue',...] — días en que enviar
//   - sections: per-sección toggles + items granulares
//   - ai_insight: bool (no implementado aún, requiere keys de IA en data.json)
//
// Ejecución: GitHub Actions (.github/workflows/telegram-daily.yml)
// Requiere: env APPDATA_PAT con un PAT con read en famisand/appdata.

const APPDATA_REPO = 'famisand/appdata';
const FILE = 'data.json';
const DAY_CODES = ['sun','mon','tue','wed','thu','fri','sat']; // index 0..6 = getDay()

async function main() {
  const PAT = process.env.APPDATA_PAT;
  const FORCE = process.env.FORCE === 'true';
  if (!PAT) { console.error('Falta APPDATA_PAT secret'); process.exit(1); }

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

  const notif = data.__notif;
  if (!notif || !notif.enabled || !notif.bot_token || !notif.chat_id) {
    console.log('__notif no configurado o desactivado. Salida limpia.');
    return;
  }

  // ── HORA: comprobar match con notif.time ──
  const now = new Date();
  const madridStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(now);
  const madridHour = parseInt(madridStr.split(':')[0], 10);
  const cfgHour = parseInt((notif.time || '09:00').split(':')[0], 10);

  if (!FORCE) {
    if (madridHour !== cfgHour) {
      console.log(`Hora Madrid ${madridStr} != notif.time ${notif.time}. Salida limpia.`);
      return;
    }
    // ── DÍA DE LA SEMANA: comprobar match con notif.days ──
    const days = notif.days || ['mon','tue','wed','thu','fri','sat','sun'];
    const madridDayIdx = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Madrid', weekday: 'short'
    }).format(now).match(/\w+/)[0].toLowerCase().slice(0,3), 10); // hack — let's just use Date
    // Mejor: get day of week from a Madrid-localized date
    const madridDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now); // "2026-05-10"
    const dow = new Date(madridDateParts + 'T12:00:00').getDay(); // 0=Sun
    const todayCode = DAY_CODES[dow];
    if (!days.includes(todayCode)) {
      console.log(`Hoy es ${todayCode} y no está en days=[${days.join(',')}]. Salida limpia.`);
      return;
    }
  }

  // ── GENERAR RESUMEN ──
  const summary = generateSummary(data, notif);

  // ── ENVIAR ──
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

// ─── Generación del resumen — honra notif.sections ───
function generateSummary(data, notif) {
  const lines = [];
  const dt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date());
  lines.push(`<b>📊 Resumen — ${dt}</b>`);
  lines.push('');

  const S = notif.sections || {};

  // ── PATRIMONIO ──
  const patSec = S.patrimonio || {};
  if (patSec.enabled !== false) {
    try {
      const profiles = parseMaybe(data?.patrimonio?.pat_v5);
      if (Array.isArray(profiles) && profiles.length) {
        const p = profiles[0];
        const ents = [...(p.entries || [])].sort((a, b) => (a.year - b.year) || (a.month - b.month));
        if (ents.length) {
          const last = ents[ents.length - 1];
          const totalNow = calcPat(last);
          const block = [];

          if (patSec.total !== false) {
            block.push(`💰 <b>Patrimonio</b>: €${fmt(totalNow)}`);
          }
          if (patSec.delta !== false && ents.length >= 2) {
            const prev = ents[ents.length - 2];
            const totalPrev = calcPat(prev);
            const diff = totalNow - totalPrev;
            const pct = totalPrev ? (diff / totalPrev * 100) : 0;
            block.push(`   ${diff >= 0 ? '↑' : '↓'} ${diff >= 0 ? '+' : ''}€${fmt(Math.abs(diff))} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%) vs mes anterior`);
          }
          if (patSec.objetivo !== false) {
            const obj = (p.objectives || []).find(o => o.type === 'patrimonio') || (p.objectives || [])[0];
            if (obj && obj.target > 0) {
              const pct = (totalNow / obj.target * 100).toFixed(1);
              block.push(`   🎯 ${pct}% del objetivo (€${fmt(obj.target)})`);
            }
          }
          if (patSec.distribucion === true) {
            // Distribución por sección del perfil
            const sections = p.sections || [];
            const distLines = [];
            sections.forEach(sec => {
              let secTotal = 0;
              (sec.assets || []).forEach(a => {
                const v = parseFloat(last.assets?.[a.id]);
                if (!isNaN(v)) secTotal += v;
              });
              if (secTotal > 0) {
                const pct = (secTotal / totalNow * 100).toFixed(0);
                distLines.push(`     ${sec.name}: €${fmt(secTotal)} (${pct}%)`);
              }
            });
            if (distLines.length) {
              block.push(`   📊 Distribución:`);
              block.push(...distLines);
            }
          }
          if (patSec.top_mover === true && ents.length >= 2) {
            // Top mover: asset con mayor Δ absoluto vs mes anterior
            const prev = ents[ents.length - 2];
            const allAssets = new Set([
              ...Object.keys(last.assets || {}),
              ...Object.keys(prev.assets || {})
            ]);
            let bestId = null, bestDiff = 0, bestName = '';
            (p.sections || []).forEach(sec => {
              (sec.assets || []).forEach(a => {
                if (!allAssets.has(a.id)) return;
                const cur = parseFloat(last.assets?.[a.id]) || 0;
                const pre = parseFloat(prev.assets?.[a.id]) || 0;
                const diff = cur - pre;
                if (Math.abs(diff) > Math.abs(bestDiff)) {
                  bestDiff = diff;
                  bestId = a.id;
                  bestName = a.name;
                }
              });
            });
            if (bestName) {
              block.push(`   ⭐ Top mover: ${escape(bestName)} ${bestDiff >= 0 ? '+' : ''}€${fmt(Math.abs(bestDiff))}`);
            }
          }
          if (block.length) lines.push(...block);
        }
      }
    } catch (e) { console.error('Patrimonio:', e.message); }
  }

  // ── OPCIONES ──
  const optSec = S.options || {};
  if (optSec.enabled !== false) {
    try {
      const arr = parseMaybe(data?.options?.ot_activas);
      if (Array.isArray(arr)) {
        const block = [];
        if (optSec.count !== false) {
          block.push(`📈 <b>Opciones</b>: ${arr.length} activas`);
        }
        if (optSec.expiring !== false) {
          const dteLimit = optSec.expiring_days || 7;
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const exp = arr.filter(a => {
            if (!a.exp) return false;
            const d = Math.round((new Date(a.exp) - today) / 86400000);
            return d >= 0 && d <= dteLimit;
          });
          if (exp.length) {
            block.push(`   ⚠ ${exp.length} expira/n en ≤${dteLimit} días:`);
            exp.slice(0, 6).forEach(a => {
              const d = Math.round((new Date(a.exp) - today) / 86400000);
              const strat = a.strat || '';
              block.push(`     • <code>${escape(a.activo || '?')}</code> ${strat} · ${d}d`);
            });
          }
        }
        if (optSec.risk_total === true) {
          let riskTot = 0;
          arr.forEach(a => { riskTot += parseFloat(a.maxRisk) || 0; });
          if (riskTot > 0) block.push(`   💼 Risk total comprometido: $${fmt(riskTot)}`);
        }
        if (optSec.pnl_mes === true) {
          // P&L del mes en curso desde HIST
          const hist = parseMaybe(data?.options?.ot_hist);
          if (Array.isArray(hist)) {
            const monthStr = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit'
            }).format(new Date()).slice(0, 7); // "2026-05"
            const mes = hist.filter(h => (h.cierre || '').startsWith(monthStr));
            const pnl = mes.reduce((s, h) => s + (parseFloat(h.totalNeto) || 0), 0) * 100;
            if (mes.length) block.push(`   💵 P&L ${monthStr}: ${pnl >= 0 ? '+' : ''}$${fmt(pnl)} (${mes.length} ops)`);
          }
        }
        if (optSec.closed_today === true) {
          const hist = parseMaybe(data?.options?.ot_hist);
          if (Array.isArray(hist)) {
            const todayStr = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date());
            const closedToday = hist.filter(h => h.cierre === todayStr);
            if (closedToday.length) {
              block.push(`   ✔ Cerradas hoy: ${closedToday.length}`);
              closedToday.slice(0, 4).forEach(h => {
                const pnl = (parseFloat(h.totalNeto) || 0) * 100;
                block.push(`     • ${escape(h.activo || '?')} ${h.strat || ''} ${pnl >= 0 ? '+' : ''}$${fmt(pnl)}`);
              });
            }
          }
        }
        if (block.length) { lines.push(''); lines.push(...block); }
      }
    } catch (e) { console.error('Options:', e.message); }
  }

  // ── FULL TRAINING ──
  const ftSec = S.training || {};
  if (ftSec.enabled !== false) {
    try {
      const ft = parseMaybe(data?.training?.ft_v4);
      if (ft) {
        const block = [];
        const activos = (ft.clients || []).filter(c => c.active).length;
        const equipo = (ft.team || []).filter(t => t.active !== false).length;
        const parts = [];
        if (ftSec.clientes !== false) parts.push(`${activos} clientes`);
        if (ftSec.equipo !== false) parts.push(`${equipo} en equipo`);
        if (parts.length) block.push(`💪 <b>Full Training</b>: ${parts.join(' · ')}`);

        if (ftSec.impagos !== false) {
          const monthKeys = Object.keys(ft.months || {}).sort();
          const lastKey = monthKeys[monthKeys.length - 1];
          if (lastKey) {
            const m = ft.months[lastKey];
            const imp = (m.entries || []).filter(e => e.paid === false).length;
            if (imp > 0) block.push(`   ⚠ ${imp} impagos en ${lastKey}`);
          }
        }
        if (ftSec.sesiones_hoy === true) {
          // Sesiones programadas hoy (de masajes/sesiones del mes actual con fecha de hoy)
          const todayStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
          }).format(new Date());
          const monthKey = todayStr.slice(0, 7);
          const m = ft.months?.[monthKey];
          if (m) {
            let sesHoy = 0;
            (m.masajes || []).forEach(mas => {
              if (mas.fecha === todayStr) sesHoy++;
            });
            (m.entries || []).forEach(e => {
              if (e.fecha === todayStr) sesHoy++;
            });
            if (sesHoy > 0) block.push(`   📅 ${sesHoy} sesion${sesHoy === 1 ? '' : 'es'} programada${sesHoy === 1 ? '' : 's'} hoy`);
          }
        }
        if (ftSec.stock_critico === true) {
          const stockArr = ft.stock || [];
          const critico = stockArr.filter(s => {
            const totalStock = Object.values(s.sizes || {}).reduce((sum, n) => sum + (parseInt(n) || 0), 0);
            return totalStock > 0 && totalStock <= 2;
          });
          if (critico.length) {
            block.push(`   📦 ${critico.length} producto${critico.length === 1 ? '' : 's'} con stock ≤2`);
          }
        }
        if (block.length) { lines.push(''); lines.push(...block); }
      }
    } catch (e) { console.error('FT:', e.message); }
  }

  // ── FACTURAS ──
  const facSec = S.facturas || {};
  if (facSec.enabled !== false) {
    try {
      const profiles = parseMaybe(data?.facturas?.fac_v1);
      if (Array.isArray(profiles)) {
        let pend = 0, venc = 0, totalMes = 0;
        const monthStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit'
        }).format(new Date()).slice(0, 7);
        profiles.forEach(p => {
          (p.facturas || []).forEach(f => {
            if (f.estado === 'pendiente') pend++;
            if (f.estado === 'vencida') venc++;
            if (f.fecha && f.fecha.startsWith(monthStr)) {
              totalMes += parseFloat(f.total) || 0;
            }
          });
        });
        const parts = [];
        if (facSec.pendientes !== false && pend) parts.push(`${pend} pendientes`);
        if (facSec.vencidas !== false && venc) parts.push(`<b>${venc} vencidas</b>`);
        const block = [];
        if (parts.length) block.push(`📄 <b>Facturas</b>: ${parts.join(' · ')}`);
        if (facSec.total_mes === true && totalMes > 0) {
          block.push(`   💶 Facturado este mes: €${fmt(totalMes)}`);
        }
        if (block.length) { lines.push(''); lines.push(...block); }
      }
    } catch (e) { console.error('Facturas:', e.message); }
  }

  lines.push('');
  lines.push('<i>Auto-generado por mis-dashboards</i>');
  return lines.join('\n');
}

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
function fmt(n) { return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n); }
function escape(s) { return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]); }

main().catch(e => { console.error('Error:', e); process.exit(1); });
