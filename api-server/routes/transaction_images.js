import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middlewares/auth.js';
import {
  saveImages,
  listImages,
  renameImages,
  deleteImages,
} from '../services/transactionImageService.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/tmp' });

router.post('/:table/:name', requireAuth, upload.array('images'), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'no files' });
    }
    const folder = req.query.folder || '';
    const files = await saveImages(req.params.table, req.params.name, req.files, folder);
    res.json(files);
  } catch (err) {
    next(err);
  }
});

router.get('/:table/:name', requireAuth, async (req, res, next) => {
  try {
    const folder = req.query.folder || '';
    const files = await listImages(req.params.table, req.params.name, folder);
    res.json(files);
  } catch (err) {
    next(err);
  }
});

router.post('/rename', requireAuth, async (req, res, next) => {
  try {
    const { table, oldName, newName, folderPath = '' } = req.body || {};
    if (!table || !oldName || !newName) {
      return res.status(400).json({ message: 'invalid data' });
    }
    const renamed = await renameImages(table, oldName, newName, folderPath);
    res.json(renamed);
  } catch (err) {
    next(err);
  }
});

router.delete('/:table/:name', requireAuth, async (req, res, next) => {
  try {
    const folder = req.query.folder || '';
    const file = req.query.file || '';
    await deleteImages(req.params.table, req.params.name, folder, file);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
