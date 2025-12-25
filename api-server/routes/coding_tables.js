import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { uploadCodingTable } from '../controllers/codingTableController.js';
import { upsertCodingTableRow } from '../services/codingTableRowUpsert.js';
import { requireAuth } from '../middlewares/auth.js';
import { buildSchemaDiff, applySchemaDiffStatements } from '../services/schemaDiff.js';
import { getEmploymentSession } from '../../db/index.js';
import hasAction from '../utils/hasAction.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      String(req.user.companyId),
      'coding_tables',
    );
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
});

const upload = multer({ storage });

router.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req, res, next) => {
    const controller = new AbortController();
    const handleClose = () => controller.abort();
    req.on('close', handleClose);
    res.on('close', handleClose);
    try {
      await uploadCodingTable(req, res, next, controller.signal);
    } finally {
      req.off('close', handleClose);
      res.off('close', handleClose);
    }
  },
);

router.post('/upsert-row', requireAuth, async (req, res, next) => {
  try {
    const { table, row } = req.body || {};
    if (!table || !row || typeof row !== 'object') {
      return res.status(400).json({ message: 'table and row required' });
    }
    const result = await upsertCodingTableRow(table, row);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/schema-diff/compare', requireAuth, async (req, res, next) => {
  const controller = new AbortController();
  const handleAbort = () => controller.abort();
  req.on('close', handleAbort);
  res.on('close', handleAbort);
  try {
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!(await hasAction(session, 'system_settings'))) return res.sendStatus(403);
    const { schemaPath, schemaFile, allowDrops = false } = req.body || {};
    const result = await buildSchemaDiff({
      schemaPath,
      schemaFile,
      allowDrops: Boolean(allowDrops),
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      return res.status(499).json({ message: 'Schema diff aborted', aborted: true });
    }
    res.json(result);
  } catch (err) {
    if (controller.signal.aborted) {
      return res.status(499).json({ message: 'Schema diff aborted', aborted: true });
    }
    next(err);
  } finally {
    req.off('close', handleAbort);
    res.off('close', handleAbort);
  }
});

router.post('/schema-diff/apply', requireAuth, async (req, res, next) => {
  const controller = new AbortController();
  const handleAbort = () => controller.abort();
  req.on('close', handleAbort);
  res.on('close', handleAbort);
  try {
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!(await hasAction(session, 'system_settings'))) return res.sendStatus(403);
    const { statements, allowDrops = false, dryRun = false } = req.body || {};
    if (!Array.isArray(statements) || statements.length === 0) {
      return res.status(400).json({ message: 'statements array is required' });
    }
    const result = await applySchemaDiffStatements(statements, {
      allowDrops: Boolean(allowDrops),
      dryRun: Boolean(dryRun),
      signal: controller.signal,
    });
    if (controller.signal.aborted || result?.aborted) {
      return res
        .status(499)
        .json({ ...(result || {}), message: 'Schema diff apply aborted' });
    }
    res.json(result);
  } catch (err) {
    if (controller.signal.aborted) {
      return res.status(499).json({ message: 'Schema diff apply aborted', aborted: true });
    }
    next(err);
  } finally {
    req.off('close', handleAbort);
    res.off('close', handleAbort);
  }
});

export default router;
