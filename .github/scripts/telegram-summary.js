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
  if (!notif || !notif.bot_token || !notif.chat_id) {
    console.log('__notif sin bot_token/chat_id. Salida.');
    return;
  }
  if (notif.enabled === false) {
    console.log('Notificaciones desactivadas. Salida.');
    return;
  }

  // ── Tiempo / día actual de Madrid ──
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

  // Schedule check
  if (!FORCE) {
    const cfgHour = parseInt((notif.time || '09:00').split(':')[0], 10);
    const cfgDays = notif.days || ['mon','tue','wed','thu','fri','sat','sun'];
    if (madridHour !== cfgHour) {
      console.log(`Madrid ${madridStr} != notif.time ${notif.time}. Salida.`);
      return;
    }
    if (!cfgDays.includes(todayCode)) {
      console.log(`Hoy es ${todayCode}, no en days=[${cfgDays.join(',')}]. Salida.`);
      return;
    }
  }

  let txt = generateSummary(data, notif);
  txt = await maybeAppendInsight(txt, notif, data);

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
  console.log('✓ Resumen enviado. message_id:', d.result.message_id);
}

// ── AI Insight (pegar al final si está activado) ──
async function maybeAppendInsight(summary, notif, data) {
  if (!notif.ai_insight) return summary;
  const ia = data.__ia;
  if (!ia || !Array.isArray(ia.providers) || !ia.providers.length) {
    return summary + '\n\n<i>(AI insight pedido pero __ia no configurado — guarda tus IA APIs en la web una vez)</i>';
  }
  const provider = ia.providers.find(p => p.activa);
  if (!provider) {
    return summary + '\n\n<i>(AI insight pedido pero ningún provider activo en __ia)</i>';
  }
  try {
    const sysPrompt = `Eres un asistente que analiza un resumen diario de varios dashboards INDEPENDIENTES.

CONTEXTO IMPORTANTE: el resumen contiene secciones SEPARADAS por dashboard. NO mezcles datos entre secciones:
- 💰 PATRIMONIO = patrimonio personal, ahorros e inversiones del usuario.
- 📈 OPCIONES = trading de opciones financieras (P&L, win rate, etc.).
- 💪 FULL TRAINING = negocio del usuario (gimnasio): facturación, gastos del NEGOCIO, beneficio del NEGOCIO, clientes, impagos.
- 📄 FACTURAS = facturas emitidas como autónomo.

Cuando hables de "gastos", aclara siempre de qué dashboard ("gastos personales del patrimonio" vs "gastos del gimnasio FT" — son distintos).

Da un insight breve (máximo 2-3 frases) en español, tono directo, sin markdown. Identifica tendencias, alertas, o próximas acciones. Si una sección parece tener un dato anómalo o incompleto, indícalo.`;
    const plain = summary.replace(/<[^>]+>/g, '');
    const insight = await callIA(provider, plain, sysPrompt);
    if (insight && insight.trim()) {
      return summary + '\n\n🤖 <i>' + escape(insight.trim()) + '</i>';
    }
    return summary;
  } catch (err) {
    console.error('AI insight error:', err.message);
    return summary + '\n\n<i>(AI insight no disponible: ' + escape(err.message) + ')</i>';
  }
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

// ─── computeEntry: fórmula REAL del dashboard de options ───
// Replica options.html computeEntry() para tener totalNeto correcto.
// totalNeto está en "escala prima" ($/100). Para mostrar en $ reales: ×100.
function computeEntry(e) {
  if (!e) return e;
  const contracts = e.contracts || 1;
  const _deb = e.pDebito != null ? Math.abs(e.pDebito) : 0;
  const _pNetoPerCtr = e.pCredito != null ? (e.pCredito - _deb - (e.pCierre || 0)) * 100 : null;
  const totalNeto = e.totalNetoOvr != null ? e.totalNetoOvr :
    (_pNetoPerCtr != null ? _pNetoPerCtr * contracts - (e.comi || 0) / 100 : null);
  return { ...e, totalNeto };
}

// Strats de OPTIONS que se cuentan como "risk total" (excluye ACC = acciones).
// Match con options.html line ~3733 (default si no hay config user).
const RISK_STRATS = ['NP','PCS','CC','CCS','DPS','IC','BWB','JL','112','0DTE','PMCC'];

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

          // ── GASTOS de patrimonio ──
          // Replicar fórmula real del dashboard:
          //   - Solo importe < 0 (positivos son ingresos/transferencias entrantes)
          //   - Saltar excluido === true
          //   - Para archivos tipo='comun' contar mitad ("mi parte")
          //   - Para individual contar completo
          //   - id de categoría sin asignar = 'sin_cat'
          function _patGastosResumenMes(monthMd) {
            if (!monthMd || !monthMd.transacciones) return null;
            const archivos = monthMd.archivos || [];
            const archMap = {};
            archivos.forEach(a => archMap[a.id] = a);
            let totalMiParte = 0;
            const porCat = {};
            let nReal = 0;
            (monthMd.transacciones||[]).forEach(t => {
              if (t.excluido) return;
              const imp = parseFloat(t.importe);
              if (!Number.isFinite(imp) || imp >= 0) return; // solo gastos
              nReal++;
              const arch = archMap[t.archivoId];
              const tipo = arch?.tipo || 'individual';
              const importeAbs = Math.abs(imp);
              const miParte = (tipo === 'comun') ? importeAbs / 2 : importeAbs;
              totalMiParte += miParte;
              const catId = t.categoriaId || 'sin_cat';
              porCat[catId] = (porCat[catId]||0) + miParte;
            });
            return { totalMiParte, porCat, nReal };
          }

          const gastosByMonth = {}; // { 'YYYY-MM': totalMiParte }
          let gastosResumenActual = null;
          if (p?.gastos?.meses) {
            for (const [mk, md] of Object.entries(p.gastos.meses)) {
              const r = _patGastosResumenMes(md);
              if (r) {
                gastosByMonth[mk] = r.totalMiParte;
                if (mk === monthKey) gastosResumenActual = r;
              }
            }
          }

          if (patSec.gastos_mes === true && gastosResumenActual && gastosResumenActual.nReal > 0) {
            const cats = p?.gastos?.categorias || [];
            const catMap = {}; cats.forEach(c => catMap[c.id] = c);
            catMap['sin_cat'] = { name: 'Sin categorizar' };
            const top3 = Object.entries(gastosResumenActual.porCat).sort((a,b)=>b[1]-a[1]).slice(0,3);
            block.push(`   💸 Gastos ${monthKey}: €${fmt(gastosResumenActual.totalMiParte)} (${gastosResumenActual.nReal} mov · mi parte)`);
            top3.forEach(([cid, amt]) => {
              const cat = catMap[cid] || { name: cid };
              block.push(`     • ${escape(cat.name)}: €${fmt(amt)}`);
            });
          }

          if (patSec.gastos_avg === true) {
            const N = patSec.gastos_avg_months || 6;
            const monthsSorted = Object.keys(gastosByMonth).sort();
            const idxNow = monthsSorted.indexOf(monthKey);
            const window = idxNow >= 0
              ? monthsSorted.slice(Math.max(0, idxNow - N), idxNow)
              : monthsSorted.slice(-N);
            const positive = window.filter(k => gastosByMonth[k] > 0);
            if (positive.length) {
              const avg = positive.reduce((s,k) => s + gastosByMonth[k], 0) / positive.length;
              const tNow = gastosResumenActual?.totalMiParte || 0;
              const cmpStr = tNow > 0
                ? ` (este mes €${fmt(tNow)}, ${tNow>=avg?'+':'-'}${Math.abs(((tNow-avg)/avg)*100).toFixed(0)}%)`
                : '';
              block.push(`   📈 Gastos media ${positive.length}m: €${fmt(avg)}/mes${cmpStr}`);
            }
          }

          // Computar ingresos por mes para reuso
          const ingSec = (p.sections||[]).find(s => s.id === 's_ingresos' || s.type === 'ingresos');
          let ingresosTotalMes = 0;
          const ingresosByMonth = {}; // { 'YYYY-MM': total }
          if (ingSec) {
            ents.forEach(e => {
              const k = `${e.year}-${String(e.month+1).padStart(2,'0')}`;
              let total = 0;
              (ingSec.assets||[]).forEach(a => {
                const v = parseFloat(e.assets?.[a.id]) || 0;
                if (v > 0) total += v;
              });
              ingresosByMonth[k] = total;
              if (k === monthKey) ingresosTotalMes = total;
            });
          }

          if (patSec.ingresos_mes === true && ingresosTotalMes > 0) {
            block.push(`   💵 Ingresos ${monthKey}: €${fmt(ingresosTotalMes)}`);
          }

          if (patSec.ingresos_avg === true && ingSec) {
            const N = patSec.ingresos_avg_months || 6;
            const monthsSorted = Object.keys(ingresosByMonth).sort();
            const idxNow = monthsSorted.indexOf(monthKey);
            const window = idxNow >= 0
              ? monthsSorted.slice(Math.max(0, idxNow - N), idxNow)
              : monthsSorted.slice(-N);
            const positive = window.map(k => ingresosByMonth[k]).filter(v => v > 0);
            if (positive.length) {
              const avg = positive.reduce((s,v) => s+v, 0) / positive.length;
              const cmpStr = ingresosTotalMes > 0
                ? ` (este mes €${fmt(ingresosTotalMes)}, ${ingresosTotalMes>=avg?'+':'-'}${Math.abs(((ingresosTotalMes-avg)/avg)*100).toFixed(0)}%)`
                : '';
              block.push(`   📈 Ingresos media ${positive.length}m: €${fmt(avg)}/mes${cmpStr}`);
            }
          }

          if (patSec.distribucion === true) {
            block.push(`   📊 Distribución:`);
            (p.sections||[]).forEach(sec => {
              if (sec.id === 's_ingresos' || sec.type === 'ingresos') return;
              let secTotal = 0;
              (sec.assets||[]).forEach(a => {
                const v = parseFloat(last.assets?.[a.id]);
                if (!isNaN(v)) secTotal += v;
              });
              if (secTotal > 0 && totalNow > 0) {
                const pct = (secTotal/totalNow*100).toFixed(0);
                // patrimonio guarda nombre de sección en `title`, no `name`
                const secName = sec.title || sec.name || sec.id || 'Sección';
                block.push(`     • ${escape(secName)}: €${fmt(secTotal)} (${pct}%)`);
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
      const histRaw = parseMaybe(data?.options?.ot_hist);
      const snaps = parseMaybe(data?.options?.ot_snaps);
      // ── ENRIQUECER hist con totalNeto (campo computado, no almacenado) ──
      const hist = Array.isArray(histRaw) ? histRaw.map(computeEntry) : null;
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

        if (optSec.pnl_avg === true && Array.isArray(hist)) {
          const N = optSec.pnl_avg_months || 6;
          const pnlByMonth = {};
          hist.forEach(h => {
            const k = (h.cierre||'').slice(0,7);
            if (!k) return;
            pnlByMonth[k] = (pnlByMonth[k]||0) + (parseFloat(h.totalNeto)||0);
          });
          const monthsSorted = Object.keys(pnlByMonth).sort();
          const idxNow = monthsSorted.indexOf(monthKey);
          const window = idxNow >= 0
            ? monthsSorted.slice(Math.max(0, idxNow - N), idxNow)
            : monthsSorted.slice(-N);
          if (window.length) {
            const sumPnl = window.reduce((s,k) => s + pnlByMonth[k], 0) * 100;
            const avg = sumPnl / window.length;
            block.push(`   📈 P&L medio ${window.length}m: ${avg>=0?'+':''}$${fmt(avg)}/mes`);
          }
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
            block.push(`   🏆 Best activo/strat: <code>${escape(best.activo||'?')}</code> ${best.strat||''} +$${fmt(v)}`);
          }
          if (worst && worst !== best && (parseFloat(worst.totalNeto)||0) < 0) {
            const v = Math.abs((parseFloat(worst.totalNeto)||0) * 100);
            block.push(`   📉 Worst activo/strat: <code>${escape(worst.activo||'?')}</code> ${worst.strat||''} -$${fmt(v)}`);
          }
        }

        if (optSec.risk_total === true) {
          // Replicar dashboard: solo cuentan risk las strats de opciones
          // (NP/PCS/CC/CCS/DPS/IC/BWB/JL/112/0DTE/PMCC). ACC = acciones,
          // capital invertido pero no "risk en juego" en el sentido del dashboard.
          let riskTot = 0;
          arr.forEach(a => {
            if (RISK_STRATS.includes(a.strat)) {
              riskTot += parseFloat(a.maxRisk) || 0;
            }
          });
          if (riskTot > 0) block.push(`   💼 Risk total (opciones): $${fmt(riskTot)}`);
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

        if (block.length) { lines.push(''); lines.push(...block); }
      }
    } catch (e) { console.error('Options:', e.message); }
  }

  // ─── FULL TRAINING ───
  // Lógica especial: el "mes en curso" suele estar incompleto (gastos/remesas
  // todavía sin meter), así que las métricas se refieren al MES ANTERIOR
  // y se comparan contra el anterior anterior. Las medias también
  // excluyen el mes en curso.
  const ftSec = S.training || {};
  if (ftSec.enabled !== false) {
    try {
      const ft = parseMaybe(data?.training?.ft_v4);
      if (ft) {
        const block = [];

        // Mes objetivo = mes anterior al actual
        const [yNow, mNow] = monthKey.split('-').map(n => parseInt(n,10));
        const dPrev = new Date(Date.UTC(yNow, mNow - 1, 1)); dPrev.setUTCMonth(dPrev.getUTCMonth() - 1);
        const ftMonthKey = `${dPrev.getUTCFullYear()}-${String(dPrev.getUTCMonth()+1).padStart(2,'0')}`;
        const dPrev2 = new Date(dPrev); dPrev2.setUTCMonth(dPrev2.getUTCMonth() - 1);
        const ftPrevMonthKey = `${dPrev2.getUTCFullYear()}-${String(dPrev2.getUTCMonth()+1).padStart(2,'0')}`;

        const activos = (ft.clients||[]).filter(c => c.active).length;
        const equipo  = (ft.team||[]).filter(t => t.active !== false).length;
        const parts = [];
        if (ftSec.clientes !== false) parts.push(`${activos} clientes`);
        if (ftSec.equipo !== false)   parts.push(`${equipo} en equipo`);
        if (parts.length) block.push(`💪 <b>Full Training</b>: ${parts.join(' · ')}`);
        block.push(`   <i>(referido a ${ftMonthKey} — el mes en curso suele estar incompleto)</i>`);

        // ── Fact + gastos por mes (match EXACTO con dashboard FT) ──
        //   entries:  [{ id, clientId, serviceId, trainerId, price, paid, recurring }]
        //   gastos:   [{ id, desc, amount, cat }]
        // El dashboard NO cuenta packs/masajes en facturación principal — solo entries.price.
        // Mantener consistencia con el dashboard.
        function _ftMonthMetrics(mv) {
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
          const beneficio = fact - gastos;
          return { fact, cobr, gastos, beneficio };
        }

        const metricsByMonth = {};
        for (const [mk, mv] of Object.entries(ft.months || {})) {
          const r = _ftMonthMetrics(mv);
          if (r) metricsByMonth[mk] = r;
        }
        const mPrev  = metricsByMonth[ftMonthKey];
        const mPrev2 = metricsByMonth[ftPrevMonthKey];

        // Δ helper: porcentaje vs mes anterior anterior
        function _deltaStr(now, prev) {
          if (prev == null || prev === 0) return '';
          const diff = now - prev;
          const pct = (diff / Math.abs(prev) * 100);
          return ` (${diff>=0?'+':''}${pct.toFixed(0)}% vs ${ftPrevMonthKey})`;
        }

        // ── Las 3 métricas del mes anterior con Δ vs anterior anterior ──
        if (ftSec.ingresos_mes !== false && mPrev) {
          if (mPrev.fact > 0) {
            block.push(`   💵 Facturación ${ftMonthKey}: €${fmt(mPrev.fact)}${_deltaStr(mPrev.fact, mPrev2?.fact)}`);
          }
          if (mPrev.gastos > 0) {
            block.push(`   💸 Gastos ${ftMonthKey}: €${fmt(mPrev.gastos)}${_deltaStr(mPrev.gastos, mPrev2?.gastos)}`);
          }
          if (mPrev.fact > 0 || mPrev.gastos > 0) {
            const sign = mPrev.beneficio >= 0 ? '+' : '-';
            block.push(`   📊 Beneficio ${ftMonthKey}: ${sign}€${fmt(Math.abs(mPrev.beneficio))}${_deltaStr(mPrev.beneficio, mPrev2?.beneficio)}`);
          }
        }

        // ── Beneficio medio últimos N meses (excluyendo mes actual) ──
        if (ftSec.ingresos_avg === true) {
          const N = ftSec.ingresos_avg_months || 6;
          const monthsSorted = Object.keys(metricsByMonth).sort();
          const idxNow = monthsSorted.indexOf(monthKey);
          const window = idxNow >= 0
            ? monthsSorted.slice(Math.max(0, idxNow - N), idxNow)
            : monthsSorted.slice(-N);
          if (window.length) {
            const benValues = window.map(k => metricsByMonth[k].beneficio);
            const avgBen = benValues.reduce((s,v) => s+v, 0) / benValues.length;
            block.push(`   📈 Beneficio medio ${window.length}m: ${avgBen>=0?'+':'-'}€${fmt(Math.abs(avgBen))}/mes`);
            const factPos = window.map(k => metricsByMonth[k].fact).filter(v => v > 0);
            if (factPos.length) {
              const avgFact = factPos.reduce((s,v) => s+v, 0) / factPos.length;
              block.push(`   📈 Facturación media ${factPos.length}m: €${fmt(avgFact)}/mes`);
            }
          }
        }

        // ── Impagos: TODOS los pendientes acumulados (todos los meses) ──
        // Lista detallada con cliente y mes para que sepas a quién perseguir.
        if (ftSec.impagos !== false) {
          const clients = ft.clients || [];
          const cliMap = {};
          clients.forEach(c => cliMap[c.id] = c.name);
          const allImpagos = []; // { mes, clientName, price }
          for (const [mk, mv] of Object.entries(ft.months || {})) {
            (mv.entries||[]).forEach(e => {
              if (e.paid === 'pagado' || e.paid === true) return;
              const price = parseFloat(e.price) || 0;
              if (price <= 0) return;
              allImpagos.push({
                mes: mk,
                cliente: cliMap[e.clientId] || e.clientId || '?',
                price: price
              });
            });
          }
          if (allImpagos.length > 0) {
            // Orden: más reciente primero
            allImpagos.sort((a,b) => b.mes.localeCompare(a.mes) || a.cliente.localeCompare(b.cliente));
            const total = allImpagos.reduce((s,x) => s + x.price, 0);
            block.push(`   ⚠ <b>${allImpagos.length} impagos pendientes</b>: €${fmt(total)}`);
            const MAX = 12;
            allImpagos.slice(0, MAX).forEach(x => {
              block.push(`     • ${x.mes} · ${escape(x.cliente)} · €${fmt(x.price)}`);
            });
            if (allImpagos.length > MAX) {
              block.push(`     ... y ${allImpagos.length - MAX} más`);
            }
          }
        }

        // top_servicios eliminado por petición del user.

        // ── Sesiones HOY (real time) ──
        if (ftSec.sesiones_hoy === true) {
          const monthM = ft.months?.[monthKey] || ft.months?.[ftMonthKey];
          if (monthM) {
            let sesHoy = 0;
            (monthM.masajes||[]).forEach(mas => { if (mas.fecha === todayStr) sesHoy++; });
            (monthM.entries||[]).forEach(e => { if (e.fecha === todayStr) sesHoy++; });
            if (sesHoy > 0) block.push(`   📅 ${sesHoy} sesion${sesHoy===1?'':'es'} hoy`);
          }
        }

        // ── Stock crítico (real time) ──
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

        // top_clientes desactivado: el campo clientId en lines no es fiable.
        // Si lo necesitamos algún día, refactorizar siguiendo lógica del dashboard.

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
