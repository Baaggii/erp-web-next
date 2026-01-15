import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middlewares/auth.js';
import { getEmploymentSession } from '../../db/index.js';
import { processCncFile, getCncOutputPath } from '../services/cncProcessing.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.dxf']);
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'application/dxf',
  'image/vnd.dxf',
  'application/octet-stream',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = file.mimetype;
    if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_MIME_TYPES.has(mime)) {
      const err = new Error('Unsupported file type for CNC processing.');
      err.status = 415;
      return cb(err);
    }
    return cb(null, true);
  },
});

const router = express.Router();

async function requireDeveloper(req, res, next) {
  try {
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, req.user.companyId));
    if (!session?.permissions?.developer) {
      return res.status(403).json({
        message: 'Developer role required to access CNC processing.',
      });
    }
    req.session = session;
    return next();
  } catch (err) {
    return next(err);
  }
}

function handleUploadError(err, req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        message: 'Uploaded file exceeds the 25MB limit.',
      });
    }
    return res.status(400).json({ message: err.message });
  }
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return next(err);
}

router.post(
  '/',
  requireAuth,
  requireDeveloper,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => handleUploadError(err, req, res, next));
  },
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
      }

      const { conversionType, outputFormat } = req.body || {};
      const result = await processCncFile({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        conversionType,
        outputFormat,
      });

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const downloadUrl = `${baseUrl}/api/cnc_processing/download/${result.filename}`;

      return res.json({
        fileName: result.filename,
        downloadUrl,
        outputFormat: result.outputFormat,
        inputType: result.inputType,
        conversionType: result.conversionType,
        processingTimeMs: result.processingTimeMs,
        sizeBytes: result.sizeBytes,
      });
    } catch (err) {
      return next(err);
    }
  },
);

router.get('/download/:filename', requireAuth, requireDeveloper, (req, res, next) => {
  try {
    const filename = req.params.filename;
    const outputPath = getCncOutputPath(filename);
    if (!outputPath || !fs.existsSync(outputPath)) {
      return res.status(404).json({ message: 'CNC output not found.' });
    }
    return res.download(outputPath, filename);
  } catch (err) {
    return next(err);
  }
});

export default router;
