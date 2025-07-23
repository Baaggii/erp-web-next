import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { callStoredProcedure } from '../../db/index.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, params } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name required' });
    const rows = await callStoredProcedure(name, Array.isArray(params) ? params : []);
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

export default router;
