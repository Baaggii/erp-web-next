import fs from 'fs/promises';
import path from 'path';
import { pool } from '../../db/index.js';
import { getConfigPath } from '../utils/configPaths.js';
import { parseLocalizedNumber } from '../../src/erp.mgt.mn/utils/parseLocalizedNumber.js';

const masterForeignKeyCache = new Map();
const masterTableColumnsCache = new Map();

const arrayIndexPattern = /^(0|[1-9]\d*)$/;

const SESSION_KEY_MAP = new Map([
  ['employee_id', 'emp_id'],
  ['employeeid', 'emp_id'],
  ['user_id', 'emp_id'],
  ['userid', 'emp_id'],
  ['company_id', 'company_id'],
  ['companyid', 'company_id'],
  ['branch_id', 'branch_id'],
  ['branchid', 'branch_id'],
  ['department_id', 'department_id'],
  ['departmentid', 'department_id'],
  ['session_id', 'session_id'],
  ['sessionid', 'session_id'],
  ['pos_date', 'pos_date'],
  ['posdate', 'pos_date'],
  ['date', 'pos_date'],
]);

function toSnakeCaseKey(rawKey) {
  if (typeof rawKey !== 'string') return '';
  const trimmed = rawKey.trim();
  if (!trimmed) return '';
  const snake = trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z0-9]+)/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/__+/g, '_')
    .toLowerCase();
  return SESSION_KEY_MAP.get(snake) || snake;
}

async function getMasterTableColumnSet(table) {
  if (!table) return new Set();
  if (masterTableColumnsCache.has(table)) {
    return masterTableColumnsCache.get(table);
  }
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [table],
  );
  const set = new Set();
  for (const row of rows) {
    const column = row?.COLUMN_NAME;
    if (column) {
      set.add(column);
    }
  }
  masterTableColumnsCache.set(table, set);
  return set;
}

function normalizeSessionInfo(sessionInfo, posData, masterColumns) {
  if (!isPlainObject(sessionInfo)) return {};
  const allowed = new Set();
  if (isPlainObject(posData)) {
    for (const key of Object.keys(posData)) {
      allowed.add(key);
    }
  }
  if (masterColumns instanceof Set) {
    for (const col of masterColumns) {
      allowed.add(col);
    }
  }
  if (!allowed.size) return {};
  const normalized = {};
  for (const [rawKey, value] of Object.entries(sessionInfo)) {
    if (value === undefined) continue;
    const key = toSnakeCaseKey(rawKey);
    if (!key || !allowed.has(key)) continue;
    normalized[key] = value;
  }
  return normalized;
}

function getValue(row, field) {
  const val = row?.[field];
  return val !== undefined && val !== null ? val : undefined;
}

function setValue(target, field, value) {
  if (target && field) {
    target[field] = value;
  }
}

function extractArrayMetadata(value) {
  if (!value || typeof value !== 'object') return null;
  const metadata = {};
  let hasMetadata = false;
  for (const key of Object.keys(value)) {
    if (key === 'rows' || key === 'meta') continue;
    if (arrayIndexPattern.test(key)) continue;
    metadata[key] = value[key];
    hasMetadata = true;
  }
  return hasMetadata ? metadata : null;
}

function assignArrayMetadata(target, source) {
  if (!Array.isArray(target) || !source || typeof source !== 'object') {
    return target;
  }
  const metadata = extractArrayMetadata(source);
  if (!metadata) return target;
  Object.assign(target, metadata);
  return target;
}

function sumCellValue(source, field) {
  if (Array.isArray(source)) {
    let sum = 0;
    let hasData = false;
    for (const row of source) {
      if (!row || typeof row !== 'object') continue;
      const raw = getValue(row, field);
      if (raw === undefined) continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      sum += num;
      hasData = true;
    }
    if (!hasData && source.length === 0) {
      hasData = true;
    }
    return { sum, hasValue: hasData };
  }
  if (isPlainObject(source)) {
    const raw = getValue(source, field);
    if (raw === undefined) {
      return { sum: 0, hasValue: false };
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      return { sum: 0, hasValue: false };
    }
    return { sum: num, hasValue: true };
  }
  return { sum: 0, hasValue: false };
}

