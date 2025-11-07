import { valuesEqual } from './generatedColumns.js';
import { isPlainRecord } from './transactionValues.js';

export function preserveManualChangesAfterRecalc({
  table,
  changes,
  computedFieldMap = {},
  editableFieldMap = {},
  desiredRow,
  recalculatedValues,
  equals = valuesEqual,
}) {
  if (!recalculatedValues || typeof recalculatedValues !== 'object') {
    return recalculatedValues;
  }
  if (!changes || typeof changes !== 'object') {
    return recalculatedValues;
  }
  if (!isPlainRecord(desiredRow)) {
    return recalculatedValues;
  }

  const changedFields = Object.keys(changes);
  if (changedFields.length === 0) {
    return recalculatedValues;
  }

  const currentContainer = recalculatedValues[table];
  if (!isPlainRecord(currentContainer)) {
    return recalculatedValues;
  }

  const rawComputed = computedFieldMap?.[table];
  let computedSet;
  if (rawComputed instanceof Set) {
    computedSet = rawComputed;
  } else if (Array.isArray(rawComputed)) {
    computedSet = new Set(
      rawComputed
        .filter((field) => typeof field === 'string')
        .map((field) => field.toLowerCase()),
    );
  } else {
    computedSet = new Set();
  }

  const rawEditable = editableFieldMap?.[table];
  let editableSet = null;
  if (rawEditable instanceof Set) {
    editableSet = new Set(
      Array.from(rawEditable)
        .filter((field) => typeof field === 'string')
        .map((field) => field.toLowerCase()),
    );
  } else if (Array.isArray(rawEditable)) {
    editableSet = new Set(
      rawEditable
        .filter((field) => typeof field === 'string')
        .map((field) => field.toLowerCase()),
    );
  } else if (rawEditable && typeof rawEditable === 'object') {
    const candidate = rawEditable.fields ?? rawEditable.list ?? rawEditable.values;
    if (candidate instanceof Set) {
      editableSet = new Set(
        Array.from(candidate)
          .filter((field) => typeof field === 'string')
          .map((field) => field.toLowerCase()),
      );
    } else if (Array.isArray(candidate)) {
      editableSet = new Set(
        candidate
          .filter((field) => typeof field === 'string')
          .map((field) => field.toLowerCase()),
      );
    }
    if (rawEditable.hasExplicitConfig && (!editableSet || editableSet.size === 0)) {
      editableSet = null;
    }
  }

  let nextContainer = currentContainer;
  let mutated = false;

  changedFields.forEach((field) => {
    if (typeof field !== 'string' || field.length === 0) return;
    const lower = field.toLowerCase();
    if (computedSet.has(lower) && editableSet && !editableSet.has(lower)) return;
    if (!Object.prototype.hasOwnProperty.call(desiredRow, field)) return;
    const desiredValue = desiredRow[field];
    if (equals(nextContainer[field], desiredValue)) return;
    if (!mutated) {
      nextContainer = { ...currentContainer };
      mutated = true;
    }
    nextContainer[field] = desiredValue;
  });

  if (!mutated || nextContainer === currentContainer) {
    return recalculatedValues;
  }

  return { ...recalculatedValues, [table]: nextContainer };
}

export default preserveManualChangesAfterRecalc;
