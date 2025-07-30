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
} from '../services/transactionImageService.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/tmp' });

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

router.delete('/cleanup/:days?', requireAuth, async (req, res, next) => {
  try {
    const days = parseInt(req.params.days || req.query.days, 10) || 30;
    const removed = await cleanupOldImages(days);
    res.json({ removed });
  } catch (err) {
    next(err);
  }
});

export default router;
