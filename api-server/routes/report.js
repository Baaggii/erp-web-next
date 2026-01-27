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

const tmpDetailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/tmp-detail', tmpDetailLimiter, requireAuth, async (req, res, next) => {
  try {
    const table = typeof req.body?.table === 'string' ? req.body.table.trim() : '';
    const pk = typeof req.body?.pk === 'string' ? req.body.pk.trim() : 'id';
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

    if (!table) {
      return res.status(400).json({ message: 'table required' });
    }
    if (!/^tmp_[a-zA-Z0-9_]+$/.test(table)) {
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
    const sql = `SELECT * FROM \`${table}\` WHERE \`${pk}\` IN (${placeholders})`;
    const [rows] = await connection.query(sql, normalizedIds);
    return res.json(rows);
  } catch (err) {
    if (isReportSessionExpiredError(err)) {
      return res.status(410).json({ error: 'REPORT_SESSION_EXPIRED' });
    }
    next(err);
  }
});

router.post('/rebuild', requireAuth, async (req, res, next) => {
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
