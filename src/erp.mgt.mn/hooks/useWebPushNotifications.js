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

export async function requestWebPushPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

async function fetchWebPushStatus() {
  const statusRes = await fetch(`${API_BASE}/web_push/status`, {
    credentials: 'include',
    skipErrorToast: true,
  });
  if (!statusRes.ok) {
    throw new Error(`status_failed:${statusRes.status}`);
  }
  return statusRes.json();
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
        const status = await fetchWebPushStatus();
        if (!status?.publicKey || !status?.canSubscribe) {
          console.warn('Web push unavailable: missing public key or web-push module');
          return;
        }

        const permission = await requestWebPushPermission();
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
        } else {
          console.warn('Web push subscribe request failed', saveRes.status);
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

  useEffect(() => {
    if (enabled) return;
    if (!('serviceWorker' in navigator)) return;

    async function disableSubscription() {
      try {
        const registration = await navigator.serviceWorker.getRegistration('/sw-webpush.js');
        if (!registration) return;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        await fetch(`${API_BASE}/web_push/unsubscribe`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          skipErrorToast: true,
        });
        await subscription.unsubscribe();
      } catch (err) {
        console.warn('Failed to disable web push subscription', err);
      }
    }

    disableSubscription();
  }, [enabled]);
}
