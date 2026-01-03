import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { uploadCodingTable } from '../controllers/codingTableController.js';
import { upsertCodingTableRow } from '../services/codingTableRowUpsert.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/admin.js';
import {
  buildSchemaDiff,
  applySchemaDiffStatements,
  getSchemaDiffPrerequisites,
  recordSchemaBaseline,
  parseSchemaScript,
} from '../services/schemaDiff.js';
import { enqueueSchemaDiffJob, getSchemaDiffJob } from '../services/schemaDiffJobs.js';

const router = express.Router();
const LONG_RUNNING_TIMEOUT_MS = 5 * 60 * 1000;

function extendTimeouts(req, res) {
  if (req.setTimeout) req.setTimeout(LONG_RUNNING_TIMEOUT_MS);
  if (res.setTimeout) res.setTimeout(LONG_RUNNING_TIMEOUT_MS);
}

function sendAborted(res, err, fallbackMessage) {
  const message =
    typeof err === 'string' ? err : err?.message || fallbackMessage || 'Request aborted';
  return res.status(499).json({
    message,
    aborted: true,
    details: typeof err === 'object' ? err?.details : undefined,
  });
}

function sendKnownError(res, err, fallbackStatus = 500) {
  const status = err?.status || fallbackStatus;
  const body = {
    message: err?.message || 'Schema diff failed',
  };
  if (err?.details) body.details = err.details;
  if (err?.code && !body.code) body.code = err.code;
  return res.status(status).json(body);
}

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
  requireAdmin,
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

router.get('/schema-diff/check', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const checks = await getSchemaDiffPrerequisites();
    const issues = [];
    const warnings = [...(checks.warnings || [])];
    if (!checks.mysqldumpAvailable) issues.push('mysqldump is not available in PATH');
    if (!checks.env.DB_NAME) issues.push('DB_NAME environment variable is not set');
    if (!checks.liquibaseAvailable) warnings.push('Liquibase missing: advanced ALTER/routine diffs unavailable.');
    res.json({
      ok: issues.length === 0,
      issues,
      warnings,
      ...checks,
    });
  } catch (err) {
    if (err.status) return sendKnownError(res, err);
    next(err);
  }
});

router.post('/schema-diff/compare', requireAuth, requireAdmin, async (req, res, next) => {
  extendTimeouts(req, res);
  try {
    const { schemaPath, schemaFile, allowDrops = false } = req.body || {};
    const job = enqueueSchemaDiffJob({
      userId: req.user.empid,
      schemaPath,
      schemaFile,
      allowDrops: Boolean(allowDrops),
      onProgress: (message) => {
        req.app.get('io')?.to(req.user.empid?.toString()).emit('schema-diff-progress', {
          jobId: message.jobId,
          message: message.message,
          at: message.at,
        });
      },
    });
    res.status(202).json({ jobId: job.id });
  } catch (err) {
    if (err.status) return sendKnownError(res, err);
    next(err);
  }
});

router.post('/schema-diff/parse-script', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { schemaPath, schemaFile } = req.body || {};
    if (!schemaPath || !schemaFile) {
      return res.status(400).json({ message: 'schemaPath and schemaFile are required' });
    }
    const result = await parseSchemaScript({ schemaPath, schemaFile });
    res.json(result);
  } catch (err) {
    if (err.status) return sendKnownError(res, err);
    next(err);
  }
});

router.post('/schema-diff/baseline', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { schemaPath, schemaFile } = req.body || {};
    if (!schemaPath || !schemaFile) {
      return res.status(400).json({ message: 'schemaPath and schemaFile are required' });
    }
    const baseline = await recordSchemaBaseline({ schemaPath, schemaFile });
    res.json({ baseline });
  } catch (err) {
    if (err.status) return sendKnownError(res, err);
    next(err);
  }
});

router.post('/schema-diff/apply', requireAuth, requireAdmin, async (req, res, next) => {
  extendTimeouts(req, res);
  try {
    const {
      statements,
      allowDrops = false,
      dryRun = false,
      alterPreviewed = false,
      routineAcknowledged = false,
    } = req.body || {};
    if (!Array.isArray(statements) || statements.length === 0) {
      return res.status(400).json({ message: 'statements array is required' });
    }
    const result = await applySchemaDiffStatements(statements, {
      allowDrops: Boolean(allowDrops),
      dryRun: Boolean(dryRun),
      alterPreviewed: Boolean(alterPreviewed),
      routineAcknowledged: Boolean(routineAcknowledged),
    });
    res.json(result);
  } catch (err) {
    if (err.status) return sendKnownError(res, err);
    next(err);
  }
});

router.post('/schema-diff/parse-script', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { schemaPath, schemaFile } = req.body || {};
    if (!schemaPath || !schemaFile) {
      return res.status(400).json({ message: 'schemaPath and schemaFile are required' });
    }
    const result = await parseSchemaScript({ schemaPath, schemaFile });
    res.json(result);
  } catch (err) {
    if (err.status) return sendKnownError(res, err);
    next(err);
  }
});

router.get('/schema-diff/jobs/:jobId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const job = getSchemaDiffJob(req.params.jobId);
    if (!job || (job.userId && job.userId !== req.user.empid)) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.json(job.serialize());
  } catch (err) {
    next(err);
  }
});

export default router;
