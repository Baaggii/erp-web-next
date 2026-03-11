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
    const preview = String(item?.preview || '').trim();
    if (preview) return preview;

    const summary = String(item?.summaryText || item?.summary_text || '').trim();
    if (summary) return summary;

    const kind = String(item?.kind || '').trim().toLowerCase();
    if (kind !== 'temporary' && !item?.temporarySubmission) return '';

    const action = String(item?.action || item?.status || '').trim().toLowerCase();
    const actionLabel =
      action === 'pending'
        ? 'Pending review'
        : action === 'promoted' || action === 'approved'
          ? 'Approved'
          : action === 'rejected' || action === 'declined'
            ? 'Rejected'
            : action === 'forwarded'
              ? 'Forwarded'
              : action === 'created' || action === 'create'
                ? 'Created'
                : action
                  ? action.charAt(0).toUpperCase() + action.slice(1)
                  : 'Pending review';

    const formName = String(item?.formName || item?.form_name || item?.configName || item?.config_name || '').trim();
    const summaryFieldsRaw =
      item?.summaryFields ||
      item?.summary_fields ||
      item?.summary_fields_list ||
      item?.summary?.fields ||
      [];
    const summaryFields = Array.isArray(summaryFieldsRaw)
      ? summaryFieldsRaw
          .map((field) => String(field?.value ?? field?.val ?? '').trim())
          .filter(Boolean)
      : [];

    const pieces = [actionLabel];
    if (formName) pieces.push(formName);
    if (summaryFields.length) pieces.push(summaryFields.join(' · '));

    return pieces.join(' • ');
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
  const fallbackBody =
    typeof payload.body === 'string' && payload.body.trim() && !parseMaybeJson(payload.body)
      ? payload.body.trim()
      : '';

  const title = payload.title || resolvedTitle || 'ERP notification';
  const options = {
    body: resolvedBody || fallbackBody || 'You have a new notification',
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
