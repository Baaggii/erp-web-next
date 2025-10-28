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
  let hasExplicitEditableConfig = false;

  const normalizeEditable = (value) => {
    if (!value) return null;
    if (value instanceof Set) return value;
    if (Array.isArray(value)) {
      return new Set(
        value
          .filter((field) => typeof field === 'string')
          .map((field) => field.toLowerCase()),
      );
    }
    return null;
  };

  if (rawEditable instanceof Set) {
    editableSet = rawEditable;
    hasExplicitEditableConfig = true;
  } else if (Array.isArray(rawEditable)) {
    editableSet = normalizeEditable(rawEditable);
    hasExplicitEditableConfig = true;
  } else if (rawEditable && typeof rawEditable === 'object') {
    const candidate = rawEditable.fields || rawEditable.set || rawEditable.list;
    editableSet = normalizeEditable(candidate);
    if (typeof rawEditable.hasExplicitConfig === 'boolean') {
      hasExplicitEditableConfig = rawEditable.hasExplicitConfig;
    } else if (editableSet) {
      hasExplicitEditableConfig = true;
    }
  }

  let nextContainer = currentContainer;
  let mutated = false;

  changedFields.forEach((field) => {
    if (typeof field !== 'string' || field.length === 0) return;
    const lower = field.toLowerCase();
    if (
      computedSet.has(lower) &&
      hasExplicitEditableConfig &&
      !(editableSet && editableSet.has(lower))
    )
      return;
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
