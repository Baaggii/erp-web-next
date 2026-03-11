import { pool } from '../../db/index.js';
import { buildEventPolicyWhereClause, normalizeSourceTransactionCode } from './eventPolicyMatching.js';

const CACHE_TTL_MS = 60_000;
const policyMatchCache = new Map();

function getCacheKey({ companyId, eventType, sourceTable, sourceTransactionType, sourceTransactionCode }) {
  return [
    companyId,
    eventType,
    sourceTable || '',
    sourceTransactionType || '',
    normalizeSourceTransactionCode(sourceTransactionCode) ?? '',
  ].join(':');
}

function readCache(key) {
  const entry = policyMatchCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    policyMatchCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value) {
  policyMatchCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}

export async function hasMatchingPolicies({
  companyId,
  eventType,
  sourceTable = null,
  sourceTransactionType = null,
  sourceTransactionCode = null,
  conn = pool,
} = {}) {
  const key = getCacheKey({ companyId, eventType, sourceTable, sourceTransactionType, sourceTransactionCode });
  const cached = readCache(key);
  if (cached !== null) return cached;

  const { whereSql, params } = buildEventPolicyWhereClause({
    companyId,
    eventType,
    sourceTable,
    sourceTransactionType,
    sourceTransactionCode,
    includeSamplePolicies: false,
  });

  const [rows] = await conn.query(
    `SELECT 1
       FROM core_event_policies
      WHERE ${whereSql}
      LIMIT 1`,
    params,
  );

  return writeCache(key, rows.length > 0);
}

export function invalidateEventPolicyMatchFastCheck(companyId = null) {
  if (companyId === null || companyId === undefined) {
    policyMatchCache.clear();
    return;
  }

  const prefix = `${companyId}:`;
  for (const key of policyMatchCache.keys()) {
    if (key.startsWith(prefix)) policyMatchCache.delete(key);
  }
}

export const __internal = {
  CACHE_TTL_MS,
  policyMatchCache,
  getCacheKey,
};
