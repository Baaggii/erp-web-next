import { pool } from '../../db/index.js';

const CACHE_TTL_MS = 60_000;

const policyCache = new Map();
const eventCache = new Map();

function isFresh(entry) {
  return entry && entry.expiresAt > Date.now();
}

function readCache(cache, companyId) {
  const entry = cache.get(companyId);
  if (!isFresh(entry)) {
    cache.delete(companyId);
    return null;
  }
  return entry.value;
}

function writeCache(cache, companyId, value) {
  cache.set(companyId, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}

export async function tenantHasPolicies(companyId, conn = pool) {
  const cached = readCache(policyCache, companyId);
  if (cached !== null) return cached;

  const [rows] = await conn.query(
    `SELECT 1
       FROM core_event_policies
      WHERE company_id = ?
        AND is_active = 1
        AND deleted_at IS NULL
      LIMIT 1`,
    [companyId],
  );

  return writeCache(policyCache, companyId, rows.length > 0);
}

export async function tenantHasRecordedEvents(companyId, conn = pool) {
  const cached = readCache(eventCache, companyId);
  if (cached !== null) return cached;

  const [rows] = await conn.query(
    `SELECT 1
       FROM core_events
      WHERE company_id = ?
      LIMIT 1`,
    [companyId],
  );

  return writeCache(eventCache, companyId, rows.length > 0);
}

export function invalidateTenantEventEngineFastCheck(companyId) {
  if (companyId === undefined || companyId === null) {
    policyCache.clear();
    eventCache.clear();
    return;
  }

  policyCache.delete(companyId);
  eventCache.delete(companyId);
}

export const __internal = {
  CACHE_TTL_MS,
  policyCache,
  eventCache,
};
