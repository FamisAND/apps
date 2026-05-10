// telegram-summary.js — generador del resumen diario de Telegram.
//
// Honra config en data.json __notif:
//   - days: ['mon','tue',...]
//   - sections: per-sección + items granulares
//   - ai_insight: bool (usa providers IA de data.json __ia si existen)
//
// Ejecución: GitHub Actions (.github/workflows/telegram-daily.yml)
// Requiere: env APPDATA_PAT con un PAT con read en famisand/appdata.

const APPDATA_REPO = 'famisand/appdata';
const FILE = 'data.json';
const DAY_CODES = ['sun','mon','tue','wed','thu','fri','sat'];

async function main() {
  const PAT = process.env.APPDATA_PAT;
  const FORCE = process.env.FORCE === 'true';
  if (!PAT) { console.error('Falta APPDATA_PAT secret'); process.exit(1); }

  const data = await fetchAppData(PAT);
  const notif = data.__notif;
  if (!notif || !notif.enabled || !notif.bot_token || !notif.chat_id) {
    console.log('__notif no configurado o desactivado. Salida.');
    return;
  }

  if (!FORCE) {
    const now = new Date();
    const madridStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(now);
    const madridHour = parseInt(madridStr.split(':')[0], 10);
    const cfgHour = parseInt((notif.time || '09:00').split(':')[0], 10);
    if (madridHour !== cfgHour) {
      console.log(`Hora Madrid ${madridStr} != notif.time ${notif.time}. Salida.`);
      return;
    }
    const days = notif.days || ['mon','tue','wed','thu','fri','sat','sun'];
    const madridDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now);
    const dow = new Date(madridDateStr + 'T12:00:00Z').getUTCDay();
    const todayCode = DAY_CODES[dow];
    if (!days.includes(todayCode)) {
      console.log(`Hoy es ${todayCode}, no en days. Salida.`);
      return;
    }
  }

  let summary = generateSummary(data, notif);

  // ── AI INSIGHT (al final, opcional) ──
  if (notif.ai_insight) {
    const ia = data.__ia;
    if (ia && Array.isArray(ia.providers) && ia.providers.length) {
      const provider = ia.providers.find(p => p.activa);
      if (provider) {
        try {
          const sysPrompt = 'Eres un analista financiero personal. Da un insight breve y útil en español, máximo 2-3 frases, tono directo, sin markdown ni saltos de línea innecesarios. Identifica tendencias, alertas, próximas acciones.';
          const plain = summary.replace(/<[^>]+>/g, '');
          const insight = await callIA(provider, plain, sysPrompt);
          if (insight && insight.trim()) {
            summary += '\n\n🤖 <i>' + escape(insight.trim()) + '</i>';
          }
        } catch (err) {
          console.error('AI insight error:', err.message);
          summary += '\n\n<i>(AI insight no disponible: ' + escape(err.message) + ')</i>';
        }
      } else {
        summary += '\n\n<i>(AI insight pedido pero ningún provider activo en __ia)</i>';
      }
    } else {
      summary += '\n\n<i>(AI insight pedido pero __ia no configurado — guarda tus IA APIs en la web)</i>';
    }
  }

  // ── ENVIAR ──
  const sendRes = await fetch(`https://api.telegram.org/bot${notif.bot_token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: notif.chat_id, text: summary,
      parse_mode: 'HTML', disable_web_page_preview: true
    })
  });
  const sendData = await sendRes.json();
  if (!sendData.ok) { console.error('Telegram error:', sendData); process.exit(1); }
  console.log('✓ Resumen enviado. message_id:', sendData.result.message_id);
}

// ─── Fetch data.json desde appdata ───
async function fetchAppData(PAT) {
  const res = await fetch(`https://api.github.com/repos/${APPDATA_REPO}/contents/${FILE}?_=${Date.now()}`, {
    headers: { Authorization: `token ${PAT}`, Accept: 'application/vnd.github.v3+json' }
  });
  if (!res.ok) { console.error('Fetch fallo:', res.status); process.exit(1); }
  const meta = await res.json();
  let raw;
  if (meta.content) raw = Buffer.from(meta.content, 'base64').toString('utf-8');
  else if (meta.sha) {
    const blob = await (await fetch(`https://api.github.com/repos/${APPDATA_REPO}/git/blobs/${meta.sha}`, {
      headers: { Authorization: `token ${PAT}`, Accept: 'application/vnd.github.v3+json' }
    })).json();
    raw = Buffer.from(blob.content, 'base64').toString('utf-8');
  } else { console.error('No content'); process.exit(1); }
  return JSON.parse(raw);
}

