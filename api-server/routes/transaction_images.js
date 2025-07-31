import express from 'express';
import multer from 'multer';
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
} from '../services/transactionImageService.js';
import { getGeneralConfig } from '../services/generalConfig.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/tmp' });

// Cleanup old images before the dynamic routes so /cleanup isn't captured
router.delete('/cleanup/:days?', requireAuth, async (req, res, next) => {
  try {
    let days = parseInt(req.params.days || req.query.days, 10);
    if (!days || Number.isNaN(days)) {
      const cfg = await getGeneralConfig();
      days = cfg.general?.imageStorage?.cleanupDays || 30;
    }
    const removed = await cleanupOldImages(days);
    res.json({ removed });
  } catch (err) {
    next(err);
  }
});

router.get('/detect_incomplete', requireAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const data = await detectIncompleteImages(page);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/fix_incomplete', requireAuth, async (req, res, next) => {
  try {
    const arr = Array.isArray(req.body?.list) ? req.body.list : [];
    const fixed = await fixIncompleteImages(arr);
    res.json({ fixed });
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
    );
    res.json(files);
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
    );
    res.json(files);
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
    );
    res.json(files);
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
    );
    res.json({ deleted: count });
  } catch (err) {
    next(err);
  }
});

export default router;