function avgCellValue(source, field) {
  if (Array.isArray(source)) {
    let sum = 0;
    let count = 0;
    for (const row of source) {
      if (!row || typeof row !== 'object') continue;
      const raw = getValue(row, field);
      if (raw === undefined) continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      sum += num;
      count += 1;
    }
    return { sum, count, hasValue: count > 0 };
  }
  if (isPlainObject(source)) {
    const raw = getValue(source, field);
    if (raw === undefined) {
      return { sum: 0, count: 0, hasValue: false };
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      return { sum: 0, count: 0, hasValue: false };
    }
    return { sum: num, count: 1, hasValue: true };
  }
  return { sum: 0, count: 0, hasValue: false };
}

const CALC_FIELD_AGGREGATORS = {
  SUM: {
    compute: sumCellValue,
    merge(prev = { sum: 0, hasValue: false }, next = { sum: 0, hasValue: false }) {
      const hasValue = Boolean(prev.hasValue) || Boolean(next.hasValue);
      const sum =
        (prev.hasValue ? prev.sum : 0) + (next.hasValue ? next.sum : 0);
      return { sum, hasValue };
    },
    finalize(result) {
      if (!result || !result.hasValue) {
        return { value: 0, hasValue: false };
      }
      return { value: result.sum, hasValue: true };
    },
  },
  AVG: {
    compute: avgCellValue,
    merge(
      prev = { sum: 0, count: 0, hasValue: false },
      next = { sum: 0, count: 0, hasValue: false },
    ) {
      const sum = (prev.sum || 0) + (next.sum || 0);
      const count = (prev.count || 0) + (next.count || 0);
      const hasValue = Boolean(prev.hasValue) || Boolean(next.hasValue);
      return { sum, count, hasValue };
    },
    finalize(result) {
      if (!result || !result.hasValue || !result.count) {
        return { value: 0, hasValue: false };
      }
      return { value: result.sum / result.count, hasValue: true };
    },
  },
};

export function propagateCalcFields(cfg, data) {
  if (!Array.isArray(cfg.calcFields)) return;
  for (const map of cfg.calcFields) {
    const cells = Array.isArray(map?.cells) ? map.cells : [];
    if (!cells.length) continue;

    const aggregatorState = new Map();
    const aggregatorOrder = [];

    let computedValue;
    let hasComputedValue = false;

    for (const cell of cells) {
      const { table, field, agg } = cell || {};
      const aggKey = typeof agg === 'string' ? agg.trim().toUpperCase() : '';
      if (!table || !field || !aggKey) continue;
      const aggregator = CALC_FIELD_AGGREGATORS[aggKey];
      if (!aggregator) continue;
      const source = data[table];
      const computed = aggregator.compute(source, field);
      if (aggregatorState.has(aggKey)) {
        const merged = aggregator.merge(aggregatorState.get(aggKey), computed);
        aggregatorState.set(aggKey, merged);
      } else {
        aggregatorState.set(aggKey, computed);
        aggregatorOrder.push(aggKey);
      }
    }

    for (const aggKey of aggregatorOrder) {
      const aggregator = CALC_FIELD_AGGREGATORS[aggKey];
      if (!aggregator) continue;
      const finalized = aggregator.finalize(aggregatorState.get(aggKey));
      if (finalized?.hasValue) {
        computedValue = finalized.value;
        hasComputedValue = true;
        break;
      }
    }

    if (!hasComputedValue) {
      for (const cell of cells) {
        const { table, field } = cell || {};
        if (!table || !field) continue;
        const source = data[table];
        const direct = getValue(source, field);
        if (direct !== undefined) {
          computedValue = direct;
          hasComputedValue = true;
          break;
        }
        if (Array.isArray(source)) {
          for (const row of source) {
            if (!row || typeof row !== 'object') continue;
            const v = getValue(row, field);
            if (v !== undefined) {
              computedValue = v;
              hasComputedValue = true;
              break;
            }
          }
        } else if (isPlainObject(source)) {
          const v = getValue(source, field);
          if (v !== undefined) {
            computedValue = v;
            hasComputedValue = true;
          }
        }
        if (hasComputedValue) break;
      }
    }

    if (!hasComputedValue) continue;

    for (const cell of cells) {
      const { table, field, agg } = cell || {};
      if (!table || !field) continue;
      const aggKey = typeof agg === 'string' ? agg.trim().toUpperCase() : '';
      const aggregator = aggKey ? CALC_FIELD_AGGREGATORS[aggKey] : null;
      const target = data[table];
      if (!target) continue;

      if (Array.isArray(target)) {
        if (aggregator) {
          setValue(target, field, computedValue);
          continue;
        }
        for (const row of target) {
          if (!row || typeof row !== 'object') continue;
          setValue(row, field, computedValue);
        }
        setValue(target, field, computedValue);
      } else if (isPlainObject(target)) {
        setValue(target, field, computedValue);
      }
    }
  }
}

