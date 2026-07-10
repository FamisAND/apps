/**
 * service-worker.js
 *
 * Estrategia:
 *   - Pre-cachea HTMLs, CSS y JS estáticos en la instalación.
 *   - Para HTML/CSS/JS propios: red primero, caché si no hay conexión.
 *   - Para otros recursos propios: caché primero con actualización en segundo plano.
 *   - Para llamadas externas (api.github.com, fonts.googleapis.com,
 *     CDNs de Chart.js, OpenRouter, Groq, Gemini): NUNCA cachear, dejar
 *     que vayan a red directo. Los datos son privados / dinámicos.
 *
 * Versión:
 *   - Subir CACHE_VERSION cuando se quiera invalidar la caché vieja.
 *   - El SW se actualiza en cuanto detecta una versión nueva (skipWaiting
 *     + clients.claim) — sin requerir cerrar todas las pestañas.
 *
 * Cómo desactivar (en navegador):
 *   - DevTools → Application → Service Workers → Unregister
 *   - O en consola:
 *       navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
 *       caches.keys().then(ks => ks.forEach(k => caches.delete(k)))
 *     y recargar.
 */

const CACHE_VERSION = 'mis-dashboards-v224';

// Recursos que se pre-cachean en install.
// Rutas RELATIVAS al scope del SW (que es el directorio donde vive este archivo).
const PRECACHE_URLS = [
  './',
  './index.html',
  './patrimonio.html',
  './full_training.html',
  './options.html',
  './facturas.html',
  './consulta.html',
  './index.css',
  './patrimonio.css',
  './full_training.css',
  './options.css',
  './facturas.css',
  './consulta.css',
  './design-system.css',
  './index.js',
  './facturas.js',
  './consulta.js',
  './dashboard-auth.js',
  './github-sync.js',
  './utils.js',
  './manifest.json',
];

// Hosts externos que NO se cachean (datos dinámicos o llamadas a APIs).
const NO_CACHE_HOSTS = [
  'api.github.com',
  'raw.githubusercontent.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'api.groq.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'api.anthropic.com',
  'finnhub.io',
  'api.frankfurter.app',
  'api.coingecko.com',
  'api.open-meteo.com',
  'www.alphavantage.co',
  'api.twelvedata.com',
];

const NETWORK_FIRST_EXTENSIONS = ['.html', '.js', '.css', '.json'];

function shouldNetworkFirst(req, url) {
  if (req.mode === 'navigate') return true;
  return NETWORK_FIRST_EXTENSIONS.some(ext => url.pathname.endsWith(ext));
}

function putCache(req, response) {
  if (response && response.ok && response.type === 'basic') {
    const clone = response.clone();
    caches.open(CACHE_VERSION).then(cache => cache.put(req, clone));
  }
  return response;
}

// ─── INSTALL ───────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // addAll falla si UN solo archivo no se puede descargar.
      // Usamos add individuales con catch para que no rompa toda la
      // instalación si, por ejemplo, manifest.json aún no se ha desplegado.
      return Promise.all(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] No pude pre-cachear', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: limpiar cachés viejas ───────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;

  // Solo nos interesan GETs.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Hosts externos: ir directo a red (no cachear).
  if (NO_CACHE_HOSTS.some(host => url.hostname.endsWith(host))) {
    return;  // dejar que el navegador maneje normal
  }

  // Solo cachear nuestro propio origen.
  if (url.origin !== self.location.origin) return;

  // HTML/CSS/JS: red primero para evitar que el dashboard muestre versiones viejas.
  if (shouldNetworkFirst(req, url)) {
    event.respondWith(
      fetch(req)
        .then(response => putCache(req, response))
        .catch(() => caches.match(req))
    );
    return;
  }

  // Resto de recursos propios: caché primero y actualización en segundo plano.
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(response => {
        return putCache(req, response);
      }).catch(() => cached); // si red falla, devolver caché si la hay

      return cached || fetchPromise;
    })
  );
});

// ─── MENSAJE: permitir que la página fuerce skip-waiting ─────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
