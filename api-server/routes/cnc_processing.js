import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
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

router.post(
  '/',
  requireAuth,
  cncLimiter,
  requireDeveloper,
  upload.single('file'),
  async (req, res) => {
    try {
      console.log('[CNC] Request received', {
        filename: req.file?.originalname,
        mimetype: req.file?.mimetype,
        size: req.file?.size,
        conversionType: req.body.conversionType,
        outputFormat: req.body.outputFormat,
      });

      if (!req.file) {
        throw new Error('No file uploaded');
      }

      const result = await processCncFile({
        file: req.file,
        outputFormat: req.body.outputFormat,
        options: { conversionType: req.body.conversionType },
      });

      console.log('[CNC] Processing success', result);

      return res.json(result);
    } catch (err) {
      console.error('[CNC ERROR]', err);
      return res.status(500).json({
        message: err.message || 'CNC processing failed',
      });
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
