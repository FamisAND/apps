#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ICNS RECIPES SCRAPER
// ─────────────────────────────────────────────────────────────────────────────
// Lee una lista de URLs de recetas de ICNS (formato del export del usuario:
// [{ id, nombre, url }, ...]) y para cada una:
//   1. Hace fetch autenticado con la cookie de sesión
//   2. Parsea el HTML con cheerio
//   3. Extrae: foto, ingredientes (nombre+cantidad+unidad), instrucciones,
//      tiempo total/elaboración, raciones, comentarios, autor, tags
//   4. Guarda incrementalmente en output/recetas-detalladas.json
//
// Cómo usar (desde la carpeta scripts/icns-scraper):
//   1. npm install
//   2. Obtén tu cookie de sesión de ICNS:
//      a) Abre https://icns.software y haz login
//      b) F12 → Network → recarga la página
//      c) Click cualquier request → Headers → "Cookie:" → copia TODO el valor
//   3. Pega la cookie en .icns-cookie.txt (un único archivo, todo en una línea)
//   4. Pon el JSON de URLs en input/urls.json (o pasa --urls=path)
//   5. npm start
//
// Opciones (env vars o flags):
//   COOKIE=...                        cookie de sesión (alternativa al archivo)
//   ICNS_BASE=https://icns.software   base URL (por defecto)
//   CONCURRENCY=2                     peticiones en paralelo (default 2; sé amable)
//   DELAY_MS=300                      delay entre requests por worker (default 300ms)
//   LIMIT=N                           solo procesar las primeras N URLs
//   --urls=path                       ruta al JSON de URLs
//   --out=path                        ruta al JSON de salida
//   --resume                          omite recetas ya extraídas con éxito
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuración ────────────────────────────────────────────────────────────
const ICNS_BASE   = process.env.ICNS_BASE  || 'https://icns.software';
const CONCURRENCY = +(process.env.CONCURRENCY || 2);
const DELAY_MS    = +(process.env.DELAY_MS   || 300);
const LIMIT       = process.env.LIMIT ? +process.env.LIMIT : null;

const argv = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const eq = a.indexOf('=');
      return eq === -1 ? [a.slice(2), true] : [a.slice(2, eq), a.slice(eq + 1)];
    })
);

const URLS_PATH = argv.urls || path.join(__dirname, 'input', 'urls.json');
const OUT_PATH  = argv.out  || path.join(__dirname, 'output', 'recetas-detalladas.json');
const RESUME    = !!argv.resume;
const COOKIE_FILE = path.join(__dirname, '.icns-cookie.txt');

// ── Cookie de sesión ─────────────────────────────────────────────────────────
function loadCookie(){
  if(process.env.COOKIE) return process.env.COOKIE.trim();
  if(fs.existsSync(COOKIE_FILE)){
    return fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
  }
  return null;
}

