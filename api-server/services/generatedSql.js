import fs from 'fs/promises';
import path from 'path';
import { pool } from '../../db/index.js';
import splitSql from '../utils/splitSql.js';

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

export async function runSql(sql) {
  const statements = splitSql(sql);
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
  return rows[0][key] + ';';
}
