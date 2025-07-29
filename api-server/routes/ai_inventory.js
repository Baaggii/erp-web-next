import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middlewares/auth.js';
import {
  identifyItems,
  saveResult,
  listResults,
  confirmResult,
} from '../services/aiInventoryService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/identify', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'missing image' });
    const items = await identifyItems(req.file.buffer, req.file.mimetype);
    const result = await saveResult(req.user.empid, items);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/results', requireAuth, async (req, res, next) => {
  try {
    const data = await listResults();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/results/:id/confirm', requireAuth, async (req, res, next) => {
  try {
    const rec = await confirmResult(req.params.id);
    if (!rec) return res.sendStatus(404);
    res.json(rec);
  } catch (err) {
    next(err);
  }
});

export default router;