function evalPosFormulas(cfg, data) {
  if (!Array.isArray(cfg.posFields)) return;
  const parseOrZero = (value) => {
    const parsed = parseLocalizedNumber(value);
    return parsed === null ? 0 : parsed;
  };
  for (const pf of cfg.posFields) {
    const parts = Array.isArray(pf?.parts) ? pf.parts : [];
    if (parts.length < 2) continue;
    const [target, ...calc] = parts;
    let val = 0;
    let init = false;
    for (const p of calc) {
      const table = typeof p?.table === 'string' ? p.table.trim() : '';
      const field = typeof p?.field === 'string' ? p.field.trim() : '';
      if (!table || !field) continue;
      const agg = typeof p?.agg === 'string' ? p.agg.trim().toUpperCase() : '';
      const source = data[table];
      let num = 0;
      if (Array.isArray(source)) {
        if (agg === 'SUM' || agg === 'AVG') {
          let sum = 0;
          for (const row of source) {
            const raw = row && typeof row === 'object' ? row[field] : undefined;
            sum += parseOrZero(raw);
          }
          num = agg === 'AVG' ? (source.length ? sum / source.length : 0) : sum;
        } else {
          const firstRow = source[0];
          const raw = firstRow && typeof firstRow === 'object' ? firstRow[field] : undefined;
          num = parseOrZero(raw);
        }
      } else if (isPlainObject(source)) {
        num = parseOrZero(source[field]);
      } else {
        num = parseOrZero(undefined);
      }
      if (agg === '=' && !init) {
        val = num;
        init = true;
      } else if (agg === '+') {
        val += num;
      } else if (agg === '-') {
        val -= num;
      } else if (agg === '*') {
        val *= num;
      } else if (agg === '/') {
        val /= num;
      } else {
        val = num;
        init = true;
      }
    }
    const targetTableKey = typeof target?.table === 'string' ? target.table.trim() : '';
    const targetField = typeof target?.field === 'string' ? target.field.trim() : '';
    if (!targetTableKey || !targetField) continue;
    const targetTable = data[targetTableKey];
    if (!targetTable) continue;
    if (Array.isArray(targetTable)) {
      for (const row of targetTable) {
        if (row && typeof row === 'object') {
          row[targetField] = val;
        }
      }
      targetTable[targetField] = val;
    } else if (isPlainObject(targetTable)) {
      targetTable[targetField] = val;
    }
  }
}

