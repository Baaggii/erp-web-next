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
const runStatusMap = new Map();

function initRunStatus(runId, statements = []) {
  runStatusMap.set(runId, {
    runId,
    status: 'pending',
    statements,
    executedCount: 0,
    executingIndex: null,
    error: null,
    updatedAt: Date.now(),
  });
}

function updateRunStatus(runId, updates = {}) {
  const current = runStatusMap.get(runId);
  if (!current) return;
  runStatusMap.set(runId, {
    ...current,
    ...updates,
    updatedAt: Date.now(),
  });
}

function setRunStatusError(runId, error) {
  updateRunStatus(runId, {
    status: 'error',
    error: error
      ? {
          message: error.message || String(error),
          code: error.code,
          sqlState: error.sqlState || error.sqlstate,
          statementIndex: error.statementIndex,
          statement: error.statement,
        }
      : null,
    executingIndex: null,
  });
}

function setRunStatusDone(runId) {
  updateRunStatus(runId, { status: 'completed', executingIndex: null });
}

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

router.get('/runs/:runId', requireAuth, requireAdmin, async (req, res) => {
  const status = runStatusMap.get(req.params.runId);
  if (!status) {
    return res.status(404).json({ message: 'Run not found' });
  }
  const { statements, executedCount, executingIndex, status: state, error } = status;
  const executedStatements = statements.slice(0, executedCount);
  const executingStatement =
    executingIndex !== null && executingIndex >= 0 ? statements[executingIndex] : null;
  const pendingStatements = statements.slice(
    executingIndex !== null && executingIndex >= 0 ? executingIndex + 1 : executedCount,
  );
  res.json({
    runId: status.runId,
    status: state,
    executedStatements,
    executingStatement,
    pendingStatements,
    error,
  });
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
      initRunStatus(runId, plan.statements);
      updateRunStatus(runId, { status: 'executing' });
      let startedAt = Date.now();
      try {
        const startedAt = Date.now();
        await runPlanStatements(plan.statements, {
          onProgress: ({ state, statementIndex }) => {
            if (state === 'executing') {
              updateRunStatus(runId, { executingIndex: statementIndex });
            }
            if (state === 'executed') {
              updateRunStatus(runId, {
                executedCount: Math.max(
                  runStatusMap.get(runId)?.executedCount ?? 0,
                  statementIndex + 1,
                ),
              });
            }
          },
        });
        executionDurationMs = Date.now() - startedAt;
        executed = true;
        setRunStatusDone(runId);
      } catch (err) {
        executionDurationMs = Date.now() - startedAt;
        runError = {
          message: err?.message,
          code: err?.code,
          sqlState: err?.sqlState || err?.sqlstate,
        };
        setRunStatusError(runId, err);
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
    const logId = await recordConversionLog(
      table,
      logColumns,
      plan.scriptText,
      runBy,
      runError ? 'error' : executed ? 'success' : 'planned',
      runError || null,
    );
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
        runId,
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
      runId,
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
  const runId = crypto.randomUUID();
  try {
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
    initRunStatus(runId, statements);
    updateRunStatus(runId, { status: 'executing' });
    await runPlanStatements(statements, {
      onProgress: ({ state, statementIndex }) => {
        if (state === 'executing') {
          updateRunStatus(runId, { executingIndex: statementIndex });
        }
        if (state === 'executed') {
          updateRunStatus(runId, {
            executedCount: Math.max(
              runStatusMap.get(runId)?.executedCount ?? 0,
              statementIndex + 1,
            ),
          });
        }
      },
    });
    setRunStatusDone(runId);
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
    res.json({ ok: true, runId });
  } catch (err) {
    setRunStatusError(runId, err);
    logConversionEvent({
      event: 'json-conversion.script-run-error',
      scriptId: req.params.id,
      error: err,
    });
    next(err);
  }
});

export default router;
