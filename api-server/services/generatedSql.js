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

export async function runSql(sql) {
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}
