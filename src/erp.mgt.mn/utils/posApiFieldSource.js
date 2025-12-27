import {
  POS_API_FIELDS,
  POS_API_ITEM_FIELDS,
  POS_API_PAYMENT_FIELDS,
  POS_API_RECEIPT_FIELDS,
} from './posApiConfig.js';

function normalizeStringValue(value = '', primaryTableName = '') {
  const trimmed = value.trim();
  if (!trimmed) return { table: '', column: '', raw: '' };
  const envMatch = trimmed.match(/^\{\{\s*([A-Z0-9_]+)\s*\}\}$/i);
  if (envMatch) {
    return {
      table: '',
      column: '',
      raw: trimmed,
      type: 'env',
      envVar: envMatch[1],
      value: envMatch[1],
    };
  }
  const parts = trimmed.split('.');
  if (parts.length > 1) {
    const [first, ...rest] = parts;
    if (/^[a-zA-Z0-9_]+$/.test(first)) {
      const normalizedPrimary = typeof primaryTableName === 'string' ? primaryTableName.trim() : '';
      if (normalizedPrimary && first === normalizedPrimary) {
        return { table: '', column: rest.join('.'), raw: trimmed, type: 'column' };
      }
      return { table: first, column: rest.join('.'), raw: trimmed, type: 'column' };
    }
  }
  return { table: '', column: trimmed, raw: trimmed, type: 'column' };
}

export function parseFieldSource(value = '', primaryTableName = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const table = typeof value.table === 'string' ? value.table.trim() : '';
    const column = typeof value.column === 'string' ? value.column.trim() : '';
    const type = typeof value.type === 'string'
      ? value.type
      : value.envVar
        ? 'env'
        : value.sessionVar
          ? 'session'
          : value.expression
            ? 'expression'
            : value.value
              ? 'literal'
              : 'column';
    const literal = typeof value.value === 'string' ? value.value.trim() : '';
    const envVar = typeof value.envVar === 'string' ? value.envVar.trim() : '';
    const sessionVar = typeof value.sessionVar === 'string' ? value.sessionVar.trim() : '';
    const expression = typeof value.expression === 'string' ? value.expression.trim() : '';
    const raw = column || literal || envVar || sessionVar || expression || table;
    return {
      table,
      column: column || (type === 'literal' ? literal : ''),
      raw,
      type,
      envVar,
      sessionVar,
      expression,
      value: literal || envVar || sessionVar || expression,
    };
  }
  if (typeof value !== 'string') {
    return { table: '', column: '', raw: value ? String(value) : '' };
  }
  return normalizeStringValue(value, primaryTableName);
}

export function buildFieldSource(tableName, columnName) {
  const tablePart = typeof tableName === 'string' ? tableName.trim() : '';
  const columnPart = typeof columnName === 'string' ? columnName.trim() : '';
  if (!columnPart) return '';
  if (!tablePart) return columnPart;
  return `${tablePart}.${columnPart}`;
}

export function normalizeMappingSelection(value, primaryTableName = '') {
  const selectionValue =
    value && typeof value === 'object'
      ? resetMappingFieldsForType(value, value?.type || value?.mode)
      : value;
  const parsed = parseFieldSource(selectionValue, primaryTableName);
  const aggregation =
    value && typeof value === 'object' && !Array.isArray(value) && typeof value.aggregation === 'string'
      ? value.aggregation
      : '';
  const type = parsed.type || 'column';
  if (type === 'literal') {
    return { type, value: parsed.value ?? parsed.column ?? '', ...(aggregation ? { aggregation } : {}) };
  }
  if (type === 'env') {
    return { type, envVar: parsed.envVar || parsed.value || parsed.raw, ...(aggregation ? { aggregation } : {}) };
  }
  if (type === 'session') {
    return {
      type,
      sessionVar: parsed.sessionVar || parsed.value || parsed.raw,
      ...(aggregation ? { aggregation } : {}),
    };
  }
  if (type === 'expression') {
    return {
      type,
      expression: parsed.expression || parsed.value || parsed.raw,
      ...(aggregation ? { aggregation } : {}),
    };
  }
  return {
    type: 'column',
    table: parsed.table,
    column: parsed.column || parsed.value || '',
    ...(aggregation ? { aggregation } : {}),
  };
}

