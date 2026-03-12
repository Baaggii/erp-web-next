import crypto from 'crypto';
import { getEmploymentSession } from '../../../db/index.js';

function normalizeId(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  const str = String(value).trim();
  if (!str) return fallback;
  const maybeNum = Number(str);
  return Number.isFinite(maybeNum) ? String(maybeNum) : str;
}

export async function buildBundleContext(req, extra = {}) {
  const companyId = Number(req.query.companyId ?? req.user.companyId);
  const session = await getEmploymentSession(req.user.empid, companyId);
  const base = {
    companyId,
    userId: req.user.empid,
    branchId: normalizeId(extra.branchId ?? req.query.branchId ?? session?.branch_id),
    departmentId: normalizeId(extra.departmentId ?? req.query.departmentId ?? session?.department_id),
    userRightId: normalizeId(extra.userRightId ?? req.query.userRightId ?? session?.user_right_id),
    workplaceId: normalizeId(extra.workplaceId ?? req.query.workplaceId ?? session?.workplace_id),
    positionId: normalizeId(extra.positionId ?? req.query.positionId ?? session?.position_id),
    workplacePositionId: normalizeId(
      extra.workplacePositionId ??
        req.query.workplacePositionId ??
        session?.workplace_position_id,
    ),
    lang: normalizeId(extra.lang ?? req.query.lang, 'mn'),
    pageKey: normalizeId(extra.pageKey ?? req.query.page),
    moduleKey: normalizeId(extra.moduleKey ?? req.query.moduleKey),
    table: normalizeId(extra.table ?? req.params.table ?? req.query.table),
    reportKey: normalizeId(extra.reportKey ?? req.params.reportKey ?? req.query.reportKey),
  };
  return { context: base, session };
}

export function makeRequestId() {
  return `req_${crypto.randomBytes(6).toString('hex')}`;
}

export function okEnvelope(data, { requestId, version = 'v2', cache } = {}) {
  return {
    ok: true,
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      requestId: requestId || makeRequestId(),
      ...(cache ? { cache } : {}),
      version,
    },
    errors: [],
  };
}

export function errorEnvelope(code, message, { requestId, version = 'v2' } = {}) {
  return {
    ok: false,
    data: null,
    meta: {
      generatedAt: new Date().toISOString(),
      requestId: requestId || makeRequestId(),
      version,
    },
    errors: [{ code, message }],
  };
}

export function setBundleHeaders(res, { bundle, cacheHit, cacheKey, durationMs }) {
  res.setHeader('X-ERP-Cache', cacheHit ? 'HIT' : 'MISS');
  res.setHeader('X-ERP-Cache-Key', String(cacheKey || '').slice(0, 120));
  res.setHeader('X-ERP-Bundle', bundle);
  res.setHeader('X-ERP-Gen-Ms', String(durationMs));
}
