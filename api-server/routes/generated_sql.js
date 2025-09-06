import express from 'express';
import { saveSql, runSql, getTableStructure } from '../services/generatedSql.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { table, sql } = req.body;
    if (!table || !sql) {
      return res.status(400).json({ message: 'table and sql required' });
    }
    await saveSql(table, sql, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.post('/execute', requireAuth, async (req, res, next) => {
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  try {
    const { sql } = req.body;
    if (!sql) {
      return res.status(400).json({ message: 'sql required' });
    }
    const { inserted, failed, aborted } = await runSql(sql, controller.signal);
    res.json({ inserted, failed, aborted });
  } catch (err) {
    next(err);
  }
});

router.get('/structure', requireAuth, async (req, res, next) => {
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
