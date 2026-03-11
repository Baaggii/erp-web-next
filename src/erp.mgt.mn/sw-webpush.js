self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const notification =
    payload?.notification && typeof payload.notification === 'object'
      ? payload.notification
      : payload;

  const title = notification.title || payload.title || 'ERP notification';
  const options = {
    ...notification,
    body: notification.body || payload.body || 'You have a new notification',
    icon: notification.icon || payload.icon || '/icon-192.png',
    badge: notification.badge || payload.badge || '/icon-192.png',
    data: {
      ...(notification.data || payload.data || {}),
      payload,
      url:
        notification?.data?.url ||
        payload?.data?.url ||
        notification.url ||
        payload.url ||
        '/#/notifications',
    },
    tag: notification.tag || payload.tag || undefined,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/#/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/#/') && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
