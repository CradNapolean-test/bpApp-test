// Ballistic Performance service worker.
//  - Web Push: shows the notification and sets the app-icon badge.
//  - Offline: precaches a small offline page, shown only when a page load fails with no network.
//  - Speed: caches the app's static build files and icons (never pages, API calls or user data, so
//    nothing signed-in is ever stored or served stale).
const VERSION = 'bp-v4';
// Dev servers reuse the same build-file URLs for changing code, so never cache them there.
const IS_LOCAL = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A page load with no network: show the friendly offline page instead of the browser's error.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Hashed build files and icons never change for a given URL: serve from cache, fill on first use.
  if (!IS_LOCAL && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/'))) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Ballistic Performance', body: '', url: '/' };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        data: { url: payload.url },
      });
      // Red number on the app icon = notifications still waiting.
      if (self.navigator && 'setAppBadge' in self.navigator) {
        const waiting = await self.registration.getNotifications();
        self.navigator.setAppBadge(waiting.length).catch(() => {});
      }
    })()
  );
});

// Focuses an already-open window on this origin if one exists, otherwise opens a new one --
// avoids piling up duplicate windows when a client taps several notifications in a row.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      if (self.navigator && 'clearAppBadge' in self.navigator) {
        const waiting = await self.registration.getNotifications();
        if (waiting.length === 0) self.navigator.clearAppBadge().catch(() => {});
      }
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })()
  );
});
