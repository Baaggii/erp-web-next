import {
  listDatabaseTables,
  listJsonConversionLogs,
  insertJsonConversionLog,
  getJsonConversionLog,
  touchJsonConversionLogRun,
  listTableColumnMeta,
} from '../../db/index.js';
import { runSql } from '../services/generatedSql.js';

function buildConversionScript(table, column) {
  const safeTable = `\`${table}\``;
  const safeColumn = `\`${column}\``;
  return [
    `ALTER TABLE ${safeTable}`,
    `  MODIFY COLUMN ${safeColumn} JSON;`,
    `UPDATE ${safeTable}`,
    `  SET ${safeColumn} = JSON_ARRAY(${safeColumn})`,
    `  WHERE ${safeColumn} IS NOT NULL;`,
  ].join('\n');
}

export async function listTables(req, res, next) {
  try {
    const tables = await listDatabaseTables();
    res.json(tables);
  } catch (err) {
    next(err);
  }
}

export async function listColumns(req, res, next) {
  try {
    const { table } = req.params;
    const companyId = Number(req.query.companyId ?? req.user?.companyId ?? 0);
    const cols = await listTableColumnMeta(table, companyId);
    const logs = await listJsonConversionLogs(table);
    const logMap = new Map();
    logs.forEach((log) => {
      const key = String(log.columnName || '').toLowerCase();
      if (key) logMap.set(key, log);
    });
    const normalized = cols.map((col) => {
      const lower = String(col.name || '').toLowerCase();
      return {
        ...col,
        jsonLogged: logMap.has(lower),
        loggedScript: logMap.get(lower) || null,
        isJson: String(col.dataType || '').toLowerCase() === 'json',
      };
    });
    res.json({ columns: normalized, logs });
  } catch (err) {
    next(err);
  }
}

export async function convertColumns(req, res, next) {
  try {
    const { table, columns, run } = req.body || {};
    if (!table || !Array.isArray(columns) || columns.length === 0) {
      return res
        .status(400)
        .json({ message: 'table and at least one column are required' });
    }
    const scripts = [];
    for (const col of columns) {
      if (!col) continue;
      const scriptText = buildConversionScript(table, col);
      const entry = await insertJsonConversionLog({
        tableName: table,
        columnName: col,
        scriptText,
        runBy: run ? req.user?.empid ?? null : null,
        runAt: run ? new Date() : null,
      });
      if (run) {
        await runSql(scriptText);
      }
      scripts.push({ ...entry, scriptText });
    }
    res.json({ scripts });
  } catch (err) {
    next(err);
  }
}

export async function listScripts(req, res, next) {
  try {
    const scripts = await listJsonConversionLogs(req.query.table || null);
    res.json(scripts);
  } catch (err) {
    next(err);
  }
}

export async function runScript(req, res, next) {
  try {
    const { id } = req.params;
    const log = await getJsonConversionLog(id);
    if (!log) return res.status(404).json({ message: 'Script not found' });
    const result = await runSql(log.scriptText);
    const touch = await touchJsonConversionLogRun(id, req.user?.empid ?? null);
    res.json({ result, log: { ...log, runAt: touch.runAt, runBy: touch.runBy } });
  } catch (err) {
    next(err);
  }
}
