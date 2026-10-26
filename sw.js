const CACHE = 'flota-palma-v1';
const ASSETS = [
  '/maquinaria-taller-palmag/preoperativo-palma.html',
  '/maquinaria-taller-palmag/taller-palma.html',
  '/maquinaria-taller-palmag/programacion-palma.html',
  '/maquinaria-taller-palmag/maestros.js',
  '/maquinaria-taller-palmag/manifest-programacion.json',
  '/maquinaria-taller-palmag/icons/programacion-192.png',
  '/maquinaria-taller-palmag/manifest-preoperativo.json',
  '/maquinaria-taller-palmag/icons/preoperativo-192.png',
  '/maquinaria-taller-palmag/gerencia-palma.html',
  '/maquinaria-taller-palmag/manifest-taller.json',
  '/maquinaria-taller-palmag/manifest-gerencia.json',
  '/maquinaria-taller-palmag/icons/taller-192.png',
  '/maquinaria-taller-palmag/icons/gerencia-192.png',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap',
];

// Instalar — cachear archivos principales
self.addEventListener('install', e => {
  e.waitUntil(
    // uno por uno: si falla uno (p. ej. la fuente), igual se instala la versión nueva
    caches.open(CACHE).then(cache => Promise.all(ASSETS.map(a => cache.add(a).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

// Activar — limpiar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(limpiarLecturas).then(() => self.clients.claim())
  );
});

// Las versiones anteriores guardaban cada lectura de la hoja de cálculo:
// no sirven (cada una lleva una marca de tiempo distinta) y llenan el celular.
async function limpiarLecturas() {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.filter(r => esGoogle(new URL(r.url))).map(r => cache.delete(r)));
}
function esGoogle(url) {
  return url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com');
}

// Cola de envíos pendientes (cuando no hay internet)
const QUEUE_KEY = 'flota_queue';

async function getQueue() {
  const clients = await self.clients.matchAll();
  return JSON.parse((await (await caches.open(CACHE)).match('/__queue__'))?.text() || '[]');
}

async function saveQueue(queue) {
  const cache = await caches.open(CACHE);
  await cache.put('/__queue__', new Response(JSON.stringify(queue)));
}

/* Cola de la versión anterior del Preoperativo. Las páginas actuales tienen
   su propia cola (y confirman en la hoja), así que aquí solo se termina de
   enviar lo que quedó guardado de antes. Un envío a la vez: si dos páginas
   piden SYNC_NOW juntas, no se manda dos veces lo mismo. */
let procesando = null;
function processQueue() {
  if (!procesando) procesando = vaciarCola().finally(() => { procesando = null; });
  return procesando;
}
async function vaciarCola() {
  const cache = await caches.open(CACHE);
  const queueRes = await cache.match('/__queue__');
  const queue = JSON.parse(await queueRes?.text() || '[]');
  if (!queue.length) return;

  const pending = [];
  for (const item of queue) {
    try {
      await fetch(item.url, { method: 'POST', mode: 'no-cors', body: item.body });
    } catch {
      pending.push(item); // sigue pendiente
    }
  }
  await cache.put('/__queue__', new Response(JSON.stringify(pending)));

  // Notificar a los clientes
  const clients = await self.clients.matchAll();
  clients.forEach(c => c.postMessage({
    type: 'SYNC_DONE',
    enviados: queue.length - pending.length,
    pendientes: pending.length
  }));
}

// Fetch — red o caché
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Los envíos (POST) no se tocan: cada página los guarda en su propia cola
  // y los da por enviados solo si salieron. Antes el service worker también
  // los guardaba y le decía a la página "enviado": quedaban en dos colas y
  // podían llegar dos veces a la hoja.
  if (e.request.method !== 'GET') return;

  // Lecturas de la hoja de cálculo: siempre de la red, nunca de la caché
  // (cada página avisa cuando no las puede leer).
  if (esGoogle(url)) return;

  // Páginas y archivos propios → primero la red, para que todos vean la
  // última versión apenas se publica; sin señal (o si tarda más de 4 s), la
  // copia guardada.
  if (url.origin === self.location.origin) {
    e.respondWith(redPrimero(e.request));
    return;
  }

  // Fuentes y demás → caché primero
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); }
      return res;
    }))
  );
});

async function redPrimero(req) {
  const cache = await caches.open(CACHE);
  const red = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  red.catch(() => null);   // si falla después de usar la copia guardada, no es un error
  const espera = new Promise(r => setTimeout(r, 4000, null));
  try {
    const res = await Promise.race([red, espera]);
    if (res) return res;
  } catch (err) { /* sin señal */ }
  const guardada = await cache.match(req, { ignoreSearch: true });
  if (guardada) return guardada;
  return red;   // nunca se guardó: esperar a la red
}

// Sincronizar cuando vuelve la conexión
self.addEventListener('sync', e => {
  if (e.tag === 'sync-preops') e.waitUntil(processQueue());
});

// Sincronizar periódicamente (cada vez que se activa)
self.addEventListener('message', e => {
  if (e.data?.type === 'SYNC_NOW') processQueue();
});
