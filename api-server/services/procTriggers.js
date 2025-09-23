import { pool } from '../../db/index.js';

function stripQuotes(value = '') {
  return value.replace(/['`]/g, '');
}

function normalizeAssignmentToken(raw) {
  const cleaned = stripQuotes(String(raw || '').trim());
  if (!cleaned || cleaned.startsWith('$')) return '';
  const withoutMarkers = cleaned.replace(/^[^A-Za-z0-9_]+/, '');
  if (!withoutMarkers || /[^A-Za-z0-9_]/.test(withoutMarkers)) return '';
  return withoutMarkers.toLowerCase();
}

function normalizeParamToken(raw) {
  let cleaned = stripQuotes(String(raw || '').trim());
  if (!cleaned) return '';
  if (/^NEW\./i.test(cleaned)) {
    cleaned = cleaned.replace(/^NEW\./i, '');
  } else if (/CURDATE\(\)/i.test(cleaned)) {
    return '$date';
  }
  if (cleaned.startsWith('$')) {
    return cleaned.toLowerCase();
  }
  const withoutMarkers = cleaned.replace(/^[^A-Za-z0-9_]+/, '');
  const normalized =
    withoutMarkers && /^[A-Za-z0-9_]+$/.test(withoutMarkers)
      ? withoutMarkers
      : cleaned;
  return normalized.toLowerCase();
}

export async function getProcTriggers(table) {
  const [rows] = await pool.query('SHOW TRIGGERS WHERE `Table` = ?', [table]);
  const result = {};
  for (const row of rows || []) {
    const stmt = row.Statement || '';
    const varToCol = {};
    for (const [, col, token] of stmt.matchAll(
      /SET\s+NEW\.([A-Za-z0-9_]+)\s*=\s*([^,\s;]+)/gi,
    )) {
      const key = normalizeAssignmentToken(token);
      if (key) varToCol[key] = col;
    }
    const calls = [...stmt.matchAll(/CALL\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/gi)];
    for (const c of calls) {
      const [, proc, paramStr] = c;
      const params = paramStr
        .split(',')
        .map((p) => normalizeParamToken(p))
        .filter((p) => p !== '');
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
