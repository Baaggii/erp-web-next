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
  const abortHandler = () => controller.abort();
  req.on('close', abortHandler);
  res.on('close', abortHandler);
  try {
    const { sql } = req.body;
    if (!sql) {
      return res.status(400).json({ message: 'sql required' });
    }
    const result = await runSql(sql, controller.signal);
    if (controller.signal.aborted || result?.aborted) {
      const completed = Number(result?.completedStatements) || 0;
      const total = Number(result?.totalStatements) || 0;
      const base = total
        ? `SQL execution was interrupted after ${completed}/${total} statement(s).`
        : `SQL execution was interrupted after ${completed} statement(s).`;
      const lastFailed =
        Array.isArray(result?.failed) && result.failed.length > 0
          ? result.failed[result.failed.length - 1]?.error || ''
          : result?.lastError || '';
      const stmtSnippet = result?.lastStatement
        ? ` Last statement: ${String(result.lastStatement).slice(0, 300)}`
        : '';
      const errorPart = lastFailed ? ` Last error: ${lastFailed}.` : '';
      return res.status(200).json({
        ...(result || {}),
        message: `${base}${errorPart}${stmtSnippet}`.trim(),
        aborted: true,
      });
    }
    res.status(200).json(result);
  } catch (err) {
    if (controller.signal.aborted) {
      return res
        .status(200)
        .json({ message: 'SQL execution was interrupted', aborted: true });
    }
    next(err);
  } finally {
    req.off('close', abortHandler);
    res.off('close', abortHandler);
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
