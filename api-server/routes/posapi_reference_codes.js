import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getEmploymentSession } from '../../db/index.js';
import {
  getUploadMiddleware,
  importStaticCodes,
  importStaticCodesFromXlsx,
  initialiseReferenceCodeSync,
  loadSyncLogs,
  loadSyncSettings,
  runReferenceCodeSync,
  saveSyncSettings,
  updateSyncSchedule,
} from '../services/posApiReferenceCodes.js';
import { isAdminUser } from '../utils/admin.js';

const router = express.Router();

async function requireSystemSettings(req, res) {
  const companyId = Number(req.query.companyId ?? req.user.companyId);
  const session =
    (req.session && Number(req.session?.company_id) === companyId && req.session) ||
    (await getEmploymentSession(req.user.empid, companyId));
  if (!isAdminUser(req.user) || !session?.permissions?.system_settings) {
    res.status(403).json({ message: 'Admin privileges required' });
    return null;
  }
  return { session, companyId };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;
    const [settings, logs] = await Promise.all([loadSyncSettings(), loadSyncLogs(50)]);
    res.json({ settings, logs });
  } catch (err) {
    next(err);
  }
});

router.post('/sync', requireAuth, async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await runReferenceCodeSync('manual', payload);
    res.json(result);
  } catch (err) {
    if (err?.details) {
      res.status(502).json({ message: err.message || 'Failed to refresh reference codes', ...err.details });
      return;
    }
    next(err);
  }
});

router.put('/settings', requireAuth, async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;
    const saved = await saveSyncSettings(req.body || {});
    updateSyncSchedule(saved);
    res.json(saved);
  } catch (err) {
    next(err);
  }
});

router.post('/upload', requireAuth, getUploadMiddleware(), async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;
    const codeType = String(req.body?.codeType || '').trim();
    if (!codeType) {
      res.status(400).json({ message: 'codeType is required' });
      return;
    }
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ message: 'CSV file is required' });
      return;
    }
    const result = await importStaticCodes(codeType, req.file.buffer);
    res.json({ message: 'Imported reference codes', result });
  } catch (err) {
    next(err);
  }
});

router.post('/import-xlsx', requireAuth, getUploadMiddleware(), async (req, res, next) => {
  try {
    const guard = await requireSystemSettings(req, res);
    if (!guard) return;
    const codeType = String(req.body?.codeType || '').trim();
    if (!codeType) {
      res.status(400).json({ message: 'codeType is required' });
      return;
    }
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ message: 'Excel file is required' });
      return;
    }
    const result = await importStaticCodesFromXlsx(codeType, req.file.buffer);
    res.json({ message: 'Imported reference codes from Excel', result });
  } catch (err) {
    if (err?.statusCode) {
      res.status(err.statusCode).json({ message: err.message || 'Invalid Excel file' });
      return;
    }
    next(err);
  }
});

// Ensure scheduler respects stored settings on startup
initialiseReferenceCodeSync().catch((err) => {
  console.error('Failed to initialize POSAPI info sync', err);
});

export default router;
