self.addEventListener('push', (event) => {
  function parseMaybeJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function normalizeText(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim().toLowerCase();
  }

  function getTableNameFromAction(action) {
    if (!action || typeof action !== 'object') return '';
    const table =
      action.table_name || action.tableName || action.table || action.transactionTable || '';
    return String(table || '').trim();
  }

  function resolveNotificationTitle(item) {
    const rawTitle = String(item?.title || item?.transactionName || '').trim();
    if (!rawTitle) return 'Notification';
    const normalizedTitle = normalizeText(rawTitle);
    const actionTable = normalizeText(getTableNameFromAction(item?.action));
    if (actionTable && normalizedTitle === actionTable) {
      return 'Notification';
    }
    return rawTitle;
  }

  function resolveNotificationBody(item) {
    return String(item?.preview || item?.summaryText || item?.summary_text || '').trim();
  }

  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const parsedMessage = parseMaybeJson(payload?.message);
  const notificationItem =
    payload?.notification ||
    payload?.feedItem ||
    payload?.item ||
    (parsedMessage && typeof parsedMessage === 'object' ? parsedMessage : null) ||
    payload;

  const resolvedTitle = resolveNotificationTitle(notificationItem);
  const resolvedBody = resolveNotificationBody(notificationItem);

  const title = payload.title || resolvedTitle || 'ERP notification';
  const options = {
    body: payload.body || resolvedBody || 'You have a new notification',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    data: payload.data || { url: '/#/notifications' },
    tag: payload.tag || undefined,
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
