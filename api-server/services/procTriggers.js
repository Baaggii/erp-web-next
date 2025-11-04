import { pool } from '../../db/index.js';

function stripQuotes(value = '') {
  return value.replace(/['`]/g, '');
}

const RESERVED_TOKENS = new Set([
  'case',
  'coalesce',
  'false',
  'greatest',
  'if',
  'ifnull',
  'least',
  'new',
  'null',
  'then',
  'true',
  'when',
  'while',
]);

function normalizeAssignmentToken(raw) {
  const cleaned = stripQuotes(String(raw || '').trim());
  if (!cleaned) return '';
  const match = cleaned.match(/[@:$]([A-Za-z0-9_]+)/);
  if (match) return match[1].toLowerCase();
  if (cleaned.startsWith('$')) return '';
  const tokens = cleaned.match(
    /[@:$]?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/g,
  );
  if (!tokens) return '';
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = normalizeParamToken(tokens[i]);
    if (!token || RESERVED_TOKENS.has(token)) continue;
    return token;
  }
  return '';
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
      /SET\s+NEW\.([A-Za-z0-9_]+)\s*=\s*([^;]+)/gi,
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