export function resetMappingFieldsForType(selection = {}, nextType = selection?.type) {
  const type = nextType || selection?.type || 'column';
  const next = { ...selection, type };
  if (type !== 'column') {
    delete next.table;
    delete next.column;
  }
  if (type !== 'literal') {
    delete next.value;
    delete next.literal;
  }
  if (type !== 'env') {
    delete next.envVar;
  }
  if (type !== 'session') {
    delete next.sessionVar;
  }
  if (type !== 'expression') {
    delete next.expression;
  }
  return next;
}

export function buildMappingValue(selection = {}, { preserveType = false } = {}) {
  const type = selection.type || 'column';
  const aggregation = typeof selection.aggregation === 'string' ? selection.aggregation : '';
  if (type === 'literal') {
    const literal = selection.value ?? selection.literal ?? '';
    const trimmed = `${literal}`.trim();
    if (!trimmed && !preserveType) return '';
    const result = { type: 'literal', value: String(trimmed) };
    if (aggregation) result.aggregation = aggregation;
    return result;
  }
  if (type === 'env') {
    const envVar = selection.envVar || selection.value || '';
    const trimmed = typeof envVar === 'string' ? envVar.trim() : envVar;
    if (!trimmed && !preserveType) return '';
    const result = { type: 'env', envVar: trimmed || '' };
    if (aggregation) result.aggregation = aggregation;
    return result;
  }
  if (type === 'session') {
    const sessionVar = selection.sessionVar || selection.value || '';
    const trimmed = typeof sessionVar === 'string' ? sessionVar.trim() : sessionVar;
    if (!trimmed && !preserveType) return '';
    const result = { type: 'session', sessionVar: trimmed || '' };
    if (aggregation) result.aggregation = aggregation;
    return result;
  }
  if (type === 'expression') {
    const expression = selection.expression || selection.value || '';
    const trimmed = typeof expression === 'string' ? expression.trim() : expression;
    if (!trimmed && !preserveType) return '';
    const result = { type: 'expression', expression: trimmed || '' };
    if (aggregation) result.aggregation = aggregation;
    return result;
  }
  const table = typeof selection.table === 'string' ? selection.table.trim() : '';
  const column = typeof selection.column === 'string' ? selection.column.trim() : '';
  if (!column && !table && !preserveType) return '';
  const base = { type: 'column', table, column: column || selection.value || '' };
  if (aggregation) base.aggregation = aggregation;
  if (column && !aggregation && !table && !preserveType) {
    return column;
  }
  if (column && !aggregation && table && !preserveType) {
    return buildFieldSource(table, column || selection.value || '');
  }
  return base;
}

export function hasMappingProvidedValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value !== 'object') return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  if (value.value || value.envVar || value.sessionVar || value.expression) return true;
  if (value.column) return true;
  if (value.table) return true;
  if (typeof value.type === 'string') return true;
  return false;
}

function tokenizeFieldPath(path) {
  if (typeof path !== 'string' || !path.trim()) return [];
  return path
    .split('.')
    .map((segment) => {
      const trimmed = segment.trim();
      if (!trimmed) return null;
      const arrayMatch = /^(.*)\[\]$/.exec(trimmed);
      if (arrayMatch) {
        return { key: arrayMatch[1], isArray: true };
      }
      return { key: trimmed, isArray: false };
    })
    .filter(Boolean);
}

function tokensToPath(tokens = []) {
  if (!Array.isArray(tokens) || tokens.length === 0) return '';
  return tokens
    .map((token) => `${token.key}${token.isArray ? '[]' : ''}`)
    .filter(Boolean)
    .join('.');
}

function stripPrefix(tokens = [], prefixTokens = []) {
  if (!tokens.length || !prefixTokens.length || tokens.length < prefixTokens.length) return null;
  for (let i = 0; i < prefixTokens.length; i += 1) {
    if (tokens[i].key !== prefixTokens[i].key) return null;
  }
  return tokens.slice(prefixTokens.length);
}

function normalizeFieldKeyForMatch(path = '') {
  return path.replace(/\[\]/g, '');
}

function normalizeNestedPathsMap(nestedPaths = {}, supportsItems = false) {
  const defaults = {};
  if (supportsItems) {
    defaults.items = 'receipts[].items[]';
  }
  defaults.payments = supportsItems ? 'receipts[].payments[]' : 'payments[]';
  defaults.receipts = 'receipts[]';
  const map = { ...defaults };
  if (nestedPaths && typeof nestedPaths === 'object' && !Array.isArray(nestedPaths)) {
    Object.entries(nestedPaths).forEach(([key, value]) => {
      if (typeof value !== 'string') return;
      const normalized = value.trim();
      if (!normalized) return;
      map[key] = normalized;
    });
  }
  return map;
}

