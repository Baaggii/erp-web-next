import { getSettings } from '../../db/index.js';
import { getEndpointById, loadEndpoints } from './posApiRegistry.js';
import { createColumnLookup } from './posApiPersistence.js';
import { resolveReferenceCodeValue } from './referenceCodeLookup.js';

function trimEndSlash(url) {
  if (!url) return '';
  return url.replace(/\/+$/, '');
}

let cachedFetch = null;
async function getFetch() {
  if (cachedFetch) return cachedFetch;
  if (typeof globalThis.fetch === 'function') {
    cachedFetch = globalThis.fetch.bind(globalThis);
    return cachedFetch;
  }
  const mod = await import('node-fetch');
  cachedFetch = mod.default;
  return cachedFetch;
}

function readEnvVar(name, { trim = true } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') return raw;
  return trim ? raw.trim() : raw;
}

function toNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function toStringValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return String(value ?? '').trim();
}

const ENV_PLACEHOLDER_REGEX = /^\s*\{\{\s*(POSAPI_[A-Z0-9_]+)\s*}}\s*$/;

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

function setValueAtTokens(target, tokens, value) {
  if (!target || typeof target !== 'object' || !tokens.length) return false;
  let current = target;
  tokens.forEach((token, index) => {
    if (!token?.key) return;
    const isLast = index === tokens.length - 1;
    if (isLast) {
      if (token.isArray) {
        current[token.key] = Array.isArray(current[token.key]) ? current[token.key] : [];
        if (!current[token.key].length) {
          current[token.key].push(value);
        } else {
          current[token.key][0] = value;
        }
      } else {
        current[token.key] = value;
      }
      return;
    }

    const nextContainer = token.isArray ? [] : {};
    if (current[token.key] === undefined || current[token.key] === null) {
      current[token.key] = token.isArray ? [nextContainer] : nextContainer;
    }
    if (token.isArray) {
      current[token.key] = Array.isArray(current[token.key]) ? current[token.key] : [];
      if (!current[token.key].length) {
        current[token.key].push(nextContainer);
      }
      current = current[token.key][0];
    } else {
      if (typeof current[token.key] !== 'object') {
        current[token.key] = nextContainer;
      }
      current = current[token.key];
    }
  });
  return true;
}

function parseEnvValue(rawValue) {
  if (rawValue === undefined || rawValue === null) return rawValue;
  if (typeof rawValue !== 'string') return rawValue;
  const trimmed = rawValue.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function applyEnvMapToPayload(payload, envMap = {}) {
  const basePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? JSON.parse(JSON.stringify(payload))
    : {};
  const target =
    basePayload.body && typeof basePayload.body === 'object' && !Array.isArray(basePayload.body)
      ? basePayload.body
      : basePayload;

  Object.entries(envMap || {}).forEach(([fieldPath, entry]) => {
    if (!fieldPath || !entry) return;

    const envVar = typeof entry === 'string' ? entry : entry.envVar;
    const applyToBody =
      entry && typeof entry === 'object' && 'applyToBody' in entry ? Boolean(entry.applyToBody) : true;

    if (!envVar) return;
    const envRaw = process.env[envVar];
    if (envRaw === undefined || envRaw === null || envRaw === '') {
      return;
    }
    const parsed = parseEnvValue(envRaw);
    const tokens = tokenizeFieldPath(fieldPath);
    const destination = applyToBody ? target : basePayload;
    setValueAtTokens(destination, tokens, parsed);
  });

  return { payload: basePayload };
}

function mergePayloads(base, overrides) {
  const baseObj =
    base && typeof base === 'object' && !Array.isArray(base) ? JSON.parse(JSON.stringify(base)) : {};
  const overrideObj =
    overrides && typeof overrides === 'object' && !Array.isArray(overrides)
      ? JSON.parse(JSON.stringify(overrides))
      : {};

  const assign = (target, source) => {
    Object.entries(source).forEach(([key, value]) => {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        assign(target[key], value);
        return;
      }
      target[key] = value;
    });
  };

  assign(baseObj, overrideObj);
  return baseObj;
}

function coerceEnvPlaceholderValue(envVar, rawValue, path = '') {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    const err = new Error(`Environment variable ${envVar} is not configured for POSAPI requests`);
    err.status = 400;
    err.details = { envVar, path };
    throw err;
  }
  if (typeof rawValue !== 'string') {
    return rawValue;
  }
  const trimmed = rawValue.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      const parseErr = new Error(`Environment variable ${envVar} contains invalid JSON`);
      parseErr.status = 400;
      parseErr.details = { envVar, path };
      throw parseErr;
    }
  }
  return trimmed;
}

function resolveEnvPlaceholders(value, path = '') {
  if (Array.isArray(value)) {
    return value.map((item, index) => resolveEnvPlaceholders(item, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, nested]) => {
      acc[key] = resolveEnvPlaceholders(nested, path ? `${path}.${key}` : key);
      return acc;
    }, Array.isArray(value) ? [] : {});
  }
  if (typeof value === 'string') {
    const match = ENV_PLACEHOLDER_REGEX.exec(value);
    if (match) {
      const envVar = match[1];
      const resolved = readEnvVar(envVar, { trim: false });
      return coerceEnvPlaceholderValue(envVar, resolved, path);
    }
  }
  return value;
}

let cachedBaseUrl = '';
let cachedBaseUrlLoaded = false;
const tokenCache = new Map();

function cacheToken(endpointId, token, expiresInSeconds) {
  if (!endpointId || !token) return;
  const ttl = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds : 300;
  const expiresAt = Date.now() + ttl * 1000 - 30000;
  tokenCache.set(endpointId, { token, expiresAt });
}

function getCachedToken(endpointId) {
  if (!endpointId) return null;
  const entry = tokenCache.get(endpointId);
  if (!entry || !entry.token) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    tokenCache.delete(endpointId);
    return null;
  }
  return entry.token;
}

function cacheTokenFromAuthResponse(endpoint, response) {
  if (!endpoint?.id || endpoint?.posApiType !== 'AUTH' || !response) return;

  const body = response.bodyJson ?? response.bodyText ?? response;
  let parsedBody = body;
  if (typeof parsedBody === 'string') {
    try {
      parsedBody = JSON.parse(parsedBody);
    } catch {
      parsedBody = null;
    }
  }

  if (!parsedBody || typeof parsedBody !== 'object') return;
  const token = parsedBody.access_token || parsedBody.id_token;
  if (!token) return;
  const expiresIn = toNumber(parsedBody.expires_in || parsedBody.expiresIn) || 300;
  cacheToken(endpoint.id, token, expiresIn);
}

export async function getPosApiBaseUrl() {
  if (cachedBaseUrlLoaded && cachedBaseUrl) {
    return cachedBaseUrl;
  }
  let baseUrl = '';
  try {
    const settings = await getSettings();
    if (settings && typeof settings === 'object') {
      baseUrl =
        toStringValue(settings.posapi_base_url) ||
        toStringValue(settings.posapiBaseUrl) ||
        '';
    }
  } catch (err) {
    // Ignore settings lookup failures and rely on environment variables.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to read POSAPI base URL from settings', err);
    }
  }
  if (!baseUrl) {
    baseUrl =
      toStringValue(readEnvVar('POSAPI_BASE_URL')) ||
      toStringValue(readEnvVar('POSAPI_URL')) ||
      '';
  }
  if (!baseUrl) {
    throw new Error('POSAPI base URL is not configured');
  }
  cachedBaseUrl = trimEndSlash(baseUrl);
  cachedBaseUrlLoaded = true;
  return cachedBaseUrl;
}

function tokenizePath(path) {
  if (typeof path !== 'string' || !path) return [];
  const tokens = [];
  const regex = /([^\.\[\]]+)|(\[(\d+)\])/g;
  let match;
  while ((match = regex.exec(path))) {
    if (match[1]) {
      tokens.push(match[1]);
    } else if (match[3] !== undefined) {
      tokens.push(Number(match[3]));
    }
  }
  return tokens;
}

