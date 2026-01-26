import { pool } from '../../db/index.js';

const REPORT_SESSION_TTL_MS = Number(
  process.env.REPORT_SESSION_TTL_MS || 30 * 60 * 1000,
);

const reportSessions = new Map();

function buildSessionKey(user, companyId) {
  const empId = user?.empid ?? user?.id ?? user?.userId ?? 'anon';
  const companyKey = companyId ?? user?.companyId ?? '0';
  return `${companyKey}:${empId}`;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [key, entry] of reportSessions.entries()) {
    if (!entry || !entry.connection) {
      reportSessions.delete(key);
      continue;
    }
    if (now - entry.lastUsed > REPORT_SESSION_TTL_MS) {
      try {
        entry.connection.release();
      } catch {
        // ignore release errors for stale connections
      }
      reportSessions.delete(key);
    }
  }
}

export async function getReportSessionConnection(req) {
  cleanupExpiredSessions();
  const key = buildSessionKey(req.user, req.user?.companyId);
  const existing = reportSessions.get(key);
  if (existing?.connection) {
    existing.lastUsed = Date.now();
    return existing.connection;
  }
  const connection = await pool.getConnection();
  reportSessions.set(key, { connection, lastUsed: Date.now() });
  return connection;
}
