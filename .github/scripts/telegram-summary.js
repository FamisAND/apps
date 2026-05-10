// telegram-summary.js — generador del resumen diario de Telegram.
//
// Estructura del mensaje:
//   1. Cabecera con fecha
//   2. 🎯 HOY — AI insight accionable (si activado y hay providers)
//   3. ⚠ URGENTE — señales cross-dashboard (solo si hay)
//   4. Bloques por dashboard, en el orden definido por notif.section_order
//   5. Footer
//
// Config en data.json __notif:
//   - days, time, enabled, ai_insight
//   - section_order: ['patrimonio','options','training','facturas']
//   - sections.<id>.<flag>
//
// Ejecución: GitHub Actions (.github/workflows/telegram-daily.yml).
// Requiere env APPDATA_PAT con read en famisand/appdata.

const APPDATA_REPO = 'famisand/appdata';
const FILE = 'data.json';
const DAY_CODES = ['sun','mon','tue','wed','thu','fri','sat'];
const DEFAULT_ORDER = ['actualidad','patrimonio','options','training','facturas'];

// Strats de OPTIONS que cuentan como "risk total" (excluye ACC = acciones).
const RISK_STRATS = ['NP','PCS','CC','CCS','DPS','IC','BWB','JL','112','0DTE','PMCC'];

// Stock total de un producto (mirror de full_training.html line 1094):
//   - hasVariants=false → p.stock
//   - hasVariants=true  → suma de p.sizes
function stockTotal(p) {
  if (p.hasVariants) return Object.values(p.sizes||{}).reduce((s,n) => s + (parseInt(n)||0), 0);
  return parseInt(p.stock) || 0;
}

// Unrealized P&L de una posición activa, replicando options.html:
//   - ACC (acciones)  → (priceCurrent - precioCompra) * contracts (= shares)
//   - Opciones (resto) → ((pCredito - |pDebito| - priceCurrent/100) * 100 * contracts)
//                        + nota: pCredito ya está en escala /100 internamente
// Devuelve P&L en $ totales o null si no hay datos suficientes.
function calcUnrealized(a) {
  const ctr = parseInt(a.contracts) || 1;
  if (a.priceCurrent == null) return null;
  if (a.strat === 'ACC') {
    if (a.precioCompra == null) return null;
    return (parseFloat(a.priceCurrent) - parseFloat(a.precioCompra)) * ctr;
  }
  if (a.pCredito == null) return null;
  const pc_share = (parseFloat(a.pCredito)||0) * 100;
  const pd_share = Math.abs(parseFloat(a.pDebito)||0) * 100;
  return ((pc_share - pd_share - (parseFloat(a.priceCurrent)||0)) * 100 * ctr);
}

