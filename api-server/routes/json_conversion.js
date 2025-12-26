import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  buildConversionPlan,
  getSavedScript,
  listColumns,
  listSavedScripts,
  listTables,
  recordConversionLog,
  runPlanStatements,
  splitStatements,
  touchScriptRun,
} from '../services/jsonConversion.js';

const router = express.Router();

router.get('/tables', requireAuth, async (req, res, next) => {
  try {
    const tables = await listTables();
    res.json({ tables });
  } catch (err) {
    next(err);
  }
});

router.get('/tables/:table/columns', requireAuth, async (req, res, next) => {
  try {
    const columns = await listColumns(req.params.table);
    res.json({ columns });
  } catch (err) {
    next(err);
  }
});

router.get('/scripts', requireAuth, async (req, res, next) => {
  try {
    const scripts = await listSavedScripts();
    res.json({ scripts });
  } catch (err) {
    next(err);
  }
});

router.post('/convert', requireAuth, async (req, res, next) => {
  try {
    const { table, columns, backup = true, runNow = true } = req.body || {};
    if (!table || !Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ message: 'table and columns are required' });
    }
    const colNames = columns.map((c) => String(c));
    const metadata = await listColumns(table);
    const plan = buildConversionPlan(table, colNames, metadata, { backup });
    if (runNow) {
      await runPlanStatements(plan.statements);
    }
    const runBy = req.user?.empid || req.user?.id || 'unknown';
    const logId = await recordConversionLog(table, colNames, plan.scriptText, runBy);
    res.json({
      scriptText: plan.scriptText,
      previews: plan.previews,
      executed: Boolean(runNow),
      logId,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/scripts/:id/run', requireAuth, async (req, res, next) => {
  try {
    const script = await getSavedScript(req.params.id);
    if (!script) {
      return res.status(404).json({ message: 'Script not found' });
    }
    const statements = splitStatements(script.script_text);
    if (statements.length === 0) {
      return res.status(400).json({ message: 'No statements to run' });
    }
    await runPlanStatements(statements);
    const runBy = req.user?.empid || req.user?.id || 'unknown';
    await touchScriptRun(script.id, runBy);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
