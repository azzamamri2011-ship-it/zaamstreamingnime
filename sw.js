// ============================================================
//  ZuPortal Service Worker  v1.0.0
//  Strategi: Cache-First untuk aset statis,
//            Network-First untuk halaman HTML,
//            Offline fallback jika tidak ada koneksi.
// ============================================================

const APP_VERSION   = 'v1.0.0';
const CACHE_STATIC  = `zuportal-static-${APP_VERSION}`;
const CACHE_DYNAMIC = `zuportal-dynamic-${APP_VERSION}`;
const CACHE_IMAGES  = `zuportal-images-${APP_VERSION}`;

// ── Aset yang langsung di-cache saat install ─────────────────
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/Komiku/komiku.html',
  '/Anime/zaamnime.html',
  '/manifest.json',
  '/komiku.jpg',
  '/zaamnime.jpg',
  // Font Awesome (CDN)
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  // Google Fonts
  'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap'
];

// ── Halaman offline fallback ─────────────────────────────────
const OFFLINE_PAGE = '/offline.html';

// ── Batas ukuran cache dinamis ───────────────────────────────
const DYNAMIC_CACHE_LIMIT = 50;
const IMAGE_CACHE_LIMIT   = 30;

// ============================================================
//  INSTALL  – Pre-cache aset statis
// ============================================================
self.addEventListener('install', event => {
  console.log(`[SW] Install ${APP_VERSION}`);

  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] Pre-caching static assets…');
      // addAll akan gagal total jika salah satu URL error,
      // jadi kita fetch satu per satu agar lebih aman
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] Gagal cache: ${url}`, err)
          )
        )
      );
    })
    .then(() => self.skipWaiting()) // langsung aktif tanpa tunggu tab lama tutup
  );
});

// ============================================================
//  ACTIVATE  – Hapus cache lama
// ============================================================
self.addEventListener('activate', event => {
  console.log(`[SW] Activate ${APP_VERSION}`);

  const allowedCaches = [CACHE_STATIC, CACHE_DYNAMIC, CACHE_IMAGES];

  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (!allowedCaches.includes(key)) {
            console.log('[SW] Hapus cache lama:', key);
            return caches.delete(key);
          }
        })
      )
    )
    .then(() => self.clients.claim()) // ambil alih semua tab yang terbuka
  );
});

// ============================================================
//  FETCH  – Intercept semua permintaan jaringan
// ============================================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Abaikan permintaan non-GET & chrome-extension
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // ── 1. Gambar → Cache-First + batas ukuran ───────────────
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, CACHE_IMAGES, IMAGE_CACHE_LIMIT));
    return;
  }

  // ── 2. Aset statis (JS/CSS/Font/Manifest) → Cache-First ──
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // ── 3. Navigasi HTML → Network-First + offline fallback ──
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // ── 4. Sisanya → Stale-While-Revalidate ──────────────────
  event.respondWith(staleWhileRevalidate(request));
});

// ============================================================
//  STRATEGI CACHING
// ============================================================

// Cache-First: cek cache dulu, fetch jika tidak ada
async function cacheFirst(request, cacheName, limit = null) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      if (limit) await trimCache(cacheName, limit);
    }
    return response;
  } catch {
    return new Response('Aset tidak tersedia offline.', { status: 503 });
  }
}

// Network-First: coba network, fallback ke cache, lalu offline page
async function networkFirstWithFallback(request) {
  const cache = await caches.open(CACHE_DYNAMIC);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Cek cache statis
    const staticCached = await caches.match(request);
    if (staticCached) return staticCached;

    // Kirim offline page
    const offlinePage = await caches.match(OFFLINE_PAGE);
    return offlinePage || new Response(offlineHTML(), {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// Stale-While-Revalidate: tampil cache langsung, update di background
async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_DYNAMIC);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
      trimCache(CACHE_DYNAMIC, DYNAMIC_CACHE_LIMIT);
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// ============================================================
//  UTILITAS
// ============================================================

// Cek apakah URL termasuk aset statis
function isStaticAsset(url) {
  return (
    url.pathname.match(/\.(css|js|woff2?|ttf|otf|json)$/i) ||
    url.host.includes('fonts.googleapis.com') ||
    url.host.includes('fonts.gstatic.com') ||
    url.host.includes('cdnjs.cloudflare.com')
  );
}

// Batasi jumlah entry dalam cache
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length > maxItems) {
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map(key => cache.delete(key)));
    console.log(`[SW] Trim ${cacheName}: hapus ${toDelete.length} item`);
  }
}

// HTML inline untuk offline fallback (jika offline.html tidak ada)
function offlineHTML() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Offline – ZuPortal</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#07070f;color:#eeeef5;font-family:system-ui,sans-serif;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      min-height:100vh;text-align:center;padding:24px}
    .icon{font-size:4rem;margin-bottom:20px;opacity:.6}
    h1{font-size:1.5rem;font-weight:700;margin-bottom:10px}
    p{font-size:.9rem;color:rgba(238,238,245,.55);line-height:1.6;max-width:300px;margin-bottom:28px}
    button{background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;
      padding:12px 28px;border-radius:50px;font-size:.9rem;cursor:pointer}
  </style>
</head>
<body>
  <div class="icon">📡</div>
  <h1>Kamu sedang Offline</h1>
  <p>Periksa koneksi internetmu, lalu coba lagi. Halaman yang sudah pernah dibuka tetap tersedia secara offline.</p>
  <button onclick="location.reload()">Coba Lagi</button>
</body>
</html>`;
}

// ============================================================
//  PUSH NOTIFICATION  – Terima notifikasi dari server
// ============================================================
self.addEventListener('push', event => {
  let data = { title: 'ZuPortal', body: 'Ada konten baru untukmu!', icon: '/icons/icon-192x192.png' };

  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon || '/icons/icon-192x192.png',
      badge:   '/icons/icon-96x96.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/' },
      actions: [
        { action: 'open',    title: 'Buka'   },
        { action: 'dismiss', title: 'Tutup'  }
      ]
    })
  );
});

// ── Klik notifikasi ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ============================================================
//  BACKGROUND SYNC  – Sinkronisasi saat kembali online
// ============================================================
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-content') {
    event.waitUntil(syncContent());
  }
});

async function syncContent() {
  console.log('[SW] Menyinkronkan konten terbaru…');
  try {
    // Refresh cache halaman utama
    const cache = await caches.open(CACHE_DYNAMIC);
    const pages = ['/', '/index.html', '/komiku.html', '/zaamnime.html'];
    await Promise.allSettled(
      pages.map(async page => {
        const response = await fetch(page);
        if (response.ok) await cache.put(page, response);
      })
    );
    console.log('[SW] Sinkronisasi selesai');
  } catch (err) {
    console.warn('[SW] Sinkronisasi gagal:', err);
  }
}

// ============================================================
//  MESSAGE  – Komunikasi dari halaman utama ke SW
// ============================================================
self.addEventListener('message', event => {
  const { type } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_VERSION':
      event.ports[0]?.postMessage({ version: APP_VERSION });
      break;

    case 'CLEAR_CACHE':
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => event.ports[0]?.postMessage({ success: true }));
      break;

    case 'CACHE_URLS':
      if (Array.isArray(event.data.urls)) {
        caches.open(CACHE_DYNAMIC).then(cache =>
          Promise.allSettled(event.data.urls.map(url => cache.add(url)))
        ).then(() => event.ports[0]?.postMessage({ success: true }));
      }
      break;
  }
});
