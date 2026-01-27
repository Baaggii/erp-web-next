const userDetailProcedures = new Map();
const knownDetailProcedures = new Set();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function resolveTtlMs() {
  const value = Number(process.env.REPORT_DETAIL_PROC_TTL_MS);
  if (Number.isFinite(value) && value > 0) return value;
  return DEFAULT_TTL_MS;
}

function clearEntry(userKey, entry) {
  if (!entry) return;
  if (entry.timeout) {
    clearTimeout(entry.timeout);
  }
  userDetailProcedures.delete(userKey);
}

function normalizeName(name) {
  if (typeof name !== 'string') return '';
  return name.trim();
}

function resolveEntry(userKey) {
  if (!userKey) return null;
  const entry = userDetailProcedures.get(userKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    clearEntry(userKey, entry);
    return null;
  }
  return entry;
}

export function registerDetailProcedure(userKey, procedureName) {
  const name = normalizeName(procedureName);
  if (!userKey || !name) return;
  knownDetailProcedures.add(name);
  const ttlMs = resolveTtlMs();
  const existing = resolveEntry(userKey);
  if (existing) {
    existing.procedures.add(name);
    existing.expiresAt = Date.now() + ttlMs;
    if (existing.timeout) {
      clearTimeout(existing.timeout);
    }
    existing.timeout = setTimeout(() => clearEntry(userKey, existing), ttlMs);
    return;
  }
  const entry = {
    procedures: new Set([name]),
    expiresAt: Date.now() + ttlMs,
    timeout: null,
  };
  entry.timeout = setTimeout(() => clearEntry(userKey, entry), ttlMs);
  userDetailProcedures.set(userKey, entry);
}

export function isDetailProcedureAllowed(userKey, procedureName) {
  const name = normalizeName(procedureName);
  if (!userKey || !name) return false;
  const entry = resolveEntry(userKey);
  return Boolean(entry?.procedures?.has(name));
}

export function isKnownDetailProcedure(procedureName) {
  const name = normalizeName(procedureName);
  if (!name) return false;
  return knownDetailProcedures.has(name);
}
