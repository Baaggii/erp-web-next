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
    const buildDetailMessage = (payload, interrupted = false) => {
      const completed = Number(payload?.completedStatements) || 0;
      const total = Number(payload?.totalStatements) || 0;
      const base = interrupted
        ? total
          ? `SQL execution was interrupted after ${completed}/${total} statement(s).`
          : `SQL execution was interrupted after ${completed} statement(s).`
        : total
        ? `SQL execution completed ${completed}/${total} statement(s).`
        : `SQL execution completed ${completed} statement(s).`;
      const failedList = Array.isArray(payload?.failed) ? payload.failed : [];
      const lastFailed = failedList.length
        ? failedList[failedList.length - 1]?.error || ''
        : payload?.lastError || '';
      const stmtSnippet = payload?.lastStatement
        ? ` Last statement: ${String(payload.lastStatement).slice(0, 300)}`
        : '';
      const errorPart = lastFailed ? ` Last error: ${lastFailed}.` : '';
      return `${base}${errorPart}${stmtSnippet}`.trim();
    };
    if (controller.signal.aborted || result?.aborted) {
      return res.status(200).json({
        ...(result || {}),
        message: buildDetailMessage(result, true),
        aborted: true,
      });
    }
    res.status(200).json({ ...(result || {}), message: buildDetailMessage(result, false) });
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
