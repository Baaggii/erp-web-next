import express from 'express';
import { listDatabaseViews } from '../../db/index.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const views = await listDatabaseViews();
    res.json(views);
  } catch (err) {
    next(err);
  }
});

export default router;