function resolveColumnName(columnLookup, record, columnName) {
  if (!columnLookup || typeof columnLookup.get !== 'function') return '';
  if (typeof columnName !== 'string') return '';
  const tokens = tokenizePath(columnName.trim());
  if (!tokens.length) return '';
  const firstToken = tokens[0];
  if (typeof firstToken !== 'string') return '';
  const normalized = firstToken.toLowerCase();
  const underscored = normalized.replace(/[^a-z0-9]+/g, '_');
  const stripped = normalized.replace(/[^a-z0-9]+/g, '');
  const candidates = [normalized, underscored, stripped];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const column = columnLookup.get(candidate);
    if (column) return column;
  }
  if (record && Object.prototype.hasOwnProperty.call(record, firstToken)) {
    return firstToken;
  }
  return '';
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function getValueFromTokens(source, tokens) {
  let current = source;
  for (const token of tokens) {
    if (current === undefined || current === null) return undefined;
    if (typeof current === 'string') {
      current = parseMaybeJson(current);
    }
    if (typeof token === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[token];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = current[token];
  }
  return current;
}

function getColumnValue(columnLookup, record, columnName) {
  if (typeof columnName !== 'string' || !columnName.trim()) return undefined;
  const tokens = tokenizePath(columnName.trim());
  if (!tokens.length) return undefined;
  const [firstToken, ...rest] = tokens;
  if (typeof firstToken !== 'string') return undefined;
  const resolved = resolveColumnName(columnLookup, record, firstToken);
  if (!resolved) return undefined;
  if (!rest.length) return record[resolved];
  const baseValue = record[resolved];
  return getValueFromTokens(baseValue, rest);
}

const COMPLEX_ARRAY_KEYS = new Set(['itemsField', 'paymentsField', 'receiptsField']);
const FIELD_MAP_KEYS = new Set(['itemFields', 'paymentFields', 'receiptFields']);
const RECEIPT_GROUP_MAPPING_KEY = 'receiptGroups';
const PAYMENT_METHOD_MAPPING_KEY = 'paymentMethods';

function coerceFieldMapValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'object') {
    if (typeof value.path === 'string' && value.path.trim()) {
      return value.path.trim();
    }
    const tablePart = typeof value.table === 'string' ? value.table.trim() : '';
    const columnPart = typeof value.column === 'string' ? value.column.trim() : '';
    if (tablePart && columnPart) return `${tablePart}.${columnPart}`;
    if (columnPart) return columnPart;
    if (tablePart) return tablePart;
  }
  const str = String(value);
  const trimmed = str.trim();
  if (trimmed && trimmed !== '[object Object]') return trimmed;
  return '';
}

function normalizeFieldMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized = {};
  Object.entries(value).forEach(([key, val]) => {
    if (typeof key !== 'string') return;
    const coerced = coerceFieldMapValue(val);
    if (coerced) normalized[key] = coerced;
  });
  return normalized;
}

function normalizeReceiptGroupsMapping(value) {
  if (!value || typeof value !== 'object') return {};
  const normalized = {};
  Object.entries(value).forEach(([key, config]) => {
    if (typeof key !== 'string') return;
    const type = key.trim();
    if (!type) return;
    const entry = {};
    if (config && typeof config === 'object') {
      ['totalAmount', 'totalVAT', 'totalCityTax', 'taxType'].forEach((field) => {
        const val = config[field];
        if (val === undefined || val === null) return;
        const str = typeof val === 'string' ? val.trim() : String(val).trim();
        if (str) entry[field] = str;
      });
    }
    if (Object.keys(entry).length) normalized[type] = entry;
  });
  return normalized;
}

function normalizePaymentMethodsMapping(value) {
  if (!value || typeof value !== 'object') return {};
  const normalized = {};
  Object.entries(value).forEach(([method, config]) => {
    if (typeof method !== 'string') return;
    const code = method.trim();
    if (!code) return;
    if (typeof config === 'string' || typeof config === 'number' || typeof config === 'bigint') {
      const str = String(config).trim();
      if (str) {
        normalized[code] = { amount: str };
      }
      return;
    }
    if (!config || typeof config !== 'object') return;
    const entry = {};
    const allowedFields = [
      'amount',
      'paidAmount',
      'currency',
      'reference',
      'status',
      'data',
      'data.terminalID',
      'data.rrn',
      'data.maskedCardNumber',
      'data.easy',
    ];
    allowedFields.forEach((field) => {
      const val = config[field];
      if (val === undefined || val === null) return;
      const str = typeof val === 'string' ? val.trim() : String(val).trim();
      if (str) entry[field] = str;
    });
    if (Object.keys(entry).length) normalized[code] = entry;
  });
  return normalized;
}

function normalizeArrayDescriptor(value) {
  if (value === undefined || value === null) return {};
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? { path: trimmed } : {};
  }
  if (Array.isArray(value)) {
    return {};
  }
  if (typeof value !== 'object') {
    return {};
  }
  const descriptor = {};
  const pathCandidate =
    (typeof value.path === 'string' && value.path.trim()) ||
    (typeof value.column === 'string' && value.column.trim()) ||
    (typeof value.field === 'string' && value.field.trim()) ||
    (typeof value.source === 'string' && value.source.trim());
  if (pathCandidate) descriptor.path = pathCandidate;
  const itemsPathCandidate =
    (typeof value.itemsPath === 'string' && value.itemsPath.trim()) ||
    (typeof value.innerPath === 'string' && value.innerPath.trim());
  if (itemsPathCandidate) descriptor.itemsPath = itemsPathCandidate;
  if (value.fields) {
    const fieldMap = normalizeFieldMap(value.fields);
    if (Object.keys(fieldMap).length) descriptor.fields = fieldMap;
  }
  if (value.map) {
    const fieldMap = normalizeFieldMap(value.map);
    if (Object.keys(fieldMap).length) {
      descriptor.fields = {
        ...(descriptor.fields || {}),
        ...fieldMap,
      };
    }
  }
  if (value.fieldMap) {
    const fieldMap = normalizeFieldMap(value.fieldMap);
    if (Object.keys(fieldMap).length) {
      descriptor.fields = {
        ...(descriptor.fields || {}),
        ...fieldMap,
      };
    }
  }
  if (value.itemFields) {
    const fieldMap = normalizeFieldMap(value.itemFields);
    if (Object.keys(fieldMap).length) descriptor.itemFields = fieldMap;
  }
  if (value.paymentFields) {
    const fieldMap = normalizeFieldMap(value.paymentFields);
    if (Object.keys(fieldMap).length) descriptor.paymentFields = fieldMap;
  }
  if (value.receiptFields) {
    const fieldMap = normalizeFieldMap(value.receiptFields);
    if (Object.keys(fieldMap).length) descriptor.receiptFields = fieldMap;
  }
  return descriptor;
}

function normalizeMapping(mapping) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return {};
  const normalized = {};
  Object.entries(mapping).forEach(([key, value]) => {
    if (typeof key !== 'string') return;
    if (value === undefined || value === null) return;
    if (COMPLEX_ARRAY_KEYS.has(key)) {
      const descriptor = normalizeArrayDescriptor(value);
      if (Object.keys(descriptor).length) {
        normalized[key] = descriptor;
      }
      return;
    }
    if (FIELD_MAP_KEYS.has(key)) {
      const fieldMap = normalizeFieldMap(value);
      if (Object.keys(fieldMap).length) {
        normalized[key] = fieldMap;
      }
      return;
    }
    if (key === RECEIPT_GROUP_MAPPING_KEY) {
      const groups = normalizeReceiptGroupsMapping(value);
      if (Object.keys(groups).length) {
        normalized[key] = groups;
      }
      return;
    }
    if (key === PAYMENT_METHOD_MAPPING_KEY) {
      const methods = normalizePaymentMethodsMapping(value);
      if (Object.keys(methods).length) {
        normalized[key] = methods;
      }
      return;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) normalized[key] = trimmed;
      return;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      normalized[key] = String(value);
      return;
    }
    if (typeof value === 'boolean') {
      normalized[key] = value ? 'true' : 'false';
      return;
    }
    if (typeof value === 'object') {
      const jsonValue = JSON.stringify(value);
      if (jsonValue && jsonValue !== '{}') {
        normalized[key] = jsonValue;
      }
    }
  });
  return normalized;
}

function parseJsonArray(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.rows)) return parsed.rows;
        if (Array.isArray(parsed.items)) return parsed.items;
      }
    } catch {
      return [];
    }
    return [];
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.rows)) return value.rows;
    if (Array.isArray(value.items)) return value.items;
  }
  return [];
}

