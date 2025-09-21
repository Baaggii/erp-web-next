import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  loadTranslations,
  saveTranslation,
  deleteTranslation,
} from '../services/manualTranslations.js';
import { createManualTranslationsLimiter } from './manual_translationsLimiter.js';

export function createManualTranslationsRouter({ limiter: limiterOptions } = {}) {
  const router = express.Router();
  router.use(requireAuth);
  const limiter = createManualTranslationsLimiter(limiterOptions);
  router.use(limiter);

  router.get('/', async (req, res, next) => {
    try {
      const data = await loadTranslations();
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      await saveTranslation(req.body || {});
      res.sendStatus(204);
    } catch (err) {
      if (err?.code === 'TRANSLATION_VALIDATION_FAILED') {
        return res.status(err.status || 400).json({
          error: 'translation_validation_failed',
          message: err.message || 'Translation failed validation',
          details: err.details || null,
        });
      }
      next(err);
    }
  });

  router.post('/bulk', async (req, res, next) => {
    try {
      const entries = Array.isArray(req.body) ? req.body : [];
      const referenceCache = {};
      for (const entry of entries) {
        await saveTranslation(entry || {}, { referenceCache });
      }
      res.sendStatus(204);
    } catch (err) {
      if (err?.code === 'TRANSLATION_VALIDATION_FAILED') {
        return res.status(err.status || 400).json({
          error: 'translation_validation_failed',
          message: err.message || 'Translation failed validation',
          details: err.details || null,
        });
      }
      next(err);
    }
  });

  router.delete('/', async (req, res, next) => {
    try {
      const { key, type = 'locale' } = req.query;
      if (!key) return res.status(400).json({ error: 'key required' });
      await deleteTranslation(key, type);
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

const router = createManualTranslationsRouter();

export default router;
