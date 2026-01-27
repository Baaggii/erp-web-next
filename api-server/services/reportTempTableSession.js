const sessions = new Map();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function releaseConnection(connection) {
  if (!connection) return;
  if (typeof connection.release === 'function') {
    try {
      connection.release();
    } catch {
      // ignore release errors
    }
  }
}

function clearSession(key, entry) {
  if (!entry) return;
  if (entry.timeout) {
    clearTimeout(entry.timeout);
  }
  releaseConnection(entry.connection);
  sessions.delete(key);
}

function resolveTtlMs() {
  const value = Number(process.env.REPORT_TEMP_SESSION_TTL_MS);
  if (Number.isFinite(value) && value > 0) return value;
  return DEFAULT_TTL_MS;
}

export function getReportTempSessionKey(req) {
  const user = req?.user || {};
  return String(
    user.id ??
      user.empid ??
      user.emp_id ??
      user.username ??
      req?.ip ??
      'anonymous',
  );
}

export function storeReportTempSession(key, connection) {
  if (!key || !connection) return;
  const existing = sessions.get(key);
  if (existing) {
    clearSession(key, existing);
  }
  const ttlMs = resolveTtlMs();
  const entry = {
    connection,
    expiresAt: Date.now() + ttlMs,
    timeout: null,
  };
  entry.timeout = setTimeout(() => clearSession(key, entry), ttlMs);
  sessions.set(key, entry);
}

export function getReportTempSession(key, { refresh = true } = {}) {
  if (!key) return null;
  const entry = sessions.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    clearSession(key, entry);
    return null;
  }
  if (refresh) {
    const ttlMs = resolveTtlMs();
    entry.expiresAt = Date.now() + ttlMs;
    if (entry.timeout) {
      clearTimeout(entry.timeout);
    }
    entry.timeout = setTimeout(() => clearSession(key, entry), ttlMs);
  }
  return entry.connection;
}

export function clearReportTempSession(key) {
  if (!key) return;
  const entry = sessions.get(key);
  if (entry) {
    clearSession(key, entry);
  }
}
