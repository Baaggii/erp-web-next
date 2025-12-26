import fs from 'fs/promises';
import { pool } from '../../db/index.js';
import { getConfigPath } from '../utils/configPaths.js';
import {
  hasPosTransactionAccess,
  getConfig as getPosTransactionLayout,
} from './posTransactionConfig.js';
import { getFormConfig } from './transactionFormConfig.js';
import {
  buildReceiptFromDynamicTransaction,
  sendReceipt,
  resolvePosApiEndpoint,
} from './posApiService.js';
import {
  computePosApiUpdates,
  createColumnLookup,
} from './posApiPersistence.js';
import { parseLocalizedNumber } from '../../utils/parseLocalizedNumber.js';
import {
  saveEbarimtInvoiceSnapshot,
  persistEbarimtInvoiceResponse,
} from './ebarimtInvoiceStore.js';
import { getMerchantById } from './merchantService.js';

const masterForeignKeyCache = new Map();
const masterTableColumnsCache = new Map();
const tableColumnNameMapCache = new Map();
const tableSessionColumnCache = new Map();

const arrayIndexPattern = /^(0|[1-9]\d*)$/;
const SUPPORTED_CALC_AGGREGATORS = new Set(['SUM', 'AVG', 'COUNT', 'MIN', 'MAX']);

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

async function getTableColumnNameMap(table) {
  if (!table) return new Map();
  if (tableColumnNameMapCache.has(table)) {
    return tableColumnNameMapCache.get(table);
  }
  const columns = await getMasterTableColumnSet(table);
  const map = new Map();
  columns.forEach((name) => {
    if (typeof name === 'string' && name) {
      map.set(name.toLowerCase(), name);
    }
  });
  tableColumnNameMapCache.set(table, map);
  return map;
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

function normalizeRecordKeyLookup(record) {
  const lookup = new Map();
  if (!record || typeof record !== 'object') return lookup;
  Object.keys(record).forEach((key) => {
    if (typeof key !== 'string') return;
    lookup.set(key.toLowerCase(), key);
  });
  return lookup;
}

function getRecordValue(record, key) {
  if (!record || typeof record !== 'object') return undefined;
  if (!key) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, key)) {
    return record[key];
  }
  const lookup = normalizeRecordKeyLookup(record);
  const normalized = String(key).toLowerCase();
  const actual = lookup.get(normalized);
  return actual ? record[actual] : undefined;
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

async function persistPosApiResponse(table, id, response, options = {}) {
  if (!table || id === undefined || id === null) return;
  if (!response || typeof response !== 'object') return;
  const columnMap = await getTableColumnNameMap(table);
  if (!columnMap || columnMap.size === 0) return;
  const lookup = createColumnLookup(columnMap);
  const updates = computePosApiUpdates(lookup, response, options);
  const entries = Object.entries(updates || {});
  if (!entries.length) return;
  const setClause = entries.map(([col]) => `\`${col}\` = ?`).join(', ');
  const params = entries.map(([, value]) => value);
  params.push(id);
  try {
    await pool.query(`UPDATE \`${table}\` SET ${setClause} WHERE id = ?`, params);
  } catch (err) {
    console.error('Failed to persist POSAPI response details', {
      table,
      id,
      error: err,
    });
  }
}