function mergeMappingSection(current = {}, defaults = {}) {
  const merged = { ...(current || {}) };
  let changed = false;
  Object.entries(defaults || {}).forEach(([fieldKey, value]) => {
    if (!hasMappingProvidedValue(merged[fieldKey]) && hasMappingProvidedValue(value)) {
      merged[fieldKey] = value;
      changed = true;
    }
  });
  return { merged, changed };
}

export function mergePosApiMappingDefaults(currentMapping = {}, defaults = {}) {
  const next = { ...(currentMapping || {}) };
  let changed = false;

  Object.entries(defaults || {}).forEach(([fieldKey, value]) => {
    if (['objectFields', 'itemFields', 'paymentFields', 'receiptFields'].includes(fieldKey)) return;
    if (!hasMappingProvidedValue(next[fieldKey]) && hasMappingProvidedValue(value)) {
      next[fieldKey] = value;
      changed = true;
    }
  });

  if (defaults.objectFields) {
    const objectFields =
      next.objectFields && typeof next.objectFields === 'object' && !Array.isArray(next.objectFields)
        ? { ...next.objectFields }
        : {};
    Object.entries(defaults.objectFields).forEach(([objectKey, fields]) => {
      const currentFields =
        objectFields[objectKey] && typeof objectFields[objectKey] === 'object' && !Array.isArray(objectFields[objectKey])
          ? objectFields[objectKey]
          : {};
      const { merged, changed: sectionChanged } = mergeMappingSection(currentFields, fields);
      if (sectionChanged) {
        objectFields[objectKey] = merged;
        changed = true;
      }
    });
    if (Object.keys(objectFields).length) {
      next.objectFields = objectFields;
    }
  }

  ['itemFields', 'paymentFields', 'receiptFields'].forEach((key) => {
    if (!defaults[key]) return;
    const currentSection =
      next[key] && typeof next[key] === 'object' && !Array.isArray(next[key]) ? next[key] : {};
    const { merged, changed: sectionChanged } = mergeMappingSection(currentSection, defaults[key]);
    if (sectionChanged) {
      next[key] = merged;
      changed = true;
    }
  });

  return { changed, value: changed ? next : currentMapping };
}

