import express from 'express';
import { getMappings, addMappings } from '../services/headerMappings.js';
import { requireAuth } from '../middlewares/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// GET /api/header_mappings?headers=a,b&lang=en
// "lang" selects a localized value when available.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { headers: headersParam, lang } = req.query;
    const headers = headersParam ? headersParam.split(',') : [];
    const map = await getMappings(headers, lang, companyId);
    res.json(map);
  } catch (err) {
    next(err);
  }
});

const postRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
});

// POST /api/header_mappings
// Body: { "sales": { "en": "Sales Dashboard" } }
router.post('/', requireAuth, postRateLimiter, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    await addMappings(req.body || {}, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