async function findSessionColumnForTable(table) {
  if (!table) return null;
  if (tableSessionColumnCache.has(table)) {
    return tableSessionColumnCache.get(table);
  }
  const candidates = [
    'pos_session_id',
    'session_id',
    'sessionid',
    'possessionid',
    'pos_sessionid',
  ];
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?`,
      [table],
    );
    const available = new Set(
      (rows || []).map((row) => row?.COLUMN_NAME?.toLowerCase()).filter(Boolean),
    );
    for (const candidate of candidates) {
      const normalized = candidate.toLowerCase();
      if (available.has(normalized)) {
        tableSessionColumnCache.set(table, candidate);
        return candidate;
      }
    }
    tableSessionColumnCache.set(table, null);
    return null;
  } catch (err) {
    console.error('Failed to inspect session column for POS transaction table', {
      table,
      error: err,
    });
    tableSessionColumnCache.set(table, null);
    return null;
  }
}

function normalizeCalcFieldCell(cell) {
  if (!cell || typeof cell !== 'object') return null;

  const table = typeof cell.table === 'string' ? cell.table.trim() : '';
  const field = typeof cell.field === 'string' ? cell.field.trim() : '';
  if (!table || !field) return null;

  const aggKey =
    typeof cell.agg === 'string' ? cell.agg.trim().toUpperCase() : '';

  return {
    ...cell,
    table,
    field,
    __aggKey: SUPPORTED_CALC_AGGREGATORS.has(aggKey) ? aggKey : '',
  };
}

function getCalcFieldCells(map) {
  if (!map || typeof map !== 'object') return [];
  const raw = Array.isArray(map.cells) ? map.cells : [];
  return raw.map(normalizeCalcFieldCell).filter(Boolean);
}

function determineComputedIndexes(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return [];
  const hasAggregator = cells.some((cell) =>
    SUPPORTED_CALC_AGGREGATORS.has(cell.__aggKey),
  );
  if (hasAggregator) {
    const indexes = [];
    let added = false;
    cells.forEach((cell, idx) => {
      if (!SUPPORTED_CALC_AGGREGATORS.has(cell.__aggKey)) {
        indexes.push(idx);
        added = true;
      }
    });
    if (!added && cells.length > 0) {
      indexes.push(0);
    }
    return indexes;
  }
  return [0];
}

function pickFirstDefinedFieldValue(source, field) {
  if (!field) return undefined;
  if (Array.isArray(source)) {
    for (const row of source) {
      if (!row || typeof row !== 'object') continue;
      const val = getValue(row, field);
      if (val !== undefined && val !== null) return val;
    }
  } else if (isPlainObject(source)) {
    const val = getValue(source, field);
    if (val !== undefined && val !== null) return val;
  }
  return undefined;
}

const CALC_FIELD_AGGREGATORS = {
  SUM: {
    compute(source, field) {
      if (Array.isArray(source)) {
        let sum = 0;
        let hasData = false;
        for (const row of source) {
          if (!row || typeof row !== 'object') continue;
          const num = parseLocalizedNumber(getValue(row, field));
          if (num === null) continue;
          sum += num;
          hasData = true;
        }
        if (!hasData && source.length === 0) {
          hasData = true;
        }
        return { sum, hasValue: hasData };
      }
      if (isPlainObject(source)) {
        const num = parseLocalizedNumber(getValue(source, field));
        if (num === null) return { sum: 0, hasValue: false };
        return { sum: num, hasValue: true };
      }
      return { sum: 0, hasValue: false };
    },
    merge(prev = { sum: 0, hasValue: false }, next = { sum: 0, hasValue: false }) {
      const hasValue = Boolean(prev.hasValue) || Boolean(next.hasValue);
      const sum = (prev.hasValue ? prev.sum : 0) + (next.hasValue ? next.sum : 0);
      return { sum, hasValue };
    },
    finalize(result) {
      if (!result || !result.hasValue) return { value: 0, hasValue: false };
      return { value: result.sum, hasValue: true };
    },
  },
  AVG: {
    compute(source, field) {
      if (Array.isArray(source)) {
        let sum = 0;
        let count = 0;
        for (const row of source) {
          if (!row || typeof row !== 'object') continue;
          const num = parseLocalizedNumber(getValue(row, field));
          if (num === null) continue;
          sum += num;
          count += 1;
        }
        return { sum, count, hasValue: count > 0 };
      }
      if (isPlainObject(source)) {
        const num = parseLocalizedNumber(getValue(source, field));
        if (num === null) return { sum: 0, count: 0, hasValue: false };
        return { sum: num, count: 1, hasValue: true };
      }
      return { sum: 0, count: 0, hasValue: false };
    },
    merge(prev = { sum: 0, count: 0, hasValue: false }, next = { sum: 0, count: 0, hasValue: false }) {
      const sum = prev.sum + next.sum;
      const count = prev.count + next.count;
      const hasValue = Boolean(prev.hasValue) || Boolean(next.hasValue) || count > 0;
      return { sum, count, hasValue };
    },
    finalize(result) {
      if (!result || !result.hasValue || !result.count) {
        return { value: 0, hasValue: false };
      }
      return { value: result.sum / result.count, hasValue: true };
    },
  },
  MIN: {
    compute(source, field) {
      if (Array.isArray(source)) {
        let min = null;
        for (const row of source) {
          if (!row || typeof row !== 'object') continue;
          const num = parseLocalizedNumber(getValue(row, field));
          if (num === null) continue;
          if (min === null || num < min) min = num;
        }
        return { min, hasValue: min !== null };
      }
      if (isPlainObject(source)) {
        const num = parseLocalizedNumber(getValue(source, field));
        if (num === null) return { min: null, hasValue: false };
        return { min: num, hasValue: true };
      }
      return { min: null, hasValue: false };
    },
    merge(prev = { min: null, hasValue: false }, next = { min: null, hasValue: false }) {
      let min = prev.min;
      if (next.min !== null && (min === null || next.min < min)) {
        min = next.min;
      }
      const hasValue = Boolean(prev.hasValue) || Boolean(next.hasValue) || min !== null;
      return { min, hasValue };
    },
    finalize(result) {
      if (!result || !result.hasValue || result.min === null) {
        return { value: 0, hasValue: false };
      }
      return { value: result.min, hasValue: true };
    },
  },
  MAX: {
    compute(source, field) {
      if (Array.isArray(source)) {
        let max = null;
        for (const row of source) {
          if (!row || typeof row !== 'object') continue;
          const num = parseLocalizedNumber(getValue(row, field));
          if (num === null) continue;
          if (max === null || num > max) max = num;
        }
        return { max, hasValue: max !== null };
      }
      if (isPlainObject(source)) {
        const num = parseLocalizedNumber(getValue(source, field));
        if (num === null) return { max: null, hasValue: false };
        return { max: num, hasValue: true };
      }
      return { max: null, hasValue: false };
    },
    merge(prev = { max: null, hasValue: false }, next = { max: null, hasValue: false }) {
      let max = prev.max;
      if (next.max !== null && (max === null || next.max > max)) {
        max = next.max;
      }
      const hasValue = Boolean(prev.hasValue) || Boolean(next.hasValue) || max !== null;
      return { max, hasValue };
    },
    finalize(result) {
      if (!result || !result.hasValue || result.max === null) {
        return { value: 0, hasValue: false };
      }
      return { value: result.max, hasValue: true };
    },
  },
  COUNT: {
    compute(source, field) {
      if (Array.isArray(source)) {
        let count = 0;
        for (const row of source) {
          if (!row || typeof row !== 'object') continue;
          const raw = getValue(row, field);
          if (raw === undefined || raw === null) continue;
          if (typeof raw === 'string' && raw.trim() === '') continue;
          count += 1;
        }
        if (count === 0 && source.length === 0) {
          return { count: 0, hasValue: true };
        }
        return { count, hasValue: count > 0 };
      }
      if (isPlainObject(source)) {
        const raw = getValue(source, field);
        if (raw === undefined || raw === null) return { count: 0, hasValue: false };
        if (typeof raw === 'string' && raw.trim() === '') {
          return { count: 0, hasValue: false };
        }
        return { count: 1, hasValue: true };
      }
      return { count: 0, hasValue: false };
    },
    merge(prev = { count: 0, hasValue: false }, next = { count: 0, hasValue: false }) {
      const count = prev.count + next.count;
      const hasValue = Boolean(prev.hasValue) || Boolean(next.hasValue) || count > 0;
      return { count, hasValue };
    },
    finalize(result) {
      if (!result) return { value: 0, hasValue: false };
      if (!result.hasValue && result.count === 0) {
        return { value: 0, hasValue: result.hasValue };
      }
      return { value: result.count, hasValue: true };
    },
  },
};

function coerceNumber(value) {
  const num = parseLocalizedNumber(value);
  if (num === null) {
    if (value === null || value === undefined || value === '') return 0;
    const direct = Number(value);
    return Number.isFinite(direct) ? direct : 0;
  }
  return num;
}

function computeFormulaAggregator(agg, source, field) {
  if (!agg) return null;
  const key = agg.trim().toUpperCase();
  if (key === 'SUM' || key === 'AVG' || key === 'MIN' || key === 'MAX') {
    let values = [];
    if (Array.isArray(source)) {
      values = source
        .filter((row) => row && typeof row === 'object')
        .map((row) => parseLocalizedNumber(getValue(row, field)))
        .filter((num) => num !== null);
    } else if (isPlainObject(source)) {
      const single = parseLocalizedNumber(getValue(source, field));
      if (single !== null) values = [single];
    }
    if (values.length === 0) {
      return key === 'MIN' ? Infinity : key === 'MAX' ? -Infinity : 0;
    }
    if (key === 'SUM') {
      return values.reduce((acc, num) => acc + num, 0);
    }
    if (key === 'AVG') {
      return values.reduce((acc, num) => acc + num, 0) / values.length;
    }
    if (key === 'MIN') {
      return Math.min(...values);
    }
    if (key === 'MAX') {
      return Math.max(...values);
    }
  }
  if (key === 'COUNT') {
    if (Array.isArray(source)) {
      return source.filter((row) => {
        if (!row || typeof row !== 'object') return false;
        const value = getValue(row, field);
        if (value === undefined || value === null) return false;
        if (typeof value === 'string' && value.trim() === '') return false;
        return true;
      }).length;
    }
    if (isPlainObject(source)) {
      const value = getValue(source, field);
      if (value === undefined || value === null) return 0;
      if (typeof value === 'string' && value.trim() === '') return 0;
      return 1;
    }
    return 0;
  }
  return null;
}

export function propagateCalcFields(cfg, data) {
  if (!Array.isArray(cfg.calcFields)) return;
  for (const map of cfg.calcFields) {
    const cells = getCalcFieldCells(map);
    if (!cells.length) continue;

    const computedIndexes = determineComputedIndexes(cells);
    const computedIndexSet = new Set(computedIndexes);

    const aggregatorState = new Map();
    const aggregatorOrder = [];

    for (const cell of cells) {
      const aggKey = cell.__aggKey;
      if (!aggKey) continue;
      const aggregator = CALC_FIELD_AGGREGATORS[aggKey];
      if (!aggregator) continue;
      const source = data[cell.table];
      const computed = aggregator.compute(source, cell.field);
      if (aggregatorState.has(aggKey)) {
        const merged = aggregator.merge(aggregatorState.get(aggKey), computed);
        aggregatorState.set(aggKey, merged);
      } else {
        aggregatorState.set(aggKey, computed);
        aggregatorOrder.push(aggKey);
      }
    }

    let computedValue;
    let hasComputedValue = false;

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
      for (let idx = 0; idx < cells.length; idx += 1) {
        if (computedIndexSet.has(idx)) continue;
        const cell = cells[idx];
        const source = data[cell.table];
        const direct = pickFirstDefinedFieldValue(source, cell.field);
        if (direct !== undefined) {
          computedValue = direct;
          hasComputedValue = true;
          break;
        }
      }
    }

    if (!hasComputedValue) {
      for (let idx = 0; idx < cells.length; idx += 1) {
        if (!computedIndexSet.has(idx)) continue;
        const cell = cells[idx];
        const source = data[cell.table];
        const direct = pickFirstDefinedFieldValue(source, cell.field);
        if (direct !== undefined) {
          computedValue = direct;
          hasComputedValue = true;
          break;
        }
      }
    }

    if (!hasComputedValue) continue;

    for (let idx = 0; idx < cells.length; idx += 1) {
      const cell = cells[idx];
      if (!cell) continue;
      const { table, field } = cell;
      if (!table || !field) continue;

      const isAggregatorCell = Boolean(cell.__aggKey);
      if (isAggregatorCell && !computedIndexSet.has(idx)) continue;

      const target = data[table];

      if (target === undefined || target === null) {
        if (!isAggregatorCell || computedIndexSet.has(idx)) {
          data[table] = { [field]: computedValue };
        }
        continue;
      }

      if (Array.isArray(target)) {
        for (const row of target) {
          if (!row || typeof row !== 'object') continue;
          setValue(row, field, computedValue);
        }
        setValue(target, field, computedValue);
        continue;
      }

      if (isPlainObject(target)) {
        setValue(target, field, computedValue);
        continue;
      }

      if (!isAggregatorCell || computedIndexSet.has(idx)) {
        data[table] = { [field]: computedValue };
      }
    }
  }
}

function evalPosFormulas(cfg, data) {
  if (!Array.isArray(cfg.posFields)) return;
  for (const pf of cfg.posFields) {
    const parts = pf.parts || [];
    if (!parts.length) continue;
    const [target, ...calc] = parts;
    let val = 0;
    let init = false;
    for (const p of calc) {
      const tData = data[p.table] || {};
      const agg = typeof p.agg === 'string' ? p.agg.trim().toUpperCase() : '';
      let num = null;
      if (agg) {
        num = computeFormulaAggregator(agg, tData, p.field);
      }
      if (num === null || num === Infinity || num === -Infinity) {
        if (Array.isArray(tData)) {
          const first = tData.find(
            (row) => row && typeof row === 'object' && row[p.field] !== undefined,
          );
          num = coerceNumber(first?.[p.field]);
        } else if (isPlainObject(tData)) {
          num = coerceNumber(getValue(tData, p.field));
        } else {
          num = 0;
        }
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
        if (num === 0) {
          val = 0;
        } else {
          val /= num;
        }
      } else if (agg === '=' || agg === 'SUM' || agg === 'AVG' || agg === 'MIN' || agg === 'MAX' || agg === 'COUNT') {
        val = num;
        if (!init) init = true;
      } else {
        val = num;
        if (!init) init = true;
      }
    }
    const targetTable = data[target.table];
    if (!targetTable) continue;
    if (Array.isArray(targetTable)) {
      for (const row of targetTable) {
        row[target.field] = val;
      }
    } else {
      targetTable[target.field] = val;
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

async function loadInvoiceRecord(invoiceId) {
  if (!invoiceId) return null;
  const [rows] = await pool.query(
    'SELECT * FROM `ebarimt_invoice` WHERE id = ? LIMIT 1',
    [invoiceId],
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function isInvoiceFinalized(invoice) {
  if (!invoice || typeof invoice !== 'object') return false;
  const status = String(invoice.status || '').trim().toUpperCase();
  if (['SUCCESS', 'APPROVED', 'REGISTERED', 'ACTIVE'].includes(status)) {
    return true;
  }
  if (invoice.ebarimt_id) return true;
  return false;
}

async function linkInvoiceToIncomeRecords({ invoiceId, incomeRows, sessionId }) {
  if (!invoiceId) return;
  const columnSet = await getMasterTableColumnSet('transactions_income');
  if (!columnSet || !columnSet.has('ebarimt_invoice_id')) return;
  const ids = new Set();
  (Array.isArray(incomeRows) ? incomeRows : []).forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const value = row.id ?? row.ID;
    if (value !== undefined && value !== null) {
      ids.add(value);
    }
  });
  try {
    if (ids.size) {
      await pool.query(
        'UPDATE `transactions_income` SET `ebarimt_invoice_id` = ? WHERE `id` IN (?)',
        [invoiceId, Array.from(ids)],
      );
      return;
    }
    if (!sessionId) return;
    const sessionColumn = await findSessionColumnForTable('transactions_income');
    if (!sessionColumn) return;
    await pool.query(
      'UPDATE `transactions_income` SET `ebarimt_invoice_id` = ? WHERE ?? = ?',
      [invoiceId, sessionColumn, sessionId],
    );
  } catch (err) {
    console.error('Failed to link ebarimt invoice to transactions_income', {
      invoiceId,
      sessionId,
      error: err,
    });
  }
}

async function loadRelatedRows(tableName, options = {}) {
  if (!tableName) return [];
  const { sessionId, masterRecord, fkMap } = options;
  if (!fkMap || !(fkMap instanceof Map)) return [];
  const rows = [];
  if (sessionId) {
    const sessionColumn = await findSessionColumnForTable(tableName);
    if (sessionColumn) {
      const [sessionRows] = await pool.query(
        'SELECT * FROM ?? WHERE ?? = ?',
        [tableName, sessionColumn, sessionId],
      );
      if (Array.isArray(sessionRows) && sessionRows.length) {
        return sessionRows;
      }
    }
  }
  const references = fkMap.get(tableName);
  if (!Array.isArray(references) || references.length === 0) {
    return rows;
  }
  for (const ref of references) {
    if (!ref?.column || !ref?.referencedColumn) continue;
    const masterValue = getRecordValue(masterRecord, ref.referencedColumn);
    if (masterValue === undefined || masterValue === null) continue;
    const [refRows] = await pool.query(
      'SELECT * FROM ?? WHERE ?? = ?',
      [tableName, ref.column, masterValue],
    );
    if (Array.isArray(refRows) && refRows.length) {
      return refRows;
    }
  }
  return rows;
}

function collectLayoutTables(layout, masterTable) {
  const tables = [];
  const seen = new Set();
  if (masterTable) {
    seen.add(masterTable);
  }
  (Array.isArray(layout?.tables) ? layout.tables : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const tableName = typeof entry.table === 'string' ? entry.table.trim() : '';
    if (!tableName || seen.has(tableName)) return;
    seen.add(tableName);
    tables.push({
      name: tableName,
      type: entry.type === 'multi' ? 'multi' : 'single',
    });
  });
  return tables;
}

function resolveSessionId(record) {
  const candidates = [
    'pos_session_id',
    'session_id',
    'sessionid',
    'session',
  ];
  for (const candidate of candidates) {
    const value = getRecordValue(record, candidate);
    if (value === undefined || value === null) continue;
    const str = typeof value === 'string' ? value.trim() : value;
    if (str !== '' && str !== null && str !== undefined) {
      return str;
    }
  }
  return null;
}

function ensureTransactionCompany(record, companyId) {
  if (!companyId) return;
  const column = getRecordValue(record, 'company_id');
  if (column === undefined || column === null) return;
  if (Number(column) !== Number(companyId)) {
    const err = new Error('Transaction does not belong to the current company');
    err.status = 403;
    throw err;
  }
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

  const branchAccessId =
    sessionInfo?.branchId ?? sessionInfo?.branch_id ?? sessionInfo?.branch ?? null;
  const departmentAccessId =
    sessionInfo?.departmentId ??
    sessionInfo?.department_id ??
    sessionInfo?.department ??
    null;
  if (!hasPosTransactionAccess(cfg, branchAccessId, departmentAccessId)) {
    const err = new Error('POS transaction access denied for current scope');
    err.status = 403;
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

export async function postPosTransactionWithEbarimt(
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

  const { config: layout } = await getPosTransactionLayout(layoutName, companyId);
  if (!layout) {
    const err = new Error(
      `POS transaction config not found for layout "${layoutName}"`,
    );
    err.status = 400;
    throw err;
  }

  const masterTable = layout.masterTable || 'transactions_pos';
  const masterForm = layout.masterForm || '';

  if (!masterForm) {
    const err = new Error('POSAPI form configuration is missing for this transaction');
    err.status = 400;
    throw err;
  }

  const { config: formCfg } = await getFormConfig(masterTable, masterForm, companyId);
  if (!formCfg?.posApiEnabled) {
    const err = new Error('POSAPI is not enabled for this transaction');
    err.status = 400;
    throw err;
  }

  const masterId = await postPosTransaction(
    layoutName,
    data,
    sessionInfo,
    companyId,
  );

  if (masterId === undefined || masterId === null) {
    const err = new Error('POS transaction did not return an identifier');
    err.status = 500;
    throw err;
  }

  let record = null;
  try {
    const [rows] = await pool.query(
      `SELECT * FROM \`${masterTable}\` WHERE id = ? LIMIT 1`,
      [masterId],
    );
    if (Array.isArray(rows) && rows[0]) {
      record = rows[0];
    }
  } catch (err) {
    console.error('Failed to load persisted transaction for POSAPI submission', {
      table: masterTable,
      id: masterId,
      error: err,
    });
  }

  if (!record) {
    const err = new Error('Unable to load transaction for POSAPI submission');
    err.status = 500;
    throw err;
  }

  const merchantId = record?.merchant_id ?? record?.merchantId ?? null;
  const merchantInfo = merchantId ? await getMerchantById(merchantId) : null;
  if (!merchantInfo) {
    const err = new Error('Merchant information is required for POSAPI submissions');
    err.status = 400;
    throw err;
  }

  const mapping = formCfg.posApiMapping || {};
  const endpoint = await resolvePosApiEndpoint(formCfg.posApiEndpointId);
  const receiptType = formCfg.posApiType || process.env.POSAPI_RECEIPT_TYPE || '';
  const payload = await buildReceiptFromDynamicTransaction(
    record,
    mapping,
    receiptType,
    { typeField: formCfg.posApiTypeField, merchantInfo, sessionInfo },
  );
  if (!payload) {
    const err = new Error('POSAPI receipt payload could not be generated from the transaction');
    err.status = 400;
    throw err;
  }

  const invoiceId = await saveEbarimtInvoiceSnapshot({
    masterTable,
    masterId,
    record,
    payload,
    merchantInfo,
  });

  const response = await sendReceipt(payload, { endpoint });
  await persistPosApiResponse(masterTable, masterId, response, {
    fieldsFromPosApi: formCfg.fieldsFromPosApi,
    responseFieldMapping: formCfg.posApiResponseMapping,
  });
  if (invoiceId) {
    await persistEbarimtInvoiceResponse(invoiceId, response, {
      fieldsFromPosApi: formCfg.fieldsFromPosApi,
      responseFieldMapping: formCfg.posApiResponseMapping,
    });
  }

  return { id: masterId, ebarimtInvoiceId: invoiceId, posApi: { payload, response } };
}

