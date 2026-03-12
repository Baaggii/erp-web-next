import crypto from 'crypto';

export function stableStringify(input) {
  if (input === null || input === undefined) return '';
  if (Array.isArray(input)) {
    return `[${input.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (typeof input === 'object') {
    const keys = Object.keys(input).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(input[k])}`).join(',')}}`;
  }
  return JSON.stringify(input);
}

export function stableHash(input) {
  const raw = stableStringify(input);
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12);
}

const val = (v, fallback = '') => (v === undefined || v === null ? fallback : String(v));

export const cacheKeys = {
  bootstrap: (c) =>
    `bootstrap:v2:c${val(c.companyId)}:u${val(c.userId)}:b${val(c.branchId)}:d${val(c.departmentId)}:p${val(c.positionId)}:wr${val(c.userRightId)}:wm${val(c.workplaceId)}:lang${val(c.lang, 'mn')}`,
  pageBundle: (c) =>
    `page_bundle:v2:page${val(c.pageKey)}:c${val(c.companyId)}:u${val(c.userId)}:b${val(c.branchId)}:d${val(c.departmentId)}:p${val(c.positionId)}:wr${val(c.userRightId)}:mk${val(c.moduleKey)}:tbl${val(c.table)}:r${val(c.reportKey)}:lang${val(c.lang, 'mn')}`,
  formBundle: (c) =>
    `form_bundle:v2:c${val(c.companyId)}:u${val(c.userId)}:mk${val(c.moduleKey)}:b${val(c.branchId)}:d${val(c.departmentId)}:wr${val(c.userRightId)}:w${val(c.workplaceId)}:p${val(c.positionId)}:wp${val(c.workplacePositionId)}:lang${val(c.lang, 'mn')}`,
  relation: ({ table, companyId, search, limit, cursor, ids, contextField, contextValue }) =>
    `relation:v2:t${val(table)}:c${val(companyId)}:q${stableHash(search || '')}:l${val(limit || 20)}:cur${stableHash(cursor || '')}:ids${stableHash(ids || [])}:cf${val(contextField)}:cv${stableHash(contextValue || '')}`,
};

export const CACHE_TTLS = {
  bootstrap: 600,
  pageBundleDashboard: 60,
  pageBundleForms: 180,
  formBundle: 600,
  relationStatic: 300,
};