function collectConfiguredFieldInfo(cfg) {
  const fieldMap = new Map();

  const ensureFieldInfo = (table, field) => {
    const key = `${table}.${field}`;
    if (!fieldMap.has(key)) {
      fieldMap.set(key, {
        table,
        field,
        numeric: false,
        sources: new Set(),
        operations: new Set(),
      });
    }
    return fieldMap.get(key);
  };

  if (Array.isArray(cfg?.calcFields)) {
    for (const calc of cfg.calcFields) {
      const cells = Array.isArray(calc?.cells) ? calc.cells : [];
      const normalizedCells = [];
      for (const rawCell of cells) {
        const table = typeof rawCell?.table === 'string' ? rawCell.table.trim() : '';
        const field = typeof rawCell?.field === 'string' ? rawCell.field.trim() : '';
        const agg = typeof rawCell?.agg === 'string' ? rawCell.agg.trim().toUpperCase() : '';
        if (!table || !field) continue;
        normalizedCells.push({ table, field, agg });
      }
      if (!normalizedCells.length) continue;
      const hasSum = normalizedCells.some((cell) => cell.agg === 'SUM');
      for (const cell of normalizedCells) {
        const info = ensureFieldInfo(cell.table, cell.field);
        info.sources.add('calcFields');
        if (cell.agg) info.operations.add(cell.agg);
        if (hasSum || cell.agg === 'SUM') {
          info.numeric = true;
        }
      }
    }
  }

  if (Array.isArray(cfg?.posFields)) {
    for (const pf of cfg.posFields) {
      const parts = Array.isArray(pf?.parts) ? pf.parts : [];
      if (!parts.length) continue;
      const normalizedParts = [];
      for (const rawPart of parts) {
        const table = typeof rawPart?.table === 'string' ? rawPart.table.trim() : '';
        const field = typeof rawPart?.field === 'string' ? rawPart.field.trim() : '';
        const agg = typeof rawPart?.agg === 'string' ? rawPart.agg.trim().toUpperCase() : '';
        if (!table || !field) continue;
        normalizedParts.push({ table, field, agg });
      }
      if (!normalizedParts.length) continue;
      const [target, ...calcParts] = normalizedParts;
      const targetInfo = ensureFieldInfo(target.table, target.field);
      targetInfo.sources.add('posFields');
      if (target.agg) targetInfo.operations.add(target.agg);
      targetInfo.numeric = true;

      for (const part of calcParts) {
        const info = ensureFieldInfo(part.table, part.field);
        info.sources.add('posFields');
        if (part.agg) info.operations.add(part.agg);
        info.numeric = true;
      }
    }
  }

  return fieldMap;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSingleEntry(value) {
  if (isPlainObject(value)) return { ...value };
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isPlainObject(item)) return { ...item };
    }
  }
  return {};
}

function normalizeMultiEntry(value) {
  let rows = [];
  let metadata = null;
  if (Array.isArray(value)) {
    rows = value.filter((item) => isPlainObject(item)).map((item) => ({ ...item }));
    metadata = extractArrayMetadata(value);
  } else if (isPlainObject(value)) {
    if (Array.isArray(value.rows)) {
      rows = value.rows
        .filter((item) => isPlainObject(item))
        .map((item) => ({ ...item }));
      metadata = extractArrayMetadata(value.meta || {});
    } else {
      rows = [{ ...value }];
    }
  }
  const normalized = Array.isArray(rows) ? rows : [];
  if (!metadata) return normalized;
  return assignArrayMetadata(normalized, metadata);
}

function inferExpectedFieldType(info) {
  if (info?.numeric) return 'numeric';
  const fieldName = info?.field ? String(info.field).toLowerCase() : '';
  if (fieldName.includes('_date') || fieldName.endsWith('date')) {
    return 'date';
  }
  return 'text';
}

function isNonNegativeFieldName(fieldName) {
  if (!fieldName) return false;
  const lowered = fieldName.toLowerCase();
  return ['amount', 'qty', 'quantity'].some((keyword) => lowered.includes(keyword));
}

function isBlankValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

function isValidDateValue(value) {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?!\d)/);
    if (isoDateMatch) {
      const [, year, month, day] = isoDateMatch;
      const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return false;
      if (
        date.getUTCFullYear() !== Number(year) ||
        date.getUTCMonth() + 1 !== Number(month) ||
        date.getUTCDate() !== Number(day)
      ) {
        return false;
      }
      return true;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed);
  }
  return false;
}

