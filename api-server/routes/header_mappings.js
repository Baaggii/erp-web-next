import express from 'express';
import { getMappings, addMappings } from '../services/headerMappings.js';
import { requireAuth } from '../middlewares/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const headers = req.query.headers ? req.query.headers.split(',') : [];
    const map = await getMappings(headers);
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

router.post('/', requireAuth, postRateLimiter, async (req, res, next) => {
  try {
    const mappings = req.body.mappings || {};
    await addMappings(mappings);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
