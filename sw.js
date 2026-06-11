const CACHE_NAME = 'isro-netra-v1';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './styles/main.css',
  './styles/hud.css',
  './src/main.js',
  './src/core/state.js',
  './src/core/audio.js',
  './src/core/propagator.js',
  './src/core/avoidance-proof.js',
  './src/core/subsystem-safety-proof.js',
  './src/core/knowledge-graph.js',
  './src/data/tle-db.js',
  './src/components/orbit-viewer.js',
  './src/components/space-weather.js',
  './src/components/telemetry-terminal.js',
  './src/components/agent-console.js',
  './src/components/collision-monitor.js',
  './src/components/ground-track.js',
  './src/components/telemetry-charts.js',
  './src/components/root-cause-analyzer.js',
  './src/components/integration-manager.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/satellite.js/4.0.0/satellite.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/lucide@latest'
];

// Install Event: cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache first, fallback to network
self.addEventListener('fetch', (event) => {
  // Only cache GET requests and skip websocket or API updates
  if (event.request.method !== 'GET' || event.request.url.includes('/api/') || event.request.url.includes('/ws/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then((networkResponse) => {
        // Cache dynamic fetches for static assets (like custom fonts)
        if (networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cacheCopy);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for offline map images if cached
        return new Response('Offline connection active.', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