export function validateConfiguredFields(cfg, data, tableTypeMap = new Map()) {
  const fieldInfoMap = collectConfiguredFieldInfo(cfg);
  const errors = [];

  for (const info of fieldInfoMap.values()) {
    const expectedType = inferExpectedFieldType(info);
    const requireNonNegative = expectedType === 'numeric' && isNonNegativeFieldName(info.field);
    const tableData = data?.[info.table];
    if (tableData === undefined || tableData === null) {
      errors.push(`Missing data for table "${info.table}" required for field "${info.field}"`);
      continue;
    }

    const tableType = tableTypeMap instanceof Map ? tableTypeMap.get(info.table) : tableTypeMap?.[info.table];
    if (tableType === 'multi' && !Array.isArray(tableData)) {
      errors.push(`Expected "${info.table}" to be an array for field "${info.field}"`);
      continue;
    }
    if (tableType === 'single' && Array.isArray(tableData)) {
      errors.push(`Expected "${info.table}" to be an object for field "${info.field}"`);
      continue;
    }

    let rows;
    if (Array.isArray(tableData)) {
      const metadata = extractArrayMetadata(tableData);
      rows = tableData.map((row, index) => ({ row, index }));
      if (metadata && Object.keys(metadata).length > 0) {
        rows.push({ row: metadata, index: 'meta' });
      }
    } else if (isPlainObject(tableData)) {
      rows = [{ row: tableData, index: null }];
    } else {
      errors.push(`Invalid data structure for ${info.table}.${info.field}`);
      continue;
    }

    if (Array.isArray(tableData) && rows.length === 0) {
      continue;
    }

    for (const { row, index } of rows) {
      if (!isPlainObject(row)) {
        const location = `${info.table}${index !== null ? `[${index}]` : ''}`;
        errors.push(`Invalid row data for ${location}; expected object`);
        continue;
      }
      const value = row[info.field];
      const location = `${info.table}${index !== null ? `[${index}]` : ''}.${info.field}`;
      if (isBlankValue(value)) {
        errors.push(`Missing value for ${location}`);
        continue;
      }

      if (expectedType === 'numeric') {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          errors.push(`Non-numeric value for ${location}`);
          continue;
        }
        if (requireNonNegative && num < 0) {
          errors.push(`Negative value not allowed for ${location}`);
        }
      } else if (expectedType === 'date') {
        if (!isValidDateValue(value)) {
          errors.push(`Invalid date for ${location}`);
        }
      }
    }
  }

  return errors;
}