function mergeFieldMaps(...maps) {
  return maps.reduce((acc, map) => {
    if (!map || typeof map !== 'object') return acc;
    Object.entries(map).forEach(([key, value]) => {
      if (typeof key !== 'string') return;
      const coerced = coerceFieldMapValue(value);
      if (coerced) {
        acc[key] = coerced;
      }
    });
    return acc;
  }, {});
}

function extractDescriptorFieldMap(descriptor, key) {
  if (!descriptor || typeof descriptor !== 'object') return {};
  const parts = [];
  if (descriptor.fields) parts.push(descriptor.fields);
  if (key && descriptor[key]) parts.push(descriptor[key]);
  return mergeFieldMaps(...parts);
}

function getValueAtPath(source, path) {
  if (path === undefined || path === null) return undefined;
  if (typeof path === 'string') {
    const tokens = tokenizePath(path);
    return getValueFromTokens(source, tokens);
  }
  if (Array.isArray(path)) {
    return getValueFromTokens(source, path);
  }
  return undefined;
}

function setValueAtPath(target, path, value) {
  if (!target || typeof target !== 'object') return;
  const tokens = Array.isArray(path) ? path.slice() : tokenizePath(String(path));
  if (!tokens.length) return;
  let current = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    if (typeof token === 'number') {
      if (!Array.isArray(current)) return;
      if (!Array.isArray(current[token]) && typeof current[token] !== 'object') {
        current[token] = typeof nextToken === 'number' ? [] : {};
      }
      if (current[token] === undefined || current[token] === null) {
        current[token] = typeof nextToken === 'number' ? [] : {};
      }
      current = current[token];
    } else {
      if (
        current[token] === undefined ||
        current[token] === null ||
        typeof current[token] !== 'object'
      ) {
        current[token] = typeof nextToken === 'number' ? [] : {};
      }
      current = current[token];
    }
  }
  const lastToken = tokens[tokens.length - 1];
  if (typeof lastToken === 'number') {
    if (!Array.isArray(current)) return;
    current[lastToken] = value;
  } else if (lastToken !== undefined) {
    current[lastToken] = value;
  }
}

function applyFieldMap(entry, fieldMap = {}) {
  if (!entry || typeof entry !== 'object') return entry;
  const mapEntries = Object.entries(fieldMap);
  if (!mapEntries.length) return entry;
  const next = { ...entry };
  mapEntries.forEach(([target, sourcePath]) => {
    if (typeof target !== 'string') return;
    const value = getValueAtPath(entry, sourcePath);
    if (value === undefined) return;
    if (target.includes('.') || Array.isArray(target)) {
      setValueAtPath(next, target, value);
    } else {
      next[target] = value;
    }
  });
  return next;
}

function extractArrayFromDescriptor(record, columnLookup, descriptor) {
  if (!descriptor) return [];
  if (typeof descriptor === 'string') {
    const value = getColumnValue(columnLookup, record, descriptor);
    return parseJsonArray(value);
  }
  if (descriptor && typeof descriptor === 'object') {
    const { path, itemsPath } = descriptor;
    let value = path ? getColumnValue(columnLookup, record, path) : undefined;
    if (itemsPath) {
      value = getValueAtPath(value, itemsPath);
    }
    return parseJsonArray(value);
  }
  return [];
}

function normalizeItemEntry(item, options = {}) {
  if (!item || typeof item !== 'object') return null;
  const next = { ...item };
  const qtyCandidate =
    item.qty ?? item.quantity ?? item.count ?? item.qtyTotal ?? item.amountQty;
  if (qtyCandidate !== undefined) {
    const parsedQty = toNumber(qtyCandidate);
    if (parsedQty !== null) next.qty = parsedQty;
  }
  const priceCandidate = item.price ?? item.unitPrice ?? item.unit_amount;
  if (priceCandidate !== undefined) {
    const parsedPrice = toNumber(priceCandidate);
    if (parsedPrice !== null) next.price = parsedPrice;
  }
  const totalCandidate =
    item.totalAmount ?? item.amount ?? item.total ?? (next.qty != null && next.price != null ? next.qty * next.price : undefined);
  if (totalCandidate !== undefined) {
    const parsedTotal = toNumber(totalCandidate);
    if (parsedTotal !== null) next.totalAmount = parsedTotal;
  }
  const vatCandidate = item.totalVAT ?? item.vat ?? item.vatAmount;
  if (vatCandidate !== undefined) {
    const parsedVat = toNumber(vatCandidate);
    if (parsedVat !== null) {
      next.totalVAT = parsedVat;
      if (next.vat === undefined) next.vat = parsedVat;
    }
  }
  const cityTaxCandidate =
    item.cityTax ?? item.totalCityTax ?? item.cityTaxAmount ?? item.ctAmount;
  if (cityTaxCandidate !== undefined) {
    const parsedCityTax = toNumber(cityTaxCandidate);
    if (parsedCityTax !== null) {
      next.totalCityTax = parsedCityTax;
      if (next.cityTax === undefined) next.cityTax = parsedCityTax;
    }
  }
  let usedClassificationField = false;
  if (options.classificationField && item[options.classificationField] !== undefined) {
    next.classificationCode = toStringValue(item[options.classificationField]);
    usedClassificationField = true;
  }
  if (!next.classificationCode && options.headerClassificationCode) {
    next.classificationCode = options.headerClassificationCode;
  }
  if (usedClassificationField && options.classificationField) {
    delete next[options.classificationField];
  }
  if (!next.taxType && options.defaultTaxType) {
    next.taxType = options.defaultTaxType;
  }
  const taxReasonCandidate = item.taxReasonCode ?? item.tax_reason_code;
  if (taxReasonCandidate !== undefined) {
    const reasonValue = toStringValue(taxReasonCandidate);
    if (reasonValue) next.taxReasonCode = reasonValue;
  }
  const barcodeTypeCandidate =
    item.barcodeType ?? item.barCodeType ?? item.barcode_type;
  if (barcodeTypeCandidate !== undefined) {
    const barcodeValue = toStringValue(barcodeTypeCandidate);
    if (barcodeValue) next.barcodeType = barcodeValue;
  }
  return next;
}

function appendLotNoToItems(items, lotNo) {
  if (!lotNo) return items;
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const next = { ...item };
    if (!next.data || typeof next.data !== 'object') {
      next.data = { lotNo };
    } else if (next.data.lotNo === undefined || next.data.lotNo === null) {
      next.data = { ...next.data, lotNo };
    }
    return next;
  });
}

function groupItemsByTaxType(items, fallbackTaxType = 'VAT_ABLE') {
  if (!Array.isArray(items) || items.length === 0) return [];
  const fallback = fallbackTaxType || 'VAT_ABLE';
  const groups = new Map();
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const rawType = toStringValue(item.taxType || item.tax_type || '');
    const type = rawType || fallback;
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type).push(item);
  });
  if (groups.size <= 1) return [];
  return Array.from(groups.entries()).map(([type, groupedItems]) => {
    const totals = groupedItems.reduce(
      (acc, entry) => {
        const amount = toNumber(entry.totalAmount ?? entry.amount ?? entry.total);
        if (amount !== null) acc.totalAmount += amount;
        const vat = toNumber(entry.totalVAT ?? entry.vat);
        if (vat !== null) acc.totalVAT += vat;
        const city = toNumber(entry.totalCityTax ?? entry.cityTax);
        if (city !== null) acc.totalCityTax += city;
        return acc;
      },
      { totalAmount: 0, totalVAT: 0, totalCityTax: 0 },
    );
    return {
      totalAmount: totals.totalAmount,
      totalVAT: totals.totalVAT,
      totalCityTax: totals.totalCityTax,
      taxType: type,
      items: groupedItems,
    };
  });
}

function normalizePaymentEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const next = { ...entry };
  if (next.code && !next.type) {
    next.type = next.code;
  }
  if (next.method && !next.type) {
    next.type = next.method;
  }
  const amountCandidate = next.amount ?? next.paidAmount ?? next.total ?? next.value;
  if (amountCandidate !== undefined) {
    const parsedAmount = toNumber(amountCandidate);
    if (parsedAmount !== null) next.amount = parsedAmount;
  }
  if (next.amount === undefined && next.value !== undefined) {
    const parsedValue = toNumber(next.value);
    if (parsedValue !== null) next.amount = parsedValue;
  }
  if (next.amount === undefined && next.paidAmount !== undefined) {
    const parsedPaidAmount = toNumber(next.paidAmount);
    if (parsedPaidAmount !== null) next.amount = parsedPaidAmount;
  }
  return next;
}