const COOKIE = loadCookie();
if(!COOKIE){
  console.error('❌ No hay cookie de sesión.\n');
  console.error('   Crea .icns-cookie.txt con tu cookie de ICNS, o exporta COOKIE=...');
  console.error('   Cómo obtenerla: F12 → Network → request → Headers → "Cookie:" → copia.\n');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function ensureDir(p){
  const dir = path.dirname(p);
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(p, fallback){
  if(!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch(e){ console.warn(`⚠ JSON inválido en ${p}, usando fallback`); return fallback; }
}

function saveJson(p, data){
  ensureDir(p);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// Devuelve texto limpio (collapsed whitespace).
function clean(s){
  return (s || '').replace(/\s+/g, ' ').trim();
}

// Intenta encontrar un número en una string ("250 g", "2 cucharadas") → 250 / 2.
function extractNumber(s){
  const m = (s || '').match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

function extractUnit(s){
  const m = (s || '').match(/\d+(?:[.,]\d+)?\s*([a-záéíóúñ]+)/i);
  return m ? m[1].toLowerCase() : '';
}

// ── Fetch HTML autenticado ───────────────────────────────────────────────────
async function fetchRecipeHtml(url){
  const res = await fetch(url, {
    headers: {
      'Cookie': COOKIE,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
      'Accept-Language': 'es-ES,es;q=0.9,ca;q=0.8,en;q=0.7'
    },
    redirect: 'follow'
  });
  if(res.status === 204){
    throw new Error('HTTP 204: cookie inválida o sesión expirada');
  }
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // Si el server devolvió la página de login (redirect implícito), detectarlo
  if(/url=.*login/i.test(text) && text.length < 500){
    throw new Error('Sesión caducada — redirige a login. Renueva la cookie.');
  }
  return text;
}

// ── Parseo del HTML ──────────────────────────────────────────────────────────
// NOTA: los selectores exactos dependen del HTML que devuelva ICNS para una
// receta logueada. La estrategia aquí es agnóstica: probamos múltiples
// patrones comunes y guardamos lo que encontremos.
function parseRecipeHtml(html, urlInfo){
  const $ = cheerio.load(html);

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

  // Foto principal — probamos varios selectores
  const imgCandidates = [
    'img.receta-foto',
    '.receta-imagen img',
    '.foto-receta img',
    'meta[property="og:image"]',
    'img[src*="receta"]',
    'img[src*="upload"]'
  ];
  for(const sel of imgCandidates){
    const el = $(sel).first();
    if(el.length){
      const src = el.attr('content') || el.attr('src') || '';
      if(src && !out.foto){
        out.foto = src.startsWith('http') ? src : (ICNS_BASE + (src.startsWith('/') ? '' : '/') + src);
        break;
      }
    }
  }

  // Todas las fotos (galería)
  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    if(src.includes('receta') || src.includes('upload')){
      const full = src.startsWith('http') ? src : (ICNS_BASE + (src.startsWith('/') ? '' : '/') + src);
      if(!out.fotos.includes(full)) out.fotos.push(full);
    }
  });

  // Raciones — buscar texto "raciones" o "comensales"
  $('*').each((_, el) => {
    const t = clean($(el).text());
    if(/(\d+)\s*(raciones|comensales|porciones)/i.test(t) && !out.raciones){
      const m = t.match(/(\d+)\s*(raciones|comensales|porciones)/i);
      out.raciones = +m[1];
    }
  });

  // Tiempos
  $('*').each((_, el) => {
    const t = clean($(el).text());
    if(!out.tiempoTotal && /tiempo\s*total/i.test(t)){
      out.tiempoTotal = t.replace(/.*tiempo\s*total[:\s]*/i, '').slice(0, 40).trim();
    }
    if(!out.tiempoElaboracion && /tiempo\s*elabor/i.test(t)){
      out.tiempoElaboracion = t.replace(/.*tiempo\s*elabor[a-zóáí]*[:\s]*/i, '').slice(0, 40).trim();
    }
  });

  // Ingredientes — buscar listas dentro de secciones que mencionen "ingredient"
  const ingSection = $('h1, h2, h3, h4, .titulo, .section-title')
    .filter((_, el) => /ingredient/i.test($(el).text()))
    .first();
  if(ingSection.length){
    let next = ingSection.next();
    let safety = 0;
    while(next.length && safety < 10){
      const items = next.find('li');
      if(items.length){
        items.each((_, li) => {
          const txt = clean($(li).text());
          if(txt){
            out.ingredientes.push({
              raw: txt,
              cantidad: extractNumber(txt),
              unidad:   extractUnit(txt),
              nombre:   txt.replace(/^\d+(?:[.,]\d+)?\s*[a-záéíóúñ]*\s*(de\s*)?/i, '').trim()
            });
          }
        });
        break;
      }
      next = next.next();
      safety++;
    }
  }

  // Fallback ingredientes: cualquier lista en la página
  if(!out.ingredientes.length){
    $('.ingredientes li, .ingrediente, [class*="ingredient"] li').each((_, el) => {
      const txt = clean($(el).text());
      if(txt && txt.length < 200){
        out.ingredientes.push({
          raw: txt,
          cantidad: extractNumber(txt),
          unidad:   extractUnit(txt),
          nombre:   txt.replace(/^\d+(?:[.,]\d+)?\s*[a-záéíóúñ]*\s*(de\s*)?/i, '').trim()
        });
      }
    });
  }

  // Instrucciones — sección que mencione "elaboración", "preparación", "pasos"
  const instSection = $('h1, h2, h3, h4, .titulo, .section-title')
    .filter((_, el) => /elabora|prepara|pasos|instruc/i.test($(el).text()))
    .first();
  if(instSection.length){
    let next = instSection.next();
    let safety = 0;
    while(next.length && safety < 10){
      const items = next.find('li, p');
      if(items.length){
        items.each((_, li) => {
          const txt = clean($(li).text());
          if(txt && txt.length > 10) out.instrucciones.push(txt);
        });
        if(out.instrucciones.length) break;
      }
      next = next.next();
      safety++;
    }
  }

  // Autor / comentarios
  const autorEl = $('[class*="autor"], [class*="author"]').first();
  if(autorEl.length) out.autor = clean(autorEl.text()).slice(0, 100);

  const comentEl = $('[class*="coment"], .nota, .observ').first();
  if(comentEl.length) out.comentarios = clean(comentEl.text()).slice(0, 500);

  // Tags adicionales (categorías visibles)
  $('.tag, .etiqueta, .badge, [class*="categoria"]').each((_, el) => {
    const txt = clean($(el).text());
    if(txt && txt.length < 30 && !out.tags.includes(txt)) out.tags.push(txt);
  });

  return out;
}

// ── Pipeline ─────────────────────────────────────────────────────────────────
async function main(){
  console.log('🍳 ICNS Recipes Scraper');
  console.log('   Cookie:', COOKIE ? `${COOKIE.length} chars ✓` : '✗');
  console.log('   Concurrencia:', CONCURRENCY, '· Delay:', DELAY_MS, 'ms');

  const urls = readJson(URLS_PATH, null);
  if(!urls || !Array.isArray(urls)){
    console.error(`❌ No se pudo leer la lista de URLs en ${URLS_PATH}`);
    console.error('   Pasa --urls=ruta/a/recetas_urls.json o copia el archivo a input/urls.json');
    process.exit(1);
  }
  const todo = LIMIT ? urls.slice(0, LIMIT) : urls;
  console.log(`   Total URLs: ${todo.length}${LIMIT ? ` (limit=${LIMIT})` : ''}`);

  // Cargar resultado previo si existe (para resume)
  const existing = readJson(OUT_PATH, []);
  const doneIds = new Set(existing.filter(r => r.url && (r.ingredientes?.length || r.instrucciones?.length)).map(r => r.id));
  if(RESUME && doneIds.size){
    console.log(`   Resume: ${doneIds.size} recetas ya extraídas, se omiten.`);
  }

  const results = [...existing];
  const limit = pLimit(CONCURRENCY);
  let done = 0, fail = 0;

  const tasks = todo.map(urlInfo => limit(async () => {
    if(RESUME && doneIds.has(urlInfo.id)) return;
    try {
      await sleep(DELAY_MS);
      const html = await fetchRecipeHtml(urlInfo.url);
      const data = parseRecipeHtml(html, urlInfo);
      // Reemplaza si ya existía con mismo id, sino añade
      const ix = results.findIndex(r => r.id === urlInfo.id);
      if(ix >= 0) results[ix] = data;
      else results.push(data);
      done++;
      if(done % 10 === 0 || done === 1){
        saveJson(OUT_PATH, results);
        console.log(`   ✓ [${done}/${todo.length}] ${urlInfo.nombre.slice(0,50)}`);
      }
    } catch(e){
      fail++;
      console.warn(`   ✗ [${urlInfo.id}] ${urlInfo.nombre.slice(0,50)} — ${e.message}`);
      const ix = results.findIndex(r => r.id === urlInfo.id);
      const errEntry = { ...urlInfo, _error: e.message };
      if(ix >= 0) results[ix] = errEntry;
      else results.push(errEntry);
    }
  }));

  await Promise.all(tasks);

  saveJson(OUT_PATH, results);
  console.log(`\n✓ Done. Éxito: ${done}, fallos: ${fail}, total escrito: ${results.length}`);
  console.log(`   Resultado en: ${OUT_PATH}`);
  console.log('\nSi muchos fallan con "HTTP 204" o "Sesión caducada", renueva la cookie.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
