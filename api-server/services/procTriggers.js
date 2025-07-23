import { pool } from '../../db/index.js';

export async function getProcTriggers(table) {
  const [rows] = await pool.query('SHOW TRIGGERS WHERE `Table` = ?', [table]);
  const result = {};
  for (const row of rows || []) {
    const stmt = row.Statement || '';
    const call = stmt.match(/CALL\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/i);
    if (!call) continue;
    const [, proc, paramStr] = call;
    const params = paramStr
      .split(',')
      .map((p) => p.trim())
      .map((p) => {
        if (/^NEW\./i.test(p)) return p.replace(/^NEW\./i, '');
        if (/CURDATE\(\)/i.test(p)) return '$date';
        return p.replace(/['`]/g, '');
      });
    params.forEach((p) => {
      if (!p) return;
      if (!result[p]) result[p] = { name: proc, params };
    });
  }
  return result;
}
