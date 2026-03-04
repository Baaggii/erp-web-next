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


async function isServiceWorkerScriptAvailable(scriptUrl) {
  try {
    const response = await fetch(scriptUrl, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      return { ok: false, reason: 'service_worker_not_found', statusCode: response.status };
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const looksLikeJavaScript =
      contentType.includes('javascript') ||
      contentType.includes('ecmascript') ||
      contentType.includes('application/x-javascript') ||
      contentType.includes('text/plain');
    if (!looksLikeJavaScript) {
      return { ok: false, reason: 'service_worker_bad_mime', contentType };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'service_worker_check_failed', error };
  }
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
  if (!window.isSecureContext) {
    return { ok: false, reason: 'insecure_context' };
  }

  const notificationApi = globalThis.Notification;
  const hasNotificationApi = typeof notificationApi !== 'undefined';
  const hasPushApi = 'serviceWorker' in navigator && 'PushManager' in window;

  if (!hasNotificationApi && !hasPushApi) {
    return { ok: false, reason: 'notifications_unsupported' };
  }

  async function askPermission() {
    if (!hasNotificationApi) {
      return 'default';
    }

    if (typeof notificationApi.requestPermission !== 'function') {
      return notificationApi.permission;
    }

    try {
      const maybePromise = notificationApi.requestPermission.call(notificationApi);
      if (maybePromise && typeof maybePromise.then === 'function') {
        return maybePromise;
      }
      if (typeof maybePromise === 'string') {
        return maybePromise;
      }
    } catch (error) {
      // Fall through to callback-based legacy API.
    }

    try {
      return await new Promise((resolve) => {
        notificationApi.requestPermission.call(notificationApi, (legacyPermission) => {
          if (typeof legacyPermission === 'string') {
            resolve(legacyPermission);
            return;
          }
          resolve(notificationApi.permission);
        });
      });
    } catch (error) {
      return notificationApi.permission;
    }

    return notificationApi.permission;
  }

  let permission = hasNotificationApi ? notificationApi.permission : 'default';
  if (hasNotificationApi && promptForPermission && permission !== 'granted') {
    permission = await askPermission();
  }
  if (hasNotificationApi && permission !== 'granted') {
    return { ok: false, reason: 'permission_not_granted', permission };
  }

  if (!hasPushApi) {
    return { ok: false, reason: 'push_unsupported', permission };
  }

  let status;
  try {
    const statusRes = await fetch(`${API_BASE}/web_push/status`, {
      credentials: 'include',
      skipErrorToast: true,
    });
    if (!statusRes.ok) return { ok: false, reason: 'status_failed', statusCode: statusRes.status };
    status = await statusRes.json();
  } catch (error) {
    return { ok: false, reason: 'status_request_failed', error };
  }

  if (!status?.vapidConfigured || !status?.publicKey) return { ok: false, reason: 'vapid_not_configured' };

  const swCheck = await isServiceWorkerScriptAvailable('/sw-webpush.js');
  if (!swCheck?.ok) {
    return swCheck;
  }

  let subscription;
  try {
    const registration = await navigator.serviceWorker.register('/sw-webpush.js');
    if (!registration?.pushManager || typeof registration.pushManager.subscribe !== 'function') {
      return { ok: false, reason: 'push_unsupported', permission };
    }
    const existing = await registration.pushManager.getSubscription();
    subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(status.publicKey),
      }));
  } catch (error) {
    if (error?.name === 'NotAllowedError') {
      return {
        ok: false,
        reason: 'permission_not_granted',
        permission: hasNotificationApi ? notificationApi.permission : permission,
      };
    }
    return { ok: false, reason: 'subscription_failed', error };
  }

  if (!subscription?.endpoint) return { ok: false, reason: 'subscription_missing_endpoint' };

  try {
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
  } catch (error) {
    return { ok: false, reason: 'subscribe_request_failed', error };
  }

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
        if (typeof globalThis.Notification !== 'undefined' && Notification.permission !== 'granted') {
          return;
        }
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
