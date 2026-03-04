import { useEffect, useMemo, useRef } from 'react';
import { API_BASE } from '../utils/apiBase.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function normalizeMutedKinds(userSettings) {
  return Array.isArray(userSettings?.webPushMutedKinds)
    ? userSettings.webPushMutedKinds
    : String(userSettings?.webPushMutedKinds || '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
}

export async function requestWebPushPermission({ userSettings, promptForPermission = true } = {}) {
  if (!('Notification' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  async function askPermission() {
    if (typeof Notification.requestPermission !== 'function') {
      return Notification.permission;
    }

    const maybePromise = Notification.requestPermission((legacyPermission) => legacyPermission);
    if (maybePromise && typeof maybePromise.then === 'function') {
      return maybePromise;
    }

    return Notification.permission;
  }

  let permission = Notification.permission;
  if (promptForPermission && permission !== 'granted') {
    permission = await askPermission();
  }
  if (permission !== 'granted') return { ok: false, reason: 'permission_not_granted', permission };

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'push_unsupported', permission };
  }

  const statusRes = await fetch(`${API_BASE}/web_push/status`, {
    credentials: 'include',
    skipErrorToast: true,
  });
  if (!statusRes.ok) return { ok: false, reason: 'status_failed', statusCode: statusRes.status };

  const status = await statusRes.json();
  if (!status?.vapidConfigured || !status?.publicKey) return { ok: false, reason: 'vapid_not_configured' };

  const registration = await navigator.serviceWorker.register('/sw-webpush.js');
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(status.publicKey),
    }));

  if (!subscription?.endpoint) return { ok: false, reason: 'subscription_missing_endpoint' };

  const saveRes = await fetch(`${API_BASE}/web_push/subscribe`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      notificationTypes: normalizeMutedKinds(userSettings),
      muteStartHour: userSettings?.webPushMuteStartHour ?? null,
      muteEndHour: userSettings?.webPushMuteEndHour ?? null,
    }),
    skipErrorToast: true,
  });
  if (!saveRes.ok) return { ok: false, reason: 'subscribe_failed', statusCode: saveRes.status };

  return { ok: true, endpoint: subscription.endpoint, permission };
}

export default function useWebPushNotifications({ user, userSettings, generalConfig }) {
  const lastEndpointRef = useRef('');

  const enabled = useMemo(
    () =>
      Boolean(generalConfig?.notifications?.webPushEnabled) &&
      userSettings?.webPushEnabled === true &&
      Boolean(user?.empid),
    [generalConfig?.notifications?.webPushEnabled, user?.empid, userSettings?.webPushEnabled],
  );

  useEffect(() => {
    if (!enabled) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let cancelled = false;

    async function register() {
      try {
        if (Notification.permission !== 'granted') return;
        const result = await requestWebPushPermission({
          userSettings,
          promptForPermission: false,
        });
        if (cancelled || !result?.ok || !result.endpoint) return;
        if (result.endpoint === lastEndpointRef.current) return;
        lastEndpointRef.current = result.endpoint;
      } catch (err) {
        console.warn('Web push registration failed', err);
      }
    }

    register();

    return () => {
      cancelled = true;
    };
  }, [enabled, userSettings?.webPushMutedKinds, userSettings?.webPushMuteStartHour, userSettings?.webPushMuteEndHour]);
}
