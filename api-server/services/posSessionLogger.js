import crypto from 'crypto';
import { closePosSession, logPosSessionStart } from '../../db/index.js';
import { getPosSessionCookieName } from '../utils/cookieNames.js';

function parseLocation(input) {
  if (input === undefined || input === null) return {};
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return typeof parsed === 'object' && parsed !== null
        ? parsed
        : { raw: input };
    } catch {
      return { raw: input };
    }
  }
  if (typeof input === 'object') {
    return Array.isArray(input) ? { points: input } : input;
  }
  return { value: input };
}

function normalizeValue(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeMac(value) {
  return normalizeValue(value) || 'unknown';
}

function coalesceLatLng(...candidates) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const lat =
      candidate.lat ??
      candidate.latitude ??
      candidate.coords?.lat ??
      candidate.coords?.latitude ??
      null;
    const lng =
      candidate.lng ??
      candidate.longitude ??
      candidate.coords?.lng ??
      candidate.coords?.longitude ??
      null;
    if (lat !== null || lng !== null) {
      return { lat, lng };
    }
  }
  return null;
}

function pickSessionValue(sessionPayload, ...keys) {
  for (const key of keys) {
    if (sessionPayload && Object.prototype.hasOwnProperty.call(sessionPayload, key)) {
      return sessionPayload[key];
    }
  }
  return null;
}

async function recordLoginSessionImpl(req, sessionPayload, user) {
  const sessionUuid = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
  const deviceInfo =
    req.body?.device ??
    req.body?.deviceInfo ??
    req.body?.device_info ??
    req.body?.hardware ??
    {};
  const deviceMac =
    normalizeMac(
      req.body?.device_mac ??
        req.body?.deviceMac ??
        deviceInfo?.mac ??
        deviceInfo?.mac_address ??
        deviceInfo?.macAddress ??
        deviceInfo?.device_mac ??
        req.headers?.['x-device-mac'] ??
        req.headers?.['x-device-mac-address'] ??
        req.headers?.['device-mac'] ??
        req.headers?.['device-mac-address'] ??
        req.headers?.['x-mac-address'] ??
        req.headers?.['x-client-mac'],
    );
  const deviceUuid =
    normalizeValue(
      req.body?.device_uuid ??
        req.body?.deviceUuid ??
        deviceInfo?.device_uuid ??
        deviceInfo?.deviceUuid ??
        deviceInfo?.uuid ??
        deviceInfo?.id ??
        req.headers?.['x-device-uuid'] ??
        req.headers?.['x-device-id'] ??
        req.headers?.['device-uuid'] ??
        req.headers?.['device-id'],
    ) || null;
  const latLng =
    coalesceLatLng(
      req.body,
      req.body?.location,
      req.body?.device_location,
      req.body?.geo,
      req.body?.coords,
      deviceInfo,
      deviceInfo?.location,
      deviceInfo?.geo,
      deviceInfo?.coords,
    ) || null;
  const location = parseLocation(
    req.body?.location ??
      req.body?.device_location ??
      deviceInfo?.location ??
      deviceInfo?.geo ??
      latLng ??
      req.headers?.['x-device-location'] ??
      req.headers?.['device-location'],
  );

  await logPosSessionStart({
    sessionUuid,
    companyId:
      pickSessionValue(sessionPayload, 'company_id', 'companyId') ?? null,
    branchId:
      pickSessionValue(sessionPayload, 'branch_id', 'branchId') ?? null,
    merchantId:
      pickSessionValue(
        sessionPayload,
        'merchant_id',
        'merchantId',
        'merchant_tin',
        'merchantTin',
        'company_merchant_tin',
        'companyMerchantTin',
      ) ?? null,
    posNo:
      pickSessionValue(sessionPayload, 'pos_no', 'posNo', 'pos_number') ?? null,
    deviceMac,
    deviceUuid,
    location,
    currentUserId: user?.id ?? null,
  });

  return {
    sessionUuid,
    cookieName: getPosSessionCookieName(),
  };
}

async function recordLogoutSessionImpl(req) {
  const sessionUuid =
    req.cookies?.[getPosSessionCookieName()] ?? req.body?.session_uuid ?? null;
  if (!sessionUuid) return false;
  await closePosSession(sessionUuid);
  return true;
}

export async function recordLoginSession(req, sessionPayload, user) {
  return recordLoginSessionImpl(req, sessionPayload, user);
}

export async function recordLogoutSession(req) {
  return recordLogoutSessionImpl(req);
}

export const __test__ = {
  setRecorders({ login, logout } = {}) {
    const originalLogin = recordLoginSessionImpl;
    const originalLogout = recordLogoutSessionImpl;
    if (typeof login === 'function') {
      recordLoginSessionImpl = login;
    }
    if (typeof logout === 'function') {
      recordLogoutSessionImpl = logout;
    }
    return () => {
      recordLoginSessionImpl = originalLogin;
      recordLogoutSessionImpl = originalLogout;
    };
  },
};
