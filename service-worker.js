// ============================================================
// SERVICE WORKER - Fenix Handball Stats PWA
// Strategie : Network First (en ligne d'abord, sinon cache)
// ============================================================

const CACHE_NAME = 'fenix-stats-v2';

// Fichiers essentiels a cacher au premier chargement
const ESSENTIAL_FILES = [
  '/',
  '/index.html',
  '/data.js',
  '/photos-index.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/ITC%20Avant%20Garde%20Gothic%20Bold%20(1).otf',
  // Libraries externes
  'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
];

// -------------------------------------------------------
// INSTALL : Pre-cache les fichiers essentiels
// -------------------------------------------------------
self.addEventListener('install', (event) => {
  console.log('[SW] Install - cache', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ESSENTIAL_FILES).catch((err) => {
        console.warn('[SW] Certains fichiers non caches :', err);
        // Cache ce qu'on peut, ne bloque pas l'install
        return Promise.all(
          ESSENTIAL_FILES.map((url) =>
            cache.add(url).catch(() => console.warn('[SW] Skip:', url))
          )
        );
      });
    })
  );
  // Activer immediatement sans attendre les anciens onglets
  self.skipWaiting();
});

// -------------------------------------------------------
// ACTIVATE : Nettoie les anciens caches
// -------------------------------------------------------
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate - nettoyage anciens caches');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Suppression ancien cache :', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Prendre le controle de tous les onglets immediatement
  self.clients.claim();
});

// -------------------------------------------------------
// FETCH : Network First (essaie en ligne, sinon cache)
// -------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Ignorer les requetes non-GET (POST, etc.)
  if (request.method !== 'GET') return;

  // Ignorer les requetes chrome-extension, etc.
  if (!request.url.startsWith('http')) return;

  event.respondWith(
    // 1) Essayer le reseau d'abord
    fetch(request)
      .then((networkResponse) => {
        // Si reponse valide, la mettre en cache
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // 2) Reseau echoue → chercher dans le cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] Depuis cache :', request.url);
            return cachedResponse;
          }

          // 3) Pas en cache non plus → page hors-ligne pour les navigations
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }

          // 4) Rien du tout → erreur reseau standard
          return new Response('Hors ligne', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

// -------------------------------------------------------
// MESSAGE : Forcer la mise a jour depuis la page
// -------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
