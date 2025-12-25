import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listJsonConversionLogs,
  insertJsonConversionLog,
  listJsonConvertedColumns,
  getColumnDefinition,
  pool,
} from '../../db/index.js';

const router = express.Router();

async function runStatements(statements) {
  if (!Array.isArray(statements) || statements.length === 0) return;
  const conn = await pool.getConnection();
  try {
    for (const stmt of statements) {
      const sql = stmt.trim();
      if (!sql) continue;
      // eslint-disable-next-line no-await-in-loop
      await conn.query(sql);
    }
  } finally {
    conn.release();
  }
}

router.get('/logs', requireAuth, async (req, res, next) => {
  try {
    const table = typeof req.query.table === 'string' ? req.query.table : null;
    const logs = await listJsonConversionLogs(table);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

router.post('/logs', requireAuth, async (req, res, next) => {
  try {
    const { tableName, columnName, scriptText } = req.body || {};
    if (!tableName || !columnName || !scriptText) {
      return res.status(400).json({ message: 'tableName, columnName, and scriptText are required' });
    }
    await insertJsonConversionLog({
      tableName,
      columnName,
      scriptText,
      runBy: req.user?.username || req.user?.empid || 'system',
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/converted/:table', requireAuth, async (req, res, next) => {
  try {
    const set = await listJsonConvertedColumns(req.params.table);
    res.json({ columns: Array.from(set) });
  } catch (err) {
    next(err);
  }
});

router.post('/convert', requireAuth, async (req, res, next) => {
  try {
    const { tableName, columns, keepBackup = true, runScript = true } = req.body || {};
    if (!tableName || !Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ message: 'tableName and columns are required' });
    }

    const scripts = [];
    for (const col of columns) {
      // eslint-disable-next-line no-await-in-loop
      const def = await getColumnDefinition(tableName, col);
      const baseType = def?.columnType || 'TEXT';
      const backupName = `${col}_old`;
      const steps = [
        `-- Convert ${tableName}.${col} to JSON`,
        `ALTER TABLE \`${tableName}\` ADD COLUMN IF NOT EXISTS \`${backupName}\` ${baseType};`,
        `UPDATE \`${tableName}\` SET \`${backupName}\` = \`${col}\`;`,
        `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${col}\` JSON;`,
        `UPDATE \`${tableName}\` SET \`${col}\` = JSON_ARRAY(\`${backupName}\`) WHERE \`${backupName}\` IS NOT NULL;`,
      ];
      if (!keepBackup) {
        steps.push(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${backupName}\`;`);
      }
      scripts.push(steps.join('\n'));
    }

    const scriptText = scripts.join('\n\n');

    if (runScript) {
      const statements = scriptText
        .split(/;\s*\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('--'))
        .map((s) => `${s}${s.endsWith(';') ? '' : ';'}`);
      await runStatements(statements);
    }

    await Promise.all(
      columns.map((col) =>
        insertJsonConversionLog({
          tableName,
          columnName: col,
          scriptText,
          runBy: req.user?.username || req.user?.empid || 'system',
        }),
      ),
    );

    res.json({ ok: true, scriptText });
  } catch (err) {
    next(err);
  }
});

export default router;