async function main() {
  const PAT = process.env.APPDATA_PAT;
  const FORCE = process.env.FORCE === 'true';
  if (!PAT) { console.error('Falta APPDATA_PAT secret'); process.exit(1); }

  const data = await fetchAppData(PAT);
  const notif = data.__notif;
  if (!notif || !notif.bot_token || !notif.chat_id) {
    console.log('__notif sin bot_token/chat_id. Salida.');
    return;
  }
  if (notif.enabled === false) {
    console.log('Notificaciones desactivadas. Salida.');
    return;
  }

  // Schedule check (Madrid time)
  const now = new Date();
  const madridStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(now);
  const madridHour = parseInt(madridStr.split(':')[0], 10);
  const madridDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const dow = new Date(madridDateStr + 'T12:00:00Z').getUTCDay();
  const todayCode = DAY_CODES[dow];

  if (!FORCE) {
    const cfgHour = parseInt((notif.time || '09:00').split(':')[0], 10);
    const cfgDays = notif.days || ['mon','tue','wed','thu','fri','sat','sun'];
    if (madridHour !== cfgHour) {
      console.log(`Madrid ${madridStr} != notif.time ${notif.time}. Salida.`);
      return;
    }
    if (!cfgDays.includes(todayCode)) {
      console.log(`Hoy ${todayCode} no en days=[${cfgDays.join(',')}]. Salida.`);
      return;
    }
  }

  const ctx = buildContext(data);
  const sections = {
    actualidad: await buildActualidad(ctx, data, notif),
    patrimonio: buildPatrimonio(ctx, data, notif),
    options:    buildOptions   (ctx, data, notif),
    training:   buildTraining  (ctx, data, notif),
    facturas:   buildFacturas  (ctx, data, notif),
  };
  const urgent  = collectUrgent(ctx, data, notif);
  const signals = buildSignals(ctx, data, notif, urgent);

  let aiInsight = null;
  if (notif.ai_insight) {
    try { aiInsight = await generateInsight(data, signals); }
    catch (e) {
      console.error('AI insight error:', e.message);
      aiInsight = `<i>(IA no disponible: ${escape(e.message)})</i>`;
    }
  }

  const txt = renderMessage(ctx, sections, urgent, aiInsight, notif);

  const res = await fetch(`https://api.telegram.org/bot${notif.bot_token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: notif.chat_id, text: txt,
      parse_mode: 'HTML', disable_web_page_preview: true
    })
  });
  const d = await res.json();
  if (!d.ok) { console.error('Telegram error:', d); process.exit(1); }
  console.log('✓ Enviado. message_id:', d.result.message_id);
}

// ───────────────────────────────────────────────────────────
//  RENDER
// ───────────────────────────────────────────────────────────
function renderMessage(ctx, sections, urgent, aiInsight, notif) {
  const out = [];
  const dt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date());
  out.push(`<b>📊 Resumen — ${dt}</b>`);

  if (aiInsight) {
    out.push('');
    out.push('🎯 <b>HOY</b>');
    out.push(aiInsight);
  }

  if (urgent.length) {
    out.push('');
    out.push('━━━━━━━━━━━━━');
    out.push('');
    out.push('⚠ <b>URGENTE</b>');
    urgent.forEach(u => out.push(`   ${u}`));
  }

  const order = Array.isArray(notif.section_order) && notif.section_order.length
    ? notif.section_order
    : DEFAULT_ORDER;

  let firstBody = true;
  order.forEach(secId => {
    const lines = sections[secId];
    if (!lines || !lines.length) return;
    out.push('');
    if (firstBody) {
      out.push('━━━━━━━━━━━━━');
      out.push('');
      firstBody = false;
    }
    out.push(...lines);
  });

  out.push('');
  out.push('<i>Auto-generado · mis-dashboards</i>');
  return out.join('\n');
}

// ───────────────────────────────────────────────────────────
//  CONTEXT (precomputado, compartido entre builders)
// ───────────────────────────────────────────────────────────
function buildContext(data) {
  const monthKey = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Madrid', year:'numeric', month:'2-digit'
  }).format(new Date()).slice(0, 7);
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date());
  const today0 = new Date(todayStr + 'T00:00:00Z'); today0.setUTCHours(0,0,0,0);

  // FT mes objetivo = mes anterior (el actual suele estar incompleto)
  const [y, m] = monthKey.split('-').map(n => parseInt(n,10));
  const dPrev = new Date(Date.UTC(y, m - 1, 1)); dPrev.setUTCMonth(dPrev.getUTCMonth() - 1);
  const ftMonthKey = `${dPrev.getUTCFullYear()}-${String(dPrev.getUTCMonth()+1).padStart(2,'0')}`;
  const dPrev2 = new Date(dPrev); dPrev2.setUTCMonth(dPrev2.getUTCMonth() - 1);
  const ftPrevMonthKey = `${dPrev2.getUTCFullYear()}-${String(dPrev2.getUTCMonth()+1).padStart(2,'0')}`;

  // diff helpers
  const monthsAgo = (mk) => {
    if (!mk || !/^\d{4}-\d{2}$/.test(mk)) return null;
    const [py, pm] = mk.split('-').map(Number);
    return (y - py) * 12 + (m - pm);
  };

  return { monthKey, todayStr, today0, ftMonthKey, ftPrevMonthKey, monthsAgo };
}

// ───────────────────────────────────────────────────────────
//  ACTUALIDAD — earnings (Finnhub) + noticias Andorra (RSS)
// ───────────────────────────────────────────────────────────
async function buildActualidad(ctx, data, notif) {
  const sec = (notif.sections || {}).actualidad || {};
  if (sec.enabled === false) return [];
  const out = [`🌍 <b>Actualidad</b>`];

  // ── Earnings de tickers que tienes activos en options ──
  if (sec.earnings === true) {
    try {
      const finProv = (data.__fin?.providers || []).find(p => p.tipo === 'finnhub' && p.activa);
      if (!finProv) {
        out.push(`   <i>(earnings: configura un API Finnhub activo en Configuración → APIs)</i>`);
      } else {
        const arr = parseMaybe(data?.options?.ot_activas);
        const tickers = Array.isArray(arr)
          ? [...new Set(arr.map(a => (a.activo||'').trim().toUpperCase()).filter(Boolean))]
          : [];
        if (tickers.length === 0) {
          out.push(`   <i>(earnings: no hay posiciones activas)</i>`);
        } else {
          const days = sec.earnings_days || 14;
          const from = ctx.todayStr;
          const to = new Date(ctx.today0); to.setUTCDate(to.getUTCDate() + days);
          const toStr = to.toISOString().slice(0,10);
          const all = [];
          // Finnhub permite filtrar por symbol — hacemos llamadas en paralelo (max 8 simultáneas)
          const calls = tickers.map(t =>
            fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${toStr}&symbol=${encodeURIComponent(t)}&token=${encodeURIComponent(finProv.key)}`)
              .then(r => r.ok ? r.json() : null)
              .then(d => { (d?.earningsCalendar || []).forEach(e => all.push(e)); })
              .catch(() => {})
          );
          await Promise.all(calls);
          if (all.length === 0) {
            out.push(`   📅 Sin earnings próximos ${days}d para tus tickers`);
          } else {
            all.sort((a,b) => (a.date||'').localeCompare(b.date||''));
            out.push(`   📅 Earnings próximos ${days}d:`);
            all.slice(0, 6).forEach(e => {
              const dte = Math.round((new Date(e.date + 'T00:00:00Z') - ctx.today0) / 86400000);
              const hora = e.hour === 'bmo' ? 'pre' : e.hour === 'amc' ? 'post' : '';
              const epsStr = e.epsEstimate != null ? ` · est $${e.epsEstimate.toFixed(2)}` : '';
              out.push(`     • <code>${escape(e.symbol)}</code> ${e.date} <i>(${dte}d${hora?` ${hora}`:''})</i>${epsStr}`);
            });
            if (all.length > 6) out.push(`     ... y ${all.length-6} más`);
          }
        }
      }
    } catch (e) { console.error('actualidad earnings:', e.message); }
  }

  // ── Calendario macro (Fed/ECB/CPI/NFP) — Finnhub ──
  if (sec.macro === true) {
    try {
      const finProv = (data.__fin?.providers || []).find(p => p.tipo === 'finnhub' && p.activa);
      if (!finProv) {
        out.push(`   <i>(macro: requiere Finnhub activo)</i>`);
      } else {
        const days = sec.macro_days || 7;
        const from = ctx.todayStr;
        const to = new Date(ctx.today0); to.setUTCDate(to.getUTCDate() + days);
        const toStr = to.toISOString().slice(0,10);
        const r = await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${toStr}&token=${encodeURIComponent(finProv.key)}`);
        const d = r.ok ? await r.json() : null;
        const events = (d?.economicCalendar || [])
          .filter(e => (e.impact || '').toLowerCase() === 'high' && ['US','EU','EUR','ES','EA'].includes(e.country))
          .slice(0, 5);
        if (events.length) {
          out.push('');
          out.push(`   📅 Macro alta importancia ${days}d:`);
          events.forEach(e => {
            const dte = Math.round((new Date(e.time?.slice(0,10) + 'T00:00:00Z') - ctx.today0) / 86400000);
            out.push(`     • ${e.time?.slice(0,10)} <i>(${dte}d)</i> · ${escape(e.country||'')} · ${escape(e.event||'')}`);
          });
        }
      }
    } catch (e) { console.error('actualidad macro:', e.message); }
  }

  // ── FX EUR/USD + crypto BTC/ETH (Coingecko, sin key) ──
  if (sec.mercados === true) {
    const market = [];
    try {
      // EUR/USD vía Frankfurter (ECB rates, gratis)
      const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
      if (r.ok) {
        const d = await r.json();
        if (d?.rates?.USD) market.push(`EUR/USD: ${d.rates.USD.toFixed(4)}`);
      }
    } catch (e) {}
    try {
      // BTC + ETH precio + 24h % vía Coingecko
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
      if (r.ok) {
        const d = await r.json();
        if (d.bitcoin) {
          const ch = d.bitcoin.usd_24h_change;
          market.push(`BTC: $${fmt(d.bitcoin.usd)} (${ch>=0?'+':''}${ch.toFixed(1)}%)`);
        }
        if (d.ethereum) {
          const ch = d.ethereum.usd_24h_change;
          market.push(`ETH: $${fmt(d.ethereum.usd)} (${ch>=0?'+':''}${ch.toFixed(1)}%)`);
        }
      }
    } catch (e) {}
    if (market.length) {
      out.push('');
      out.push(`   💱 Mercados:`);
      market.forEach(m => out.push(`     • ${m}`));
    }
  }

  // ── Tiempo Andorra (Open-Meteo, sin key) ──
  if (sec.tiempo === true) {
    try {
      // Andorra la Vella: 42.5063 N, 1.5218 E
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=42.5063&longitude=1.5218&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Europe%2FMadrid&forecast_days=3');
      const d = r.ok ? await r.json() : null;
      if (d?.daily) {
        out.push('');
        out.push(`   🌤 Tiempo Andorra:`);
        const codes = { 0:'☀ despejado', 1:'🌤 mayormente sol', 2:'⛅ nubes', 3:'☁ nublado',
                        45:'🌫 niebla', 48:'🌫 niebla', 51:'🌦 llovizna', 53:'🌦 llovizna', 55:'🌦 llovizna',
                        61:'🌧 lluvia', 63:'🌧 lluvia', 65:'🌧 lluvia fuerte',
                        71:'🌨 nieve', 73:'🌨 nieve', 75:'🌨 nieve fuerte',
                        80:'🌦 chubasco', 81:'🌧 chubasco', 82:'🌧 tormenta',
                        95:'⛈ tormenta', 96:'⛈ tormenta', 99:'⛈ tormenta' };
        const labels = ['Hoy', 'Mañana', 'Pasado'];
        for (let i = 0; i < 3 && i < d.daily.time.length; i++) {
          const desc = codes[d.daily.weathercode[i]] || '·';
          const min = Math.round(d.daily.temperature_2m_min[i]);
          const max = Math.round(d.daily.temperature_2m_max[i]);
          const prec = d.daily.precipitation_sum[i] || 0;
          const precStr = prec >= 1 ? ` · ${prec.toFixed(0)}mm` : '';
          out.push(`     • ${labels[i]}: ${desc} ${min}°/${max}°${precStr}`);
        }
      }
    } catch (e) { console.error('actualidad tiempo:', e.message); }
  }

  // ── Noticias Andorra — RSS BonDia + Altaveu + Diari ──
  if (sec.noticias_andorra === true) {
    try {
      const news = await fetchAndorraNews();
      if (news.length) {
        out.push('');
        out.push(`   📰 Andorra hoy:`);
        news.slice(0, 3).forEach(n => {
          out.push(`     • <a href="${escape(n.link)}">${escape(n.title)}</a> <i>(${escape(n.source)})</i>`);
        });
      } else {
        out.push(`   <i>(noticias: feeds RSS no respondieron)</i>`);
      }
    } catch (e) { console.error('actualidad noticias:', e.message); }
  }

  return out.length > 1 ? out : [];
}

// Fetch RSS de medios andorranos. Parser regex simple — Node 20+ tiene fetch nativo.
async function fetchAndorraNews() {
  const FEEDS = [
    { url: 'https://www.bondia.ad/rss',         source: 'BonDia'    },
    { url: 'https://www.altaveu.com/rss',       source: 'Altaveu'   },
    { url: 'https://www.diariandorra.ad/rss/portada', source: 'Diari' },
  ];
  const all = [];
  await Promise.all(FEEDS.map(async f => {
    try {
      const res = await fetch(f.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 mis-dashboards-bot' }
      });
      if (!res.ok) return;
      const xml = await res.text();
      const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/g)].slice(0, 5);
      items.forEach(it => {
        const block = it[0];
        const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1];
        const link  = (block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) || [])[1];
        const date  = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
        if (title && link) {
          all.push({
            title: title.trim().replace(/\s+/g, ' ').slice(0, 90),
            link: link.trim(),
            source: f.source,
            date: date ? new Date(date.trim()) : null
          });
        }
      });
    } catch (e) { /* feed individual falla, seguimos */ }
  }));
  // ordenar por fecha desc, distintas fuentes en el top
  all.sort((a,b) => (b.date?.getTime()||0) - (a.date?.getTime()||0));
  // diversificar: 1 de cada fuente primero, luego rellenar
  const seen = new Set();
  const top = []; const rest = [];
  all.forEach(n => { if (!seen.has(n.source)) { seen.add(n.source); top.push(n); } else { rest.push(n); } });
  return [...top, ...rest];
}

// ───────────────────────────────────────────────────────────
//  PATRIMONIO
// ───────────────────────────────────────────────────────────
function buildPatrimonio(ctx, data, notif) {
  const sec = (notif.sections || {}).patrimonio || {};
  if (sec.enabled === false) return [];

  try {
    const profiles = parseMaybe(data?.patrimonio?.pat_v5);
    if (!Array.isArray(profiles) || !profiles.length) return [];
    const p = profiles[0];
    const ents = [...(p.entries || [])].sort((a,b) => (a.year-b.year) || (a.month-b.month));
    if (!ents.length) return [];

    const last = ents[ents.length-1];
    const prev = ents.length >= 2 ? ents[ents.length-2] : null;
    const totalNow  = calcPat(last);
    const totalPrev = prev ? calcPat(prev) : null;

    const out = ['💰 <b>Patrimonio</b>'];

    if (sec.total !== false) out.push(`   Total: €${fmt(totalNow)}`);

    if (sec.delta !== false && totalPrev != null) {
      const diff = totalNow - totalPrev;
      const pct  = totalPrev ? (diff/totalPrev*100) : 0;
      out.push(`   ${diff>=0?'↑':'↓'} ${diff>=0?'+':''}€${fmt(Math.abs(diff))} (${pct>=0?'+':''}${pct.toFixed(1)}%) vs mes anterior`);
    }

    if (sec.objetivo !== false) {
      const obj = (p.objectives||[]).find(o => o.type === 'patrimonio') || (p.objectives||[])[0];
      if (obj && obj.target > 0) {
        const pct = (totalNow / obj.target * 100).toFixed(1);
        out.push(`   🎯 ${pct}% del objetivo (€${fmt(obj.target)})`);
      }
    }

    if (sec.ytd_pct === true) {
      const yearStart = ents.find(e => e.year === last.year && e.month === 0)
                    || ents.find(e => e.year === last.year);
      if (yearStart) {
        const t0 = calcPat(yearStart);
        if (t0) {
          const ytd = ((totalNow - t0) / t0 * 100);
          out.push(`   📅 YTD: ${ytd>=0?'+':''}${ytd.toFixed(1)}%`);
        }
      }
    }

    // Gastos por mes
    const gastosByMonth = {};
    let gastosActual = null;
    if (p?.gastos?.meses) {
      for (const [mk, md] of Object.entries(p.gastos.meses)) {
        const r = patGastosMes(md);
        if (r) {
          gastosByMonth[mk] = r.total;
          if (mk === ctx.monthKey) gastosActual = r;
        }
      }
    }

    if (sec.gastos_mes === true && gastosActual && gastosActual.nReal > 0) {
      const cats = p?.gastos?.categorias || [];
      const catMap = {}; cats.forEach(c => catMap[c.id] = c);
      catMap['sin_cat'] = { name: 'Sin categorizar' };
      const top3 = Object.entries(gastosActual.porCat).sort((a,b)=>b[1]-a[1]).slice(0,3);
      out.push('');
      out.push(`   💸 Gastos ${ctx.monthKey}: €${fmt(gastosActual.total)} <i>(${gastosActual.nReal} mov · mi parte)</i>`);
      top3.forEach(([cid, amt]) => {
        const cat = catMap[cid] || { name: cid };
        out.push(`     • ${escape(cat.name)}: €${fmt(amt)}`);
      });
    }

    if (sec.gastos_avg === true) {
      const avg = movingAvg(gastosByMonth, ctx.monthKey, sec.gastos_avg_months || 6);
      if (avg) {
        const tNow = gastosActual?.total || 0;
        const cmp = tNow > 0 && avg.value > 0
          ? ` <i>(este mes ${tNow>=avg.value?'+':'-'}${Math.abs(((tNow-avg.value)/avg.value)*100).toFixed(0)}%)</i>`
          : '';
        out.push(`   📈 Media gastos ${avg.n}m: €${fmt(avg.value)}/mes${cmp}`);
      }
    }

    // Ingresos por mes
    const ingSec = (p.sections||[]).find(s => s.id === 's_ingresos' || s.type === 'ingresos');
    let ingActual = 0;
    const ingByMonth = {};
    if (ingSec) {
      ents.forEach(e => {
        const k = `${e.year}-${String(e.month+1).padStart(2,'0')}`;
        let total = 0;
        (ingSec.assets||[]).forEach(a => {
          const v = parseFloat(e.assets?.[a.id]) || 0;
          if (v > 0) total += v;
        });
        ingByMonth[k] = total;
        if (k === ctx.monthKey) ingActual = total;
      });
    }

    if (sec.ingresos_mes === true && ingActual > 0) {
      out.push('');
      out.push(`   💵 Ingresos ${ctx.monthKey}: €${fmt(ingActual)}`);
    }

    if (sec.ingresos_avg === true && ingSec) {
      const avg = movingAvg(ingByMonth, ctx.monthKey, sec.ingresos_avg_months || 6);
      if (avg) {
        const cmp = ingActual > 0 && avg.value > 0
          ? ` <i>(este mes ${ingActual>=avg.value?'+':'-'}${Math.abs(((ingActual-avg.value)/avg.value)*100).toFixed(0)}%)</i>`
          : '';
        out.push(`   📈 Media ingresos ${avg.n}m: €${fmt(avg.value)}/mes${cmp}`);
      }
    }

    if (sec.distribucion === true) {
      out.push('');
      out.push(`   📊 Distribución:`);
      (p.sections||[]).forEach(s => {
        if (s.id === 's_ingresos' || s.type === 'ingresos') return;
        let secTotal = 0;
        (s.assets||[]).forEach(a => {
          const v = parseFloat(last.assets?.[a.id]);
          if (!isNaN(v)) secTotal += v;
        });
        if (secTotal > 0 && totalNow > 0) {
          const pct = (secTotal/totalNow*100).toFixed(0);
          const name = s.title || s.name || s.id || 'Sección';
          out.push(`     • ${escape(name)}: €${fmt(secTotal)} (${pct}%)`);
        }
      });
    }

    if (sec.top_mover === true && prev) {
      let bestDiff = 0, bestName = '';
      (p.sections||[]).forEach(s => {
        (s.assets||[]).forEach(a => {
          const cur = parseFloat(last.assets?.[a.id]) || 0;
          const pre = parseFloat(prev.assets?.[a.id]) || 0;
          const diff = cur - pre;
          if (Math.abs(diff) > Math.abs(bestDiff)) { bestDiff = diff; bestName = a.name; }
        });
      });
      if (bestName) out.push(`   ⭐ Top mover: ${escape(bestName)} ${bestDiff>=0?'+':''}€${fmt(Math.abs(bestDiff))}`);
    }

    return out.length > 1 ? out : [];
  } catch (e) {
    console.error('Patrimonio:', e.message);
    return [];
  }
}

function patGastosMes(monthMd) {
  if (!monthMd || !monthMd.transacciones) return null;
  const archMap = {};
  (monthMd.archivos||[]).forEach(a => archMap[a.id] = a);
  let total = 0; const porCat = {}; let nReal = 0;
  (monthMd.transacciones||[]).forEach(t => {
    if (t.excluido) return;
    const imp = parseFloat(t.importe);
    if (!Number.isFinite(imp) || imp >= 0) return;
    nReal++;
    const tipo = archMap[t.archivoId]?.tipo || 'individual';
    const part = (tipo === 'comun') ? Math.abs(imp)/2 : Math.abs(imp);
    total += part;
    const cid = t.categoriaId || 'sin_cat';
    porCat[cid] = (porCat[cid]||0) + part;
  });
  return { total, porCat, nReal };
}

function movingAvg(byMonth, currentKey, N) {
  const sorted = Object.keys(byMonth).sort();
  const idx = sorted.indexOf(currentKey);
  const window = idx >= 0
    ? sorted.slice(Math.max(0, idx - N), idx)
    : sorted.slice(-N);
  const positive = window.map(k => byMonth[k]).filter(v => v > 0);
  if (!positive.length) return null;
  return { value: positive.reduce((s,v) => s+v, 0) / positive.length, n: positive.length };
}

// ───────────────────────────────────────────────────────────
//  OPTIONS
// ───────────────────────────────────────────────────────────
// computeEntry: replica options.html — totalNeto se computa runtime
function computeEntry(e) {
  if (!e) return e;
  const contracts = e.contracts || 1;
  const _deb = e.pDebito != null ? Math.abs(e.pDebito) : 0;
  const _pNetoPerCtr = e.pCredito != null ? (e.pCredito - _deb - (e.pCierre || 0)) * 100 : null;
  const totalNeto = e.totalNetoOvr != null ? e.totalNetoOvr :
    (_pNetoPerCtr != null ? _pNetoPerCtr * contracts - (e.comi || 0) / 100 : null);
  return { ...e, totalNeto };
}

function buildOptions(ctx, data, notif) {
  const sec = (notif.sections || {}).options || {};
  if (sec.enabled === false) return [];

  try {
    const arr     = parseMaybe(data?.options?.ot_activas);
    const histRaw = parseMaybe(data?.options?.ot_hist);
    const snaps   = parseMaybe(data?.options?.ot_snaps);
    const hist    = Array.isArray(histRaw) ? histRaw.map(computeEntry) : null;
    if (!Array.isArray(arr)) return [];

    const out = [`📈 <b>Opciones</b>`];

    if (sec.count !== false) out.push(`   ${arr.length} posiciones activas`);

    if (sec.net_liq === true && Array.isArray(snaps) && snaps.length) {
      const sorted = [...snaps].sort((a,b) => (a.date||'').localeCompare(b.date||''));
      const latest = sorted[sorted.length-1];
      if (latest) out.push(`   💵 NAV ${latest.date}: $${fmt(latest.val)}`);
    }

    if (sec.expiring !== false) {
      const dteLimit = sec.expiring_days || 7;
      const exp = arr.filter(a => {
        if (!a.exp) return false;
        const d = Math.round((new Date(a.exp + 'T00:00:00Z') - ctx.today0) / 86400000);
        return d >= 0 && d <= dteLimit;
      });
      if (exp.length) {
        out.push('');
        out.push(`   ⚠ ${exp.length} expira/n en ≤${dteLimit}d:`);
        exp.slice(0, 6).forEach(a => {
          const d = Math.round((new Date(a.exp + 'T00:00:00Z') - ctx.today0) / 86400000);
          out.push(`     • <code>${escape(a.activo||'?')}</code> ${a.strat||''} · ${d}d`);
        });
      }
    }

    if (sec.lista_activas === true && arr.length) {
      out.push('');
      out.push(`   📋 Posiciones:`);
      arr.slice(0, 12).forEach(a => {
        const ctr = parseInt(a.contracts) || 1;
        const dte = a.exp ? Math.round((new Date(a.exp + 'T00:00:00Z') - ctx.today0) / 86400000) : null;
        const u = calcUnrealized(a);
        const pnlStr = u != null ? ` · P&L ${u>=0?'+':''}$${fmt(Math.abs(u))}` : '';
        const dteStr = (a.strat === 'ACC') ? '' : (dte != null ? ` · ${dte}d DTE` : '');
        const ctrStr = ctr > 1 ? ` x${ctr}` : '';
        out.push(`     • <code>${escape(a.activo||'?')}</code> ${a.strat||''}${ctrStr}${dteStr}${pnlStr}`);
      });
      if (arr.length > 12) out.push(`     ... y ${arr.length-12} más`);
    }

    const mesHist = Array.isArray(hist) ? hist.filter(h => (h.cierre||'').startsWith(ctx.monthKey)) : [];

    if (sec.pnl_mes === true && mesHist.length) {
      const pnl = mesHist.reduce((s,h) => s + (parseFloat(h.totalNeto)||0), 0) * 100;
      out.push('');
      out.push(`   💵 P&L ${ctx.monthKey}: ${pnl>=0?'+':''}$${fmt(pnl)} <i>(${mesHist.length} ops)</i>`);
    }

    if (sec.pnl_avg === true && Array.isArray(hist)) {
      const N = sec.pnl_avg_months || 6;
      const pnlByMonth = {};
      hist.forEach(h => {
        const k = (h.cierre||'').slice(0,7);
        if (!k) return;
        pnlByMonth[k] = (pnlByMonth[k]||0) + (parseFloat(h.totalNeto)||0);
      });
      const sorted = Object.keys(pnlByMonth).sort();
      const idx = sorted.indexOf(ctx.monthKey);
      const window = idx >= 0 ? sorted.slice(Math.max(0, idx - N), idx) : sorted.slice(-N);
      if (window.length) {
        const sum = window.reduce((s,k) => s + pnlByMonth[k], 0) * 100;
        const avg = sum / window.length;
        out.push(`   📈 P&L medio ${window.length}m: ${avg>=0?'+':''}$${fmt(avg)}/mes`);
      }
    }

    if (sec.win_rate_mes === true && mesHist.length) {
      const wins = mesHist.filter(h => (parseFloat(h.totalNeto)||0) > 0).length;
      const losses = mesHist.length - wins;
      const wr = (wins/mesHist.length*100).toFixed(0);
      out.push(`   📊 WR ${ctx.monthKey}: ${wr}% <i>(${wins}W / ${losses}L)</i>`);
    }

    // Best/Worst — siempre muestra el mejor y peor del mes, aunque ambos sean del mismo signo.
    if (sec.best_worst === true && mesHist.length) {
      const sorted = [...mesHist].sort((a,b) => (parseFloat(b.totalNeto)||0) - (parseFloat(a.totalNeto)||0));
      const best  = sorted[0];
      const worst = sorted[sorted.length-1];
      if (best) {
        const v = (parseFloat(best.totalNeto)||0) * 100;
        out.push(`   🏆 Mejor: <code>${escape(best.activo||'?')}</code> ${best.strat||''} ${v>=0?'+':''}$${fmt(Math.abs(v))}`);
      }
      if (worst && worst !== best) {
        const v = (parseFloat(worst.totalNeto)||0) * 100;
        out.push(`   📉 Peor: <code>${escape(worst.activo||'?')}</code> ${worst.strat||''} ${v>=0?'+':''}$${fmt(Math.abs(v))}`);
      }
    }

    if (sec.risk_total === true) {
      let riskTot = 0;
      arr.forEach(a => { if (RISK_STRATS.includes(a.strat)) riskTot += parseFloat(a.maxRisk) || 0; });
      if (riskTot > 0) out.push(`   💼 Risk total: $${fmt(riskTot)}`);
    }

    if (sec.closed_today === true && Array.isArray(hist)) {
      const closed = hist.filter(h => h.cierre === ctx.todayStr);
      if (closed.length) {
        out.push('');
        out.push(`   ✔ Cerradas hoy: ${closed.length}`);
        closed.slice(0, 4).forEach(h => {
          const pnl = (parseFloat(h.totalNeto)||0) * 100;
          out.push(`     • ${escape(h.activo||'?')} ${h.strat||''} ${pnl>=0?'+':''}$${fmt(pnl)}`);
        });
      }
    }

    return out.length > 1 ? out : [];
  } catch (e) {
    console.error('Options:', e.message);
    return [];
  }
}

// ───────────────────────────────────────────────────────────
//  FULL TRAINING
// ───────────────────────────────────────────────────────────
function ftMonthMetrics(mv) {
  if (!mv) return null;
  let fact = 0, cobr = 0;
  (mv.entries||[]).forEach(e => {
    const p = parseFloat(e.price) || 0;
    fact += p;
    if (e.paid === 'pagado' || e.paid === true) cobr += p;
  });
  const gastos = (mv.gastos||[])
    .filter(g => g.cat !== 'dividendos')
    .reduce((s,g) => s + (parseFloat(g.amount)||0), 0);
  return { fact, cobr, gastos, beneficio: fact - gastos };
}

function buildTraining(ctx, data, notif) {
  const sec = (notif.sections || {}).training || {};
  if (sec.enabled === false) return [];

  try {
    const ft = parseMaybe(data?.training?.ft_v4);
    if (!ft) return [];

    const out = [`💪 <b>Full Training</b>`];

    const activos = (ft.clients||[]).filter(c => c.active).length;
    const equipo  = (ft.team||[]).filter(t => t.active !== false).length;
    const parts = [];
    if (sec.clientes !== false) parts.push(`${activos} clientes`);
    if (sec.equipo   !== false) parts.push(`${equipo} en equipo`);
    if (parts.length) out.push(`   ${parts.join(' · ')}`);

    // Pendiente del mes actual (KPI del dashboard, en rojo si > 0)
    const mNow = ftMonthMetrics(ft.months?.[ctx.monthKey]);
    if (mNow) {
      const pendNow = mNow.fact - mNow.cobr;
      if (pendNow > 0) {
        out.push(`   🔴 <b>Pendiente ${ctx.monthKey}: €${fmt(pendNow)}</b> <i>(de €${fmt(mNow.fact)} facturados)</i>`);
      }
    }

    const metricsByMonth = {};
    for (const [mk, mv] of Object.entries(ft.months || {})) {
      const r = ftMonthMetrics(mv);
      if (r) metricsByMonth[mk] = r;
    }
    const mPrev  = metricsByMonth[ctx.ftMonthKey];
    const mPrev2 = metricsByMonth[ctx.ftPrevMonthKey];

    function deltaStr(now, prev) {
      if (prev == null || prev === 0) return '';
      const d = now - prev;
      const pct = (d / Math.abs(prev) * 100);
      return ` <i>(${d>=0?'+':''}${pct.toFixed(0)}% vs ${ctx.ftPrevMonthKey})</i>`;
    }

    if (sec.ingresos_mes !== false && mPrev) {
      out.push('');
      out.push(`   <i>Métricas del mes cerrado anterior (${ctx.ftMonthKey}):</i>`);
      if (mPrev.fact > 0)   out.push(`   💵 Facturación: €${fmt(mPrev.fact)}${deltaStr(mPrev.fact, mPrev2?.fact)}`);
      if (mPrev.gastos > 0) out.push(`   💸 Gastos: €${fmt(mPrev.gastos)}${deltaStr(mPrev.gastos, mPrev2?.gastos)}`);
      if (mPrev.fact > 0 || mPrev.gastos > 0) {
        const sign = mPrev.beneficio >= 0 ? '+' : '-';
        out.push(`   📊 Beneficio: ${sign}€${fmt(Math.abs(mPrev.beneficio))}${deltaStr(mPrev.beneficio, mPrev2?.beneficio)}`);
      }
    }

    if (sec.ingresos_avg === true) {
      const N = sec.ingresos_avg_months || 6;
      const sorted = Object.keys(metricsByMonth).sort();
      const idx = sorted.indexOf(ctx.monthKey);
      const window = idx >= 0 ? sorted.slice(Math.max(0, idx - N), idx) : sorted.slice(-N);
      if (window.length) {
        const ben = window.map(k => metricsByMonth[k].beneficio).reduce((s,v) => s+v, 0) / window.length;
        out.push(`   📈 Beneficio medio ${window.length}m: ${ben>=0?'+':'-'}€${fmt(Math.abs(ben))}/mes`);
      }
    }

    // Impagos — solo MESES CERRADOS (mk <= ftMonthKey, el actual aún se cobra).
    // Agrupados por cliente, con TODOS los meses pendientes detallados.
    if (sec.impagos !== false) {
      const cliMap = {};
      (ft.clients||[]).forEach(c => cliMap[c.id] = c.name);
      // byCliente: { [name]: { total, byMonth: { [mk]: amount } } }
      const byCliente = {}; let totalAll = 0; let countAll = 0;
      for (const [mk, mv] of Object.entries(ft.months||{})) {
        if (mk > ctx.monthKey) continue; // incluir mes actual, excluir futuros
        (mv.entries||[]).forEach(e => {
          if (e.paid === 'pagado' || e.paid === true) return;
          const pr = parseFloat(e.price) || 0;
          if (pr <= 0) return;
          const cli = cliMap[e.clientId] || e.clientId || '?';
          if (!byCliente[cli]) byCliente[cli] = { total: 0, byMonth: {} };
          byCliente[cli].total += pr;
          byCliente[cli].byMonth[mk] = (byCliente[cli].byMonth[mk] || 0) + pr;
          totalAll += pr; countAll++;
        });
      }
      const grouped = Object.entries(byCliente).sort((a,b) => b[1].total - a[1].total);
      if (grouped.length) {
        out.push('');
        out.push(`   🔴 <b>${countAll} impagos · €${fmt(totalAll)}</b> <i>(${grouped.length} cliente${grouped.length===1?'':'s'})</i>`);
        grouped.forEach(([cli, d]) => {
          const months = Object.entries(d.byMonth).sort((a,b) => b[0].localeCompare(a[0])); // mes desc
          out.push(`     ${escape(cli)} · €${fmt(d.total)}:`);
          months.forEach(([mk, amt]) => {
            out.push(`       • ${mk}: €${fmt(amt)}`);
          });
        });
      }
    }

    if (sec.sesiones_hoy === true) {
      const monthM = ft.months?.[ctx.monthKey] || ft.months?.[ctx.ftMonthKey];
      if (monthM) {
        let sesHoy = 0;
        (monthM.masajes||[]).forEach(mas => { if (mas.fecha === ctx.todayStr) sesHoy++; });
        (monthM.entries||[]).forEach(e => { if (e.fecha === ctx.todayStr) sesHoy++; });
        if (sesHoy > 0) out.push(`   📅 ${sesHoy} sesion${sesHoy===1?'':'es'} hoy`);
      }
    }

    if (sec.stock_critico === true) {
      const critico = (ft.stock||[]).filter(s => {
        const t = stockTotal(s);
        return t > 0 && t <= 2;
      });
      if (critico.length) {
        out.push('');
        out.push(`   📦 ${critico.length} con stock ≤2:`);
        critico.slice(0, 3).forEach(s => out.push(`     • ${escape(s.name)} (${stockTotal(s)} uds)`));
      }
    }

    return out.length > 2 ? out : [];
  } catch (e) {
    console.error('FT:', e.message);
    return [];
  }
}

// ───────────────────────────────────────────────────────────
//  FACTURAS
// ───────────────────────────────────────────────────────────
function buildFacturas(ctx, data, notif) {
  const sec = (notif.sections || {}).facturas || {};
  if (sec.enabled === false) return [];

  try {
    const profiles = parseMaybe(data?.facturas?.fac_v1);
    if (!Array.isArray(profiles)) return [];

    let pend = 0, venc = 0, totalMes = 0;
    const byClienteMes = {};
    profiles.forEach(p => {
      (p.facturas||[]).forEach(f => {
        if (f.estado === 'pendiente') pend++;
        if (f.estado === 'vencida')   venc++;
        if (f.fecha && f.fecha.startsWith(ctx.monthKey)) {
          const t = parseFloat(f.total)||0;
          totalMes += t;
          const cn = f.clienteName || f.clienteId || '?';
          byClienteMes[cn] = (byClienteMes[cn]||0) + t;
        }
      });
    });

    const out = [`📄 <b>Facturas</b>`];
    const parts = [];
    if (sec.pendientes !== false && pend) parts.push(`${pend} pendientes`);
    if (sec.vencidas   !== false && venc) parts.push(`🔴 <b>${venc} vencidas</b>`);
    if (parts.length) out.push(`   ${parts.join(' · ')}`);
    if (sec.total_mes !== false && totalMes > 0) out.push(`   💶 Facturado ${ctx.monthKey}: €${fmt(totalMes)}`);
    if (sec.top_cliente === true) {
      const top = Object.entries(byClienteMes).sort((a,b) => b[1]-a[1])[0];
      if (top) out.push(`   👤 Top: ${escape(top[0])} (€${fmt(top[1])})`);
    }
    return out.length > 1 ? out : [];
  } catch (e) {
    console.error('Facturas:', e.message);
    return [];
  }
}

// ───────────────────────────────────────────────────────────
//  URGENTE — señales cross-dashboard que merecen atención inmediata
// ───────────────────────────────────────────────────────────
function collectUrgent(ctx, data, notif) {
  const out = [];

  // Facturas vencidas
  try {
    const profiles = parseMaybe(data?.facturas?.fac_v1);
    if (Array.isArray(profiles)) {
      const venc = [];
      profiles.forEach(p => (p.facturas||[]).forEach(f => {
        if (f.estado === 'vencida') {
          venc.push({ cli: f.clienteName || '?', total: parseFloat(f.total)||0 });
        }
      }));
      if (venc.length) {
        const tot = venc.reduce((s,x) => s + x.total, 0);
        out.push(`🔴 ${venc.length} factura${venc.length===1?'':'s'} VENCIDA${venc.length===1?'':'S'} · €${fmt(tot)}`);
      }
    }
  } catch (e) { console.error('urgent facturas:', e.message); }

  // Opciones expirando ≤1d
  try {
    const arr = parseMaybe(data?.options?.ot_activas);
    if (Array.isArray(arr)) {
      const inminentes = arr.filter(a => {
        if (!a.exp) return false;
        const d = Math.round((new Date(a.exp + 'T00:00:00Z') - ctx.today0) / 86400000);
        return d >= 0 && d <= 1;
      });
      if (inminentes.length) {
        const tickers = inminentes.slice(0, 3).map(a => a.activo).join(', ');
        const more = inminentes.length > 3 ? ` +${inminentes.length-3}` : '';
        out.push(`📈 ${inminentes.length} opci${inminentes.length===1?'ón':'ones'} expira${inminentes.length===1?'':'n'} ≤1d: ${escape(tickers)}${more}`);
      }
    }
  } catch (e) { console.error('urgent options:', e.message); }

  // Impagos FT con antigüedad ≥3 meses, SOLO en meses cerrados (mk <= ftMonthKey)
  try {
    const ft = parseMaybe(data?.training?.ft_v4);
    if (ft) {
      const cliMap = {}; (ft.clients||[]).forEach(c => cliMap[c.id] = c.name);
      const viejos = {}; let viejosCount = 0; let viejosTotal = 0;
      for (const [mk, mv] of Object.entries(ft.months||{})) {
        if (mk > ctx.monthKey) continue; // incluir mes actual, excluir futuros // descartar mes en curso (no cerrado)
        const age = ctx.monthsAgo(mk);
        if (age == null || age < 3) continue;
        (mv.entries||[]).forEach(e => {
          if (e.paid === 'pagado' || e.paid === true) return;
          const pr = parseFloat(e.price) || 0;
          if (pr <= 0) return;
          const cli = cliMap[e.clientId] || '?';
          viejos[cli] = (viejos[cli]||0) + pr;
          viejosCount++;
          viejosTotal += pr;
        });
      }
      if (viejosCount) {
        const top = Object.entries(viejos).sort((a,b) => b[1]-a[1])[0];
        out.push(`💪 ${viejosCount} impago${viejosCount===1?'':'s'} FT >3m antiguos · €${fmt(viejosTotal)}${top?` (top: ${escape(top[0])} €${fmt(top[1])})`:''}`);
      }

      // Stock agotado: total === 0 considerando hasVariants
      const agotados = (ft.stock||[]).filter(s => stockTotal(s) === 0);
      if (agotados.length) {
        const names = agotados.slice(0, 2).map(s => s.name).join(', ');
        const more = agotados.length > 2 ? ` +${agotados.length-2}` : '';
        out.push(`📦 ${agotados.length} producto${agotados.length===1?'':'s'} AGOTADO${agotados.length===1?'':'S'}: ${escape(names)}${more}`);
      }
    }
  } catch (e) { console.error('urgent ft:', e.message); }

  return out;
}

// ───────────────────────────────────────────────────────────
//  AI INSIGHT — señales estructuradas + prompt accionable
// ───────────────────────────────────────────────────────────
function buildSignals(ctx, data, notif, urgent) {
  const sig = [];

  // Patrimonio
  try {
    const profiles = parseMaybe(data?.patrimonio?.pat_v5);
    if (Array.isArray(profiles) && profiles[0]) {
      const p = profiles[0];
      const ents = [...(p.entries||[])].sort((a,b)=>(a.year-b.year)||(a.month-b.month));
      if (ents.length) {
        const last = ents[ents.length-1];
        const totalNow = calcPat(last);
        sig.push(`Patrimonio total: €${fmt(totalNow)}`);
        if (ents.length >= 2) {
          const prev = calcPat(ents[ents.length-2]);
          const diff = totalNow - prev;
          const pct = prev ? (diff/prev*100).toFixed(1) : 0;
          sig.push(`Patrimonio Δ vs mes anterior: ${diff>=0?'+':''}€${fmt(Math.abs(diff))} (${pct}%)`);
        }
        const r = patGastosMes(p?.gastos?.meses?.[ctx.monthKey]);
        if (r && r.nReal) {
          const cats = p?.gastos?.categorias || [];
          const catMap = {}; cats.forEach(c => catMap[c.id] = c.name);
          const top = Object.entries(r.porCat).sort((a,b)=>b[1]-a[1]).slice(0,2)
            .map(([cid,v]) => `${catMap[cid]||cid} €${fmt(v)}`).join(', ');
          sig.push(`Gastos personales ${ctx.monthKey}: €${fmt(r.total)} (top: ${top})`);
        }
      }
    }
  } catch(e){}

  // Options
  try {
    const arr = parseMaybe(data?.options?.ot_activas);
    const histRaw = parseMaybe(data?.options?.ot_hist);
    const hist = Array.isArray(histRaw) ? histRaw.map(computeEntry) : null;
    if (Array.isArray(arr)) {
      sig.push(`Opciones activas: ${arr.length}`);
      const exp1 = arr.filter(a => {
        if (!a.exp) return false;
        const d = Math.round((new Date(a.exp + 'T00:00:00Z') - ctx.today0) / 86400000);
        return d >= 0 && d <= 1;
      });
      if (exp1.length) {
        sig.push(`Opciones DTE≤1: ${exp1.map(a => `${a.activo} ${a.strat||''}`).join(', ')}`);
      }
    }
    if (Array.isArray(hist)) {
      const mes = hist.filter(h => (h.cierre||'').startsWith(ctx.monthKey));
      if (mes.length) {
        const pnl = mes.reduce((s,h) => s + (parseFloat(h.totalNeto)||0), 0) * 100;
        const wins = mes.filter(h => (parseFloat(h.totalNeto)||0) > 0).length;
        sig.push(`Options P&L ${ctx.monthKey}: ${pnl>=0?'+':''}$${fmt(pnl)} (${mes.length} ops, WR ${(wins/mes.length*100).toFixed(0)}%)`);
      }
    }
  } catch(e){}

  // FT
  try {
    const ft = parseMaybe(data?.training?.ft_v4);
    if (ft) {
      const m = ftMonthMetrics(ft.months?.[ctx.ftMonthKey]);
      if (m && (m.fact > 0 || m.gastos > 0)) {
        sig.push(`FT ${ctx.ftMonthKey}: facturación €${fmt(m.fact)}, gastos €${fmt(m.gastos)}, beneficio ${m.beneficio>=0?'+':'-'}€${fmt(Math.abs(m.beneficio))}`);
      }
      const cliMap = {}; (ft.clients||[]).forEach(c => cliMap[c.id] = c.name);
      const byCli = {};
      for (const [mk, mv] of Object.entries(ft.months||{})) {
        if (mk > ctx.monthKey) continue; // incluir mes actual, excluir futuros // solo meses cerrados
        (mv.entries||[]).forEach(e => {
          if (e.paid === 'pagado' || e.paid === true) return;
          const pr = parseFloat(e.price) || 0;
          if (pr <= 0) return;
          const cli = cliMap[e.clientId] || '?';
          if (!byCli[cli]) byCli[cli] = { total: 0, oldest: mk };
          byCli[cli].total += pr;
          if (mk < byCli[cli].oldest) byCli[cli].oldest = mk;
        });
      }
      const top3 = Object.entries(byCli).sort((a,b) => b[1].total - a[1].total).slice(0,3);
      if (top3.length) {
        const detail = top3.map(([cli, d]) => `${cli} €${fmt(d.total)} (desde ${d.oldest})`).join(' | ');
        sig.push(`FT impagos top (meses cerrados): ${detail}`);
      }
      const agotados = (ft.stock||[]).filter(s => stockTotal(s) === 0).map(s => s.name);
      if (agotados.length) sig.push(`FT stock agotado: ${agotados.slice(0,3).join(', ')}`);
    }
  } catch(e){}

  // Facturas
  try {
    const profiles = parseMaybe(data?.facturas?.fac_v1);
    if (Array.isArray(profiles)) {
      let pend = 0, venc = 0;
      const vencDet = [];
      profiles.forEach(p => (p.facturas||[]).forEach(f => {
        if (f.estado === 'pendiente') pend++;
        if (f.estado === 'vencida') {
          venc++;
          vencDet.push(`${f.clienteName||'?'} €${fmt(parseFloat(f.total)||0)}`);
        }
      }));
      if (pend) sig.push(`Facturas pendientes: ${pend}`);
      if (venc) sig.push(`Facturas VENCIDAS: ${venc} (${vencDet.slice(0,3).join(', ')})`);
    }
  } catch(e){}

  if (urgent.length) sig.push(`URGENTES detectados: ${urgent.length}`);

  return sig;
}

async function generateInsight(data, signals) {
  const ia = data.__ia;
  if (!ia || !Array.isArray(ia.providers) || !ia.providers.length) {
    return '<i>(IA pedida pero __ia sin configurar)</i>';
  }
  const provider = ia.providers.find(p => p.activa);
  if (!provider) return '<i>(IA pedida pero ningún provider activo)</i>';

  const sysPrompt = [
    'Eres el asistente personal de Sergio. Recibes SEÑALES literales extraídas de sus dashboards.',
    'Tu tarea: 2-3 acciones CONCRETAS para HOY, en bullets cortos (≤14 palabras), tono directo, español.',
    '',
    'REGLA #1 (CRÍTICA): Solo puedes mencionar un nombre propio (ticker, cliente, producto) si aparece LITERALMENTE en las SEÑALES. Si no está, NO lo nombres. NUNCA inventes ni completes con conocimiento general.',
    '',
    'REGLA #2: Si una sección no tiene señal urgente, NO sugieras "verifica X" o "revisa Y" — eso es ruido. Solo emite acciones cuando hay un disparador concreto en las señales.',
    '',
    'Contexto temporal:',
    '- Patrimonio y Opciones = mes actual.',
    '- FT (Full Training) SIEMPRE mes anterior cerrado, NUNCA mes en curso.',
    '- Impagos FT solo se cuentan de meses cerrados.',
    '',
    'Formato:',
    '- Acción = verbo + objetivo concreto + cifra/contexto.',
    '- Sin markdown, sin negritas. Solo bullets con "• " al inicio.',
    '- Si no hay nada urgente, responde EXACTAMENTE: "• Todo en orden — nada urgente hoy" y para.',
    '',
    'Buenos:',
    '• Cobra a Pepe — €340 desde febrero (nombre Pepe SÍ está en señales)',
    '• Cierra SLV NP hoy, DTE=1 (SLV sí está en señales)',
    '',
    'Malos (todos prohibidos):',
    '• Cierra TSLA NP — TSLA no está en señales (alucinación)',
    '• Verifica facturas pendientes — sin disparador (ruido)',
    '• Revisa opciones — vago, sin nombre concreto',
    '• Considera revisar tus gastos — genérico',
  ].join('\n');

  const userMsg = 'SEÑALES:\n' + signals.map(s => '- ' + s).join('\n');

  const text = await callIA(provider, userMsg, sysPrompt);
  if (!text || !text.trim()) return null;
  // Asegurar que cada bullet vaya indentado para que case con el resto del mensaje
  return text.trim().split('\n').filter(l => l.trim()).map(l => '   ' + escape(l.trim())).join('\n');
}

// ───────────────────────────────────────────────────────────
//  IA call (replicado de ia-module.js)
// ───────────────────────────────────────────────────────────
async function callIA(provider, prompt, systemMsg) {
  if (provider.tipo === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.modelo}:generateContent?key=${encodeURIComponent(provider.key)}`;
    const body = { contents:[{parts:[{text: prompt}]}], generationConfig:{ temperature:0.4, maxOutputTokens:512 } };
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
    body: JSON.stringify({ model: provider.modelo, messages, temperature:0.4, max_tokens:512 })
  });
  if (!res.ok) throw new Error(`${provider.tipo} ${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content || '';
}

// ───────────────────────────────────────────────────────────
//  Fetch data.json desde appdata
// ───────────────────────────────────────────────────────────
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

// ───────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────
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
