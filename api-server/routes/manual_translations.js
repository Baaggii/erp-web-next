import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  loadTranslations,
  saveTranslation,
  deleteTranslation,
} from '../services/manualTranslations.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const data = await loadTranslations();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    await saveTranslation(req.body || {});
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const { key, type = 'locale' } = req.query;
    if (!key) return res.status(400).json({ error: 'key required' });
    await deleteTranslation(key, type);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
