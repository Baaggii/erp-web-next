import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middlewares/auth.js';
import { saveImages, listImages } from '../services/transactionImageService.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/tmp' });

router.post('/:name', requireAuth, upload.array('images'), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'no files' });
    }
    const { trtype = '', transType = '' } = req.query;
    const files = await saveImages(trtype, transType, req.params.name, req.files);
    res.json(files);
  } catch (err) {
    next(err);
  }
});

router.get('/:name', requireAuth, async (req, res, next) => {
  try {
    const { trtype = '', transType = '' } = req.query;
    const files = await listImages(trtype, transType, req.params.name);
    res.json(files);
  } catch (err) {
    next(err);
  }
});

export default router;
