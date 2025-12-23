import crypto from 'crypto';
import { closePosSession, logPosSessionStart } from '../../db/index.js';
import { getPosSessionCookieName } from '../utils/cookieNames.js';

function parseLocation(input) {
  if (input === undefined || input === null) return {};
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return typeof parsed === 'object' && parsed !== null ? parsed : { raw: input };
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

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeNumericId(value) {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

async function recordLoginSessionImpl(req, sessionPayload, user) {
  const devicePayload =
    req.body?.device ||
    req.body?.device_info ||
    req.body?.deviceInfo ||
    req.body?.devicePayload ||
    req.body?.device_payload ||
    {};
  const sessionUuid = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
  const companyId = sessionPayload?.company_id ?? null;
  const branchId = sessionPayload?.branch_id ?? null;
  const departmentId = sessionPayload?.department_id ?? null;
  const workplaceId = sessionPayload?.workplace_id ?? null;
  const merchantId =
    sessionPayload?.merchant_id ??
    sessionPayload?.merchantId ??
    sessionPayload?.merchant_tin ??
    sessionPayload?.merchantTin ??
    null;
  const posNo =
    sessionPayload?.pos_no ??
    sessionPayload?.posNo ??
    sessionPayload?.pos_number ??
    req.body?.pos_no ??
    req.body?.posNo ??
    null;
  const deviceMac =
    normalizeMac(
      req.body?.device_mac ??
        req.body?.deviceMac ??
        devicePayload?.mac ??
        devicePayload?.device_mac ??
        devicePayload?.deviceMac ??
        req.headers?.['x-device-mac'] ??
        req.headers?.['x-device-mac-address'],
    );
  const deviceUuid =
    normalizeValue(
      req.body?.device_uuid ??
        req.body?.deviceUuid ??
        devicePayload?.device_uuid ??
        devicePayload?.deviceUuid ??
        devicePayload?.uuid ??
        devicePayload?.id ??
        req.headers?.['x-device-uuid'] ??
        req.headers?.['x-device-id'],
    ) || null;
  const seniorId = normalizeText(
    sessionPayload?.senior_empid ??
      sessionPayload?.seniorEmpid ??
      req.body?.senior_empid ??
      req.body?.seniorEmpid,
  );
  const planSeniorId = normalizeText(
    sessionPayload?.senior_plan_empid ??
      sessionPayload?.seniorPlanEmpid ??
      req.body?.senior_plan_empid ??
      req.body?.seniorPlanEmpid,
  );
  const location = parseLocation(
    req.body?.location ??
      req.body?.device_location ??
      devicePayload?.location ??
      devicePayload?.device_location ??
      devicePayload?.coords ??
      devicePayload?.coordinates ??
      req.headers?.['x-device-location'],
  );

  await logPosSessionStart({
    sessionUuid,
    companyId,
    branchId,
    departmentId,
    workplaceId,
    merchantId,
    posNo,
    deviceMac,
    deviceUuid,
    location,
    currentUserId: user?.id ?? null,
    seniorId,
    planSeniorId,
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
  try {
    return await recordLoginSessionImpl(req, sessionPayload, user);
  } catch (error) {
    return {
      sessionUuid: null,
      cookieName: getPosSessionCookieName(),
      error,
    };
  }
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
