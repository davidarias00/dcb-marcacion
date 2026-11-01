// Service worker: deja abrir la marcación y la pantalla de campo sin señal.
// Red primero (con tiempo límite) y, si no hay red, lo último guardado.
// Solo toca GET del mismo sitio y de cdn.jsdelivr.net; nunca las llamadas a Supabase.

const CACHE = 'dcb-portal-v2';
const PRECARGA = [
  './', './config.js', './css/portal.css',
  './lib/navegador.js', './lib/marcacion.js', './lib/imagen.js', './lib/ids.js', './lib/fechas.js',
  './lib/cola.js', './lib/api.js', './lib/demo.js', './lib/dom.js', './lib/validacion.js', './lib/supabase.js',
  './m/', './m/marcar.js', './m/camara.js', './m/gps.js',
  './campo/', './campo/campo.js',
];
const ESPERA_RED_MS = 5000;

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PRECARGA.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(url) {
  return url.origin === self.location.origin || url.hostname === 'cdn.jsdelivr.net';
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!cacheable(url)) return;
  const navegacion = req.mode === 'navigate';
  ev.respondWith(redPrimero(req, navegacion));
});

async function redPrimero(req, navegacion) {
  const cache = await caches.open(CACHE);
  const red = fetch(req).then((r) => {
    if (r && r.ok) cache.put(req, r.clone()).catch(() => {});
    return r;
  });
  const limite = new Promise((resolve) => setTimeout(() => resolve(null), ESPERA_RED_MS));
  try {
    const r = await Promise.race([red, limite]);
    if (r) return r;
  } catch { /* sin red */ }
  // La navegación a /m/?q=... sirve la copia de /m/ (el QR se lee de la URL real).
  const guardado = await cache.match(req, { ignoreSearch: navegacion });
  if (guardado) return guardado;
  return red.catch(() => new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
}