async function normalizeItemReferenceCodes(item) {
  if (!item || typeof item !== 'object') return item;
  const next = { ...item };
  if (next.classificationCode) {
    const resolvedClassification = await resolveReferenceCodeValue(
      'classification',
      next.classificationCode,
    );
    if (resolvedClassification?.code) next.classificationCode = resolvedClassification.code;
  }
  if (next.taxType) {
    const resolvedTaxType = await resolveReferenceCodeValue('tax_type', next.taxType);
    if (resolvedTaxType?.code) next.taxType = resolvedTaxType.code;
  }
  if (next.taxReasonCode) {
    const resolvedReason = await resolveReferenceCodeValue(
      'tax_reason',
      next.taxReasonCode,
    );
    if (resolvedReason?.code) next.taxReasonCode = resolvedReason.code;
  }
  if (next.barcodeType) {
    const resolvedBarcode = await resolveReferenceCodeValue(
      'barcode_type',
      next.barcodeType,
    );
    if (resolvedBarcode?.code) next.barcodeType = resolvedBarcode.code;
  }
  return next;
}

async function normalizeReceiptsWithReferenceCodes(receipts) {
  if (!Array.isArray(receipts) || receipts.length === 0) return receipts || [];
  const normalized = [];
  for (const receipt of receipts) {
    if (!receipt || typeof receipt !== 'object') {
      normalized.push(receipt);
      continue;
    }
    if (!Array.isArray(receipt.items) || receipt.items.length === 0) {
      normalized.push(receipt);
      continue;
    }
    const normalizedItems = [];
    for (const item of receipt.items) {
      normalizedItems.push(await normalizeItemReferenceCodes(item));
    }
    normalized.push({ ...receipt, items: normalizedItems });
  }
  return normalized;
}

async function normalizePaymentsWithReferenceCodes(payments) {
  if (!Array.isArray(payments) || payments.length === 0) return payments || [];
  const normalized = [];
  for (const payment of payments) {
    if (!payment || typeof payment !== 'object') {
      normalized.push(payment);
      continue;
    }
    const next = { ...payment };
    const resolved = await resolveReferenceCodeValue(
      'payment_code',
      next.type ?? next.code ?? next.method,
    );
    if (resolved?.code) {
      next.type = resolved.code;
      next.code = resolved.code;
    } else if (!next.type) {
      next.type = 'CASH';
    }
    normalized.push(next);
  }
  return normalized;
}

function normalizeReceiptEntry(entry, options = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const mapped = applyFieldMap(entry, options.fieldMap || {});
  const next = { ...mapped };

  const totalAmountCandidate =
    next.totalAmount ?? next.amount ?? next.total ?? next.receiptAmount;
  const parsedTotal = toNumber(totalAmountCandidate);
  if (parsedTotal !== null) next.totalAmount = parsedTotal;

  const vatCandidate = next.totalVAT ?? next.vat ?? next.vatAmount;
  const parsedVat = toNumber(vatCandidate);
  if (parsedVat !== null) {
    next.totalVAT = parsedVat;
    if (next.vat === undefined) next.vat = parsedVat;
  }

  const cityTaxCandidate = next.totalCityTax ?? next.cityTax ?? next.cityTaxAmount;
  const parsedCityTax = toNumber(cityTaxCandidate);
  if (parsedCityTax !== null) {
    next.totalCityTax = parsedCityTax;
    if (next.cityTax === undefined) next.cityTax = parsedCityTax;
  }

  const explicitTaxType = toStringValue(next.taxType || next.tax_type || '');
  if (explicitTaxType) {
    next.taxType = explicitTaxType;
  } else if (options.defaultTaxType) {
    next.taxType = options.defaultTaxType;
  }

  let items = parseJsonArray(next.items)
    .map((item) => applyFieldMap(item, options.itemFieldMap || {}))
    .map((item) =>
      normalizeItemEntry(item, {
        classificationField: options.classificationField,
        headerClassificationCode: options.headerClassificationCode,
        defaultTaxType: next.taxType || options.defaultTaxType,
      }),
    )
    .filter(Boolean);

  if (options.lotNo) {
    items = appendLotNoToItems(items, options.lotNo);
  }

  const payments = parseJsonArray(next.payments)
    .map((entry) => applyFieldMap(entry, options.paymentFieldMap || {}))
    .map((entry) => normalizePaymentEntry(entry))
    .filter(Boolean);

  const receipt = { ...next, items };
  if (payments.length) {
    receipt.payments = payments;
  } else {
    delete receipt.payments;
  }
  if (!receipt.totalAmount && items.length) {
    const computed = items.reduce((sum, item) => {
      const amount = toNumber(item.totalAmount ?? item.amount ?? item.total);
      return sum + (amount ?? 0);
    }, 0);
    if (Number.isFinite(computed) && computed > 0) {
      receipt.totalAmount = computed;
    }
  }
  if (!receipt.totalVAT && items.length) {
    const computedVat = items.reduce((sum, item) => {
      const vat = toNumber(item.totalVAT ?? item.vat);
      return sum + (vat ?? 0);
    }, 0);
    if (Number.isFinite(computedVat) && computedVat > 0) {
      receipt.totalVAT = computedVat;
    }
  }
  if (!receipt.totalCityTax && items.length) {
    const computedCityTax = items.reduce((sum, item) => {
      const cityTax = toNumber(item.totalCityTax ?? item.cityTax);
      return sum + (cityTax ?? 0);
    }, 0);
    if (Number.isFinite(computedCityTax) && computedCityTax > 0) {
      receipt.totalCityTax = computedCityTax;
    }
  }
  return receipt;
}

const POSAPI_TYPE_VALUES = new Set([
  'B2C',
  'B2B_SALE',
  'B2B_PURCHASE',
  'STOCK_QR',
]);

const LEGACY_RECEIPT_TYPE_ALIASES = new Map([
  ['B2C_RECEIPT', 'B2C'],
  ['B2C_INVOICE', 'B2C'],
  ['B2B_RECEIPT', 'B2B_SALE'],
  ['B2B_INVOICE', 'B2B_SALE'],
  ['B2B', 'B2B_SALE'],
]);

function normalizeReceiptTypeValue(value) {
  const str = toStringValue(value);
  if (!str) return '';
  const normalized = str.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (POSAPI_TYPE_VALUES.has(normalized)) {
    return normalized;
  }
  if (LEGACY_RECEIPT_TYPE_ALIASES.has(normalized)) {
    return LEGACY_RECEIPT_TYPE_ALIASES.get(normalized);
  }
  return '';
}

function isTruthyFlag(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Number(value) !== 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (['0', 'false', 'no', 'n', 'off'].includes(lower)) return false;
    return true;
  }
  return Boolean(value);
}

function detectInventoryFlag({
  mapping,
  record,
  columnLookup,
  inventoryFlagField,
}) {
  const candidates = new Set();
  const addCandidate = (field) => {
    if (typeof field !== 'string') return;
    const trimmed = field.trim();
    if (!trimmed) return;
    candidates.add(trimmed);
  };

  addCandidate(inventoryFlagField);
  addCandidate(mapping.inventoryFlagField);
  addCandidate(mapping.inventoryFlag);
  addCandidate(mapping.stockFlagField);
  addCandidate(mapping.stockFlag);
  addCandidate(mapping.stockIndicatorField);
  addCandidate(mapping.stockIndicator);

  Object.entries(mapping).forEach(([key, value]) => {
    if (typeof value !== 'string') return;
    const lowerKey = String(key || '').toLowerCase();
    if (!lowerKey.includes('flag') && !lowerKey.includes('indicator')) return;
    if (!lowerKey.includes('inventory') && !lowerKey.includes('stock')) return;
    addCandidate(value);
  });

  const fallbackColumns = [
    'inventoryFlag',
    'inventory_flag',
    'inventory',
    'isInventory',
    'is_inventory',
    'stockFlag',
    'stock_flag',
    'stockIndicator',
    'stock_indicator',
    'stockQr',
    'stock_qr',
    'issueStockQr',
    'issue_stock_qr',
    'posapiStock',
    'posapi_stock',
  ];
  fallbackColumns.forEach(addCandidate);

  for (const candidate of candidates) {
    const value = getColumnValue(columnLookup, record, candidate);
    if (isTruthyFlag(value)) return true;
  }
  return false;
}

