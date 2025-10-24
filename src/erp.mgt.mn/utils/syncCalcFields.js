import { extractArrayMetadata, assignArrayMetadata } from './transactionValues.js';
import { parseLocalizedNumber } from '../../../utils/parseLocalizedNumber.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const SUPPORTED_CALC_AGGREGATORS = new Set(['SUM', 'AVG', 'COUNT', 'MIN', 'MAX']);

function normalizeCalcFieldCell(cell) {
  if (!cell || typeof cell !== 'object') return null;

  const table = typeof cell.table === 'string' ? cell.table.trim() : '';
  const field = typeof cell.field === 'string' ? cell.field.trim() : '';

  if (!table || !field) return null;

  const agg =
    typeof cell.agg === 'string' ? cell.agg.trim() : cell.agg ?? undefined;
  const normalized = { ...cell, table, field };

  if (typeof agg === 'string') {
    normalized.agg = agg;
    normalized.__aggKey = agg.trim().toUpperCase();
  } else {
    normalized.__aggKey = '';
  }

  if (!SUPPORTED_CALC_AGGREGATORS.has(normalized.__aggKey)) {
    normalized.__aggKey = '';
  }

  return normalized;
}

function getNormalizedCells(map) {
  if (!map || typeof map !== 'object') return [];
  if (Array.isArray(map.__normalizedCalcCells)) {
    return map.__normalizedCalcCells;
  }
  const rawCells = Array.isArray(map.cells) ? map.cells : [];
  return rawCells.map(normalizeCalcFieldCell).filter(Boolean);
}

export function normalizeCalcFieldConfig(mapConfig) {
  if (!Array.isArray(mapConfig)) return [];

  return mapConfig
    .map((map) => {
      if (!map || typeof map !== 'object') return null;
      const normalizedCells = getNormalizedCells(map);
      const computedIndexes = [];
      const hasAggregator = normalizedCells.some((cell) =>
        SUPPORTED_CALC_AGGREGATORS.has(cell.__aggKey),
      );

      if (hasAggregator) {
        let added = false;
        normalizedCells.forEach((cell, idx) => {
          if (!SUPPORTED_CALC_AGGREGATORS.has(cell.__aggKey)) {
            computedIndexes.push(idx);
            added = true;
          }
        });
        if (!added && normalizedCells.length > 0) {
          computedIndexes.push(0);
        }
      } else if (normalizedCells.length > 0) {
        computedIndexes.push(0);
      }

      return {
        ...map,
        cells: normalizedCells,
        __normalizedCalcCells: normalizedCells,
        __computedCellIndexes: computedIndexes,
      };
    })
    .filter(Boolean);
}

function collectSectionFields(map, table) {
  const fields = new Set();
  if (!map || !table) return fields;

  const addList = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) => {
      if (typeof item === 'string' && item) fields.add(item);
    });
  };

  const tableSections = map.tableSections;
  if (tableSections && typeof tableSections === 'object') {
    const info = tableSections[table];
    if (info && typeof info === 'object') {
      addList(info.headerFields || info.header || info.headers);
      addList(info.footerFields || info.footer || info.footers);
    }
  }

  const headerByTable = map.headerFieldsByTable;
  if (headerByTable && typeof headerByTable === 'object') {
    addList(headerByTable[table]);
  }

  const footerByTable = map.footerFieldsByTable;
  if (footerByTable && typeof footerByTable === 'object') {
    addList(footerByTable[table]);
  }

  return fields;
}

