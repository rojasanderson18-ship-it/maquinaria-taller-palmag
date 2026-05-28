const CACHE = 'flota-palma-v2';
const ASSETS = [
  '/maquinaria-taller-palmag/index.html',
  '/maquinaria-taller-palmag/preoperativo-palma.html',
  '/maquinaria-taller-palmag/taller-palma.html',
  '/maquinaria-taller-palmag/gerencia-palma.html',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap',
];

// Instalar — cachear archivos principales
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activar — limpiar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cola de envíos pendientes (cuando no hay internet)
const QUEUE_KEY = 'flota_queue';

async function saveQueue(queue) {
  const cache = await caches.open(CACHE);
  await cache.put('/__queue__', new Response(JSON.stringify(queue)));
}

async function processQueue() {
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

  // POST a Apps Script → encolar si no hay red
  if (e.request.method === 'POST' && url.hostname.includes('script.google.com')) {
    e.respondWith(
      e.request.clone().text().then(async body => {
        try {
          await fetch(e.request.clone(), { mode: 'no-cors' });
          return new Response(JSON.stringify({ ok: true, online: true }), { headers: { 'Content-Type': 'application/json' } });
        } catch {
          // Sin internet → encolar
          const cache = await caches.open(CACHE);
          const queueRes = await cache.match('/__queue__');
          const queue = JSON.parse(await queueRes?.text() || '[]');
          queue.push({ url: e.request.url, body, timestamp: Date.now() });
          await cache.put('/__queue__', new Response(JSON.stringify(queue)));
          return new Response(JSON.stringify({ ok: true, offline: true, encolado: queue.length }), { headers: { 'Content-Type': 'application/json' } });
        }
      })
    );
    return;
  }

  // GET → caché primero, luego red
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          caches.open(CACHE).then(cache => cache.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// Sincronizar cuando vuelve la conexión
self.addEventListener('sync', e => {
  if (e.tag === 'sync-preops') e.waitUntil(processQueue());
});

// Sincronizar periódicamente (cada vez que se activa)
self.addEventListener('message', e => {
  if (e.data?.type === 'SYNC_NOW') processQueue();
});
