// src/erp.mgt.mn/utils/deviceContext.js

const DEVICE_UUID_KEY = 'erp_device_uuid';
let inMemoryDeviceUuid = null;
let cachedLocation = undefined;
let inflightLocationPromise = null;

function supportsLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readLocalStorage(key) {
  if (!supportsLocalStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key, value) {
  if (!supportsLocalStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore storage errors */
  }
}

function generateDeviceUuid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore UUID errors */
  }
  const random = Math.random().toString(16).slice(2);
  return `dev-${Date.now().toString(16)}-${random}`;
}

export function getDeviceUuid() {
  if (inMemoryDeviceUuid) return inMemoryDeviceUuid;

  const stored = readLocalStorage(DEVICE_UUID_KEY);
  if (stored && typeof stored === 'string') {
    inMemoryDeviceUuid = stored;
    return stored;
  }

  const generated = generateDeviceUuid();
  inMemoryDeviceUuid = generated;
  writeLocalStorage(DEVICE_UUID_KEY, generated);
  return generated;
}

function normalizeCoordinate(value) {
  if (value === undefined || value === null) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function geolocationSupported() {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

function requestBrowserLocation() {
  return new Promise((resolve) => {
    if (!geolocationSupported()) {
      resolve(null);
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = normalizeCoordinate(position?.coords?.latitude);
          const lon = normalizeCoordinate(position?.coords?.longitude);
          if (lat === null && lon === null) {
            resolve(null);
            return;
          }
          resolve({ lat, lon });
        },
        () => resolve(null),
        {
          enableHighAccuracy: false,
          maximumAge: 300000,
          timeout: 7000,
        },
      );
    } catch {
      resolve(null);
    }
  });
}

export async function requestDeviceLocation() {
  if (cachedLocation !== undefined) return cachedLocation;

  if (!inflightLocationPromise) {
    inflightLocationPromise = requestBrowserLocation();
  }

  try {
    cachedLocation = await inflightLocationPromise;
  } catch {
    cachedLocation = null;
  } finally {
    inflightLocationPromise = null;
  }

  return cachedLocation;
}

export async function collectDeviceContext() {
  const deviceUuid = getDeviceUuid();
  let location = null;

  try {
    location = await requestDeviceLocation();
  } catch {
    location = null;
  }

  return {
    deviceUuid: deviceUuid || null,
    deviceMac: deviceUuid || null,
    location: location || { lat: null, lon: null },
  };
}
