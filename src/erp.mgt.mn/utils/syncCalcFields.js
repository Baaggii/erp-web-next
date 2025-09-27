import { extractArrayMetadata, assignArrayMetadata } from './transactionValues.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseLocalizedNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const withoutGrouping = trimmed.replace(/[\s\u00A0]+/g, '');
  if (!withoutGrouping) return null;

  let normalized = withoutGrouping;

  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    const commaCount = (normalized.match(/,/g) || []).length;
    if (commaCount === 1) {
      normalized = normalized.replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
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
      const sum =
        (prev.hasValue ? prev.sum : 0) + (next.hasValue ? next.sum : 0);
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
          const raw = row[field];
          if (raw === undefined || raw === null) continue;
          const num = parseLocalizedNumber(raw);
          if (num === null) continue;
          sum += num;
          count += 1;
        }
        return { sum, count, hasValue: count > 0 };
      }
      if (isPlainObject(source)) {
        const raw = source[field];
        if (raw === undefined || raw === null) {
          return { sum: 0, count: 0, hasValue: false };
        }
        const num = parseLocalizedNumber(raw);
        if (num === null) {
          return { sum: 0, count: 0, hasValue: false };
        }
        return { sum: num, count: 1, hasValue: true };
      }
      return { sum: 0, count: 0, hasValue: false };
    },
    merge(
      prev = { sum: 0, count: 0, hasValue: false },
      next = { sum: 0, count: 0, hasValue: false },
    ) {
      const count = (prev.count || 0) + (next.count || 0);
      const sum = (prev.sum || 0) + (next.sum || 0);
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

export function syncCalcFields(vals, mapConfig) {
  if (!Array.isArray(mapConfig)) return vals;
  const base = vals && typeof vals === 'object' ? vals : {};
  let next = { ...base };

  for (const map of mapConfig) {
    const rawCells = Array.isArray(map?.cells) ? map.cells : [];
    const cells = rawCells.filter(
      (cell) =>
        cell &&
        typeof cell.table === 'string' &&
        cell.table &&
        typeof cell.field === 'string' &&
        cell.field,
    );
    if (!cells.length) continue;

    const aggregatorState = new Map();
    const aggregatorOrder = [];

    for (const cell of cells) {
      const aggKey =
        typeof cell.agg === 'string' ? cell.agg.trim().toUpperCase() : '';
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
      for (const cell of cells) {
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

    for (const cell of cells) {
      const { table, field } = cell;
      const aggKey =
        typeof cell.agg === 'string' ? cell.agg.trim().toUpperCase() : '';
      const aggregator = aggKey ? CALC_FIELD_AGGREGATORS[aggKey] : null;
      const target = next[table];

      if (aggregator && Array.isArray(target)) {
        continue;
      }

      if (target === undefined || target === null) {
        if (aggregator) continue;
        next = { ...next, [table]: { [field]: computedValue } };
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
        }
      } else if (isPlainObject(target)) {
        if (target[field] === computedValue) continue;
        next = { ...next, [table]: { ...target, [field]: computedValue } };
      } else {
        if (aggregator) continue;
        next = { ...next, [table]: { [field]: computedValue } };
      }
    }
  }

  return next;
}

export default syncCalcFields;
