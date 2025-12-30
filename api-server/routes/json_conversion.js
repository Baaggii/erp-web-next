import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/admin.js';
import {
  buildConversionPlan,
  listColumns,
  listSavedScripts,
  listTables,
  normalizeColumnsInput,
  recordConversionLog,
} from '../services/jsonConversion.js';

const router = express.Router();

router.get('/tables', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const tables = await listTables();
    res.json({ tables });
  } catch (err) {
    next(err);
  }
});

router.get('/tables/:table/columns', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { columns, tableForeignKeys, dbEngine } = await listColumns(req.params.table);
    res.json({ columns, tableForeignKeys, dbEngine });
  } catch (err) {
    next(err);
  }
});

router.get('/scripts', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const scripts = await listSavedScripts();
    res.json({ scripts });
  } catch (err) {
    next(err);
  }
});

router.post('/convert', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { table, columns, backup = true } = req.body || {};
    const normalizedColumns = normalizeColumnsInput(columns);
    if (!table || normalizedColumns.length === 0) {
      return res.status(400).json({ message: 'table and columns are required' });
    }
    const { columns: metadata, tableForeignKeys, dbEngine } = await listColumns(table);
    const plan = await buildConversionPlan(table, normalizedColumns, metadata, {
      backup,
      tableForeignKeys,
      dbEngine,
    });
    const runBy = req.user?.empid || req.user?.id || 'unknown';
    const logColumns = normalizedColumns.map((c) => c.name);
    const blocked = plan.previews.filter((p) => p.blocked);
    const logId = await recordConversionLog(table, logColumns, plan.scriptText, runBy);
    res.json({
      scriptText: plan.scriptText,
      previews: plan.previews,
      executed: false,
      logId,
      blockedColumns: blocked.map((p) => p.column),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/scripts/:id/run', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    return res.status(403).json({
      message: 'Script execution is disabled. Download the SQL and run it manually if needed.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
