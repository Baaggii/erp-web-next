import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import rateLimit from 'express-rate-limit';
import {
  loadTranslations,
  saveTranslation,
  deleteTranslation,
} from '../services/manualTranslations.js';

// Set up rate limiter: max 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the RateLimit-* headers
  legacyHeaders: false, // Disable the X-RateLimit-* headers
});

const router = express.Router();

router.get('/', limiter, requireAuth, async (req, res, next) => {
  try {
    const data = await loadTranslations();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', limiter, requireAuth, async (req, res, next) => {
  try {
    await saveTranslation(req.body || {});
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.delete('/', limiter, requireAuth, async (req, res, next) => {
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
