import express from 'express';
import { saveSql, runSql } from '../services/generatedSql.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { table, sql } = req.body;
    if (!table || !sql) {
      return res.status(400).json({ message: 'table and sql required' });
    }
    await saveSql(table, sql);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.post('/execute', requireAuth, async (req, res, next) => {
  try {
    const { sql } = req.body;
    if (!sql) {
      return res.status(400).json({ message: 'sql required' });
    }
    const inserted = await runSql(sql);
    res.json({ inserted });
  } catch (err) {
    next(err);
  }
});

export default router;
