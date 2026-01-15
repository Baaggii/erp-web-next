import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { performance } from 'perf_hooks';
import { requireAuth } from '../middlewares/auth.js';
import { getEmploymentSession } from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';
import {
  processCncFile,
  getCncOutput,
} from '../services/cncProcessingService.js';

const router = express.Router();

const cncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.user?.empid ?? req.ip,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

async function requireDeveloper(req, res, next) {
  try {
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, req.user.companyId));
    const hasDeveloperAccess = await hasAction(session, 'cnc_processing');
    if (!hasDeveloperAccess) {
      return res.status(403).json({ message: 'Developer privileges required' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

function buildAbsoluteUrl(req, pathname) {
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  let base = `${proto}://${host}`;
  const origin = req.get('origin');
  if (origin && (host?.startsWith('127.') || host === 'localhost')) {
    base = origin.replace(/\/$/, '');
  }
  return `${base}${pathname}`;
}

router.post(
  '/',
  requireAuth,
  cncLimiter,
  requireDeveloper,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ message: 'File too large' });
        }
        return next(err);
      }
      return next();
    });
  },
  async (req, res, next) => {
    const start = performance.now();
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'File is required' });
      }
      const outputFormat = req.body?.outputFormat || 'gcode';
      const conversionType = req.body?.conversionType || 'vectorize';
      const step = req.body?.step;
      const feedRate = req.body?.feedRate;
      const cutDepth = req.body?.cutDepth;
      const safeHeight = req.body?.safeHeight;
      const plungeRate = req.body?.plungeRate;

      const metadata = await processCncFile({
        file: req.file,
        outputFormat,
        options: {
          step: step ? Number(step) : undefined,
          feedRate: feedRate ? Number(feedRate) : undefined,
          cutDepth: cutDepth ? Number(cutDepth) : undefined,
          safeHeight: safeHeight ? Number(safeHeight) : undefined,
          plungeRate: plungeRate ? Number(plungeRate) : undefined,
        },
      });

      const processingTimeMs = Math.round(performance.now() - start);
      const downloadUrl = buildAbsoluteUrl(
        req,
        `/api/cnc_processing/download/${metadata.id}`,
      );

      return res.json({
        fileName: metadata.fileName,
        downloadUrl,
        processingTimeMs,
        outputFormat,
        conversionType,
      });
    } catch (err) {
      return next(err);
    }
  },
);

router.get(
  '/download/:id',
  requireAuth,
  cncLimiter,
  requireDeveloper,
  async (req, res, next) => {
    try {
      const record = getCncOutput(req.params.id);
      if (!record) {
        return res.status(404).json({ message: 'File not found' });
      }
      res.setHeader('Content-Type', record.mimeType || 'application/octet-stream');
      return res.download(record.path, record.fileName);
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