export async function issueSavedPosTransactionEbarimt(
  name,
  recordId,
  companyId = 0,
) {
  const layoutName = typeof name === 'string' ? name.trim() : '';
  if (!layoutName) {
    const err = new Error('POS transaction layout name is required');
    err.status = 400;
    throw err;
  }
  if (recordId === undefined || recordId === null || `${recordId}`.trim() === '') {
    const err = new Error('recordId is required');
    err.status = 400;
    throw err;
  }

  const { config: layout } = await getPosTransactionLayout(layoutName, companyId);
  if (!layout) {
    const err = new Error(
      `POS transaction config not found for layout "${layoutName}"`,
    );
    err.status = 400;
    throw err;
  }

  const masterTable = layout.masterTable || 'transactions_pos';
  const masterForm = layout.masterForm || '';
  if (!masterForm) {
    const err = new Error('POSAPI form configuration is missing for this transaction');
    err.status = 400;
    throw err;
  }

  const { config: formCfg } = await getFormConfig(masterTable, masterForm, companyId);
  if (!formCfg?.posApiEnabled) {
    const err = new Error('POSAPI is not enabled for this transaction');
    err.status = 400;
    throw err;
  }

  const [rows] = await pool.query(
    `SELECT * FROM \`${masterTable}\` WHERE id = ? LIMIT 1`,
    [recordId],
  );
  const masterRecord = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!masterRecord) {
    const err = new Error('Transaction not found');
    err.status = 404;
    throw err;
  }

  if (companyId) {
    ensureTransactionCompany(masterRecord, companyId);
  }

  const merchantId = masterRecord?.merchant_id ?? masterRecord?.merchantId ?? null;
  const merchantInfo = merchantId ? await getMerchantById(merchantId) : null;
  if (!merchantInfo) {
    const err = new Error('Merchant information is required for POSAPI submissions');
    err.status = 400;
    throw err;
  }

  const invoiceIdCandidate = masterRecord?.ebarimt_invoice_id ?? null;
  if (invoiceIdCandidate) {
    const invoiceRecord = await loadInvoiceRecord(invoiceIdCandidate);
    if (isInvoiceFinalized(invoiceRecord)) {
      const err = new Error('Ebarimt already issued for this transaction');
      err.status = 409;
      err.details = { invoiceId: invoiceIdCandidate };
      throw err;
    }
  }

  const sessionId = resolveSessionId(masterRecord);
  const fkMap = await getMasterForeignKeyMap(pool, masterTable);
  const tables = collectLayoutTables(layout, masterTable);
  const aggregatedRecord = { ...masterRecord };
  const incomeRows = [];
  for (const tableEntry of tables) {
    const relatedRows = await loadRelatedRows(tableEntry.name, {
      sessionId,
      masterRecord,
      fkMap,
    });
    if (tableEntry.type === 'multi') {
      aggregatedRecord[tableEntry.name] = relatedRows;
    } else {
      aggregatedRecord[tableEntry.name] = relatedRows[0] || null;
    }
    if (tableEntry.name === 'transactions_income') {
      relatedRows.forEach((row) => incomeRows.push(row));
    }
  }

  const mapping = formCfg.posApiMapping || {};
  const endpoint = await resolvePosApiEndpoint(formCfg.posApiEndpointId);
  const receiptType = formCfg.posApiType || process.env.POSAPI_RECEIPT_TYPE || '';
  const payload = await buildReceiptFromDynamicTransaction(
    aggregatedRecord,
    mapping,
    receiptType,
    { typeField: formCfg.posApiTypeField, merchantInfo, sessionInfo },
  );
  if (!payload) {
    const err = new Error('POSAPI receipt payload could not be generated from the transaction');
    err.status = 400;
    throw err;
  }

  const invoiceId = await saveEbarimtInvoiceSnapshot({
    masterTable,
    masterId: recordId,
    record: aggregatedRecord,
    payload,
    merchantInfo,
  });

  const response = await sendReceipt(payload, { endpoint });
  await persistPosApiResponse(masterTable, recordId, response, {
    fieldsFromPosApi: formCfg.fieldsFromPosApi,
    responseFieldMapping: formCfg.posApiResponseMapping,
  });
  if (invoiceId) {
    await persistEbarimtInvoiceResponse(invoiceId, response, {
      fieldsFromPosApi: formCfg.fieldsFromPosApi,
      responseFieldMapping: formCfg.posApiResponseMapping,
    });
    await linkInvoiceToIncomeRecords({
      invoiceId,
      incomeRows,
      sessionId,
    });
  }

  const invoiceRecord = invoiceId ? await loadInvoiceRecord(invoiceId) : null;
  const status = invoiceRecord?.status ?? response?.status ?? null;
  const billId =
    invoiceRecord?.ebarimt_id ?? response?.billId ?? response?.billid ?? response?.receiptId ?? null;
  const errorMessage = invoiceRecord?.error_message ?? response?.message ?? null;

  return {
    id: recordId,
    ebarimtInvoiceId: invoiceId,
    status,
    billId,
    errorMessage,
    invoice: invoiceRecord,
    posApi: { payload, response },
  };
}

export default postPosTransaction;
