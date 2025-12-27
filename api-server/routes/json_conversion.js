import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { ensureAdminResponse } from '../utils/admin.js';
import { getEmploymentSession } from '../../db/index.js';
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

const router = express.Router();

router.get('/tables', requireAuth, async (req, res, next) => {
  try {
    // Admin-only: inspects database columns and may use admin credentials.
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!ensureAdminResponse(req, res, { sessionPermissions: session?.permissions })) return;
    const tables = await listTables({ user: req.user, sessionPermissions: session?.permissions });
    res.json({ tables });
  } catch (err) {
    next(err);
  }
});

router.get('/tables/:table/columns', requireAuth, async (req, res, next) => {
  try {
    // Admin-only: exposes schema metadata for arbitrary tables.
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!ensureAdminResponse(req, res, { sessionPermissions: session?.permissions })) return;
    const columns = await listColumns(req.params.table, {
      user: req.user,
      sessionPermissions: session?.permissions,
    });
    res.json({ columns });
  } catch (err) {
    next(err);
  }
});

router.get('/scripts', requireAuth, async (req, res, next) => {
  try {
    // Admin-only: manages saved schema-conversion scripts.
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!ensureAdminResponse(req, res, { sessionPermissions: session?.permissions })) return;
    const scripts = await listSavedScripts({ user: req.user, sessionPermissions: session?.permissions });
    res.json({ scripts });
  } catch (err) {
    next(err);
  }
});

router.post('/convert', requireAuth, async (req, res, next) => {
  try {
    // Admin-only: generates and optionally applies column conversion SQL.
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!ensureAdminResponse(req, res, { sessionPermissions: session?.permissions })) return;
    const { table, columns, backup = true, runNow = true } = req.body || {};
    const normalizedColumns = normalizeColumnsInput(columns);
    if (!table || normalizedColumns.length === 0) {
      return res.status(400).json({ message: 'table and columns are required' });
    }
    const metadata = await listColumns(table, {
      user: req.user,
      sessionPermissions: session?.permissions,
    });
    const plan = buildConversionPlan(table, normalizedColumns, metadata, { backup });
    const runBy = req.user?.empid || req.user?.id || 'unknown';
    const logColumns = normalizedColumns.map((c) => c.name);
    const blocked = plan.previews.filter((p) => p.blocked);
    let executed = false;
    let runError = null;
    if (runNow && plan.statements.length > 0) {
      try {
        await runPlanStatements(plan.statements, { user: req.user, sessionPermissions: session?.permissions });
        executed = true;
      } catch (err) {
        runError = {
          message: err?.message,
          code: err?.code,
          sqlState: err?.sqlState || err?.sqlstate,
        };
      }
    }
    const logId = await recordConversionLog(table, logColumns, plan.scriptText, runBy, {
      user: req.user,
      sessionPermissions: session?.permissions,
    });
    if (runError) {
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
    res.json({
      scriptText: plan.scriptText,
      previews: plan.previews,
      executed: Boolean(executed),
      logId,
      blockedColumns: blocked.map((p) => p.column),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/scripts/:id/run', requireAuth, async (req, res, next) => {
  try {
    // Admin-only: executes stored conversion scripts against database schema.
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!ensureAdminResponse(req, res, { sessionPermissions: session?.permissions })) return;
    const script = await getSavedScript(req.params.id, { user: req.user, sessionPermissions: session?.permissions });
    if (!script) {
      return res.status(404).json({ message: 'Script not found' });
    }
    const statements = splitStatements(script.script_text);
    if (statements.length === 0) {
      return res.status(400).json({ message: 'No statements to run' });
    }
    await runPlanStatements(statements, { user: req.user, sessionPermissions: session?.permissions });
    const runBy = req.user?.empid || req.user?.id || 'unknown';
    await touchScriptRun(script.id, runBy, { user: req.user, sessionPermissions: session?.permissions });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
