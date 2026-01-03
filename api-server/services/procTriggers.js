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
  const assignOnlyColumns = new Set();
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
    // Track columns that have direct assignments without procedure calls to avoid false "unused" notices
    for (const [, col] of stmt.matchAll(/NEW\.([A-Za-z0-9_]+)\s*=/gi)) {
      assignOnlyColumns.add(col.toLowerCase());
    }
  }
  if (assignOnlyColumns.size > 0) {
    assignOnlyColumns.forEach((col) => {
      if (!result[col]) result[col] = [];
    });
  }
  return result;
}

function buildAssignmentExpressions(statement = '') {
  const matches = [
    ...statement.matchAll(
      /NEW\.([A-Za-z0-9_]+)\s*=\s*(.+?)(?=,\s*NEW\.|;)/gis,
    ),
  ];
  return matches.map(([, target, expr]) => ({
    target,
    expression: expr.trim(),
  }));
}

function buildParameterizedExpression(expression = '') {
  const params = [];
  let sql = expression;
  sql = sql.replace(/NEW\.([A-Za-z0-9_]+)/gi, (_, name) => {
    params.push(name);
    return '?';
  });
  return { sql: `SELECT (${sql}) AS value`, params };
}

export async function previewTriggerAssignments(table, values = {}) {
  const lowerValues = {};
  Object.entries(values || {}).forEach(([k, v]) => {
    lowerValues[String(k).toLowerCase()] = v;
  });
  const [rows] = await pool.query('SHOW TRIGGERS WHERE `Table` = ?', [table]);
  const assignments = {};
  for (const row of rows || []) {
    const stmt = row.Statement || '';
    const expressions = buildAssignmentExpressions(stmt);
    for (const { target, expression } of expressions) {
      if (!target || !expression) continue;
      const { sql, params } = buildParameterizedExpression(expression);
      const bindings = params.map((name) => lowerValues[name.toLowerCase()]);
      try {
        const [resultRows] = await pool.query(sql, bindings);
        const val =
          Array.isArray(resultRows) && resultRows.length > 0
            ? resultRows[0]?.value
            : null;
        assignments[target] = val;
      } catch (err) {
        // Ignore evaluation errors to avoid blocking the preview flow
      }
    }
  }
  return assignments;
}
