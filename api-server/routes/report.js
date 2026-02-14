import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middlewares/auth.js';
import {
  callStoredProcedure,
  getProcedureParams,
} from '../../db/index.js';
import { listPermittedProcedures } from '../utils/reportProcedures.js';
import {
  clearReportTempSession,
  getReportTempSession,
  getReportTempSessionKey,
  storeReportTempSession,
} from '../services/reportTempTableSession.js';

const router = express.Router();

const reportSessionErrorTokens = ['Report session not found', "doesn't exist"];

function resolveCompanyId(req) {
  const rawCompanyId = req.query?.companyId ?? req.user?.companyId;
  const companyId = Number(rawCompanyId);
  if (!Number.isFinite(companyId) || companyId <= 0) return null;
  return companyId;
}

function isReportSessionExpiredError(err) {
  const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
  return reportSessionErrorTokens.some((token) =>
    message.includes(token.toLowerCase()),
  );
}

function normalizeDetailTempTables(tableConfig) {
  if (typeof tableConfig === 'string') {
    const raw = tableConfig.trim();
    if (!raw) return [];
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        return normalizeDetailTempTables(JSON.parse(raw));
      } catch {
        return [raw];
      }
    }
    return [raw];
  }

  if (Array.isArray(tableConfig)) {
    return tableConfig
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object' && typeof entry.table === 'string') {
          return entry.table.trim();
        }
        return '';
      })
      .filter(Boolean);
  }

  if (tableConfig && typeof tableConfig === 'object') {
    const levels = Array.isArray(tableConfig.levels) ? tableConfig.levels : [];
    return levels
      .slice()
      .sort((a, b) => Number(a?.level ?? 0) - Number(b?.level ?? 0))
      .map((entry) => (typeof entry?.table === 'string' ? entry.table.trim() : ''))
      .filter(Boolean);
  }

  return [];
}

const tmpDetailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const rebuildLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/tmp-detail', tmpDetailLimiter, requireAuth, async (req, res, next) => {
  try {
    const tables = normalizeDetailTempTables(req.body?.table);
    const pk = typeof req.body?.pk === 'string' ? req.body.pk.trim() : 'id';
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

    if (!tables.length) {
      return res.status(400).json({ message: 'table required' });
    }
    if (tables.some((table) => !/^tmp_[a-zA-Z0-9_]+$/.test(table))) {
      return res.status(400).json({ message: 'Invalid table name' });
    }
    if (!pk || !/^[a-zA-Z0-9_]+$/.test(pk)) {
      return res.status(400).json({ message: 'Invalid primary key column' });
    }

    const normalizedIds = ids
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);
    if (!normalizedIds.length) {
      return res.json([]);
    }

    const sessionKey = getReportTempSessionKey(req);
    const connection = getReportTempSession(sessionKey);
    if (!connection) {
      return res.status(410).json({ error: 'REPORT_SESSION_EXPIRED' });
    }

    const placeholders = normalizedIds.map(() => '?').join(', ');
    const rows = [];
    const seenIds = new Set();

    for (const table of tables) {
      const sql = `SELECT * FROM \`${table}\` WHERE \`${pk}\` IN (${placeholders})`;
      const [tableRows] = await connection.query(sql, normalizedIds);
      if (Array.isArray(tableRows) && tableRows.length) {
        tableRows.forEach((tableRow) => {
          const rowPk = String(tableRow?.[pk] ?? '').trim();
          if (rowPk && !seenIds.has(rowPk)) {
            seenIds.add(rowPk);
            rows.push(tableRow);
          }
        });
      }
    }

    return res.json(rows);
  } catch (err) {
    if (isReportSessionExpiredError(err)) {
      return res.status(410).json({ error: 'REPORT_SESSION_EXPIRED' });
    }
    next(err);
  }
});

router.post('/rebuild', rebuildLimiter, requireAuth, async (req, res, next) => {
  try {
    const reportName = typeof req.body?.reportName === 'string' ? req.body.reportName.trim() : '';
    const reportParams = req.body?.reportParams ?? null;
    if (!reportName) {
      return res.status(400).json({ message: 'reportName required' });
    }

    const { branchId, departmentId } = req.query;
    const companyId = resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId required' });
    const { procedures } = await listPermittedProcedures(
      { branchId, departmentId },
      companyId,
      req.user,
    );
    const allowed = new Set(procedures.map((p) => p.name));
    if (!allowed.has(reportName)) {
      return res.status(403).json({ message: 'Procedure not allowed' });
    }

    let params = [];
    if (Array.isArray(reportParams)) {
      params = reportParams;
    } else {
      const paramNames = await getProcedureParams(reportName);
      params = paramNames.map((param) => reportParams?.[param]);
    }

    const { reportMeta, connection } = await callStoredProcedure(
      reportName,
      params,
      [],
      { retainConnection: true },
    );
    const sessionKey = getReportTempSessionKey(req);
    const useTempSession =
      reportMeta?.drilldown?.mode === 'materialized' &&
      Boolean(reportMeta?.drilldown?.detailTempTable);
    if (connection) {
      if (useTempSession) {
        storeReportTempSession(sessionKey, connection);
      } else {
        clearReportTempSession(sessionKey);
        connection.release();
      }
    } else if (!useTempSession) {
      clearReportTempSession(sessionKey);
    }

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
