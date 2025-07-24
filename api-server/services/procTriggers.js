import { pool } from '../../db/index.js';

export async function getProcTriggers(table) {
  const [rows] = await pool.query('SHOW TRIGGERS WHERE `Table` = ?', [table]);
  const result = {};
  for (const row of rows || []) {
    const stmt = row.Statement || '';
    const varToCol = {};
    stmt.replace(/SET\s+NEW\.([A-Za-z0-9_]+)\s*=\s*([A-Za-z0-9_]+)/gi, (_, col, v) => {
      varToCol[v.toLowerCase()] = col;
      return '';
    });
    const calls = [...stmt.matchAll(/CALL\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/gi)];
    for (const c of calls) {
      const [, proc, paramStr] = c;
      const params = paramStr
        .split(',')
        .map((p) => p.trim())
        .map((p) => {
          if (/^NEW\./i.test(p)) return p.replace(/^NEW\./i, '');
          if (/CURDATE\(\)/i.test(p)) return '$date';
          return p.replace(/['`]/g, '');
        })
        .map((p) => p.toLowerCase());
      const outMap = {};
      params.forEach((p) => {
        if (varToCol[p]) outMap[p] = varToCol[p];
      });
      params.forEach((p) => {
        if (!p) return;
        const key = (varToCol[p] || p).toLowerCase();
        if (!result[key]) result[key] = [];
        const exists = result[key].some(
          (cfg) =>
            cfg.name === proc &&
            JSON.stringify(cfg.params) === JSON.stringify(params) &&
            JSON.stringify(cfg.outMap) === JSON.stringify(outMap),
        );
        if (!exists) result[key].push({ name: proc, params, outMap });
      });
    }
  }
  return result;
}