export function deriveEndpointRequestMappingDefaults(endpoint, { primaryTableName = '' } = {}) {
  if (!endpoint) return null;
  const mappingEntries = [];

  if (endpoint.requestMappings && typeof endpoint.requestMappings === 'object') {
    if (Array.isArray(endpoint.requestMappings)) {
      endpoint.requestMappings.forEach((entry) => {
        if (entry && typeof entry === 'object' && entry.field) {
          mappingEntries.push([entry.field, entry]);
        }
      });
    } else {
      mappingEntries.push(...Object.entries(endpoint.requestMappings));
    }
  }

  if (endpoint.requestFieldMappings && typeof endpoint.requestFieldMappings === 'object' && !Array.isArray(endpoint.requestFieldMappings)) {
    mappingEntries.push(...Object.entries(endpoint.requestFieldMappings));
  }

  if (endpoint.requestEnvMap && typeof endpoint.requestEnvMap === 'object' && !Array.isArray(endpoint.requestEnvMap)) {
    Object.entries(endpoint.requestEnvMap).forEach(([fieldPath, envEntry]) => {
      if (!fieldPath) return;
      const envVar = typeof envEntry === 'string' ? envEntry : envEntry?.envVar;
      if (!envVar) return;
      const applyToBody = envEntry && typeof envEntry === 'object' && envEntry.applyToBody === false ? false : true;
      mappingEntries.push([fieldPath, { type: 'env', envVar, applyToBody }]);
    });
  }

  if (!mappingEntries.length) return null;

  const nestedPaths = normalizeNestedPathsMap(endpoint?.mappingHints?.nestedPaths || {}, endpoint?.supportsItems !== false);
  const itemsPrefixTokens = tokenizeFieldPath(nestedPaths.items || '');
  const paymentsPrefixTokens = tokenizeFieldPath(nestedPaths.payments || '');
  const receiptsPrefixTokens = tokenizeFieldPath(nestedPaths.receipts || '');
  const itemsObjectKey = tokensToPath(itemsPrefixTokens) || 'items';
  const paymentsObjectKey = tokensToPath(paymentsPrefixTokens) || 'payments';
  const receiptsObjectKey = tokensToPath(receiptsPrefixTokens) || 'receipts';
  const rootDefaults = {};
  const objectFields = {};
  const legacyItemFields = {};
  const legacyPaymentFields = {};
  const legacyReceiptFields = {};

  const ROOT_REQUEST_KEYS = new Set(POS_API_FIELDS.map((field) => field.key));
  const ITEM_REQUEST_KEYS = new Set(POS_API_ITEM_FIELDS.map((field) => field.key));
  const PAYMENT_REQUEST_KEYS = new Set(POS_API_PAYMENT_FIELDS.map((field) => field.key));
  const RECEIPT_REQUEST_KEYS = new Set(POS_API_RECEIPT_FIELDS.map((field) => field.key));

  const assignObjectField = (objectKey, fieldKey, legacyTarget, value, includeLegacy = true) => {
    if (!fieldKey || !value) return;
    if (legacyTarget && includeLegacy) {
      legacyTarget[fieldKey] = value;
    }
    if (!objectKey) return;
    const existing =
      objectFields[objectKey] && typeof objectFields[objectKey] === 'object'
        ? { ...objectFields[objectKey] }
        : {};
    existing[fieldKey] = value;
    objectFields[objectKey] = existing;
  };

  mappingEntries.forEach(([fieldPath, rawSelection]) => {
    if (!fieldPath) return;
    if (rawSelection && rawSelection.applyToBody === false) return;
    const literalSelection =
      rawSelection && rawSelection.type === 'literal' && rawSelection.value === undefined && rawSelection.literal !== undefined
        ? { ...rawSelection, value: rawSelection.literal }
        : rawSelection;
    const normalizedSelection = normalizeMappingSelection(literalSelection || {}, primaryTableName);
    if (!hasMappingProvidedValue(normalizedSelection)) return;
    const mappingValue = buildMappingValue(normalizedSelection, { preserveType: true });
    if (!hasMappingProvidedValue(mappingValue)) return;
    const tokens = tokenizeFieldPath(fieldPath);
    const itemRemainder = stripPrefix(tokens, itemsPrefixTokens);
    if (itemRemainder) {
      const itemKey = normalizeFieldKeyForMatch(tokensToPath(itemRemainder));
      if (itemKey) {
        assignObjectField(
          itemsObjectKey,
          itemKey,
          legacyItemFields,
          mappingValue,
          ITEM_REQUEST_KEYS.has(itemKey),
        );
      }
      return;
    }
    const paymentRemainder = stripPrefix(tokens, paymentsPrefixTokens);
    if (paymentRemainder) {
      const paymentKey = normalizeFieldKeyForMatch(tokensToPath(paymentRemainder));
      if (paymentKey) {
        assignObjectField(
          paymentsObjectKey,
          paymentKey,
          legacyPaymentFields,
          mappingValue,
          PAYMENT_REQUEST_KEYS.has(paymentKey),
        );
      }
      return;
    }
    const receiptRemainder = stripPrefix(tokens, receiptsPrefixTokens);
    if (receiptRemainder) {
      const receiptKey = normalizeFieldKeyForMatch(tokensToPath(receiptRemainder));
      if (receiptKey) {
        assignObjectField(
          receiptsObjectKey,
          receiptKey,
          legacyReceiptFields,
          mappingValue,
          RECEIPT_REQUEST_KEYS.has(receiptKey),
        );
      }
      return;
    }
    const rootKey = normalizeFieldKeyForMatch(fieldPath);
    if (ROOT_REQUEST_KEYS.has(rootKey)) {
      rootDefaults[rootKey] = mappingValue;
    }
  });

  const result = { ...rootDefaults };
  if (Object.keys(objectFields).length) result.objectFields = objectFields;
  if (Object.keys(legacyItemFields).length) result.itemFields = legacyItemFields;
  if (Object.keys(legacyPaymentFields).length) result.paymentFields = legacyPaymentFields;
  if (Object.keys(legacyReceiptFields).length) result.receiptFields = legacyReceiptFields;
  return Object.keys(result).length ? result : null;
}
