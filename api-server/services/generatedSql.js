import fs from 'fs/promises';
import path from 'path';
import { pool } from '../../db/index.js';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

async function ensureDir(companyId = 0) {
  const filePath = tenantConfigPath('generatedSql.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readMap(companyId = 0) {
    try {
      const { path: jsonPath } = await getConfigPath(
        'generatedSql.json',
        companyId,
      );
      const data = await fs.readFile(jsonPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return {};
    }
}

async function writeFiles(map, companyId = 0) {
  await ensureDir(companyId);
  const jsonPath = tenantConfigPath('generatedSql.json', companyId);
  const sqlPath = tenantConfigPath('generated.sql', companyId);
  const sqlCombined = Object.values(map).join('\n\n');
  await fs.writeFile(jsonPath, JSON.stringify(map, null, 2));
  await fs.writeFile(sqlPath, sqlCombined);
}

export async function saveSql(table, sql, companyId = 0) {
  const map = await readMap(companyId);
  map[table] = sql;
  await writeFiles(map, companyId);
}

export function splitSqlStatements(sqlText) {
  const lines = sqlText.split(/\r?\n/);
  const statements = [];
  let current = [];
  let inTrigger = false;
  for (const line of lines) {
    current.push(line);
    if (inTrigger) {
      if (/END;\s*$/.test(line)) {
        statements.push(current.join('\n').trim());
        current = [];
        inTrigger = false;
      }
    } else if (/^CREATE\s+TRIGGER/i.test(line)) {
      inTrigger = true;
    } else if (/;\s*$/.test(line)) {
      statements.push(current.join('\n').trim());
      current = [];
    }
  }
  if (current.length) {
    const stmt = current.join('\n').trim();
    if (stmt) statements.push(stmt.endsWith(';') ? stmt : stmt + ';');
  }
  return statements;
}

export async function runSql(sql, signal) {
  if (signal?.aborted) {
    return { inserted: 0, failed: [], aborted: true };
  }
  const statements = splitSqlStatements(sql);
  let inserted = 0;
  const failed = [];
  const conn = await pool.getConnection();
  let aborted = false;
  let lastStatement = '';
  let completedStatements = 0;
  let lastError = '';
  const totalStatements = statements.length;
  try {
    for (const stmt of statements) {
      lastStatement = stmt;
      try {
        const [res] = await conn.query(stmt);
        if (res && typeof res.affectedRows === 'number') {
          const change = typeof res.changedRows === 'number' ? res.changedRows : 0;
          inserted += res.affectedRows - change;
        }
        completedStatements += 1;
      } catch (err) {
        failed.push({ sql: stmt, error: err.message });
        lastError = err?.message || '';
        completedStatements += 1;
      }
      if (signal?.aborted) {
        aborted = true;
        conn.destroy();
        break;
      }
    }
  } finally {
    if (!aborted) conn.release();
  }
  return {
    inserted,
    failed,
    aborted,
    lastStatement,
    lastError,
    completedStatements,
    totalStatements,
  };
}

export async function getTableStructure(table) {
  const [rows] = await pool.query(`SHOW CREATE TABLE \`${table}\``);
  if (!rows || rows.length === 0) return '';
  const key = Object.keys(rows[0]).find((k) => /create table/i.test(k));
  let sql = rows[0][key] + ';';
  try {
    const [trgs] = await pool.query(`SHOW TRIGGERS WHERE \`Table\` = ?`, [table]);
    for (const t of trgs) {
      const trgName = t.Trigger;
      sql += `\nDROP TRIGGER IF EXISTS \`${trgName}\`;`;
      try {
        const [info] = await pool.query(`SHOW CREATE TRIGGER \`${trgName}\``);
        if (info && info.length) {
          const k = Object.keys(info[0]).find((x) => /create trigger/i.test(x));
          sql += `\n${info[0][k]};`;
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore trigger fetching errors
  }
  return sql;
}
