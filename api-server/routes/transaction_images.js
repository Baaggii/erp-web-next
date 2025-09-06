import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../middlewares/auth.js';
import {
  saveImages,
  listImages,
  renameImages,
  deleteImage,
  deleteAllImages,
  cleanupOldImages,
  detectIncompleteImages,
  fixIncompleteImages,
  checkUploadedImages,
  commitUploadedImages,
  detectIncompleteFromNames,
  searchImages,
} from '../services/transactionImageService.js';
import { getGeneralConfig } from '../services/generalConfig.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const companyId = req.user?.companyId || 0;
    const dest = path.join('uploads', String(companyId), 'tmp');
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
});

const upload = multer({ storage });

function toAbsolute(req, list) {
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  let base = `${proto}://${host}`;
  const origin = req.get('origin');
  if (origin && (host?.startsWith('127.') || host === 'localhost')) {
    base = origin.replace(/\/$/, '');
  }
  return list.map((p) => (p.startsWith('http') ? p : `${base}${p}`));
}

// Cleanup old images before the dynamic routes so /cleanup isn't captured
router.delete('/cleanup/:days?', requireAuth, async (req, res, next) => {
  try {
    let days = parseInt(req.params.days || req.query.days, 10);
    if (!days || Number.isNaN(days)) {
      const cfg = await getGeneralConfig(req.user.companyId);
      days = cfg.images?.cleanupDays || 30;
    }
    const removed = await cleanupOldImages(days, req.user.companyId);
    res.json({ removed });
  } catch (err) {
    next(err);
  }
});

router.get('/detect_incomplete', requireAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.pageSize, 10) || 100;
    const data = await detectIncompleteImages(page, perPage, req.user.companyId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/fix_incomplete', requireAuth, async (req, res, next) => {
  try {
    const arr = Array.isArray(req.body?.list) ? req.body.list : [];
    const fixed = await fixIncompleteImages(arr, req.user.companyId);
    res.json({ fixed });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/upload_check',
  requireAuth,
  (req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      return upload.array('images')(req, res, next);
    }
    return next();
  },
  async (req, res, next) => {
    try {
      let metaRaw = req.body?.meta || [];
      if (!Array.isArray(metaRaw)) metaRaw = [metaRaw];
      const files = Array.isArray(req.files) ? req.files : [];
      const names = Array.isArray(req.body?.names) ? req.body.names : [];
      if (metaRaw.length && metaRaw.length !== files.length) {
        return res.status(400).json({ message: 'Mismatched metadata' });
      }
      const withMeta = files.map((f, i) => {
        let m = {};
        try {
          m = JSON.parse(metaRaw[i] || '{}');
        } catch {
          // ignore malformed metadata
        }
        return {
          ...f,
          index: m.index,
          rowId: m.rowId,
          transType: m.transType,
          originalname: m.originalName || f.originalname,
        };
      });
      const { list, summary } = await checkUploadedImages(withMeta, names, req.user.companyId);
      res.json({ list, summary });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/upload_scan', requireAuth, async (req, res, next) => {
  try {
    const names = Array.isArray(req.body?.names) ? req.body.names : [];
    const { list, skipped, summary } = await detectIncompleteFromNames(names, req.user.companyId);
    res.json({ list, skipped, summary });
  } catch (err) {
    next(err);
  }
});

router.post('/upload_commit', requireAuth, async (req, res, next) => {
  try {
    const arr = Array.isArray(req.body?.list) ? req.body.list : [];
    const uploaded = await commitUploadedImages(arr, req.user.companyId);
    res.json({ uploaded });
  } catch (err) {
    next(err);
  }
});

router.get('/search/:value', requireAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.pageSize, 10) || 20;
    const { files, total } = await searchImages(req.params.value, page, perPage, req.user.companyId);
    res.json({ files: toAbsolute(req, files), total, page, perPage });
  } catch (err) {
    next(err);
  }
});

router.post('/:table/:name', requireAuth, upload.array('images'), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'no files' });
    }
    const files = await saveImages(
      req.params.table,
      req.params.name,
      req.files,
      req.query.folder,
      req.user.companyId,
    );
    res.json(toAbsolute(req, files));
  } catch (err) {
    next(err);
  }
});

router.get('/:table/:name', requireAuth, async (req, res, next) => {
  try {
    const files = await listImages(
      req.params.table,
      req.params.name,
      req.query.folder,
      req.user.companyId,
    );
    res.json(toAbsolute(req, files));
  } catch (err) {
    next(err);
  }
});

router.post('/:table/:oldName/rename/:newName', requireAuth, async (req, res, next) => {
  try {
    const files = await renameImages(
      req.params.table,
      req.params.oldName,
      req.params.newName,
      req.query.folder,
      req.user.companyId,
    );
    res.json(toAbsolute(req, files));
  } catch (err) {
    next(err);
  }
});

router.delete('/:table/:name/:file', requireAuth, async (req, res, next) => {
  try {
    const ok = await deleteImage(
      req.params.table,
      req.params.file,
      req.query.folder,
      req.user.companyId,
    );
    res.json({ ok });
  } catch (err) {
    next(err);
  }
});

router.delete('/:table/:name', requireAuth, async (req, res, next) => {
  try {
    const count = await deleteAllImages(
      req.params.table,
      req.params.name,
      req.query.folder,
      req.user.companyId,
    );
    res.json({ deleted: count });
  } catch (err) {
    next(err);
  }
});

export default router;
