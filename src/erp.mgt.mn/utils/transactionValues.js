import {
  createGeneratedColumnEvaluator,
  applyGeneratedColumnEvaluators,
  valuesEqual,
} from './generatedColumns.js';
import { syncCalcFields } from './syncCalcFields.js';

const arrayIndexPattern = /^(0|[1-9]\d*)$/;

export function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function extractArrayMetadata(value, { excludeKeys = [] } = {}) {
  if (!value || typeof value !== 'object') return null;
  const exclusions = new Set(excludeKeys);
  const metadata = {};
  let hasMetadata = false;
  Object.keys(value).forEach((key) => {
    if (exclusions.has(key)) return;
    if (!arrayIndexPattern.test(key)) {
      metadata[key] = value[key];
      hasMetadata = true;
    }
  });
  return hasMetadata ? metadata : null;
}

export function assignArrayMetadata(target, source, options = {}) {
  if (!Array.isArray(target) || !source || typeof source !== 'object') {
    return target;
  }
  const metadata = extractArrayMetadata(source, options);
  if (metadata) Object.assign(target, metadata);
  return target;
}

export function cloneArrayWithMetadata(source, options = {}) {
  if (!Array.isArray(source)) return source;
  const clone = source.map((row) => (isPlainRecord(row) ? { ...row } : row));
  return assignArrayMetadata(clone, source, options);
}

export function serializeRowsWithMetadata(container, options = {}) {
  const metaOptions = { excludeKeys: ['rows', 'meta'], ...options };
  if (isPlainRecord(container) && Array.isArray(container.rows)) {
    const rows = container.rows.map((row) => (isPlainRecord(row) ? { ...row } : row));
    const meta = extractArrayMetadata(container.meta, metaOptions);
    return meta ? { rows, meta } : { rows };
  }
  const rows = Array.isArray(container)
    ? container.map((row) => (isPlainRecord(row) ? { ...row } : row))
    : [];
  const meta = extractArrayMetadata(container, metaOptions);
  return meta ? { rows, meta } : { rows };
}

export function restoreRowsWithMetadata(entry, options = {}) {
  const metaOptions = { excludeKeys: ['rows', 'meta'], ...options };
  if (Array.isArray(entry)) {
    return cloneArrayWithMetadata(entry, metaOptions);
  }
  if (isPlainRecord(entry) && Array.isArray(entry.rows)) {
    const rows = entry.rows.map((row) => (isPlainRecord(row) ? { ...row } : row));
    return assignArrayMetadata(rows, entry.meta || {}, metaOptions);
  }
  if (isPlainRecord(entry)) {
    return [{ ...entry }];
  }
  return [];
}

export function serializeValuesForTransport(values, multiTableSet, options = {}) {
  const metaOptions = { excludeKeys: ['rows', 'meta'], ...options };
  const result = {};
  Object.entries(values || {}).forEach(([table, value]) => {
    if (multiTableSet?.has(table)) {
      const serialized = serializeRowsWithMetadata(value, metaOptions);
      result[table] = serialized.meta
        ? { rows: serialized.rows, meta: serialized.meta }
        : { rows: serialized.rows };
    } else if (Array.isArray(value)) {
      result[table] = value.map((row) => (isPlainRecord(row) ? { ...row } : row));
    } else if (isPlainRecord(value)) {
      result[table] = { ...value };
    } else {
      result[table] = value;
    }
  });
  return result;
}

export function restoreValuesFromTransport(values, multiTableSet, options = {}) {
  const metaOptions = { excludeKeys: ['rows', 'meta'], ...options };
  if (!values || typeof values !== 'object') return {};
  const result = {};
  Object.entries(values).forEach(([table, value]) => {
    if (multiTableSet?.has(table)) {
      result[table] = restoreRowsWithMetadata(value, metaOptions);
    } else if (Array.isArray(value)) {
      result[table] = value.map((row) => (isPlainRecord(row) ? { ...row } : row));
    } else if (isPlainRecord(value)) {
      result[table] = { ...value };
    } else {
      result[table] = value;
    }
  });
  return result;
}

export function cloneValuesForRecalc(vals, options = {}) {
  const metaOptions = { excludeKeys: ['rows', 'meta'], ...options };
  if (!vals || typeof vals !== 'object') return {};
  const next = {};
  Object.entries(vals).forEach(([table, value]) => {
    if (Array.isArray(value)) {
      next[table] = cloneArrayWithMetadata(value, metaOptions);
    } else if (isPlainRecord(value)) {
      next[table] = { ...value };
    } else {
      next[table] = value;
    }
  });
  return next;
}

export function buildGeneratedColumnEvaluators(tableColumns, columnCaseMap = {}) {
  const map = {};
  if (!Array.isArray(tableColumns)) return map;
  tableColumns.forEach((col) => {
    if (!col || typeof col !== 'object') return;
    const rawName = col.name;
    const expr =
      col.generationExpression ??
      col.GENERATION_EXPRESSION ??
      col.generation_expression ??
      null;
    if (!rawName || !expr) return;
    const key = columnCaseMap[String(rawName).toLowerCase()] || rawName;
    if (typeof key !== 'string') return;
    const evaluator = createGeneratedColumnEvaluator(expr, columnCaseMap);
    if (evaluator) map[key] = evaluator;
  });
  return map;
}

