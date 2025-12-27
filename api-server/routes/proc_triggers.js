import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getProcTriggers } from '../services/procTriggers.js';
import { ensureAdminResponse } from '../utils/admin.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    // Admin-only: reveals trigger/procedure relationships; restrict to admins to avoid leakage.
    if (!ensureAdminResponse(req, res)) return;
    const { table } = req.query;
    if (!table) return res.status(400).json({ message: 'table required' });
    const triggers = await getProcTriggers(table);
    res.json(triggers);
  } catch (err) {
    next(err);
  }
});

export default router;
