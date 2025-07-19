import express from 'express';
import { saveSql, runSql, getTableStructure } from '../services/generatedSql.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { table, sql } = req.body;
    if (!table || !sql) {
      return res.status(400).json({ message: 'table and sql required' });
    }
    if (/\b(drop|truncate|alter)\b/i.test(sql)) {
      return res.status(400).json({ message: 'Dangerous SQL detected' });
    }
    await saveSql(table, sql);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.post('/execute', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { sql } = req.body;
    if (!sql) {
      return res.status(400).json({ message: 'sql required' });
    }
    if (/\b(drop|truncate|alter)\b/i.test(sql)) {
      return res.status(400).json({ message: 'Dangerous SQL detected' });
    }
    const { inserted, failed } = await runSql(sql);
    res.json({ inserted, failed });
  } catch (err) {
    next(err);
  }
});

router.get('/structure', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { table } = req.query;
    if (!table) return res.status(400).json({ message: 'table required' });
    const sql = await getTableStructure(table);
    if (!sql) return res.status(404).json({ message: 'not found' });
    res.json({ sql });
  } catch (err) {
    next(err);
  }
});

export default router;
