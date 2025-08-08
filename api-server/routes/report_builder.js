import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listDatabaseTables,
  listTableColumns,
  saveStoredProcedure,
} from '../../db/index.js';

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

// Save a stored procedure
router.post('/procedures', requireAuth, async (req, res, next) => {
  try {
    const { sql } = req.body || {};
    if (!sql) return res.status(400).json({ message: 'sql required' });
    await saveStoredProcedure(sql);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

