import {
  POS_API_FIELDS,
  POS_API_ITEM_FIELDS,
  POS_API_PAYMENT_FIELDS,
  POS_API_RECEIPT_FIELDS,
} from './posApiConfig.js';
import { buildMappingValue, normalizeMappingSelection } from './posApiFieldSource.js';

const ROOT_REQUEST_KEYS = new Set(POS_API_FIELDS.map((field) => field.key));
const ITEM_REQUEST_KEYS = new Set(POS_API_ITEM_FIELDS.map((field) => field.key));
const PAYMENT_REQUEST_KEYS = new Set(POS_API_PAYMENT_FIELDS.map((field) => field.key));
const RECEIPT_REQUEST_KEYS = new Set(POS_API_RECEIPT_FIELDS.map((field) => field.key));

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

export function normalizeNestedPathsMap(nestedPaths = {}, supportsItems = false) {
  const defaults = {};
  if (supportsItems) {
    defaults.items = 'receipts[].items[]';
  }
  defaults.payments = supportsItems ? 'receipts[].payments[]' : 'payments[]';
  defaults.receipts = 'receipts[]';
  const map = { ...defaults };
  if (nestedPaths && typeof nestedPaths === 'object' && !Array.isArray(nestedPaths)) {
    Object.entries(nestedPaths).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        map[key] = value.trim();
      }
    });
  }
  return map;
}

export function hasMappingProvidedValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value !== 'object') return false;
  if (Object.keys(value).length === 0) return false;
  if (value.value || value.envVar || value.sessionVar || value.expression) return true;
  if (value.column) return true;
  if (value.table) return true;
  return false;
}

export function mergeMappingSection(current = {}, defaults = {}) {
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

function normalizeFieldKeyForMatch(path = '') {
  return path.replace(/\[\]/g, '');
}

function normalizeSelection(rawSelection) {
  const literalSelection =
    rawSelection && rawSelection.type === 'literal' && rawSelection.value === undefined && rawSelection.literal !== undefined
      ? { ...rawSelection, value: rawSelection.literal }
      : rawSelection;
  const normalizedSelection = normalizeMappingSelection(literalSelection || {});
  if (!hasMappingProvidedValue(normalizedSelection)) return null;
  const mappingValue = buildMappingValue(normalizedSelection, { preserveType: true });
  if (!hasMappingProvidedValue(mappingValue)) return null;
  return mappingValue;
}

function coerceMappingEntry(entry) {
  if (entry === undefined || entry === null) return null;
  const applyToBody =
    entry && typeof entry === 'object' && 'applyToBody' in entry ? entry.applyToBody !== false : true;
  const selection = entry && typeof entry === 'object' && 'selection' in entry ? entry.selection : entry;
  const mappingValue = normalizeSelection(selection);
  if (!mappingValue) return null;
  return { applyToBody, mappingValue };
}

function assignObjectField(objectFields, objectKey, fieldKey, legacyTarget, value, includeLegacy = true) {
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
}

export function buildEndpointRequestMappingDefaults(
  endpoint = {},
  { nestedPaths = {}, supportsItems = false } = {},
) {
  if (!endpoint || typeof endpoint !== 'object') return null;
  const normalizedNestedPaths = normalizeNestedPathsMap(nestedPaths, supportsItems);
  const itemsPrefixTokens = tokenizeFieldPath(normalizedNestedPaths.items || '');
  const paymentsPrefixTokens = tokenizeFieldPath(normalizedNestedPaths.payments || '');
  const receiptsPrefixTokens = tokenizeFieldPath(normalizedNestedPaths.receipts || '');
  const itemsObjectKey = tokensToPath(itemsPrefixTokens) || 'items';
  const paymentsObjectKey = tokensToPath(paymentsPrefixTokens) || 'payments';
  const receiptsObjectKey = tokensToPath(receiptsPrefixTokens) || 'receipts';
  const rootDefaults = {};
  const objectFields = {};
  const legacyItemFields = {};
  const legacyPaymentFields = {};
  const legacyReceiptFields = {};

  const entries = [];
  Object.entries(endpoint.requestFieldMappings || {}).forEach(([fieldPath, selection]) => {
    entries.push([fieldPath, selection]);
  });
  Object.entries(endpoint.requestMappings || {}).forEach(([fieldPath, selection]) => {
    entries.push([fieldPath, selection]);
  });
  Object.entries(endpoint.requestEnvMap || {}).forEach(([fieldPath, envEntry]) => {
    if (!fieldPath) return;
    const envVar = typeof envEntry === 'string' ? envEntry : envEntry?.envVar;
    if (!envVar) return;
    const applyToBody =
      envEntry && typeof envEntry === 'object' && 'applyToBody' in envEntry
        ? Boolean(envEntry.applyToBody)
        : true;
    entries.push([fieldPath, { type: 'env', envVar, applyToBody }]);
  });

  if (!entries.length) return null;

  entries.forEach(([fieldPath, rawSelection]) => {
    if (!fieldPath) return;
    const parsed = coerceMappingEntry(rawSelection);
    if (!parsed || parsed.applyToBody === false) return;
    const { mappingValue } = parsed;
    const tokens = tokenizeFieldPath(fieldPath);
    const itemRemainder = stripPrefix(tokens, itemsPrefixTokens);
    if (itemRemainder) {
      const itemKey = normalizeFieldKeyForMatch(tokensToPath(itemRemainder));
      if (itemKey) {
        assignObjectField(
          objectFields,
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
          objectFields,
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
          objectFields,
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
