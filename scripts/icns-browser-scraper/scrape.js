/* ═══════════════════════════════════════════════════════════════════════════
   ICNS BROWSER SCRAPER — versión consola del navegador (sin Node)
   ───────────────────────────────────────────────────────────────────────────
   QUÉ HACE:
     - Pides un JSON con la lista de URLs de tus recetas ICNS
       (recetas_urls_hasta_pX.json).
     - El script abre cada URL en background usando TU sesión de ICNS
       (porque ya estás logueado en esta pestaña).
     - Extrae foto, ingredientes con cantidades, instrucciones, tiempos,
       raciones, autor, comentarios y tags de cada receta.
     - Te descarga un archivo recetas-detalladas.json al acabar.
     - Importas ese JSON en la app (tab Menús → Recetas → "⬆ Importar JSON").

   CÓMO USAR:
     1. Abre https://icns.software y haz login normal.
     2. En la misma pestaña, abre DevTools (F12) → Console.
     3. Pega TODO este archivo y pulsa Enter.
     4. Aparece un panel en la esquina inferior derecha — sigue las
        instrucciones (carga tu urls.json, pulsa Start).
     5. Cuando termine, se descarga el JSON. Importalo en la app.

   IMPORTANTE:
     - Si tu sesión caduca a mitad del scraping, el panel te avisa y los
       fallos quedan marcados con _error en el JSON (puedes reintentar
       solo esos pulsando "Retry fallos").
     - Concurrencia 2 con delay 300ms — amable con el servidor.
   ═══════════════════════════════════════════════════════════════════════════ */

