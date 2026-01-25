import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { requireAuth } from '../middlewares/auth.js';
import {
  callStoredProcedure,
  listStoredProcedures,
  getProcedureParams,
  getProcedureRawRows,
  getProcedureLockCandidates,
  getReportLockCandidatesForRequest,
  pool,
} from '../../db/index.js';
import { listPermittedProcedures } from '../utils/reportProcedures.js';
import { buildReportFieldLineage } from '../utils/reportFieldLineage.js';
import { getConfigPath } from '../utils/configPaths.js';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimits = new Map();

const router = express.Router();

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

function resolveCompanyId(req) {
  const rawCompanyId = req.query?.companyId ?? req.user?.companyId;
  const companyId = Number(rawCompanyId);
  if (!Number.isFinite(companyId) || companyId <= 0) return null;
  return companyId;
}

function isRateLimited(key) {
  const now = Date.now();
  const recent = (rateLimits.get(key) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) return true;
  recent.push(now);
  rateLimits.set(key, recent);
  return false;
}

function generateLockRequestId() {
  const now = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return -1 * (now * 1000 + random);
}

function normalizeBulkUpdateConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const fieldName = String(raw.fieldName || '').trim();
  const hasDefaultValue = Object.prototype.hasOwnProperty.call(raw, 'defaultValue');
  const defaultValue = hasDefaultValue
    ? raw.defaultValue === undefined || raw.defaultValue === null
      ? ''
      : String(raw.defaultValue)
    : '';
  if (!fieldName && !defaultValue) return null;
  return { fieldName, defaultValue };
}

async function loadBulkUpdateConfig(name, companyId) {
  if (!name || !companyId) return null;
  try {
    const { path: configPath } = await getConfigPath(
      path.join('report_builder', `${name}.json`),
      companyId,
    );
    const text = await fs.readFile(configPath, 'utf-8');
    const data = JSON.parse(text);
    return normalizeBulkUpdateConfig(data?.bulkUpdateConfig);
  } catch {
    return null;
  }
}

async function validateCompanyForGid(companyId, gId, res) {
  const normalizedCompanyId = Number(companyId);
  const normalizedGid = Number(gId);
  if (!Number.isFinite(normalizedGid)) return true;
  if (!Number.isFinite(normalizedCompanyId)) {
    res.status(400).json({ message: 'companyId is required when supplying g_id' });
    return false;
  }
  const [rows] = await pool.query(
    'SELECT 1 FROM transactions_contract WHERE company_id = ? AND g_id = ? LIMIT 1',
    [normalizedCompanyId, normalizedGid],
  );
  if (!rows.length) {
    res.status(400).json({ message: 'No company found for supplied g_id' });
    return false;
  }
  return true;
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { prefix = '', branchId, departmentId } = req.query;
    const companyId = resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId required' });
    const { procedures } = await listPermittedProcedures(
      { branchId, departmentId, prefix },
      companyId,
      req.user,
    );
    const existing = new Set(await listStoredProcedures(prefix));
    const names = procedures
      .map((p) => p.name)
      .filter((n) => existing.has(n));
    res.json({ procedures: names });
  } catch (err) {
    next(err);
  }
});

router.get('/:name/params', requireAuth, async (req, res, next) => {
  try {
    const { branchId, departmentId } = req.query;
    const companyId = resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId required' });
    const { procedures } = await listPermittedProcedures(
      { branchId, departmentId },
      companyId,
      req.user,
    );
    const allowed = new Set(procedures.map((p) => p.name));
    if (!allowed.has(req.params.name))
      return res.status(403).json({ message: 'Procedure not allowed' });
    const parameters = await getProcedureParams(req.params.name);
    res.json({ parameters });
  } catch (err) {
    next(err);
  }
});

