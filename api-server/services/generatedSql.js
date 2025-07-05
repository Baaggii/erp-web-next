import fs from 'fs/promises';
import path from 'path';
import { pool } from '../../db/index.js';

const jsonPath = path.join(process.cwd(), 'config', 'generatedSql.json');
const sqlPath = path.join(process.cwd(), 'config', 'generated.sql');

async function ensureDir() {
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
}

async function readMap() {
  try {
    await ensureDir();
    const data = await fs.readFile(jsonPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeFiles(map) {
  await ensureDir();
  const sqlCombined = Object.values(map).join('\n\n');
  await fs.writeFile(jsonPath, JSON.stringify(map, null, 2));
  await fs.writeFile(sqlPath, sqlCombined);
}

export async function saveSql(table, sql) {
  const map = await readMap();
  map[table] = sql;
  await writeFiles(map);
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

export async function runSql(sql) {
  const statements = splitSqlStatements(sql);
  let inserted = 0;
  const failed = [];
  for (const stmt of statements) {
    try {
      const [res] = await pool.query(stmt);
      if (res && typeof res.affectedRows === 'number') {
        const change = typeof res.changedRows === 'number' ? res.changedRows : 0;
        inserted += res.affectedRows - change;
      }
    } catch (err) {
      failed.push({ sql: stmt, error: err.message });
    }
  }
  return { inserted, failed };
}

export async function getTableStructure(table) {
  const [rows] = await pool.query(`SHOW CREATE TABLE \`${table}\``);
  if (!rows || rows.length === 0) return '';
  const key = Object.keys(rows[0]).find((k) => /create table/i.test(k));
  let sql = rows[0][key] + ';';
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    const numCols = cols.filter((c) => c.Field && c.Field.includes('num'));
    for (const col of numCols) {
      const trgName = `${table}_${col.Field}_bi`; // before insert
      sql += `\nDROP TRIGGER IF EXISTS \`${trgName}\`;`;
      let createSql;
      try {
        const [trg] = await pool.query(`SHOW CREATE TRIGGER \`${trgName}\``);
        if (trg && trg.length) {
          const k = Object.keys(trg[0]).find((x) => /create trigger/i.test(x));
          createSql = trg[0][k] + ';';
        }
      } catch {
        createSql = '';
      }
      if (!createSql) {
        createSql = `CREATE TRIGGER \`${trgName}\` BEFORE INSERT ON \`${table}\` FOR EACH ROW\nBEGIN\n  SET NEW.\`${col.Field}\` = CONCAT(\n    UPPER(CONCAT(\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26))\n    )),\n    '-',\n    UPPER(CONCAT(\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26))\n    )),\n    '-',\n    UPPER(CONCAT(\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26))\n    )),\n    '-',\n    UPPER(CONCAT(\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26)),\n      CHAR(FLOOR(65 + RAND() * 26))\n    ))\n  );\nEND;`;
      }
      sql += `\n${createSql}`;
    }
  } catch {
    // ignore trigger generation errors
  }
  return sql;
}