function ensureFieldSet(value) {
  if (value instanceof Set) return value;
  const set = new Set();
  if (!value) return set;
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (typeof item === 'string' && item) set.add(item);
    });
    return set;
  }
  if (typeof value === 'string' && value) {
    set.add(value);
    return set;
  }
  return set;
}

export function createGeneratedColumnPipeline({
  tableColumns,
  columnCaseMap = {},
  mainFields,
  metadataFields,
  equals = valuesEqual,
} = {}) {
  const evaluators = buildGeneratedColumnEvaluators(tableColumns, columnCaseMap);
  const mainFieldSet = ensureFieldSet(mainFields);
  const metadataFieldSet = ensureFieldSet(metadataFields);
  const hasEvaluators = Object.keys(evaluators).length > 0;

  const apply = (targetRows, indices = null) => {
    if (!hasEvaluators || !Array.isArray(targetRows)) {
      return { changed: false, metadata: null };
    }
    return applyGeneratedColumnEvaluators({
      targetRows,
      evaluators,
      indices,
      mainFields: mainFieldSet,
      metadataFields: metadataFieldSet,
      equals,
    });
  };

  return {
    evaluators,
    apply,
    mainFields: mainFieldSet,
    metadataFields: metadataFieldSet,
  };
}

export function applyGeneratedColumnsForValues(valuesByTable, pipelineMap) {
  if (!valuesByTable || typeof valuesByTable !== 'object') return valuesByTable;
  if (!pipelineMap || typeof pipelineMap !== 'object') return valuesByTable;

  let next = valuesByTable;
  let mutated = false;

  Object.entries(pipelineMap).forEach(([table, pipeline]) => {
    if (!pipeline || typeof pipeline.apply !== 'function') return;
    const current = next[table];
    if (!Array.isArray(current)) return;
    const cloned = cloneArrayWithMetadata(current);
    const { changed, metadata } = pipeline.apply(cloned);
    if (!changed && !metadata) return;
    if (metadata && typeof metadata === 'object') {
      Object.entries(metadata).forEach(([key, value]) => {
        cloned[key] = value;
      });
    }
    if (!mutated) {
      next = { ...valuesByTable };
      mutated = true;
    }
    next[table] = cloned;
  });

  return mutated ? next : valuesByTable;
}

export function applyPosFields(vals, posFieldConfig) {
  if (!Array.isArray(posFieldConfig)) return vals;

  let next = { ...vals };

  for (const pf of posFieldConfig) {
    const parts = Array.isArray(pf?.parts) ? pf.parts : [];
    if (parts.length < 2) continue;

    const [target, ...calc] = parts;
    let val = 0;
    let init = false;

    for (const p of calc) {
      if (!p?.table || !p?.field) continue;
      const data = next[p.table];
      let num = 0;

      if (Array.isArray(data)) {
        if (p.agg === 'SUM' || p.agg === 'AVG') {
          const sum = data.reduce(
            (sumAcc, row) => sumAcc + (Number(row?.[p.field]) || 0),
            0,
          );
          num = p.agg === 'AVG' ? (data.length ? sum / data.length : 0) : sum;
        } else {
          num = Number(data[0]?.[p.field]) || 0;
        }
      } else {
        num = Number(data?.[p.field]) || 0;
      }

      if (p.agg === '=' && !init) {
        val = num;
        init = true;
      } else if (p.agg === '+') {
        val += num;
      } else if (p.agg === '-') {
        val -= num;
      } else if (p.agg === '*') {
        val *= num;
      } else if (p.agg === '/') {
        val /= num;
      } else {
        val = num;
        init = true;
      }
    }

    if (!target?.table || !target?.field) continue;
    const tgt = next[target.table];

    if (Array.isArray(tgt)) {
      let resultRows = tgt;
      let tableChanged = false;

      const ensureClone = () => {
        if (resultRows === tgt) {
          resultRows = cloneArrayWithMetadata(tgt);
        }
      };

      tgt.forEach((row, index) => {
        if (!isPlainRecord(row)) return;
        if ((row?.[target.field] ?? undefined) === val) return;
        ensureClone();
        resultRows[index] = { ...row, [target.field]: val };
        tableChanged = true;
      });

      if ((resultRows?.[target.field] ?? undefined) !== val) {
        ensureClone();
        resultRows[target.field] = val;
        tableChanged = true;
      }

      if (tableChanged) {
        next = { ...next, [target.table]: resultRows };
      }
    } else {
      next = { ...next, [target.table]: { ...(tgt || {}), [target.field]: val } };
    }
  }

  return next;
}

export function recalcGeneratedColumns(values, pipelines, calcFields) {
  let next = values;

  if (Array.isArray(calcFields) && calcFields.length > 0) {
    next = syncCalcFields(next, calcFields);
  }

  return applyGeneratedColumnsForValues(next, pipelines);
}

export function recalcTotals(values, { calcFields, pipelines, posFields } = {}) {
  const base = recalcGeneratedColumns(values, pipelines, calcFields);
  return applyPosFields(base, posFields);
}

export default {
  isPlainRecord,
  extractArrayMetadata,
  assignArrayMetadata,
  cloneArrayWithMetadata,
  serializeRowsWithMetadata,
  restoreRowsWithMetadata,
  serializeValuesForTransport,
  restoreValuesFromTransport,
  cloneValuesForRecalc,
  buildGeneratedColumnEvaluators,
  createGeneratedColumnPipeline,
  applyGeneratedColumnsForValues,
  applyPosFields,
  recalcGeneratedColumns,
  recalcTotals,
};