router.post('/locks', requireAuth, async (req, res, next) => {
  try {
    const { name, params, aliases, requestId, request_id } = req.body || {};
    const lockRequestId =
      requestId ?? request_id ?? req.body?.lockRequestId ?? req.body?.lock_request_id;
    const { branchId, departmentId } = req.query;
    const companyId = resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId required' });
    if (lockRequestId !== undefined && lockRequestId !== null && lockRequestId !== '') {
      const lockCandidates = await getReportLockCandidatesForRequest(lockRequestId, {
        companyId,
      });
      res.json({ lockCandidates, requestId: lockRequestId });
      return;
    }
    if (!name) return res.status(400).json({ message: 'name required' });
    const { procedures } = await listPermittedProcedures(
      { branchId, departmentId },
      companyId,
      req.user,
    );
    const allowed = new Set(procedures.map((p) => p.name));
    if (!allowed.has(name))
      return res.status(403).json({ message: 'Procedure not allowed' });
    const lockCandidates = await getProcedureLockCandidates(
      name,
      Array.isArray(params) ? params : [],
      Array.isArray(aliases) ? aliases : [],
      { companyId },
    );
    res.json({ lockCandidates });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, params, aliases } = req.body || {};
    const collectLocks =
      isTruthyFlag(req.body?.collectLocks) ||
      isTruthyFlag(req.body?.collect_lock_candidates) ||
      isTruthyFlag(req.body?.populateLockCandidates);
    const providedLockRequestId =
      req.body?.lockRequestId ??
      req.body?.lock_request_id ??
      req.body?.requestId ??
      req.body?.request_id;
    const lockRequestId =
      collectLocks && (providedLockRequestId || providedLockRequestId === 0)
        ? providedLockRequestId
        : collectLocks
        ? generateLockRequestId()
        : null;
    if (!name) return res.status(400).json({ message: 'name required' });
    const { branchId, departmentId } = req.query;
    const companyId = resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId required' });
    const { procedures } = await listPermittedProcedures(
      { branchId, departmentId },
      companyId,
      req.user,
    );
    const allowed = new Set(procedures.map((p) => p.name));
    if (!allowed.has(name))
      return res.status(403).json({ message: 'Procedure not allowed' });
    const rateKey = req.user?.id ?? req.user?.empid ?? req.ip;
    if (isRateLimited(rateKey))
      return res.status(429).json({ message: 'Too many procedure requests. Please slow down.' });
    const aliasGid =
      Array.isArray(params) && Array.isArray(aliases)
        ? params[aliases.findIndex((a) => a === 'g_id')]
        : undefined;
    const rawGid = req.body?.g_id ?? req.query?.g_id ?? aliasGid;
    const validCompany = await validateCompanyForGid(companyId, rawGid, res);
    if (!validCompany) return;
    const [procResult, fieldLineage, bulkUpdateConfig] = await Promise.all([
      callStoredProcedure(
        name,
        Array.isArray(params) ? params : [],
        Array.isArray(aliases) ? aliases : [],
        {
          session: {
            collectUsedRows: collectLocks,
            requestId: lockRequestId,
            empId: req.user?.empid ?? null,
          },
        },
      ),
      buildReportFieldLineage(name, companyId),
      loadBulkUpdateConfig(name, companyId),
    ]);
    const { row, reportCapabilities, lockCandidates } = procResult;
    res.json({
      row,
      lockRequestId: collectLocks ? lockRequestId : null,
      reportCapabilities,
      lockCandidates,
      fieldLineage,
      reportMeta: {
        bulkUpdateConfig,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/raw', requireAuth, async (req, res, next) => {
  try {
    const {
      name,
      params,
      aliases,
      column,
      groupField,
      groupValue,
      extraConditions,
      session,
    } = req.body || {};
    if (!name || !column)
      return res.status(400).json({ message: 'name and column required' });
    const { branchId, departmentId } = req.query;
    const companyId = resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'companyId required' });
    const { procedures } = await listPermittedProcedures(
      { branchId, departmentId },
      companyId,
      req.user,
    );
    const allowed = new Set(procedures.map((p) => p.name));
    if (!allowed.has(name))
      return res.status(403).json({ message: 'Procedure not allowed' });
    const rateKey = req.user?.id ?? req.user?.empid ?? req.ip;
    if (isRateLimited(rateKey))
      return res.status(429).json({ message: 'Too many procedure requests. Please slow down.' });
    const aliasGid =
      Array.isArray(params) && Array.isArray(aliases)
        ? params[aliases.findIndex((a) => a === 'g_id')]
        : undefined;
    const rawGid = req.body?.g_id ?? req.query?.g_id ?? aliasGid;
    const validCompany = await validateCompanyForGid(companyId, rawGid, res);
    if (!validCompany) return;
    const { rows, sql, original, file, displayFields } = await getProcedureRawRows(
      name,
      params || {},
      column,
      groupField,
      groupValue,
      Array.isArray(extraConditions) ? extraConditions : [],
      { ...(session || {}), empid: req.user?.empid },
    );
    res.json({ rows, sql, original, file, displayFields });
  } catch (err) {
    next(err);
  }
});

export default router;
