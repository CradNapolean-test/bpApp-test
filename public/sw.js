// Web Push service worker. Deliberately minimal -- no offline caching/asset precaching here,
// this exists solely to receive push events and show the OS notification; adding a caching
// strategy on top is a separate decision, not bundled into this pass.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/logo-badge.png',
      badge: '/logo-badge.png',
      data: { url: payload.url },
    })
  );
});

// Focuses an already-open tab on this origin if one exists, otherwise opens a new one --
// avoids piling up duplicate tabs when a client taps several notifications in a row.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