async function getMasterForeignKeyMap(conn, masterTable) {
  if (!masterTable) return new Map();
  if (masterForeignKeyCache.has(masterTable)) {
    return masterForeignKeyCache.get(masterTable);
  }
  const [rows] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = ?`,
    [masterTable],
  );
  const map = new Map();
  for (const row of rows) {
    if (!row?.TABLE_NAME || !row?.COLUMN_NAME) continue;
    if (!map.has(row.TABLE_NAME)) map.set(row.TABLE_NAME, []);
    map.get(row.TABLE_NAME).push({
      column: row.COLUMN_NAME,
      referencedColumn: row.REFERENCED_COLUMN_NAME,
    });
  }
  masterForeignKeyCache.set(masterTable, map);
  return map;
}

function applyMasterForeignKeys(table, row, fkMap, masterRow) {
  if (!isPlainObject(row)) return;
  const refs = fkMap.get(table);
  if (!Array.isArray(refs) || refs.length === 0) return;
  for (const ref of refs) {
    const refCol = ref?.referencedColumn;
    if (!ref?.column || !refCol) continue;
    const value = masterRow?.[refCol];
    if (value !== undefined && value !== null) {
      row[ref.column] = value;
    }
  }
}

async function upsertRow(conn, table, row) {
  const cols = Object.keys(row);
  if (!cols.length) return null;
  const placeholders = cols.map(() => '?').join(',');
  const updates = cols.map((c) => `${c}=VALUES(${c})`).join(',');
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
  const params = cols.map((c) => row[c]);
  const [res] = await conn.query(sql, params);
  return res.insertId && res.insertId !== 0 ? res.insertId : row.id;
}

export async function postPosTransaction(
  name,
  data,
  sessionInfo = {},
  companyId = 0,
) {
  const layoutName = typeof name === 'string' ? name.trim() : '';
  if (!layoutName) {
    const err = new Error('POS transaction layout name is required');
    err.status = 400;
    throw err;
  }

  const { path: cfgPath } = await getConfigPath(
    'posTransactionConfig.json',
    companyId,
  );
  const cfgRaw = await fs.readFile(cfgPath, 'utf8');
  const json = JSON.parse(cfgRaw);
  const cfg = json?.[layoutName];
  if (!cfg) {
    const err = new Error(
      `POS transaction config not found for layout "${layoutName}"`,
    );
    err.status = 400;
    throw err;
  }

  const masterTable = cfg.masterTable || 'transactions_pos';
  const masterType = cfg.masterType === 'multi' ? 'multi' : 'single';
  const tableTypeMap = new Map();
  if (masterTable) tableTypeMap.set(masterTable, masterType);
  for (const entry of Array.isArray(cfg.tables) ? cfg.tables : []) {
    const tableName = entry?.table;
    if (!tableName) continue;
    const type = entry.type === 'multi' ? 'multi' : 'single';
    if (type === 'multi') {
      tableTypeMap.set(tableName, 'multi');
    } else if (!tableTypeMap.has(tableName)) {
      tableTypeMap.set(tableName, 'single');
    }
  }

  const statusCfg = cfg.statusField || {};
  const statusTable =
    typeof statusCfg.table === 'string' ? statusCfg.table.trim() : '';
  const statusField =
    typeof statusCfg.field === 'string' ? statusCfg.field.trim() : '';
  const statusCreated = statusCfg.created ?? null;
  const statusBeforePost = statusCfg.beforePost ?? null;
  const statusPosted = statusCfg.posted ?? null;
  if (statusTable && !tableTypeMap.has(statusTable)) {
    tableTypeMap.set(statusTable, 'single');
  }

  const rawData = data && typeof data === 'object' ? data : {};
  const inputMasterId = rawData.masterId ?? null;
  const singleEntries =
    rawData.single && typeof rawData.single === 'object' && !Array.isArray(rawData.single)
      ? rawData.single
      : {};
  const multiEntries =
    rawData.multi && typeof rawData.multi === 'object' && !Array.isArray(rawData.multi)
      ? rawData.multi
      : {};

  const mergedData = {};
  const assignNormalized = (table, value) => {
    if (!table || value === undefined || value === null) return;
    const expectedType = tableTypeMap.get(table);
    if (expectedType === 'multi') {
      mergedData[table] = normalizeMultiEntry(value);
    } else if (expectedType === 'single') {
      mergedData[table] = normalizeSingleEntry(value);
    } else if (Array.isArray(value)) {
      mergedData[table] = value
        .filter((item) => isPlainObject(item))
        .map((item) => ({ ...item }));
    } else if (isPlainObject(value)) {
      mergedData[table] = { ...value };
    } else {
      mergedData[table] = value;
    }
  };

  for (const [table, value] of Object.entries(rawData)) {
    if (table === 'masterId' || table === 'single' || table === 'multi') continue;
    assignNormalized(table, value);
  }
  for (const [table, value] of Object.entries(singleEntries)) {
    assignNormalized(table, value);
  }
  for (const [table, value] of Object.entries(multiEntries)) {
    assignNormalized(table, value);
  }

  for (const [table, type] of tableTypeMap.entries()) {
    if (type === 'multi') {
      if (!Array.isArray(mergedData[table])) {
        mergedData[table] = [];
      }
    } else if (!isPlainObject(mergedData[table])) {
      mergedData[table] = {};
    }
  }

  if (statusTable) {
    const expectedStatusType = tableTypeMap.get(statusTable);
    if (expectedStatusType === 'multi') {
      if (!Array.isArray(mergedData[statusTable])) {
        mergedData[statusTable] = [];
      }
    } else if (!isPlainObject(mergedData[statusTable])) {
      mergedData[statusTable] = {};
    }
  }

  const posDataEntry = mergedData[masterTable];
  const posData = isPlainObject(posDataEntry) ? posDataEntry : {};
  mergedData[masterTable] = posData;
  if (inputMasterId !== null && inputMasterId !== undefined && inputMasterId !== '') {
    posData.id = inputMasterId;
  }

  // Propagate mapped values
  propagateCalcFields(cfg, mergedData);

  // Evaluate formulas
  evalPosFormulas(cfg, mergedData);

  const masterColumns = await getMasterTableColumnSet(masterTable);
  const normalizedSession = normalizeSessionInfo(sessionInfo, posData, masterColumns);
  Object.assign(posData, normalizedSession);

  const validationErrors = validateConfiguredFields(cfg, mergedData, tableTypeMap);
  if (validationErrors.length) {
    const validationError = new Error(
      `POS transaction validation failed: ${validationErrors.join('; ')}`,
    );
    validationError.code = 'POS_VALIDATION_ERROR';
    validationError.details = validationErrors;
    throw validationError;
  }

  const required = ['pos_date', 'total_amount', 'total_quantity', 'payment_type'];
  for (const f of required) {
    if (posData[f] === undefined || posData[f] === null) {
      throw new Error(`Missing field ${f}`);
    }
  }

  const conn = await pool.getConnection();
  const statusRowsForPosted = [];
  let shouldUpdateMasterToPosted = false;
  let committed = false;
  try {
    await conn.beginTransaction();
    const fkMap = await getMasterForeignKeyMap(conn, masterTable);
    const useStatusTable =
      statusTable && statusTable !== masterTable && fkMap.has(statusTable);

    if (!useStatusTable && statusField && statusCreated !== null) {
      posData[statusField] = statusCreated;
    }

    const masterId = await upsertRow(conn, masterTable, posData);
    if (masterId !== null && masterId !== undefined) {
      posData.id = masterId;
    }

    if (useStatusTable) {
      const statusData = mergedData[statusTable];
      const statusRows = [];
      if (Array.isArray(statusData)) {
        for (const row of statusData) {
          if (isPlainObject(row)) statusRows.push(row);
        }
        if (statusRows.length === 0) {
          const createdRow = {};
          statusData.push(createdRow);
          statusRows.push(createdRow);
        }
      } else if (isPlainObject(statusData)) {
        statusRows.push(statusData);
      } else {
        const createdRow = {};
        mergedData[statusTable] = createdRow;
        statusRows.push(createdRow);
      }

      for (const row of statusRows) {
        applyMasterForeignKeys(statusTable, row, fkMap, posData);
        if (statusField && statusBeforePost !== null) {
          row[statusField] = statusBeforePost;
        }
        if (!isPlainObject(row) || Object.keys(row).length === 0) continue;
        let rowForPosted = null;
        if (statusField && statusPosted !== null) {
          rowForPosted = { ...row, [statusField]: statusPosted };
        }
        const insertedId = await upsertRow(conn, statusTable, row);
        if (
          insertedId !== null &&
          insertedId !== undefined &&
          insertedId !== 0 &&
          !('id' in row)
        ) {
          row.id = insertedId;
          if (rowForPosted && !('id' in rowForPosted)) {
            rowForPosted.id = insertedId;
          }
        }
        if (rowForPosted) {
          statusRowsForPosted.push(rowForPosted);
        }
      }
    } else if (statusField && statusBeforePost !== null && masterId !== null && masterId !== undefined) {
      await conn.query(
        `UPDATE ${masterTable} SET ${statusField}=? WHERE id=?`,
        [statusBeforePost, masterId],
      );
      shouldUpdateMasterToPosted = statusPosted !== null;
    } else if (statusField && statusPosted !== null) {
      shouldUpdateMasterToPosted = true;
    }

    const tablesToPersist = Object.keys(mergedData).filter(
      (table) => table && table !== masterTable && table !== statusTable,
    );
    for (const table of tablesToPersist) {
      const tData = mergedData[table];
      if (!tData) continue;
      if (Array.isArray(tData)) {
        for (const row of tData) {
          if (!isPlainObject(row) || Object.keys(row).length === 0) continue;
          applyMasterForeignKeys(table, row, fkMap, posData);
          await upsertRow(conn, table, row);
        }
      } else if (isPlainObject(tData) && Object.keys(tData).length > 0) {
        applyMasterForeignKeys(table, tData, fkMap, posData);
        await upsertRow(conn, table, tData);
      }
    }

    await conn.commit();
    committed = true;

    if (useStatusTable && statusRowsForPosted.length) {
      for (const row of statusRowsForPosted) {
        await upsertRow(conn, statusTable, row);
      }
    } else if (
      !useStatusTable &&
      shouldUpdateMasterToPosted &&
      statusField &&
      statusPosted !== null &&
      posData.id !== null &&
      posData.id !== undefined
    ) {
      await conn.query(
        `UPDATE ${masterTable} SET ${statusField}=? WHERE id=?`,
        [statusPosted, posData.id],
      );
    }

    return masterId;
  } catch (err) {
    if (!committed) {
      await conn.rollback();
    }
    throw err;
  } finally {
    conn.release();
  }
}

export default postPosTransaction;
