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
        const statusRes = await fetch(`${API_BASE}/web_push/status`, {
          credentials: 'include',
          skipErrorToast: true,
        });
        if (!statusRes.ok) return;
        const status = await statusRes.json();
        if (!status?.vapidConfigured || !status?.publicKey) return;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const registration = await navigator.serviceWorker.register('/sw-webpush.js');
        const existing = await registration.pushManager.getSubscription();
        const subscription =
          existing ||
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(status.publicKey),
          }));

        if (cancelled || !subscription?.endpoint) return;
        if (subscription.endpoint === lastEndpointRef.current) return;

        const mutedKinds = Array.isArray(userSettings?.webPushMutedKinds)
          ? userSettings.webPushMutedKinds
          : String(userSettings?.webPushMutedKinds || '')
              .split(',')
              .map((entry) => entry.trim().toLowerCase())
              .filter(Boolean);

        const body = {
          subscription: subscription.toJSON(),
          notificationTypes: mutedKinds,
          muteStartHour: userSettings?.webPushMuteStartHour ?? null,
          muteEndHour: userSettings?.webPushMuteEndHour ?? null,
        };

        const saveRes = await fetch(`${API_BASE}/web_push/subscribe`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          skipErrorToast: true,
        });

        if (saveRes.ok) {
          lastEndpointRef.current = subscription.endpoint;
        }
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
