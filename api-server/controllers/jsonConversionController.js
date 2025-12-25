import {
  ensureJsonConversionLog,
  executeConversion,
  listConversionLogs,
  listJsonAwareColumns,
  listTablesWithJsonInfo,
  rerunScript,
} from '../services/jsonConversion.js';

export async function listJsonTables(_req, res, next) {
  try {
    const tables = await listTablesWithJsonInfo();
    res.json(tables);
  } catch (err) {
    next(err);
  }
}

export async function listJsonTableColumns(req, res, next) {
  try {
    const { table } = req.params;
    if (!table) {
      return res.status(400).json({ message: 'table is required' });
    }
    const columns = await listJsonAwareColumns(table);
    res.json(columns);
  } catch (err) {
    next(err);
  }
}

export async function previewOrRunConversion(req, res, next) {
  try {
    const { table, columns, keepBackup, execute = false } = req.body || {};
    if (!table || !Array.isArray(columns)) {
      return res.status(400).json({ message: 'table and columns are required' });
    }
    const result = await executeConversion(table, columns, {
      keepBackup: !!keepBackup,
      execute: !!execute,
      actor: req.user?.empid || null,
    });
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
}

export async function listConversionHistory(_req, res, next) {
  try {
    await ensureJsonConversionLog();
    const logs = await listConversionLogs();
    res.json(logs);
  } catch (err) {
    next(err);
  }
}

export async function rerunSavedScript(req, res, next) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'id is required' });
    }
    const result = await rerunScript(id, req.user?.empid || null);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
}