// ─── AI call (replicado de ia-module.js _callSingle) ───
async function callIA(provider, prompt, systemMsg) {
  if (provider.tipo === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.modelo}:generateContent?key=${encodeURIComponent(provider.key)}`;
    const body = { contents:[{parts:[{text: prompt}]}], generationConfig:{ temperature:0.4, maxOutputTokens:1024 } };
    if (systemMsg) body.systemInstruction = { parts:[{text: systemMsg}] };
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('Gemini ' + res.status);
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  const endpoint = provider.tipo === 'openrouter'
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions';
  const headers = { 'Content-Type':'application/json', Authorization:`Bearer ${provider.key}` };
  if (provider.tipo === 'openrouter') {
    headers['HTTP-Referer'] = 'https://famisand.github.io';
    headers['X-Title'] = 'Mis Dashboards';
  }
  const messages = [];
  if (systemMsg) messages.push({ role:'system', content: systemMsg });
  messages.push({ role:'user', content: prompt });
  const res = await fetch(endpoint, {
    method:'POST', headers,
    body: JSON.stringify({ model: provider.modelo, messages, temperature:0.4, max_tokens:1024 })
  });
  if (!res.ok) throw new Error(`${provider.tipo} ${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content || '';
}

// ─── Sparkline ASCII (8 niveles) ───
function sparkline(values) {
  const vals = values.filter(v => v != null && !isNaN(v));
  if (vals.length < 2) return '';
  const blocks = '▁▂▃▄▅▆▇█';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  return vals.map(v => blocks[Math.round((v - min) / range * 7)]).join('');
}

// ─── Generación principal ───
function generateSummary(data, notif) {
  const lines = [];
  const dt = new Intl.DateTimeFormat('es-ES', {
    timeZone:'Europe/Madrid', weekday:'long', day:'numeric', month:'long'
  }).format(new Date());
  lines.push(`<b>📊 Resumen — ${dt}</b>`);
  lines.push('');

  const S = notif.sections || {};
  const monthKey = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Madrid', year:'numeric', month:'2-digit'
  }).format(new Date()).slice(0, 7); // "2026-05"
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date());
  const today0 = new Date(todayStr + 'T00:00:00Z'); today0.setUTCHours(0,0,0,0);

  // ─── PATRIMONIO ───
  const patSec = S.patrimonio || {};
  if (patSec.enabled !== false) {
    try {
      const profiles = parseMaybe(data?.patrimonio?.pat_v5);
      if (Array.isArray(profiles) && profiles.length) {
        const p = profiles[0];
        const ents = [...(p.entries || [])].sort((a,b) => (a.year-b.year) || (a.month-b.month));
        if (ents.length) {
          const last = ents[ents.length-1];
          const totalNow = calcPat(last);
          const block = [];

          if (patSec.total !== false) block.push(`💰 <b>Patrimonio</b>: €${fmt(totalNow)}`);

          if (patSec.delta !== false && ents.length >= 2) {
            const prev = ents[ents.length-2];
            const totalPrev = calcPat(prev);
            const diff = totalNow - totalPrev;
            const pct = totalPrev ? (diff/totalPrev*100) : 0;
            block.push(`   ${diff>=0?'↑':'↓'} ${diff>=0?'+':''}€${fmt(Math.abs(diff))} (${pct>=0?'+':''}${pct.toFixed(1)}%) vs mes anterior`);
          }

          if (patSec.objetivo !== false) {
            const obj = (p.objectives||[]).find(o => o.type === 'patrimonio') || (p.objectives||[])[0];
            if (obj && obj.target > 0) {
              const pct = (totalNow / obj.target * 100).toFixed(1);
              block.push(`   🎯 ${pct}% del objetivo (€${fmt(obj.target)})`);
            }
          }

          if (patSec.sparkline === true && ents.length >= 2) {
            const last12 = ents.slice(-12).map(e => calcPat(e));
            const spark = sparkline(last12);
            if (spark) block.push(`   <code>${spark}</code> últimos ${last12.length}m`);
          }

          if (patSec.ytd_pct === true) {
            const yearStart = ents.find(e => e.year === last.year && e.month === 0)
                          || ents.find(e => e.year === last.year);
            if (yearStart) {
              const t0 = calcPat(yearStart);
              if (t0) {
                const ytd = ((totalNow - t0) / t0 * 100);
                block.push(`   📅 YTD: ${ytd>=0?'+':''}${ytd.toFixed(1)}%`);
              }
            }
          }

          if (patSec.gastos_mes === true) {
            const txs = p?.gastos?.meses?.[monthKey]?.transacciones || [];
            if (txs.length) {
              const total = txs.reduce((s,t) => s + Math.abs(parseFloat(t.importe)||0), 0);
              const byCat = {};
              txs.forEach(t => {
                const cid = t.categoriaId || '_sin';
                byCat[cid] = (byCat[cid]||0) + Math.abs(parseFloat(t.importe)||0);
              });
              const cats = p?.gastos?.categorias || [];
              const top3 = Object.entries(byCat).sort((a,b) => b[1]-a[1]).slice(0, 3);
              block.push(`   💸 Gastos ${monthKey}: €${fmt(total)} (${txs.length} mov)`);
              top3.forEach(([cid, amt]) => {
                const cat = cats.find(c => c.id === cid);
                block.push(`     • ${escape(cat ? cat.name : 'Sin categoría')}: €${fmt(amt)}`);
              });
            }
          }

          if (patSec.ingresos_mes === true) {
            const ingSec = (p.sections||[]).find(s => s.id === 's_ingresos' || s.type === 'ingresos');
            if (ingSec) {
              let total = 0;
              (ingSec.assets||[]).forEach(a => {
                const v = parseFloat(last.assets?.[a.id]) || 0;
                if (v > 0) total += v;
              });
              if (total > 0) block.push(`   💵 Ingresos ${monthKey}: €${fmt(total)}`);
            }
          }

          if (patSec.distribucion === true) {
            (p.sections||[]).forEach(sec => {
              if (sec.id === 's_ingresos' || sec.type === 'ingresos') return;
              let secTotal = 0;
              (sec.assets||[]).forEach(a => {
                const v = parseFloat(last.assets?.[a.id]);
                if (!isNaN(v)) secTotal += v;
              });
              if (secTotal > 0 && totalNow > 0) {
                const pct = (secTotal/totalNow*100).toFixed(0);
                block.push(`     ${escape(sec.name)}: €${fmt(secTotal)} (${pct}%)`);
              }
            });
          }

          if (patSec.top_mover === true && ents.length >= 2) {
            const prev = ents[ents.length-2];
            let bestDiff = 0, bestName = '';
            (p.sections||[]).forEach(sec => {
              (sec.assets||[]).forEach(a => {
                const cur = parseFloat(last.assets?.[a.id]) || 0;
                const pre = parseFloat(prev.assets?.[a.id]) || 0;
                const diff = cur - pre;
                if (Math.abs(diff) > Math.abs(bestDiff)) {
                  bestDiff = diff; bestName = a.name;
                }
              });
            });
            if (bestName) block.push(`   ⭐ Top mover: ${escape(bestName)} ${bestDiff>=0?'+':''}€${fmt(Math.abs(bestDiff))}`);
          }

          if (block.length) lines.push(...block);
        }
      }
    } catch (e) { console.error('Patrimonio:', e.message); }
  }

  // ─── OPCIONES ───
  const optSec = S.options || {};
  if (optSec.enabled !== false) {
    try {
      const arr = parseMaybe(data?.options?.ot_activas);
      const hist = parseMaybe(data?.options?.ot_hist);
      const snaps = parseMaybe(data?.options?.ot_snaps);
      if (Array.isArray(arr)) {
        const block = [];

        if (optSec.count !== false) block.push(`📈 <b>Opciones</b>: ${arr.length} activas`);

        if (optSec.net_liq === true && Array.isArray(snaps) && snaps.length) {
          const sorted = [...snaps].sort((a,b) => (a.date||'').localeCompare(b.date||''));
          const latest = sorted[sorted.length-1];
          if (latest) block.push(`   💵 NAV ${latest.date}: $${fmt(latest.val)}`);
        }

        if (optSec.expiring !== false) {
          const dteLimit = optSec.expiring_days || 7;
          const exp = arr.filter(a => {
            if (!a.exp) return false;
            const d = Math.round((new Date(a.exp + 'T00:00:00Z') - today0) / 86400000);
            return d >= 0 && d <= dteLimit;
          });
          if (exp.length) {
            block.push(`   ⚠ ${exp.length} expira/n en ≤${dteLimit}d:`);
            exp.slice(0, 6).forEach(a => {
              const d = Math.round((new Date(a.exp + 'T00:00:00Z') - today0) / 86400000);
              block.push(`     • <code>${escape(a.activo||'?')}</code> ${a.strat||''} · ${d}d`);
            });
          }
        }

        if (optSec.lista_activas === true && arr.length) {
          block.push(`   📋 Posiciones activas:`);
          arr.slice(0, 12).forEach(a => {
            const ctr = parseInt(a.contracts) || 1;
            const dte = a.exp ? Math.round((new Date(a.exp + 'T00:00:00Z') - today0) / 86400000) : null;
            // pCredito está en $/share. Para credit strategies, prima entrada > prima actual = ganancia.
            const pIn  = (parseFloat(a.pCredito)||0) * 100; // → $/contrato
            const pAct = a.priceCurrent != null ? parseFloat(a.priceCurrent) * 100 : null;
            let pnlStr = '';
            if (pAct != null) {
              const unrealized = (pIn - pAct) * ctr;
              pnlStr = ` · ${unrealized>=0?'+':''}$${fmt(Math.abs(unrealized))}`;
            }
            const dteStr = dte != null ? ` ${dte}d` : '';
            const ctrStr = ctr > 1 ? ` x${ctr}` : '';
            block.push(`     • <code>${escape(a.activo||'?')}</code> ${a.strat||''}${ctrStr}${dteStr}${pnlStr}`);
          });
          if (arr.length > 12) block.push(`     ... y ${arr.length-12} más`);
        }

        // Mes en curso desde HIST
        const mesHist = Array.isArray(hist) ? hist.filter(h => (h.cierre||'').startsWith(monthKey)) : [];

        if (optSec.pnl_mes === true && mesHist.length) {
          const pnl = mesHist.reduce((s,h) => s + (parseFloat(h.totalNeto)||0), 0) * 100;
          block.push(`   💵 P&L ${monthKey}: ${pnl>=0?'+':''}$${fmt(pnl)} (${mesHist.length} ops)`);
        }

        if (optSec.win_rate_mes === true && mesHist.length) {
          const wins = mesHist.filter(h => (parseFloat(h.totalNeto)||0) > 0).length;
          const losses = mesHist.length - wins;
          const wr = (wins/mesHist.length*100).toFixed(0);
          block.push(`   📊 WR ${monthKey}: ${wr}% (${wins}W / ${losses}L)`);
        }

        if (optSec.best_worst === true && mesHist.length) {
          const sorted = [...mesHist].sort((a,b) => (parseFloat(b.totalNeto)||0) - (parseFloat(a.totalNeto)||0));
          const best = sorted[0], worst = sorted[sorted.length-1];
          if (best && (parseFloat(best.totalNeto)||0) > 0) {
            const v = (parseFloat(best.totalNeto)||0) * 100;
            block.push(`   🏆 Best mes: <code>${escape(best.activo||'?')}</code> ${best.strat||''} +$${fmt(v)}`);
          }
          if (worst && worst !== best && (parseFloat(worst.totalNeto)||0) < 0) {
            const v = Math.abs((parseFloat(worst.totalNeto)||0) * 100);
            block.push(`   📉 Worst mes: <code>${escape(worst.activo||'?')}</code> ${worst.strat||''} -$${fmt(v)}`);
          }
        }

        if (optSec.risk_total === true) {
          let riskTot = 0;
          arr.forEach(a => { riskTot += parseFloat(a.maxRisk)||0; });
          if (riskTot > 0) block.push(`   💼 Risk total: $${fmt(riskTot)}`);
        }

        if (optSec.closed_today === true && Array.isArray(hist)) {
          const closedToday = hist.filter(h => h.cierre === todayStr);
          if (closedToday.length) {
            block.push(`   ✔ Cerradas hoy: ${closedToday.length}`);
            closedToday.slice(0, 4).forEach(h => {
              const pnl = (parseFloat(h.totalNeto)||0) * 100;
              block.push(`     • ${escape(h.activo||'?')} ${h.strat||''} ${pnl>=0?'+':''}$${fmt(pnl)}`);
            });
          }
        }

        if (optSec.pnl_sparkline === true && Array.isArray(hist)) {
          // últimos 6 meses, sumar P&L por mes
          const pnlByMonth = {};
          hist.forEach(h => {
            const k = (h.cierre||'').slice(0, 7);
            if (!k) return;
            pnlByMonth[k] = (pnlByMonth[k]||0) + (parseFloat(h.totalNeto)||0);
          });
          const last6 = Object.keys(pnlByMonth).sort().slice(-6).map(k => pnlByMonth[k] * 100);
          if (last6.length >= 2) {
            const spark = sparkline(last6);
            if (spark) block.push(`   <code>${spark}</code> P&L últimos ${last6.length}m`);
          }
        }

        if (block.length) { lines.push(''); lines.push(...block); }
      }
    } catch (e) { console.error('Options:', e.message); }
  }

  // ─── FULL TRAINING ───
  const ftSec = S.training || {};
  if (ftSec.enabled !== false) {
    try {
      const ft = parseMaybe(data?.training?.ft_v4);
      if (ft) {
        const block = [];
        const activos = (ft.clients||[]).filter(c => c.active).length;
        const equipo  = (ft.team||[]).filter(t => t.active !== false).length;
        const parts = [];
        if (ftSec.clientes !== false) parts.push(`${activos} clientes`);
        if (ftSec.equipo !== false)   parts.push(`${equipo} en equipo`);
        if (parts.length) block.push(`💪 <b>Full Training</b>: ${parts.join(' · ')}`);

        const m = ft.months?.[monthKey];

        if (ftSec.ingresos_mes === true && m) {
          let totalFact = 0, totalCobr = 0;
          (m.entries||[]).forEach(e => {
            let entryTotal = 0;
            (e.lines||[]).forEach(l => { entryTotal += (parseFloat(l.qty)||0) * (parseFloat(l.price)||0); });
            (m.masajes||[]).forEach(mas => {});  // masajes go separate
            totalFact += entryTotal;
            if (e.paid) totalCobr += entryTotal;
          });
          (m.masajes||[]).forEach(mas => {
            const t = (parseFloat(mas.qty)||0) * (parseFloat(mas.price)||0);
            totalFact += t;
            if (mas.paid) totalCobr += t;
          });
          if (totalFact > 0) {
            const pctCobr = totalFact ? (totalCobr/totalFact*100).toFixed(0) : 0;
            block.push(`   💵 Facturado ${monthKey}: €${fmt(totalFact)} (€${fmt(totalCobr)} cobrado · ${pctCobr}%)`);
          }
        }

        if (ftSec.impagos !== false && m) {
          const imp = (m.entries||[]).filter(e => e.paid === false).length;
          if (imp > 0) block.push(`   ⚠ ${imp} impagos en ${monthKey}`);
        }

        if (ftSec.top_servicios === true && m) {
          const services = ft.services || [];
          const byService = {};
          (m.entries||[]).forEach(e => {
            (e.lines||[]).forEach(l => {
              const lt = (parseFloat(l.qty)||0) * (parseFloat(l.price)||0);
              byService[l.serviceId] = (byService[l.serviceId]||0) + lt;
            });
          });
          const topSrv = Object.entries(byService).sort((a,b) => b[1]-a[1]).slice(0, 3);
          if (topSrv.length) {
            block.push(`   🏆 Top servicios:`);
            topSrv.forEach(([sid, total]) => {
              const svc = services.find(s => s.id === sid);
              block.push(`     • ${escape(svc ? svc.name : sid)}: €${fmt(total)}`);
            });
          }
        }

        if (ftSec.top_clientes === true && m) {
          const clients = ft.clients || [];
          const byClient = {};
          (m.entries||[]).forEach(e => {
            let entryTotal = 0;
            (e.lines||[]).forEach(l => { entryTotal += (parseFloat(l.qty)||0) * (parseFloat(l.price)||0); });
            byClient[e.clientId] = (byClient[e.clientId]||0) + entryTotal;
          });
          const top = Object.entries(byClient).sort((a,b) => b[1]-a[1]).slice(0, 3);
          if (top.length) {
            block.push(`   👥 Top clientes:`);
            top.forEach(([cid, total]) => {
              const cli = clients.find(c => c.id === cid);
              block.push(`     • ${escape(cli ? cli.name : cid)}: €${fmt(total)}`);
            });
          }
        }

        if (ftSec.sesiones_hoy === true) {
          const monthM = ft.months?.[monthKey];
          if (monthM) {
            let sesHoy = 0;
            (monthM.masajes||[]).forEach(mas => { if (mas.fecha === todayStr) sesHoy++; });
            (monthM.entries||[]).forEach(e => { if (e.fecha === todayStr) sesHoy++; });
            if (sesHoy > 0) block.push(`   📅 ${sesHoy} sesion${sesHoy===1?'':'es'} hoy`);
          }
        }

        if (ftSec.stock_critico === true) {
          const critico = (ft.stock||[]).filter(s => {
            const total = Object.values(s.sizes||{}).reduce((sum,n) => sum + (parseInt(n)||0), 0);
            return total > 0 && total <= 2;
          });
          if (critico.length) {
            block.push(`   📦 ${critico.length} producto${critico.length===1?'':'s'} con stock ≤2`);
            critico.slice(0, 3).forEach(s => {
              const total = Object.values(s.sizes||{}).reduce((sum,n) => sum + (parseInt(n)||0), 0);
              block.push(`     • ${escape(s.name)} (${total} uds)`);
            });
          }
        }

        if (block.length) { lines.push(''); lines.push(...block); }
      }
    } catch (e) { console.error('FT:', e.message); }
  }

  // ─── FACTURAS ───
  const facSec = S.facturas || {};
  if (facSec.enabled !== false) {
    try {
      const profiles = parseMaybe(data?.facturas?.fac_v1);
      if (Array.isArray(profiles)) {
        let pend = 0, venc = 0, totalMes = 0;
        const byClienteMes = {};
        profiles.forEach(p => {
          (p.facturas||[]).forEach(f => {
            if (f.estado === 'pendiente') pend++;
            if (f.estado === 'vencida')   venc++;
            if (f.fecha && f.fecha.startsWith(monthKey)) {
              const t = parseFloat(f.total)||0;
              totalMes += t;
              const cn = f.clienteName || f.clienteId || '?';
              byClienteMes[cn] = (byClienteMes[cn]||0) + t;
            }
          });
        });
        const block = [];
        const parts = [];
        if (facSec.pendientes !== false && pend) parts.push(`${pend} pendientes`);
        if (facSec.vencidas !== false && venc)   parts.push(`<b>${venc} vencidas</b>`);
        if (parts.length) block.push(`📄 <b>Facturas</b>: ${parts.join(' · ')}`);
        if (facSec.total_mes !== false && totalMes > 0) block.push(`   💶 Facturado ${monthKey}: €${fmt(totalMes)}`);
        if (facSec.top_cliente === true) {
          const top = Object.entries(byClienteMes).sort((a,b) => b[1]-a[1])[0];
          if (top) block.push(`   👤 Top cliente: ${escape(top[0])} (€${fmt(top[1])})`);
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
  if (typeof v === 'string') { try { return JSON.parse(v); } catch(e){ return null; } }
  return null;
}
function calcPat(entry) {
  let t = 0;
  Object.values(entry.assets||{}).forEach(v => { const n = parseFloat(v); if (!isNaN(n)) t += n; });
  Object.values(entry.debts||{}).forEach(v => { const n = parseFloat(v); if (!isNaN(n)) t -= n; });
  return t;
}
function fmt(n) { return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n); }
function escape(s) { return String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[c]); }

main().catch(e => { console.error('Error:', e); process.exit(1); });
