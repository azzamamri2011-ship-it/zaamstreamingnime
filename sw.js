/* ===========================
   ZAAMSTREAM V2 — sw.js
   Service Worker for PWA
   =========================== */

const CACHE_NAME = 'zaamstream-v2-cache-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ===========================
// INSTALL — cache static assets
// ===========================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[SW] Some assets failed to cache:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// ===========================
// ACTIVATE — clean old caches
// ===========================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ===========================
// FETCH — Network-first for API, Cache-first for static
// ===========================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip chrome-extension and other non-http
    if (!request.url.startsWith('http')) return;

    // API requests — Network first, fallback to offline message
    if (url.hostname.includes('sankavollerei.com')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Static assets — Cache first, fallback to network
    event.respondWith(cacheFirst(request));
});

// Cache-first strategy
async function cacheFirst(request) {
    try {
        const cached = await caches.match(request);
        if (cached) return cached;

        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        console.warn('[SW] Cache-first fetch failed:', err);
        return offlineFallback();
    }
}

// Network-first strategy
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        return networkResponse;
    } catch (err) {
        console.warn('[SW] Network-first fetch failed:', err);
        // Try cache for API if offline
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(
            JSON.stringify({ error: 'offline', message: 'Tidak ada koneksi internet.' }),
            { headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// Offline fallback page
function offlineFallback() {
    return new Response(
        `<!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>ZaamStream — Offline</title>
            <style>
                body {
                    margin: 0;
                    font-family: sans-serif;
                    background: #0b0c0f;
                    color: #fff;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    text-align: center;
                    padding: 20px;
                }
                .icon { font-size: 3rem; margin-bottom: 16px; }
                h1 { font-size: 1.3rem; margin-bottom: 8px; }
                p { color: #8b95a6; font-size: 0.9rem; }
                button {
                    margin-top: 20px;
                    padding: 12px 28px;
                    background: #ff3e3e;
                    border: none;
                    border-radius: 50px;
                    color: #fff;
                    font-size: 0.9rem;
                    font-weight: 700;
                    cursor: pointer;
                }
            </style>
        </head>
        <body>
            <div class="icon">📡</div>
            <h1>Kamu Sedang Offline</h1>
            <p>Periksa koneksi internet kamu<br>lalu coba lagi.</p>
            <button onclick="location.reload()">Coba Lagi</button>
        </body>
        </html>`,
        { headers: { 'Content-Type': 'text/html' } }
    );
}

// ===========================
// PUSH NOTIFICATIONS (future use)
// ===========================
self.addEventListener('push', (event) => {
    if (!event.data) return;
    const data = event.data.json();
    self.registration.showNotification(data.title || 'ZaamStream', {
        body: data.body || 'Ada update baru!',
        icon: './icons/icon-192.png',
        badge: './icons/icon-72.png',
        vibrate: [100, 50, 100]
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow('./'));
});