function detectDocumentFlavor({ mapping, record, columnLookup }) {
  const candidates = new Set();
  const addCandidate = (field) => {
    if (typeof field !== 'string') return;
    const trimmed = field.trim();
    if (!trimmed) return;
    candidates.add(trimmed);
  };

  ['invoiceNo', 'invoiceNumber', 'invoice_no', 'invoice_number', 'invoiceId', 'invoice_id']
    .forEach(addCandidate);
  ['billNo', 'billNumber', 'bill_no', 'bill_number', 'billId', 'bill_id'].forEach(addCandidate);

  Object.entries(mapping).forEach(([key, value]) => {
    if (typeof value !== 'string') return;
    const lowerKey = String(key || '').toLowerCase();
    if (!lowerKey.includes('invoice') && !lowerKey.includes('bill')) return;
    if (!lowerKey.endsWith('no') && !lowerKey.endsWith('number') && !lowerKey.endsWith('id'))
      return;
    addCandidate(value);
  });

  for (const candidate of candidates) {
    const raw = getColumnValue(columnLookup, record, candidate);
    const str = toStringValue(raw);
    if (str) {
      return 'INVOICE';
    }
  }
  return 'RECEIPT';
}

function resolveReceiptType({
  explicitType,
  typeField,
  mapping,
  record,
  columnLookup,
  customerTin,
  consumerNo,
  inventoryFlagField,
}) {
  const candidates = [];
  if (typeField) candidates.push(typeField);
  if (mapping.posApiTypeField) candidates.push(mapping.posApiTypeField);
  if (mapping.typeField) candidates.push(mapping.typeField);
  for (const candidate of candidates) {
    const value = getColumnValue(columnLookup, record, candidate);
    const normalized = normalizeReceiptTypeValue(value);
    if (normalized) return normalized;
  }

  const normalizedExplicit = normalizeReceiptTypeValue(explicitType);
  if (normalizedExplicit) return normalizedExplicit;

  if (detectInventoryFlag({
    mapping,
    record,
    columnLookup,
    inventoryFlagField,
  })) {
    return 'STOCK_QR';
  }

  if (customerTin) return 'B2B_SALE';
  if (consumerNo) return 'B2C';

  const envType = normalizeReceiptTypeValue(process.env.POSAPI_RECEIPT_TYPE);
  if (envType) return envType;

  const flavor = detectDocumentFlavor({ mapping, record, columnLookup });
  if (flavor === 'INVOICE' && customerTin) {
    return 'B2B_SALE';
  }
  return 'B2C';
}

function applyAdditionalMappings(
  payload,
  normalizedMapping,
  record,
  columnLookup,
  reservedKeys,
) {
  Object.entries(normalizedMapping).forEach(([key, columnName]) => {
    if (reservedKeys.has(key)) return;
    const value = getColumnValue(columnLookup, record, columnName);
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && !value.trim()) return;
    payload[key] = value;
  });
}

export async function resolvePosApiEndpoint(endpointId) {
  if (endpointId) {
    const endpoint = await getEndpointById(endpointId);
    if (!endpoint) {
      const err = new Error(`POSAPI endpoint not found: ${endpointId}`);
      err.status = 400;
      throw err;
    }
    return endpoint;
  }
  const endpoints = await loadEndpoints();
  const fallback = endpoints.find((entry) => entry?.defaultForForm) || endpoints[0] || null;
  if (!fallback) {
    const err = new Error('No POSAPI endpoints are configured');
    err.status = 500;
    throw err;
  }
  return fallback;
}

async function resolveAuthEndpoint(authEndpointId) {
  if (authEndpointId) {
    const endpoint = await getEndpointById(authEndpointId);
    if (endpoint && endpoint.posApiType === 'AUTH') return endpoint;
  }
  const endpoints = await loadEndpoints();
  return endpoints.find((entry) => entry?.posApiType === 'AUTH') || null;
}

function resolveEndpointBaseUrl(definition, environment = 'staging') {
  if (!definition || typeof definition !== 'object') return '';
  const trimmedEnv = environment === 'production' ? 'production' : 'staging';
  const envMap = definition.urlEnvMap || {};
  const pickKey = (key) => {
    const envVar = envMap[key] || definition[`${key}EnvVar`];
    const mode = definition[`${key}Mode`] === 'literal' ? 'literal' : envVar ? 'env' : 'literal';
    const literal = toStringValue(definition[key] || '');
    if (mode === 'env' && envVar) {
      const envRaw = readEnvVar(envVar);
      if (envRaw !== undefined && envRaw !== null && envRaw !== '') {
        return toStringValue(envRaw);
      }
    }
    return literal;
  };

  const candidateKeys =
    trimmedEnv === 'production'
      ? ['productionServerUrl', 'testServerUrlProduction', 'testServerUrl', 'serverUrl']
      : ['testServerUrl', 'testServerUrlProduction', 'productionServerUrl', 'serverUrl'];

  for (const key of candidateKeys) {
    const value = pickKey(key);
    if (value) return value;
  }

  return '';
}

