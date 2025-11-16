import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getEmploymentSession } from '../../db/index.js';
import {
  getUploadMiddleware,
  importStaticCodes,
  initialiseReferenceCodeSync,
  loadSyncLogs,
  loadSyncSettings,
  runReferenceCodeSync,
  saveSyncSettings,
  updateSyncSchedule,
} from '../services/posApiReferenceCodes.js';

const router = express.Router();

async function requireSystemSettings(req, res) {
  const companyId = Number(req.query.companyId ?? req.user.companyId);
  const session =
    (req.session && Number(req.session?.company_id) === companyId && req.session) ||
    (await getEmploymentSession(req.user.empid, companyId));
  if (!session?.permissions?.system_settings) {
    res.status(403).json({ message: 'Admin access required' });
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
    const rawEndpoints = req.body?.endpoints || req.body?.endpointIds || [];
    const endpointIds = Array.isArray(rawEndpoints)
      ? rawEndpoints.filter(Boolean)
      : typeof rawEndpoints === 'string'
        ? rawEndpoints.split(',').map((value) => value.trim()).filter(Boolean)
        : [];
    const result = await runReferenceCodeSync('manual', {
      usage: req.body?.usage,
      endpointIds,
    });
    res.json(result);
  } catch (err) {
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

// Ensure scheduler respects stored settings on startup
initialiseReferenceCodeSync().catch((err) => {
  console.error('Failed to initialize POSAPI info sync', err);
});

export default router;

