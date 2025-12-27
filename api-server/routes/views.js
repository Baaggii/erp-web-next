import express from 'express';
import { listDatabaseViews } from '../../db/index.js';
import { requireAuth } from '../middlewares/auth.js';
import { ensureAdminResponse } from '../utils/admin.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    // Admin-only: exposes database view definitions which are sensitive metadata.
    if (!ensureAdminResponse(req, res)) return;
    const { prefix = '' } = req.query;
    const views = await listDatabaseViews(prefix);
    res.json(views);
  } catch (err) {
    next(err);
  }
});

export default router;