async function posApiFetch(path, { method = 'GET', body, token, headers, baseUrl, debug } = {}) {
  const resolvedBaseUrl = baseUrl ? trimEndSlash(baseUrl) : await getPosApiBaseUrl();
  const url = `${resolvedBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const fetchFn = await getFetch();
  const res = await fetchFn(url, {
    method,
    headers: {
      Accept: 'application/json, text/plain;q=0.9, */*;q=0.5',
      ...(headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

  const rawText = await res.text();
  const contentType = res.headers.get('content-type') || '';
  let parsedBody = rawText;
  if (contentType.includes('application/json')) {
    try {
      parsedBody = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsedBody = rawText;
    }
  }

  if (!res.ok) {
    const err = new Error(
      `POSAPI request failed with status ${res.status}: ${rawText || res.statusText}`,
    );
    err.status = res.status;
    err.responseBody = parsedBody;
    throw err;
  }

  if (debug) {
    const headerEntries = {};
    res.headers.forEach((value, key) => {
      headerEntries[key] = value;
    });
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: headerEntries,
      bodyText: rawText,
      bodyJson: typeof parsedBody === 'object' ? parsedBody : null,
      url,
    };
  }

  return parsedBody;
}

async function fetchEnvPosApiToken({ useCachedToken = true } = {}) {
  const cached = useCachedToken ? getCachedToken('ENV_FALLBACK') : null;
  if (cached) return cached;

  const requiredEnv = [
    'POSAPI_AUTH_URL',
    'POSAPI_AUTH_REALM',
    'POSAPI_CLIENT_ID',
    'POSAPI_CLIENT_SECRET',
  ];
  const missing = [];
  const values = {};
  requiredEnv.forEach((key) => {
    const value = readEnvVar(key);
    if (!value) missing.push(key);
    values[key] = value;
  });
  if (missing.length) {
    const err = new Error(
      `POSAPI authentication configuration is incomplete. Missing: ${missing.join(', ')}`,
    );
    err.status = 500;
    err.details = { missingEnvVars: missing };
    throw err;
  }
  const baseUrl = trimEndSlash(values.POSAPI_AUTH_URL || '');
  const realm = values.POSAPI_AUTH_REALM;
  const clientId = values.POSAPI_CLIENT_ID;
  const clientSecret = values.POSAPI_CLIENT_SECRET;
  const tokenUrl = `${baseUrl}/realms/${realm}/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('client_id', clientId);
  if (clientSecret) {
    params.set('client_secret', clientSecret);
  }
  const fetchFn = await getFetch();
  const res = await fetchFn(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(
      `Failed to retrieve POSAPI token (${res.status}): ${text || res.statusText}`,
    );
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  if (!json?.access_token) {
    throw new Error('POSAPI token response missing access_token');
  }
  const expiresIn = toNumber(json.expires_in || json.expiresIn) || 300;
  cacheToken('ENV_FALLBACK', json.access_token, expiresIn);
  return json.access_token;
}

async function fetchTokenFromAuthEndpoint(
  authEndpoint,
  { baseUrl, payload, useCachedToken = true, environment = 'staging' } = {},
) {
  if (!authEndpoint?.id) return fetchEnvPosApiToken({ useCachedToken });
  if (!useCachedToken) {
    tokenCache.delete(authEndpoint.id);
  }
  const cached = useCachedToken ? getCachedToken(authEndpoint.id) : null;
  if (cached) return cached;

  const normalizePayload = (rawValue) => {
    if (!rawValue) return null;
    if (typeof rawValue === 'object' && !Array.isArray(rawValue)) return rawValue;
    if (typeof rawValue !== 'string') return null;

    try {
      const parsed = JSON.parse(rawValue);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Ignore JSON parse failure and try parsing as form data.
    }

    const params = new URLSearchParams(rawValue);
    const entries = {};
    let hasEntries = false;
    params.forEach((value, key) => {
      if (!key) return;
      entries[key] = value;
      hasEntries = true;
    });
    return hasEntries ? entries : null;
  };

  let requestPayload = normalizePayload(payload);
  if (!requestPayload) {
    requestPayload = normalizePayload(authEndpoint.requestExample);
  }
  if (!requestPayload && Array.isArray(authEndpoint.variations)) {
    const variationWithRequest = authEndpoint.variations.find(
      (variation) => variation?.requestExample || variation?.request?.body || variation?.request,
    );
    if (variationWithRequest?.requestExample) {
      requestPayload = normalizePayload(variationWithRequest.requestExample);
    } else if (variationWithRequest?.request?.body !== undefined) {
      requestPayload = normalizePayload(variationWithRequest.request.body);
    } else if (variationWithRequest?.request) {
      requestPayload = normalizePayload(variationWithRequest.request);
    }
  }
  if (!requestPayload && authEndpoint.requestBody?.schema && typeof authEndpoint.requestBody.schema === 'object') {
    requestPayload = authEndpoint.requestBody.schema;
  }
  const mappedPayload = applyEnvMapToPayload(requestPayload || {}, authEndpoint.requestEnvMap).payload;
  let targetBaseUrl = resolveEndpointBaseUrl(authEndpoint, environment);
  if (!targetBaseUrl && baseUrl) {
    targetBaseUrl = toStringValue(baseUrl);
  }
  if (!targetBaseUrl) {
    try {
      targetBaseUrl = await getPosApiBaseUrl();
    } catch {
      targetBaseUrl = '';
    }
  }
  const result = await invokePosApiEndpoint(authEndpoint.id, mappedPayload, {
    endpoint: authEndpoint,
    baseUrl: targetBaseUrl,
    debug: true,
    skipAuth: true,
  });
  const response = result?.response?.bodyJson || result?.response?.bodyText || result?.response;
  const parsed =
    typeof response === 'string'
      ? (() => {
          try {
            return JSON.parse(response);
          } catch {
            return {};
          }
        })()
      : response;
  const token = parsed?.access_token || parsed?.id_token;
  if (!token) {
    throw new Error('Authentication endpoint did not return an access_token');
  }
  const expiresIn = toNumber(parsed?.expires_in || parsed?.expiresIn) || 300;
  cacheToken(authEndpoint.id, token, expiresIn);
  return token;
}

export async function getPosApiToken(options = {}) {
  const optionBag = options && typeof options === 'object' ? options : {};
  const authEndpointId = optionBag.authEndpointId || null;
  const authEndpoint = await resolveAuthEndpoint(authEndpointId);
  if (authEndpoint) {
    return fetchTokenFromAuthEndpoint(authEndpoint, {
      baseUrl: optionBag.baseUrl,
      payload: optionBag.authPayload,
      useCachedToken: optionBag.useCachedToken !== false,
      environment: optionBag.environment,
    });
  }
  return fetchEnvPosApiToken({ useCachedToken: optionBag.useCachedToken !== false });
}

export async function buildReceiptFromDynamicTransaction(
  record,
  mapping = {},
  type,
  options = {},
) {
  if (!record || typeof record !== 'object') return null;
  const normalizedMapping = normalizeMapping(mapping);
  const columnLookup = createColumnLookup(record);
  const merchantInfo = options.merchantInfo || null;
  const receiptGroupMapping =
    normalizedMapping[RECEIPT_GROUP_MAPPING_KEY] || {};
  const paymentMethodMapping =
    normalizedMapping[PAYMENT_METHOD_MAPPING_KEY] || {};
  delete normalizedMapping[RECEIPT_GROUP_MAPPING_KEY];
  delete normalizedMapping[PAYMENT_METHOD_MAPPING_KEY];

  const totalAmountColumn = normalizedMapping.totalAmount;
  const totalAmountValue = getColumnValue(columnLookup, record, totalAmountColumn);
  const totalAmount = toNumber(totalAmountValue);
  if (totalAmount === null) {
    const err = new Error(
      `POSAPI totalAmount is missing or invalid (column: ${totalAmountColumn})`,
    );
    err.status = 400;
    err.details = { field: 'totalAmount', column: totalAmountColumn };
    throw err;
  }

  const totalVatValue = getColumnValue(columnLookup, record, normalizedMapping.totalVAT);
  const totalVAT = toNumber(totalVatValue);
  const totalCityTaxValue = getColumnValue(
    columnLookup,
    record,
    normalizedMapping.totalCityTax,
  );
  const totalCityTax = toNumber(totalCityTaxValue);

  const customerTin = toStringValue(
    getColumnValue(columnLookup, record, normalizedMapping.customerTin),
  );
  const consumerNo = toStringValue(
    getColumnValue(columnLookup, record, normalizedMapping.consumerNo),
  );

  const taxTypeField = normalizedMapping.taxTypeField || normalizedMapping.taxType;
  let taxType = toStringValue(getColumnValue(columnLookup, record, taxTypeField));

  const descriptionField = normalizedMapping.description || normalizedMapping.itemDescription;
  let description = '';
  if (descriptionField) {
    const descValue = getColumnValue(columnLookup, record, descriptionField);
    if (descValue !== undefined && descValue !== null) {
      description = descValue;
    }
  }
  if (!description) {
    description = record.description ?? record.remarks ?? '';
  }

  const lotNo = toStringValue(
    getColumnValue(columnLookup, record, normalizedMapping.lotNo),
  );

  const branchNo =
    toStringValue(
      merchantInfo?.branch_no ?? merchantInfo?.branchNo ?? merchantInfo?.branch,
    ) ||
    toStringValue(getColumnValue(columnLookup, record, normalizedMapping.branchNo)) ||
    toStringValue(readEnvVar('POSAPI_BRANCH_NO'));
  const merchantTin =
    toStringValue(
      merchantInfo?.tax_registration_no ??
        merchantInfo?.merchant_tin ??
        merchantInfo?.taxRegistrationNo ??
        merchantInfo?.tin,
    ) ||
    toStringValue(getColumnValue(columnLookup, record, normalizedMapping.merchantTin)) ||
    toStringValue(readEnvVar('POSAPI_MERCHANT_TIN'));
  const posNo =
    toStringValue(
      merchantInfo?.pos_no ?? merchantInfo?.pos_registration_no ?? merchantInfo?.posNo,
    ) ||
    toStringValue(getColumnValue(columnLookup, record, normalizedMapping.posNo)) ||
    toStringValue(readEnvVar('POSAPI_POS_NO'));
  const districtCode =
    toStringValue(merchantInfo?.district_code ?? merchantInfo?.districtCode) ||
    toStringValue(getColumnValue(columnLookup, record, normalizedMapping.districtCode)) ||
    toStringValue(readEnvVar('POSAPI_DISTRICT_CODE'));

  const missingEnv = [];
  if (!branchNo) missingEnv.push('branchNo');
  if (!merchantTin) missingEnv.push('merchantTin');
  if (!posNo) missingEnv.push('posNo');
  if (missingEnv.length) {
    const err = new Error(
      `POSAPI receipt configuration is incomplete. Missing: ${missingEnv.join(', ')}`,
    );
    err.status = 500;
    err.details = { missingFields: missingEnv };
    throw err;
  }

  const classificationField = normalizedMapping.classificationCodeField;
  const headerClassificationCode = toStringValue(
    getColumnValue(columnLookup, record, classificationField),
  );

  const itemsDescriptor = normalizedMapping.itemsField || normalizedMapping.items;
  const paymentsDescriptor =
    normalizedMapping.paymentsField || normalizedMapping.payments;
  const receiptsDescriptor =
    normalizedMapping.receiptsField || normalizedMapping.receipts;

  const itemFieldMap = mergeFieldMaps(
    normalizedMapping.itemFields,
    extractDescriptorFieldMap(itemsDescriptor, 'itemFields'),
    extractDescriptorFieldMap(receiptsDescriptor, 'itemFields'),
  );
  const paymentFieldMap = mergeFieldMaps(
    normalizedMapping.paymentFields,
    extractDescriptorFieldMap(paymentsDescriptor, 'paymentFields'),
    extractDescriptorFieldMap(receiptsDescriptor, 'paymentFields'),
  );
  const receiptFieldMap = mergeFieldMaps(
    normalizedMapping.receiptFields,
    extractDescriptorFieldMap(receiptsDescriptor, 'receiptFields'),
  );

  let items = extractArrayFromDescriptor(record, columnLookup, itemsDescriptor)
    .map((item) => applyFieldMap(item, itemFieldMap))
    .map((item) =>
      normalizeItemEntry(item, {
        classificationField,
        headerClassificationCode,
        defaultTaxType: taxType,
      }),
    )
    .filter(Boolean);
  items = appendLotNoToItems(items, lotNo);

  const rawPayments = extractArrayFromDescriptor(
    record,
    columnLookup,
    paymentsDescriptor,
  );
  let payments = rawPayments
    .map((entry) => applyFieldMap(entry, paymentFieldMap))
    .map((entry) => normalizePaymentEntry(entry))
    .filter(Boolean);

  const mappedPayments = Object.entries(paymentMethodMapping).map(
    ([method, config]) => {
      if (!config || typeof config !== 'object') return null;
      const amountColumn = config.amount;
      if (!amountColumn) return null;
      const amountValue = toNumber(
        getColumnValue(columnLookup, record, amountColumn),
      );
      if (amountValue === null) return null;
      const payment = { type: method, amount: amountValue };
      if (config.currency) {
        const currencyValue = toStringValue(
          getColumnValue(columnLookup, record, config.currency),
        );
        if (currencyValue) payment.currency = currencyValue;
      }
      if (config.reference) {
        const referenceValue = toStringValue(
          getColumnValue(columnLookup, record, config.reference),
        );
        if (referenceValue) payment.reference = referenceValue;
      }
      return payment;
    },
  ).filter(Boolean);

  if (mappedPayments.length) {
    const paymentByType = new Map();
    mappedPayments.forEach((entry) => {
      if (!entry || typeof entry.type !== 'string') return;
      paymentByType.set(entry.type, entry);
    });
    payments.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const typeCandidate =
        typeof entry.type === 'string'
          ? entry.type
          : typeof entry.method === 'string'
            ? entry.method
            : '';
      if (!typeCandidate) return;
      const type = typeCandidate;
      if (paymentByType.has(type)) {
        const merged = { ...entry, ...paymentByType.get(type), type };
        paymentByType.set(type, merged);
      } else {
        paymentByType.set(type, entry);
      }
    });
    payments = Array.from(paymentByType.values());
  }

  const rawReceipts = extractArrayFromDescriptor(
    record,
    columnLookup,
    receiptsDescriptor,
  );
  let receipts = rawReceipts
    .map((entry) =>
      normalizeReceiptEntry(entry, {
        fieldMap: receiptFieldMap,
        itemFieldMap,
        paymentFieldMap,
        classificationField,
        headerClassificationCode,
        defaultTaxType: taxType,
        lotNo,
      }),
    )
    .filter(
      (receipt) =>
        receipt && Array.isArray(receipt.items) && receipt.items.length > 0,
    );

  const mappedReceipts = Object.entries(receiptGroupMapping)
    .map(([typeKey, config]) => {
      if (!config || typeof config !== 'object') return null;
      const amountValue = toNumber(
        getColumnValue(columnLookup, record, config.totalAmount),
      );
      if (amountValue === null) return null;
      const entry = { totalAmount: amountValue };
      const vatValue = toNumber(
        getColumnValue(columnLookup, record, config.totalVAT),
      );
      if (vatValue !== null) entry.totalVAT = vatValue;
      const cityValue = toNumber(
        getColumnValue(columnLookup, record, config.totalCityTax),
      );
      if (cityValue !== null) entry.totalCityTax = cityValue;
      const taxTypeValue = toStringValue(
        getColumnValue(columnLookup, record, config.taxType),
      );
      const resolvedType = taxTypeValue || typeKey;
      if (resolvedType) entry.taxType = resolvedType;
      return entry;
    })
    .filter(Boolean);

  if (mappedReceipts.length) {
    receipts = mappedReceipts;
  }

  if (!receipts.length && items.length) {
    const groupedReceipts = groupItemsByTaxType(items, taxType);
    if (groupedReceipts.length) {
      receipts = groupedReceipts;
    }
  }

  if (!items.length && !receipts.length) {
    const fallbackItem = {
      name: description ? String(description) : 'POS Transaction',
      qty: 1,
      price: totalAmount ?? 0,
      totalAmount: totalAmount ?? 0,
    };
    if (totalVAT !== null) {
      fallbackItem.totalVAT = totalVAT;
      fallbackItem.vat = totalVAT;
    }
    if (totalCityTax !== null) {
      fallbackItem.totalCityTax = totalCityTax;
      fallbackItem.cityTax = totalCityTax;
    }
    if (lotNo) {
      fallbackItem.data = { ...(fallbackItem.data || {}), lotNo };
    }
    if (headerClassificationCode) {
      fallbackItem.classificationCode = headerClassificationCode;
    }
    items = [fallbackItem];
  }

  items = appendLotNoToItems(items, lotNo);

  if (!taxType && receipts.length) {
    const firstReceiptType = toStringValue(receipts[0]?.taxType);
    if (firstReceiptType) {
      taxType = firstReceiptType;
    }
  }
  if (!taxType) {
    taxType = 'VAT_ABLE';
  }

  if (totalAmount === null) {
    if (receipts.length) {
      const computedTotal = receipts.reduce((sum, receipt) => {
        const value = toNumber(receipt.totalAmount ?? receipt.amount ?? receipt.total);
        return sum + (value ?? 0);
      }, 0);
      if (Number.isFinite(computedTotal) && computedTotal > 0) {
        totalAmount = computedTotal;
      }
    }
    if (totalAmount === null && items.length) {
      const computedItemsTotal = items.reduce((sum, item) => {
        const value = toNumber(item.totalAmount ?? item.amount ?? item.total);
        return sum + (value ?? 0);
      }, 0);
      if (Number.isFinite(computedItemsTotal) && computedItemsTotal > 0) {
        totalAmount = computedItemsTotal;
      }
    }
  }

  if (totalAmount === null) {
    const err = new Error(
      `POSAPI totalAmount is missing or invalid (column: ${totalAmountColumn})`,
    );
    err.status = 400;
    err.details = { field: 'totalAmount', column: totalAmountColumn };
    throw err;
  }

  let normalizedTotalVAT = totalVAT;
  if (normalizedTotalVAT === null) {
    if (receipts.length) {
      const computedVat = receipts.reduce((sum, receipt) => {
        const value = toNumber(receipt.totalVAT ?? receipt.vat);
        return sum + (value ?? 0);
      }, 0);
      if (Number.isFinite(computedVat) && computedVat > 0) {
        normalizedTotalVAT = computedVat;
      }
    }
    if (normalizedTotalVAT === null && items.length) {
      const computedVat = items.reduce((sum, item) => {
        const value = toNumber(item.totalVAT ?? item.vat);
        return sum + (value ?? 0);
      }, 0);
      if (Number.isFinite(computedVat) && computedVat > 0) {
        normalizedTotalVAT = computedVat;
      }
    }
  }

  let normalizedTotalCityTax = totalCityTax;
  if (normalizedTotalCityTax === null) {
    if (receipts.length) {
      const computedCityTax = receipts.reduce((sum, receipt) => {
        const value = toNumber(receipt.totalCityTax ?? receipt.cityTax);
        return sum + (value ?? 0);
      }, 0);
      if (Number.isFinite(computedCityTax) && computedCityTax > 0) {
        normalizedTotalCityTax = computedCityTax;
      }
    }
    if (normalizedTotalCityTax === null && items.length) {
      const computedCityTax = items.reduce((sum, item) => {
        const value = toNumber(item.totalCityTax ?? item.cityTax);
        return sum + (value ?? 0);
      }, 0);
      if (Number.isFinite(computedCityTax) && computedCityTax > 0) {
        normalizedTotalCityTax = computedCityTax;
      }
    }
  }

  if (!payments.length) {
    const defaultPaymentType = toStringValue(
      getColumnValue(columnLookup, record, normalizedMapping.paymentType),
    );
    payments = [
      {
        type: defaultPaymentType || 'CASH',
        amount: totalAmount,
      },
    ];
  } else {
    payments = payments.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      if (entry.amount === undefined || entry.amount === null) {
        const amount = toNumber(entry.total ?? entry.value);
        if (amount !== null) {
          return { ...entry, amount };
        }
        return { ...entry, amount: totalAmount };
      }
      return entry;
    });
  }

  const receiptType = resolveReceiptType({
    explicitType: type,
    typeField: options.typeField || options.posApiTypeField,
    mapping: normalizedMapping,
    record,
    columnLookup,
    customerTin,
    consumerNo,
    inventoryFlagField: options.inventoryFlagField,
  });

  let receiptsPayload = receipts.length
    ? receipts.map((receipt) => {
        if (!receipt || typeof receipt !== 'object') return receipt;
        if (!receipt.taxType && taxType) {
          return { ...receipt, taxType };
        }
        return receipt;
      })
    : [
        {
          totalAmount,
          totalVAT: normalizedTotalVAT ?? 0,
          totalCityTax: normalizedTotalCityTax ?? 0,
          taxType,
          items: items.length ? items : [],
        },
      ];

  receiptsPayload = await normalizeReceiptsWithReferenceCodes(receiptsPayload);
  const normalizedPayments = await normalizePaymentsWithReferenceCodes(payments);
  payments = normalizedPayments;

  const payload = {
    branchNo,
    merchantTin,
    posNo,
    type: receiptType,
    totalAmount,
    totalVAT: normalizedTotalVAT ?? 0,
    totalCityTax: normalizedTotalCityTax ?? 0,
    receipts: receiptsPayload,
  };
  if (districtCode) payload.districtCode = districtCode;
  if (customerTin) payload.customerTin = customerTin;
  if (consumerNo) payload.consumerNo = consumerNo;
  if (payments.length) payload.payments = payments;

  const reservedMappingKeys = new Set([
    'totalAmount',
    'totalVAT',
    'totalCityTax',
    'customerTin',
    'consumerNo',
    'taxType',
    'taxTypeField',
    'description',
    'itemDescription',
    'lotNo',
    'itemsField',
    'items',
    'paymentsField',
    'payments',
    'receiptsField',
    'receipts',
    'itemFields',
    'paymentFields',
    'receiptFields',
    'branchNo',
    'merchantTin',
    'posNo',
    'districtCode',
    'classificationCodeField',
    'posApiTypeField',
    'typeField',
    'inventoryFlag',
    'inventoryFlagField',
    'stockFlag',
    'stockFlagField',
    'stockIndicator',
    'stockIndicatorField',
    RECEIPT_GROUP_MAPPING_KEY,
    PAYMENT_METHOD_MAPPING_KEY,
  ]);
  applyAdditionalMappings(payload, normalizedMapping, record, columnLookup, reservedMappingKeys);

  return payload;
}

