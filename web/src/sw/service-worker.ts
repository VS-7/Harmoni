/// <reference lib="webworker" />
// Service worker do PWA (RF5.1). Compilado por `npm run build:sw` para dist/service-worker.js,
// na raiz do escopo, porque um SW só controla o diretório onde é servido.
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'harmoni-static-v2';

/** O shell mínimo para abrir o app offline. */
const STATIC_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  void self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // A API e o streaming de áudio nunca passam pelo cache estático: o áudio offline
  // vive no IndexedDB (Guardrail 6) e as respostas da API precisam ser atuais.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/rest/')) {
    return;
  }

  // Navegação: rede primeiro, para que um deploy novo apareça sem limpar cache.
  // O SPA usa rotas reais (/album/:id), então o fallback é sempre o index.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) ?? Response.error()),
    );
    return;
  }

  // Assets: cache primeiro, já que o Vite versiona o nome de cada arquivo.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});

export {};