(function(){
  if(window._icnsScraperRunning){
    alert('El scraper ya está corriendo. Cierra el panel existente primero.');
    return;
  }
  window._icnsScraperRunning = true;

  const ICNS_BASE = location.origin;
  let CONCURRENCY = 2;
  let DELAY_MS    = 300;

  // ── UI inyectada ────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = '_icns-scraper-panel';
  panel.style.cssText = `
    position:fixed;bottom:14px;right:14px;width:380px;z-index:999999;
    background:#0d1117;color:#c9d1d9;border:1px solid #f0a500;
    border-radius:8px;padding:14px;font-family:'Courier New',monospace;font-size:12px;
    box-shadow:0 4px 20px rgba(0,0,0,.6);max-height:80vh;overflow-y:auto;
  `;
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;border-bottom:1px solid #1e2d3d;padding-bottom:8px;">
      <strong style="color:#f0a500;font-size:13px;">🍳 ICNS Scraper</strong>
      <button id="_icns-close" style="background:transparent;border:1px solid #1e2d3d;color:#888;cursor:pointer;padding:2px 8px;border-radius:3px;font-family:inherit;">×</button>
    </div>

    <div id="_icns-step1">
      <div style="margin-bottom:8px;color:#9aa9ba;line-height:1.4;">
        1. Carga <b>recetas_urls_hasta_pX.json</b> (lista de URLs) <span style="color:#5a7a9a;font-size:10px;">— o varios <code>recetas_pX*.json</code> a la vez (sintetiza URLs desde el id)</span>
      </div>
      <input type="file" id="_icns-urls-file" accept=".json" multiple style="margin-bottom:10px;color:#888;font-family:inherit;font-size:11px;">
      <div id="_icns-urls-info" style="font-size:11px;color:#5a7a9a;margin-bottom:10px;"></div>

      <div style="display:flex;gap:10px;margin-bottom:10px;align-items:center;font-size:11px;">
        <label style="color:#888;">Concurrencia: <input type="number" id="_icns-conc" value="2" min="1" max="5" style="width:40px;background:#0a0e14;border:1px solid #1e2d3d;color:#c9d1d9;font-family:inherit;padding:2px 4px;border-radius:3px;"></label>
        <label style="color:#888;">Delay ms: <input type="number" id="_icns-delay" value="300" min="100" step="100" style="width:60px;background:#0a0e14;border:1px solid #1e2d3d;color:#c9d1d9;font-family:inherit;padding:2px 4px;border-radius:3px;"></label>
        <label style="color:#888;">Limit: <input type="number" id="_icns-limit" placeholder="∞" style="width:50px;background:#0a0e14;border:1px solid #1e2d3d;color:#c9d1d9;font-family:inherit;padding:2px 4px;border-radius:3px;"></label>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        <button id="_icns-test-one" class="_icns-btn" disabled>🧪 Probar 1</button>
        <button id="_icns-dump-html" class="_icns-btn" disabled title="Descarga el HTML crudo de la primera receta — útil para depurar selectores">💾 HTML</button>
        <button id="_icns-start" class="_icns-btn _icns-primary" disabled>▶ Start</button>
      </div>
    </div>

    <div id="_icns-step2" style="display:none;">
      <div style="font-size:13px;font-weight:700;color:#f0a500;margin-bottom:6px;">⏳ Procesando…</div>
      <div id="_icns-progress" style="background:#1e2d3d;border-radius:3px;overflow:hidden;height:6px;margin-bottom:6px;">
        <div id="_icns-progress-bar" style="background:#f0a500;height:100%;width:0%;transition:width .2s;"></div>
      </div>
      <div id="_icns-stats" style="font-size:11px;color:#888;margin-bottom:8px;">0 / 0</div>
      <div id="_icns-current" style="font-size:11px;color:#5a7a9a;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
      <div style="display:flex;gap:6px;">
        <button id="_icns-pause" class="_icns-btn">⏸ Pausa</button>
        <button id="_icns-stop" class="_icns-btn">⏹ Stop</button>
      </div>
    </div>

    <div id="_icns-step3" style="display:none;">
      <div style="font-size:13px;font-weight:700;color:#3fb68b;margin-bottom:8px;">✓ Completado</div>
      <div id="_icns-summary" style="font-size:11px;color:#9aa9ba;line-height:1.6;margin-bottom:10px;"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button id="_icns-download" class="_icns-btn _icns-primary">⬇ Descargar JSON</button>
        <button id="_icns-retry" class="_icns-btn">↻ Retry fallos</button>
        <button id="_icns-restart" class="_icns-btn">⟲ Empezar de cero</button>
      </div>
    </div>

    <div id="_icns-log" style="margin-top:10px;padding-top:8px;border-top:1px solid #1e2d3d;font-size:10px;color:#5a7a9a;max-height:140px;overflow-y:auto;font-family:'Courier New',monospace;"></div>
  `;
  document.body.appendChild(panel);

  // Styles for buttons (inlined)
  const style = document.createElement('style');
  style.textContent = `
    #_icns-scraper-panel ._icns-btn{
      background:transparent;border:1px solid #1e2d3d;color:#9aa9ba;
      padding:5px 10px;border-radius:3px;cursor:pointer;
      font-family:'Courier New',monospace;font-size:11px;
      transition:all .15s ease;
    }
    #_icns-scraper-panel ._icns-btn:hover:not(:disabled){border-color:#f0a500;color:#f0a500;}
    #_icns-scraper-panel ._icns-btn:disabled{opacity:.4;cursor:not-allowed;}
    #_icns-scraper-panel ._icns-btn._icns-primary{background:#f0a500;color:#000;border-color:#f0a500;font-weight:700;}
    #_icns-scraper-panel ._icns-btn._icns-primary:hover:not(:disabled){background:#ffc445;border-color:#ffc445;}
  `;
  document.head.appendChild(style);

  // ── Estado ──────────────────────────────────────────────────────
  let urls = [];
  let results = [];
  let aborted = false;
  let paused = false;

  function log(msg, type=''){
    const el = document.getElementById('_icns-log');
    const colors = { ok:'#3fb68b', fail:'#dc6a6a', info:'#5a7a9a', '':'#9aa9ba' };
    const line = document.createElement('div');
    line.style.color = colors[type] || colors[''];
    line.textContent = msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
    if(type === 'fail') console.warn('[icns]', msg);
    else console.log('[icns]', msg);
  }

  // ── Carga del archivo de URLs ───────────────────────────────────
  // Acepta MULTIPLE formatos:
  //  · { id, nombre, url }      → usa la URL directamente
  //  · { id, nombre, kcal, ... } → sintetiza URL desde id: /receta_{id}
  //  · array suelto o {recetas:[...]} o {data:[...]}
  // También permite arrastrar varios archivos (multi-file).
  const fileInput = document.getElementById('_icns-urls-file');
  fileInput.addEventListener('change', async (ev) => {
    const files = Array.from(ev.target.files || []);
    if(!files.length) return;
    urls = [];
    const seen = new Set();
    let synthetized = 0, direct = 0, dropped = 0;
    for(const file of files){
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed
                   : Array.isArray(parsed.recetas) ? parsed.recetas
                   : Array.isArray(parsed.data) ? parsed.data
                   : null;
        if(!list){ throw new Error('Formato no esperado'); }
        for(const item of list){
          if(!item || !item.id){ dropped++; continue; }
          const id = String(item.id);
          if(seen.has(id)) continue;  // duplicado entre archivos
          seen.add(id);
          let url = item.url;
          if(!url){
            // Sintetiza URL ICNS canónica desde el id
            url = ICNS_BASE + '/receta_' + id;
            synthetized++;
          } else {
            direct++;
          }
          urls.push({ id, nombre: item.nombre || ('Receta ' + id), url });
        }
      } catch(e){
        log(`✗ ${file.name}: ${e.message}`, 'fail');
        dropped++;
      }
    }
    const msg = files.length > 1
      ? `✓ ${urls.length} URLs de ${files.length} archivos`
      : `✓ Cargadas ${urls.length} URLs`;
    const detail = (synthetized ? ` · ${synthetized} sintetizadas desde id` : '')
                 + (direct ? ` · ${direct} con url directa` : '')
                 + (dropped ? ` · ${dropped} sin id` : '');
    document.getElementById('_icns-urls-info').innerHTML =
      `<div>${msg}</div><div style="color:#5a7a9a;font-size:10px;margin-top:2px;">${detail}</div>`;
    document.getElementById('_icns-test-one').disabled = urls.length === 0;
    document.getElementById('_icns-start').disabled    = urls.length === 0;
    log(`URLs cargadas: ${urls.length}${detail}`, urls.length ? 'ok' : 'fail');
  });

  // ── Parser HTML → datos ────────────────────────────────────────
  function clean(s){ return (s || '').replace(/\s+/g, ' ').trim(); }
  function extractNumber(s){ const m = (s || '').match(/(\d+(?:[.,]\d+)?)/); return m ? parseFloat(m[1].replace(',', '.')) : null; }
  function extractUnit(s){ const m = (s || '').match(/\d+(?:[.,]\d+)?\s*([a-záéíóúñ]+)/i); return m ? m[1].toLowerCase() : ''; }
  function absUrl(src){
    if(!src) return '';
    if(src.startsWith('http')) return src;
    return ICNS_BASE + (src.startsWith('/') ? '' : '/') + src;
  }

  // ── Limpieza de ingrediente: quita ruido típico de ICNS ────────
  // Patterns conocidos a strippear:
  //   " Detalles X€ - X€"  → precios al final
  //   " (123 gr.)"          → peso entre paréntesis al final
  //   "Detalles" suelto
  function cleanIngredienteText(txt){
    return (txt || '')
      .replace(/\s*Detalles\s+[\d.,]+€?\s*[-–]\s*[\d.,]+€?\s*$/i, '')
      .replace(/\s*Detalles\s*$/i, '')
      .trim();
  }
  // Extrae el nombre real del ingrediente quitando cantidad/unidad + paréntesis con peso.
  // Ej: "150 gramos de tempeh (X gr.) Detalles 2€-8€" → "tempeh"
  function extractIngNombre(txt){
    let s = cleanIngredienteText(txt);
    // Quitar cantidad inicial + unidad + opcional "de"
    s = s.replace(/^[¼½¾⅓⅔⅛⅜⅝⅞\d]+(?:[.,]\d+)?\s*[a-záéíóúñ]+\s*(de\s+)?/i, '');
    // Quitar paréntesis con peso al final: " (123 gr.)" o " (5.3 gr.)"
    s = s.replace(/\s*\([\d.,\s]+gr\.?\)\s*$/i, '');
    return s.trim();
  }

  // ── Mapeo de tags ICNS → momentos del día ──────────────────────
  // ICNS usa "#Desayunos", "#Comidas", "#Cenas", "#Snacks", "#Merienda",
  // etc. Los mapeamos a los momentos internos de la app.
  function tagsToMomentos(tags){
    const set = new Set();
    tags.forEach(t => {
      const low = t.toLowerCase().replace(/^#/, '').trim();
      if(/desayuno|esmorzar|breakfast/i.test(low)) set.add('esmorzar');
      if(/medi[aá]\s*ma[ñn]ana|mig\s*mat[ií]|brunch/i.test(low)) set.add('mig_mati');
      if(/comida|almuerzo|dinar|lunch/i.test(low)) set.add('dinar');
      if(/merienda|berenar|snack/i.test(low)){ set.add('berenar'); set.add('mig_mati'); }
      if(/cena|sopar|dinner/i.test(low)) set.add('sopar');
    });
    return [...set];
  }

  // Helper: encuentra el siguiente sibling/descendiente con contenido
  // significativo tras un <img> "header" de ICNS (img/lang/es/{name}.png).
  // Devuelve el elemento, o null si no encuentra.
  function findContentAfterIcnsHeader(doc, headerImgPath){
    const imgs = Array.from(doc.querySelectorAll('img'));
    const hdrImg = imgs.find(img => {
      const src = img.getAttribute('src') || '';
      return src.includes(headerImgPath);
    });
    if(!hdrImg) return null;
    // El header está en un <span> dentro de un <div>. Subimos al div padre
    // y cogemos el siguiente sibling div.
    let cont = hdrImg.closest('div');
    if(!cont) return null;
    let next = cont.nextElementSibling;
    while(next){
      // Skip nodos vacíos o de utilidad
      if(next.tagName && next.tagName !== 'SCRIPT' && next.tagName !== 'STYLE'){
        const txt = (next.textContent || '').trim();
        if(txt.length > 0) return next;
      }
      next = next.nextElementSibling;
    }
    return null;
  }

  function parseRecipeHtml(html, urlInfo){
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const $ = (sel) => doc.querySelector(sel);
    const $$ = (sel) => Array.from(doc.querySelectorAll(sel));
    const out = {
      id: urlInfo.id,
      nombre: urlInfo.nombre,
      url: urlInfo.url,
      foto: '',
      fotos: [],
      raciones: null,
      tiempoTotal: '',
      tiempoElaboracion: '',
      momentos: [],
      ingredientes: [],
      instrucciones: [],
      comentarios: '',
      autor: '',
      tags: []
    };

    // ── FOTO ───────────────────────────────────────────────────────
    // ICNS usa URLs RELATIVAS sin "/" inicial: src="din/recetas/fotos/...".
    // El regex anterior requería "/" inicial y fallaba en todas las recetas.
    // Aceptamos: relativa o absoluta, sin importar el prefijo.
    const ICNS_FOTO_RE = /(?:^|[\/"'=\s])(din\/recetas\/(fotos|chefs)\/[^\s"'<>)\\]+\.(jpg|jpeg|png|webp))/i;
    const checkAndAdd = (src) => {
      if(!src) return;
      const m = src.match(ICNS_FOTO_RE);
      if(!m) return;
      const path = m[1];  // siempre relativa al base
      const full = absUrl(path);
      if(!out.fotos.includes(full)) out.fotos.push(full);
    };
    // Selector específico ICNS: #foto > img es la foto principal
    const fotoMain = $('#foto img');
    if(fotoMain){
      checkAndAdd(fotoMain.getAttribute('src'));
    }
    // Resto de imgs (incluyendo data-src por si lazy-load)
    $$('img').forEach(el => {
      checkAndAdd(el.getAttribute('src'));
      checkAndAdd(el.getAttribute('data-src'));
      checkAndAdd(el.getAttribute('data-lazy-src'));
      checkAndAdd(el.getAttribute('data-original'));
    });
    // Regex sobre el HTML crudo (atrapa URLs en JSON embebido, onclick, etc)
    const htmlMatches = html.match(/(?:^|[\/"'=\s])(din\/recetas\/(?:fotos|chefs)\/[^\s"'<>)\\]+\.(?:jpg|jpeg|png|webp))/gi) || [];
    htmlMatches.forEach(m => {
      const clean = m.replace(/^[\/"'=\s]+/, '');
      checkAndAdd(clean);
    });
    // Foto principal = primera de /fotos/ (la #foto img ya está priorizada
    // al añadirse primero); fallback a primera /chefs/.
    out.foto = out.fotos.find(f => /\/fotos\//i.test(f)) || out.fotos[0] || '';

    // ── TÍTULO ─────────────────────────────────────────────────────
    const tituloEl = $('#titulo_receta');
    if(tituloEl){
      const t = clean(tituloEl.textContent);
      if(t && t.length < 200) out.nombre = t;  // override del urlInfo si existe
    }

    // ── TIEMPOS ────────────────────────────────────────────────────
    // ICNS los muestra como divs con "Tiempo total: 00:15h." y
    // "Elaboración: 00:15h." (con icono de reloj <i class="mdi-clock">).
    $$('div, span').forEach(el => {
      if(out.tiempoTotal && out.tiempoElaboracion) return;
      const t = clean(el.textContent);
      if(t.length > 80) return;
      if(!out.tiempoTotal){
        const m = t.match(/tiempo\s*total[:\s]+([\d:hmin\s.]+?)(?:\.|$)/i);
        if(m) out.tiempoTotal = m[1].trim().replace(/\.$/,'');
      }
      if(!out.tiempoElaboracion){
        const m = t.match(/elabor[a-zóáí]+[:\s]+([\d:hmin\s.]+?)(?:\.|$)/i);
        if(m) out.tiempoElaboracion = m[1].trim().replace(/\.$/,'');
      }
    });

    // ── RACIONES ───────────────────────────────────────────────────
    // ICNS: <span class="receta_num_personas">N:</span>
    const racEl = $('.receta_num_personas');
    if(racEl){
      const m = (racEl.textContent || '').match(/(\d+)/);
      if(m) out.raciones = +m[1];
    }
    if(out.raciones == null){
      // Fallback genérico
      $$('*').forEach(el => {
        if(out.raciones != null) return;
        const t = clean(el.textContent);
        if(t.length > 200) return;
        const m = t.match(/(\d+)\s*(raciones|comensales|porciones|persones|persona)/i);
        if(m) out.raciones = +m[1];
      });
    }

    // ── INGREDIENTES ───────────────────────────────────────────────
    // Header: <img src="img/lang/es/ingredientes.png"> en un div.
    // Los <li> siguientes son los ingredientes (en el div hermano o
    // descendiente).
    const ingCont = findContentAfterIcnsHeader(doc, 'lang/es/ingredientes.png');
    if(ingCont){
      ingCont.querySelectorAll('li').forEach(li => {
        const rawTxt = clean(li.textContent);
        if(!rawTxt || rawTxt.length >= 200) return;
        const cleaned = cleanIngredienteText(rawTxt);
        out.ingredientes.push({
          raw: rawTxt,
          cantidad: extractNumber(cleaned),
          unidad:   extractUnit(cleaned),
          nombre:   extractIngNombre(rawTxt)
        });
      });
    }
    // Fallback: cualquier lista con clase relacionada (por si ICNS cambia
    // el HTML en futuras recetas)
    if(!out.ingredientes.length){
      $$('[class*="ingredient"] li, .ingredientes li').forEach(li => {
        const rawTxt = clean(li.textContent);
        if(rawTxt && rawTxt.length < 200){
          const cleaned = cleanIngredienteText(rawTxt);
          out.ingredientes.push({
            raw: rawTxt,
            cantidad: extractNumber(cleaned),
            unidad:   extractUnit(cleaned),
            nombre:   extractIngNombre(rawTxt)
          });
        }
      });
    }

    // ── INSTRUCCIONES (Preparación) ────────────────────────────────
    // Header: <img src="img/lang/es/preparacion.png">
    // Las instrucciones están en el siguiente div, separadas por <br />.
    const instCont = findContentAfterIcnsHeader(doc, 'lang/es/preparacion.png');
    if(instCont){
      // Reemplaza <br> por \n para preservar separación de pasos
      const html2 = instCont.innerHTML.replace(/<br\s*\/?>/gi, '\n');
      const tmp = doc.createElement('div');
      tmp.innerHTML = html2;
      const txt = (tmp.textContent || '').trim();
      if(txt){
        // Divide por saltos de línea, mantén pasos significativos
        const pasos = txt.split(/\n+/)
          .map(s => s.trim())
          .map(s => s.replace(/^[-·•*]\s*/, ''))  // quita bullets
          .filter(s => s.length > 5);
        out.instrucciones = pasos;
      }
    }

    // ── COMENTARIOS ─────────────────────────────────────────────────
    const comCont = findContentAfterIcnsHeader(doc, 'lang/es/comentarios.png');
    if(comCont){
      const txt = clean(comCont.textContent);
      if(txt) out.comentarios = txt.slice(0, 800);
    }

    // ── TAGS ────────────────────────────────────────────────────────
    // Header: <img src="img/lang/es/hashtags.png"> seguido de divs con
    // class="tag_seleccionado_popup_receta" (con texto tipo "#Vegan").
    $$('.tag_seleccionado_popup_receta').forEach(el => {
      const txt = clean(el.textContent).replace(/^#/, '').trim();
      if(txt && txt.length > 1 && !out.tags.includes(txt)) out.tags.push(txt);
    });
    // Fallback: cualquier elemento con #word
    if(!out.tags.length){
      $$('.tag, .etiqueta, .badge, [class*="categoria"], [class*="tag"]').forEach(el => {
        const txt = clean(el.textContent);
        if(txt && txt.length < 40 && /^#/.test(txt)){
          const t = txt.replace(/^#/, '').trim();
          if(t.length > 1 && !out.tags.includes(t)) out.tags.push(t);
        }
      });
    }

    // ── AUTOR ───────────────────────────────────────────────────────
    // Header: <img src="img/lang/es/autor.png">
    // Nombre: <h3 class="box-title">...</h3> en el bloque siguiente.
    const autorCont = findContentAfterIcnsHeader(doc, 'lang/es/autor.png');
    if(autorCont){
      const h3 = autorCont.querySelector('h3, .box-title');
      if(h3){
        out.autor = clean(h3.textContent).slice(0, 100);
      } else {
        // Fallback: alt de la foto del chef
        const chefImg = autorCont.querySelector('img[src*="chefs/"]');
        if(chefImg) out.autor = chefImg.getAttribute('alt') || '';
      }
    }

    // ── MOMENTOS desde tags ────────────────────────────────────────
    out.momentos = tagsToMomentos(out.tags);

    return out;
  }

  // ── Fetch + parse de UNA receta ─────────────────────────────────
  async function scrapeOne(urlInfo){
    const res = await fetch(urlInfo.url, { credentials: 'include' });
    if(res.status === 204) throw new Error('HTTP 204 — sesión caducada');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    if(/url=.*login/i.test(html) && html.length < 500){
      throw new Error('Redirige a login — sesión caducada');
    }
    return parseRecipeHtml(html, urlInfo);
  }

  // ── Probar 1 (dumps el HTML + el parseo) ─────────────────────────
  const dumpHtmlBtn = document.getElementById('_icns-dump-html');
  document.getElementById('_icns-test-one').addEventListener('click', async () => {
    if(!urls.length) return;
    const u = urls[0];
    log(`Probando: ${u.nombre}`, 'info');
    try {
      const res = await fetch(u.url, { credentials: 'include' });
      log(`HTTP ${res.status}`, res.ok ? 'ok' : 'fail');
      if(!res.ok) return;
      const html = await res.text();
      log(`HTML recibido: ${html.length} chars`, 'info');
      const parsed = parseRecipeHtml(html, u);
      log(`Foto: ${parsed.foto ? '✓' : '✗'} · Ingr: ${parsed.ingredientes.length} · Instr: ${parsed.instrucciones.length}`, 'ok');
      window._icnsLastTest = { html, parsed, urlInfo: u };
      console.log('💡 Resultado completo en window._icnsLastTest', parsed);
      log('💾 HTML descargable con botón verde', 'info');
      dumpHtmlBtn.disabled = false;
    } catch(e){
      log('Error: ' + e.message, 'fail');
    }
  });

  // ── Botón "💾 HTML" descarga el HTML crudo del último Probar 1 ──
  // Útil para depurar selectores cuando algo no se parsea bien. Se
  // descarga como archivo .html que se puede inspeccionar offline.
  dumpHtmlBtn.addEventListener('click', () => {
    const test = window._icnsLastTest;
    if(!test || !test.html){
      log('Primero pulsa "🧪 Probar 1"', 'fail');
      return;
    }
    const blob = new Blob([test.html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `icns_html_${test.urlInfo?.id || 'receta'}.html`;
    a.click();
    log(`HTML descargado: icns_html_${test.urlInfo?.id || 'receta'}.html`, 'ok');
  });

  // ── Pipeline principal ─────────────────────────────────────────
  async function runPipeline(targetUrls){
    aborted = false; paused = false;
    document.getElementById('_icns-step1').style.display = 'none';
    document.getElementById('_icns-step2').style.display = '';
    document.getElementById('_icns-step3').style.display = 'none';

    CONCURRENCY = +(document.getElementById('_icns-conc').value) || 2;
    DELAY_MS    = +(document.getElementById('_icns-delay').value) || 300;
    const limit = +(document.getElementById('_icns-limit').value) || null;

    const todo = limit ? targetUrls.slice(0, limit) : targetUrls;
    let done = 0, fail = 0;
    const total = todo.length;
    log(`Comenzando: ${total} URLs (conc=${CONCURRENCY}, delay=${DELAY_MS}ms)`, 'info');

    // Workers: cada uno procesa secuencialmente; CONCURRENCY workers en paralelo
    const queue = todo.slice();
    const worker = async () => {
      while(queue.length && !aborted){
        while(paused) await new Promise(r => setTimeout(r, 200));
        const u = queue.shift();
        if(!u) break;
        document.getElementById('_icns-current').textContent = u.nombre.slice(0, 50);
        try {
          await new Promise(r => setTimeout(r, DELAY_MS));
          const data = await scrapeOne(u);
          const ix = results.findIndex(r => r.id === u.id);
          if(ix >= 0) results[ix] = data; else results.push(data);
          done++;
          if(done % 5 === 0) log(`✓ [${done}/${total}] ${u.nombre.slice(0,40)}`, 'ok');
        } catch(e){
          fail++;
          const ix = results.findIndex(r => r.id === u.id);
          const errEntry = { ...u, _error: e.message };
          if(ix >= 0) results[ix] = errEntry; else results.push(errEntry);
          log(`✗ [${u.id}] ${e.message}`, 'fail');
        }
        const pct = ((done + fail) / total * 100).toFixed(1);
        document.getElementById('_icns-progress-bar').style.width = pct + '%';
        document.getElementById('_icns-stats').textContent = `${done + fail} / ${total} · ✓${done} ✗${fail}`;
      }
    };
    const workers = Array.from({length: CONCURRENCY}, () => worker());
    await Promise.all(workers);

    document.getElementById('_icns-step2').style.display = 'none';
    document.getElementById('_icns-step3').style.display = '';
    document.getElementById('_icns-summary').innerHTML = `
      <div>Total procesado: ${results.length}</div>
      <div style="color:#3fb68b;">✓ Éxito: ${done}</div>
      <div style="color:#dc6a6a;">✗ Fallos: ${fail}</div>
      ${aborted ? '<div style="color:#e6c14d;">⚠ Detenido manualmente</div>' : ''}
    `;
    log(`Completado: ${done} éxito, ${fail} fallos`, fail > 0 ? '' : 'ok');
  }

  document.getElementById('_icns-start').addEventListener('click', () => {
    if(!urls.length) return;
    results = [];
    runPipeline(urls);
  });

  document.getElementById('_icns-pause').addEventListener('click', (e) => {
    paused = !paused;
    e.target.textContent = paused ? '▶ Reanudar' : '⏸ Pausa';
    log(paused ? 'Pausado' : 'Reanudando…', 'info');
  });

  document.getElementById('_icns-stop').addEventListener('click', () => {
    aborted = true;
    log('Detenido por el usuario', 'info');
  });

  document.getElementById('_icns-download').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `recetas-detalladas_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    log('JSON descargado ✓', 'ok');
  });

  document.getElementById('_icns-retry').addEventListener('click', () => {
    const fallos = results.filter(r => r._error).map(r => ({ id:r.id, nombre:r.nombre, url:r.url }));
    if(!fallos.length){ log('No hay fallos para reintentar', 'info'); return; }
    log(`Reintentando ${fallos.length} fallos…`, 'info');
    runPipeline(fallos);
  });

  document.getElementById('_icns-restart').addEventListener('click', () => {
    results = [];
    document.getElementById('_icns-step1').style.display = '';
    document.getElementById('_icns-step3').style.display = 'none';
    document.getElementById('_icns-progress-bar').style.width = '0%';
    log('Reiniciado', 'info');
  });

  document.getElementById('_icns-close').addEventListener('click', () => {
    if(confirm('¿Cerrar el panel? Si está corriendo se detendrá.')){
      aborted = true;
      panel.remove();
      style.remove();
      delete window._icnsScraperRunning;
    }
  });

  log('Scraper inicializado. Carga el JSON de URLs.', 'info');
  console.log('💡 Tip: window._icnsLastTest contiene el resultado del último "Probar 1" para inspeccionar manualmente los selectores.');
})();
