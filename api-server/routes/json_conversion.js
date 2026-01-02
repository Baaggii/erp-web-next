import crypto from 'crypto';
import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/admin.js';
import {
  buildConversionPlan,
  getSavedScript,
  listColumns,
  listSavedScripts,
  listTables,
  normalizeColumnsInput,
  recordConversionLog,
  runPlanStatements,
  splitStatements,
  touchScriptRun,
} from '../services/jsonConversion.js';
import { logConversionEvent } from '../utils/jsonConversionLogger.js';

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
  const runId = crypto.randomUUID();
  const requestStartedAt = Date.now();
  try {
    const { table, columns, backup = true, runNow = true } = req.body || {};
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
    logConversionEvent({
      event: 'json-conversion.plan-ready',
      runId,
      table,
      columns: logColumns,
      statementCount: plan.statements.length,
      blockedColumns: blocked.map((p) => p.column),
      dbEngine,
      backup,
      runNow,
      runBy,
      statementsSample: plan.statements.slice(0, 3),
    });
    let executed = false;
    let runError = null;
    let executionDurationMs = 0;
    if (runNow && plan.statements.length > 0) {
      try {
        const startedAt = Date.now();
        await runPlanStatements(plan.statements);
        executionDurationMs = Date.now() - startedAt;
        executed = true;
      } catch (err) {
        executionDurationMs = Date.now() - startedAt;
        runError = {
          message: err?.message,
          code: err?.code,
          sqlState: err?.sqlState || err?.sqlstate,
        };
        logConversionEvent({
          event: 'json-conversion.apply-error',
          runId,
          table,
          columns: logColumns,
          statementCount: plan.statements.length,
          failedStatementIndex: err?.statementIndex,
          failedStatement: err?.statement,
          durationMs: executionDurationMs,
          error: err,
          runBy,
        });
      }
    }
    const logId = await recordConversionLog(table, logColumns, plan.scriptText, runBy);
    if (runError) {
      logConversionEvent({
        event: 'json-conversion.respond-error',
        runId,
        table,
        columns: logColumns,
        statementCount: plan.statements.length,
        durationMs: Date.now() - requestStartedAt,
        error: runError,
        logId,
        runBy,
      });
      return res.status(409).json({
        message:
          runError.message ||
          'Conversion failed while applying statements. Please inspect constraints and rerun.',
        error: runError,
        scriptText: plan.scriptText,
        previews: plan.previews,
        executed: false,
        logId,
        blockedColumns: blocked.map((p) => p.column),
      });
    }
    logConversionEvent({
      event: 'json-conversion.respond-success',
      runId,
      table,
      columns: logColumns,
      statementCount: plan.statements.length,
      durationMs: Date.now() - requestStartedAt,
      logId,
      runBy,
      executed,
      blockedColumns: blocked.map((p) => p.column),
    });
    res.json({
      scriptText: plan.scriptText,
      previews: plan.previews,
      executed: Boolean(executed),
      logId,
      blockedColumns: blocked.map((p) => p.column),
    });
  } catch (err) {
    logConversionEvent({
      event: 'json-conversion.unhandled-error',
      runId,
      error: err,
    });
    next(err);
  }
});

router.post('/scripts/:id/run', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const runId = crypto.randomUUID();
    const startedAt = Date.now();
    const script = await getSavedScript(req.params.id);
    if (!script) {
      return res.status(404).json({ message: 'Script not found' });
    }
    const runBy = req.user?.empid || req.user?.id || 'unknown';
    const statements = splitStatements(script.script_text);
    if (statements.length === 0) {
      return res.status(400).json({ message: 'No statements to run' });
    }
    logConversionEvent({
      event: 'json-conversion.script-run-start',
      runId,
      scriptId: script.id,
      table: script.table_name,
      columns: (script.column_name || '').split(','),
      statementCount: statements.length,
      runBy,
      statementsSample: statements.slice(0, 3),
    });
    await runPlanStatements(statements);
    await touchScriptRun(script.id, runBy);
    logConversionEvent({
      event: 'json-conversion.script-run-success',
      runId,
      scriptId: script.id,
      table: script.table_name,
      columns: (script.column_name || '').split(','),
      statementCount: statements.length,
      durationMs: Date.now() - startedAt,
      runBy,
    });
    res.json({ ok: true });
  } catch (err) {
    logConversionEvent({
      event: 'json-conversion.script-run-error',
      scriptId: req.params.id,
      error: err,
    });
    next(err);
  }
});

export default router;
