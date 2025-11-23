/**
 * SHAC Player Service Worker
 * Enables offline functionality and caching
 */

const CACHE_NAME = 'shac-player-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/js/app.js',
  '/js/controls.js',
  '/js/file-loader.js',
  '/js/movement-presets.js',
  '/js/pako.min.js',
  '/js/shac-decoder.js',
  '/js/spatial-audio.js',
  '/js/visualizer.js',
  '/js/zus-loader.js',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

// Install event - cache all required files
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[ServiceWorker] Skip waiting');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[ServiceWorker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          console.log('[ServiceWorker] Serving from cache:', event.request.url);
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Cache the fetched response for future use
          caches.open(CACHE_NAME)
            .then(cache => {
              // Don't cache external resources or API calls
              const url = new URL(event.request.url);
              if (url.origin === location.origin) {
                cache.put(event.request, responseToCache);
              }
            });

          return response;
        }).catch(() => {
          // Offline fallback
          console.log('[ServiceWorker] Offline - no cached version available');
          // Could return a custom offline page here
        });
      })
  );
});

// Handle messages from the app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Skip waiting on message');
    self.skipWaiting();
  }
});

// Background sync for future features
self.addEventListener('sync', event => {
  if (event.tag === 'sync-shac-files') {
    console.log('[ServiceWorker] Background sync triggered');
    // Could implement file syncing here
  }
});