export async function invokePosApiEndpoint(endpointId, payload = {}, options = {}) {
  const optionBag =
    options && typeof options === 'object' ? options : { headers: {}, endpoint: null };
  const {
    headers: optionHeaders,
    endpoint: endpointOverride,
    baseUrl,
    debug,
    authEndpointId,
    authPayload,
    environment,
    skipAuth,
    useCachedToken = true,
  } = optionBag;
  const endpoint = endpointOverride || (await resolvePosApiEndpoint(endpointId));
  const method = (endpoint?.method || 'GET').toUpperCase();
  let path = (endpoint?.path || '/').trim() || '/';
  const params = Array.isArray(endpoint?.parameters) ? endpoint.parameters : [];
  let payloadData =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? { ...payload }
      : {};
  try {
    payloadData = resolveEnvPlaceholders(payloadData);
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to resolve environment placeholders');
    error.status = error.status || 400;
    throw error;
  }
  const { body: explicitBody, ...restPayload } = payloadData;

  params
    .filter((param) => param && param.in === 'path' && typeof param.name === 'string')
    .forEach((param) => {
      const raw = restPayload[param.name];
      const strValue =
        raw === undefined || raw === null ? '' : encodeURIComponent(String(raw));
      if (strValue) {
        path = path.replaceAll(`{${param.name}}`, strValue);
      }
      delete restPayload[param.name];
    });

  const queryParams = new URLSearchParams();
  params
    .filter((param) => param && param.in === 'query' && typeof param.name === 'string')
    .forEach((param) => {
      const value = restPayload[param.name];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        queryParams.append(param.name, String(value));
      }
      delete restPayload[param.name];
    });

  const queryString = queryParams.toString();
  if (queryString) {
    path = `${path}${path.includes('?') ? '&' : '?'}${queryString}`;
  }

  let bodyPayload;
  if (explicitBody !== undefined) {
    bodyPayload = explicitBody;
  } else if (method !== 'GET' && method !== 'HEAD' && Object.keys(restPayload).length) {
    bodyPayload = restPayload;
  }

  const headers = { ...(optionHeaders || {}) };
  let body;
  if (bodyPayload !== undefined && method !== 'GET' && method !== 'HEAD') {
    if (endpoint?.posApiType === 'AUTH') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const paramsForm = new URLSearchParams();
      Object.entries(bodyPayload || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        paramsForm.set(key, String(value));
      });
      body = paramsForm.toString();
    } else {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      body = JSON.stringify(bodyPayload);
    }
  }

  const requestBaseUrl =
    baseUrl || resolveEndpointBaseUrl(endpoint, environment) || (await getPosApiBaseUrl());
  const requestUrl = `${trimEndSlash(requestBaseUrl)}${path.startsWith('/') ? path : `/${path}`}`;

  let token = null;
  if (!skipAuth && endpoint?.posApiType !== 'AUTH') {
    const selectedAuthEndpointId = authEndpointId || endpoint?.authEndpointId || null;
    token = await getPosApiToken({
      authEndpointId: selectedAuthEndpointId,
      baseUrl: requestBaseUrl,
      authPayload,
      useCachedToken,
      environment,
    });
  }

  try {
    const response = await posApiFetch(path, {
      method,
      body,
      token,
      headers,
      baseUrl: requestBaseUrl,
      debug,
    });
    cacheTokenFromAuthResponse(endpoint, response);
    if (debug) {
      return {
        response,
        request: {
          method,
          url: requestUrl,
          headers,
          body: bodyPayload ?? null,
        },
      };
    }
    return response;
  } catch (err) {
    if (debug) {
      err.request = {
        method,
        url: requestUrl,
        headers,
        body: bodyPayload ?? null,
      };
    }
    throw err;
  }
}

