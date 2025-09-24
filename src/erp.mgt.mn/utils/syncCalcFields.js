function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
        const raw = source[field];
        if (raw === undefined || raw === null) {
          return { sum: 0, hasValue: false };
        }
        const num = Number(raw);
        if (!Number.isFinite(num)) {
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
        let changed = false;
        const updated = target.map((row) => {
          if (!isPlainObject(row)) return row;
          if (row[field] === computedValue) return row;
          changed = true;
          return { ...row, [field]: computedValue };
        });
        if (changed) {
          next = { ...next, [table]: updated };
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