function pickFirstDefinedFieldValue(source, field) {
  if (!field) return undefined;
  if (Array.isArray(source)) {
    for (const row of source) {
      if (!isPlainObject(row)) continue;
      const val = row[field];
      if (val !== undefined && val !== null) return val;
    }
  } else if (isPlainObject(source)) {
    const val = source[field];
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
          if (!isPlainObject(row)) continue;
          const raw = row[field];
          if (raw === undefined || raw === null) continue;
          const num = parseLocalizedNumber(raw);
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
        const raw = source[field];
        if (raw === undefined || raw === null) {
          return { sum: 0, hasValue: false };
        }
        const num = parseLocalizedNumber(raw);
        if (num === null) {
          return { sum: 0, hasValue: false };
        }
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
          if (!isPlainObject(row)) continue;
          const num = parseLocalizedNumber(row[field]);
          if (num === null) continue;
          sum += num;
          count += 1;
        }
        return { sum, count, hasValue: count > 0 };
      }
      if (isPlainObject(source)) {
        const num = parseLocalizedNumber(source[field]);
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
          if (!isPlainObject(row)) continue;
          const num = parseLocalizedNumber(row[field]);
          if (num === null) continue;
          if (min === null || num < min) min = num;
        }
        return { min, hasValue: min !== null };
      }
      if (isPlainObject(source)) {
        const num = parseLocalizedNumber(source[field]);
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
          if (!isPlainObject(row)) continue;
          const num = parseLocalizedNumber(row[field]);
          if (num === null) continue;
          if (max === null || num > max) max = num;
        }
        return { max, hasValue: max !== null };
      }
      if (isPlainObject(source)) {
        const num = parseLocalizedNumber(source[field]);
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
          if (!isPlainObject(row)) continue;
          const raw = row[field];
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
        const raw = source[field];
        if (raw === undefined || raw === null) {
          return { count: 0, hasValue: false };
        }
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

export function evaluateCalcAggregator(aggKey, source, field) {
  if (!aggKey) {
    return { value: null, hasValue: false };
  }
  const normalized = aggKey.trim().toUpperCase();
  const aggregator = CALC_FIELD_AGGREGATORS[normalized];
  if (!aggregator) {
    return { value: null, hasValue: false };
  }
  const computed = aggregator.compute(source, field);
  const finalized = aggregator.finalize(computed);
  if (finalized && finalized.hasValue) {
    return finalized;
  }
  return {
    value: finalized?.value ?? null,
    hasValue: false,
  };
}

export function syncCalcFields(vals, mapConfig) {
  if (!Array.isArray(mapConfig)) return vals;
  const base = vals && typeof vals === 'object' ? vals : {};
  let next = { ...base };

  for (const map of mapConfig) {
    const cells = getNormalizedCells(map);
    if (!cells.length) continue;

    const computedIndexSet = new Set(
      Array.isArray(map.__computedCellIndexes)
        ? map.__computedCellIndexes
            .map((idx) => (Number.isInteger(idx) ? idx : null))
            .filter((idx) => idx !== null)
        : [],
    );
    if (computedIndexSet.size === 0) {
      const hasAggregator = cells.some((cell) =>
        SUPPORTED_CALC_AGGREGATORS.has(cell.__aggKey),
      );
      if (hasAggregator) {
        let added = false;
        cells.forEach((cell, idx) => {
          if (!SUPPORTED_CALC_AGGREGATORS.has(cell.__aggKey)) {
            computedIndexSet.add(idx);
            added = true;
          }
        });
        if (!added && cells.length > 0) {
          computedIndexSet.add(0);
        }
      } else if (cells.length > 0) {
        computedIndexSet.add(0);
      }
    }

    const aggregatorState = new Map();
    const aggregatorOrder = [];

    for (const cell of cells) {
      const aggKey =
        typeof cell.__aggKey === 'string'
          ? cell.__aggKey
          : typeof cell.agg === 'string'
            ? cell.agg.trim().toUpperCase()
            : '';
      const aggregator = aggKey ? CALC_FIELD_AGGREGATORS[aggKey] : null;
      if (!aggregator) continue;
      const source = next[cell.table];
      const computed = aggregator.compute(source, cell.field);
      if (aggregatorState.has(aggKey)) {
        const merged = aggregator.merge(aggregatorState.get(aggKey), computed);
        aggregatorState.set(aggKey, merged);
      } else {
        aggregatorState.set(aggKey, computed);
        aggregatorOrder.push(aggKey);
      }

      const aggregatorState = new Map();
      const aggregatorOrder = [];

      for (let idx = 0; idx < cells.length; idx += 1) {
        const cell = cells[idx];
        const aggKey =
          typeof cell.__aggKey === 'string'
            ? cell.__aggKey
            : typeof cell.agg === 'string'
              ? cell.agg.trim().toUpperCase()
              : '';
        const aggregator = aggKey ? CALC_FIELD_AGGREGATORS[aggKey] : null;
        if (!aggregator) continue;
        if (computedIndexSet.has(idx)) continue;
        const source = next[cell.table];
        const computed = aggregator.compute(source, cell.field);
        if (aggregatorState.has(aggKey)) {
          const merged = aggregator.merge(aggregatorState.get(aggKey), computed);
          aggregatorState.set(aggKey, merged);
        } else {
          aggregatorState.set(aggKey, computed);
          aggregatorOrder.push(aggKey);
        }
      }

    if (!hasComputedValue) {
      for (let idx = 0; idx < cells.length; idx += 1) {
        if (computedIndexSet.has(idx)) continue;
        const cell = cells[idx];
        const source = next[cell.table];
        const val = pickFirstDefinedFieldValue(source, cell.field);
        if (val !== undefined) {
          computedValue = val;
          hasComputedValue = true;
          break;
        }
      }
    }

    if (!hasComputedValue) {
      for (let idx = 0; idx < cells.length; idx += 1) {
        if (!computedIndexSet.has(idx)) continue;
        const cell = cells[idx];
        const source = next[cell.table];
        const val = pickFirstDefinedFieldValue(source, cell.field);
        if (val !== undefined) {
          computedValue = val;
          hasComputedValue = true;
          break;
        }
      }
    }

    if (!hasComputedValue) continue;

    for (let idx = 0; idx < cells.length; idx += 1) {
      const cell = cells[idx];
      const { table, field } = cell;
      const aggKey =
        typeof cell.agg === 'string' ? cell.agg.trim().toUpperCase() : '';
      const aggregator = aggKey ? CALC_FIELD_AGGREGATORS[aggKey] : null;

      if (aggregator && !computedIndexSet.has(idx)) {
        continue;
      }

      const target = next[table];

      if (target === undefined || target === null) {
        next = { ...next, [table]: { [field]: computedValue } };
        continue;
      }

      if (!hasComputedValue) continue;

      for (let idx = 0; idx < cells.length; idx += 1) {
        const cell = cells[idx];
        const { table, field } = cell;
        const aggKey =
          typeof cell.agg === 'string' ? cell.agg.trim().toUpperCase() : '';
        const aggregator = aggKey ? CALC_FIELD_AGGREGATORS[aggKey] : null;

        if (aggregator && !computedIndexSet.has(idx)) {
          continue;
        }

        const target = next[table];

        if (target === undefined || target === null) {
          next = { ...next, [table]: { [field]: computedValue } };
          iterationChanged = true;
          continue;
        }

        if (Array.isArray(target)) {
          const sectionFields = collectSectionFields(map, table);
          const metadata = extractArrayMetadata(target) || {};
          const metadataHasField = Object.prototype.hasOwnProperty.call(
            metadata,
            field,
          );
          const missingInRows = !target.some(
            (row) =>
              isPlainObject(row) && Object.prototype.hasOwnProperty.call(row, field),
          );

          let tableChanged = false;
          let resultRows = target;

          if (target.length > 0) {
            const mapped = target.map((row) => {
              if (!isPlainObject(row)) return row;
              if (row[field] === computedValue) return row;
              tableChanged = true;
              return { ...row, [field]: computedValue };
            });
            if (tableChanged) {
              resultRows = assignArrayMetadata(mapped, target);
            }
          }

          const shouldUpdateMetadata =
            sectionFields.has(field) || metadataHasField || missingInRows;

          if (shouldUpdateMetadata) {
            const ensureClone = () => {
              if (resultRows === target) {
                resultRows = assignArrayMetadata(target.slice(), target);
              }
              if (!tableChanged && resultRows !== target) {
                tableChanged = true;
              }
            };
            if ((resultRows?.[field] ?? undefined) !== computedValue) {
              ensureClone();
              resultRows[field] = computedValue;
            }
          }

          if (tableChanged) {
            next = { ...next, [table]: resultRows };
            iterationChanged = true;
          }
        } else if (isPlainObject(target)) {
          if (target[field] === computedValue) continue;
          next = { ...next, [table]: { ...target, [field]: computedValue } };
          iterationChanged = true;
        } else {
          if (aggregator) continue;
          next = { ...next, [table]: { [field]: computedValue } };
          iterationChanged = true;
        }
      }
    }

    if (!iterationChanged) {
      break;
    }
  }

  return next;
}

export default syncCalcFields;
