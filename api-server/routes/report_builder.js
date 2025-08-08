import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listDatabaseTables, listTableColumns } from '../../db/index.js';

const router = express.Router();

// List database tables
router.get('/tables', requireAuth, async (req, res, next) => {
  try {
    const tables = await listDatabaseTables();
    res.json({ tables });
  } catch (err) {
    next(err);
  }
});

// List fields for a specific table
router.get('/fields', requireAuth, async (req, res, next) => {
  try {
    const { table } = req.query;
    if (!table) return res.status(400).json({ message: 'table required' });
    const fields = await listTableColumns(table);
    res.json({ fields });
  } catch (err) {
    next(err);
  }
});

export default router;