export async function sendReceipt(payload, options = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('POSAPI receipt payload is required');
  }
  const endpoint = options.endpoint || (await resolvePosApiEndpoint(options.endpointId));
  const method = (endpoint?.method || 'POST').toUpperCase();
  const path = endpoint?.path || '/rest/receipt';
  const token = await getPosApiToken({ authEndpointId: endpoint?.authEndpointId });
  const headers = { ...(options.headers || {}) };
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(payload);
  return posApiFetch(path, {
    method,
    token,
    headers,
    body,
  });
}

export async function cancelReceipt(billId, inactiveId) {
  if (!billId || !inactiveId) {
    throw new Error('billId and inactiveId are required to cancel a receipt');
  }
  const token = await getPosApiToken();
  return posApiFetch('/rest/receipt', {
    method: 'DELETE',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billId, inactiveId }),
  });
}

export async function getInformation(params = {}) {
  const token = await getPosApiToken();
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    query.set(key, String(value));
  });
  const path = `/rest/getInformation${query.toString() ? `?${query.toString()}` : ''}`;
  return posApiFetch(path, { token });
}

export async function getBankAccountInfo() {
  const token = await getPosApiToken();
  return posApiFetch('/rest/getBankAccountInfo', { token });
}

export async function getDistrictCodes() {
  const token = await getPosApiToken();
  return posApiFetch('/rest/getDistrictCode', { token });
}

export async function getVatTaxTypes() {
  const token = await getPosApiToken();
  return posApiFetch('/rest/vat_tax_type', { token });
}

export async function getBranchInfo() {
  const token = await getPosApiToken();
  return posApiFetch('/rest/getBranchInfo', { token });
}
