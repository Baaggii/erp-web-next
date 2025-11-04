import fetch from 'node-fetch';
import { parseLocalizedNumber } from '../../utils/parseLocalizedNumber.js';

const tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

const DEFAULT_TIMEOUT = Number.parseInt(process.env.POSAPI_TIMEOUT_MS || '15000', 10) || 15000;

function resolvePath(source, path) {
  if (!source || typeof source !== 'object') return undefined;
  if (!path) return undefined;
  const segments = String(path)
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  let current = source;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
      continue;
    }
    const lower = segment.toLowerCase();
    const match = Object.keys(current).find((key) => key.toLowerCase() === lower);
    if (!match) return undefined;
    current = current[match];
  }
  return current;
}

function resolveMappedValue(entry, txnData) {
  if (entry === undefined || entry === null) return undefined;
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('env:')) {
      const envKey = trimmed.slice(4).trim();
      return envKey ? process.env[envKey] : undefined;
    }
    return resolvePath(txnData, trimmed);
  }
  if (typeof entry === 'number' || typeof entry === 'boolean') {
    return entry;
  }
  if (Array.isArray(entry)) {
    return entry
      .map((value) => resolveMappedValue(value, txnData))
      .filter((value) => value !== undefined && value !== null);
  }
  if (entry && typeof entry === 'object') {
    if (entry.value !== undefined) return entry.value;
    if (entry.env && typeof entry.env === 'string') {
      const envValue = process.env[entry.env];
      if (envValue !== undefined) return envValue;
    }
    if (entry.field || entry.column || entry.path) {
      const field = entry.field ?? entry.column ?? entry.path;
      const resolved = resolvePath(txnData, field);
      if (resolved !== undefined && resolved !== null && resolved !== '') {
        return resolved;
      }
    }
    if (entry.fallbackEnv && typeof entry.fallbackEnv === 'string') {
      const envValue = process.env[entry.fallbackEnv];
      if (envValue !== undefined) return envValue;
    }
    if (entry.fallback !== undefined) return entry.fallback;
    if (entry.default !== undefined) return entry.default;
  }
  return undefined;
}

function getMappedValue(mapping, txnData, key, fallback) {
  if (!mapping || typeof mapping !== 'object') return fallback;
  if (!Object.prototype.hasOwnProperty.call(mapping, key)) {
    return fallback;
  }
  const entry = mapping[key];
  const value = resolveMappedValue(entry, txnData);
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}

function coerceString(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const first = value.find((entry) => entry !== undefined && entry !== null && entry !== '');
    return coerceString(first);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return String(value);
}

function coerceNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value)) {
    const first = value.find((entry) => entry !== undefined && entry !== null && entry !== '');
    return coerceNumber(first, fallback);
  }
  const parsed = parseLocalizedNumber(value);
  if (parsed === null || !Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function parseJsonIfNeeded(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function normalizeItem(rawItem) {
  if (rawItem === undefined || rawItem === null) return null;
  let item = rawItem;
  if (typeof rawItem === 'string') {
    const parsed = parseJsonIfNeeded(rawItem);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    item = parsed;
  }
  if (typeof item !== 'object') return null;
  const normalized = { ...item };
  if (normalized.qty !== undefined) {
    const qty = coerceNumber(normalized.qty, undefined);
    if (qty !== undefined) normalized.qty = qty;
  }
  if (normalized.price !== undefined) {
    const price = coerceNumber(normalized.price, undefined);
    if (price !== undefined) normalized.price = price;
  }
  if (normalized.totalAmount !== undefined) {
    const total = coerceNumber(normalized.totalAmount, undefined);
    if (total !== undefined) normalized.totalAmount = total;
  }
  if (normalized.total !== undefined && normalized.totalAmount === undefined) {
    const total = coerceNumber(normalized.total, undefined);
    if (total !== undefined) normalized.totalAmount = total;
    delete normalized.total;
  }
  if (normalized.vat !== undefined) {
    const vat = coerceNumber(normalized.vat, undefined);
    if (vat !== undefined) normalized.vat = vat;
  }
  if (normalized.vatAmount !== undefined && normalized.vat === undefined) {
    const vat = coerceNumber(normalized.vatAmount, undefined);
    if (vat !== undefined) normalized.vat = vat;
    delete normalized.vatAmount;
  }
  if (normalized.cityTax !== undefined) {
    const cityTax = coerceNumber(normalized.cityTax, undefined);
    if (cityTax !== undefined) normalized.cityTax = cityTax;
  }
  if (normalized.cityTaxAmount !== undefined && normalized.cityTax === undefined) {
    const cityTax = coerceNumber(normalized.cityTaxAmount, undefined);
    if (cityTax !== undefined) normalized.cityTax = cityTax;
    delete normalized.cityTaxAmount;
  }
  if (normalized.data && typeof normalized.data === 'string') {
    const parsed = parseJsonIfNeeded(normalized.data);
    if (parsed) normalized.data = parsed;
  }
  return normalized;
}

function normalizeItems(rawItems) {
  if (rawItems === undefined || rawItems === null) return [];
  const entries = Array.isArray(rawItems)
    ? rawItems
    : (() => {
        const parsed = parseJsonIfNeeded(rawItems);
        if (Array.isArray(parsed)) return parsed;
        return parsed ? [parsed] : [rawItems];
      })();
  const items = entries
    .map((entry) => normalizeItem(entry))
    .filter((entry) => entry && typeof entry === 'object');
  return items;
}

function normalizeReceipts(rawReceipts, defaultTaxType) {
  if (rawReceipts === undefined || rawReceipts === null) return [];
  const entries = Array.isArray(rawReceipts)
    ? rawReceipts
    : (() => {
        const parsed = parseJsonIfNeeded(rawReceipts);
        if (Array.isArray(parsed)) return parsed;
        return parsed ? [parsed] : [rawReceipts];
      })();
  const receipts = [];
  entries.forEach((entry) => {
    let receipt = entry;
    if (typeof entry === 'string') {
      const parsed = parseJsonIfNeeded(entry);
      if (!parsed || typeof parsed !== 'object') return;
      receipt = parsed;
    }
    if (!receipt || typeof receipt !== 'object') return;
    const normalized = { ...receipt };
    const items = normalizeItems(normalized.items ?? normalized.itemList ?? normalized.rows);
    if (!items.length) return;
    normalized.items = items;
    if (!normalized.taxType && defaultTaxType) {
      normalized.taxType = defaultTaxType;
    }
    receipts.push(normalized);
  });
  return receipts;
}

function computeTotals(receipts) {
  const totals = {
    totalAmount: 0,
    totalVat: 0,
    totalCityTax: 0,
  };
  receipts.forEach((receipt) => {
    const items = Array.isArray(receipt.items) ? receipt.items : [];
    items.forEach((item) => {
      const qty = coerceNumber(item.qty, 0);
      const price = coerceNumber(item.price, undefined);
      const totalAmount = coerceNumber(item.totalAmount, price !== undefined ? price * qty : undefined);
      const vat = coerceNumber(item.vat, 0);
      const cityTax = coerceNumber(item.cityTax, 0);
      if (Number.isFinite(totalAmount)) totals.totalAmount += totalAmount;
      if (Number.isFinite(vat)) totals.totalVat += vat;
      if (Number.isFinite(cityTax)) totals.totalCityTax += cityTax;
    });
  });
  return totals;
}

function cleanObject(value) {
  if (Array.isArray(value)) {
    const cleaned = value
      .map((entry) => cleanObject(entry))
      .filter((entry) => {
        if (entry === undefined || entry === null) return false;
        if (typeof entry === 'string') return entry.trim() !== '';
        if (typeof entry === 'object') return Object.keys(entry).length > 0;
        return true;
      });
    return cleaned;
  }
  if (value && typeof value === 'object') {
    const cleaned = {};
    Object.entries(value).forEach(([key, val]) => {
      if (val === undefined || val === null) return;
      if (typeof val === 'string') {
        if (val.trim() === '') return;
        cleaned[key] = val;
        return;
      }
      const nested = cleanObject(val);
      if (nested === undefined) return;
      if (Array.isArray(nested) && nested.length === 0) return;
      if (typeof nested === 'object' && !Array.isArray(nested) && Object.keys(nested).length === 0) return;
      cleaned[key] = nested;
    });
    return cleaned;
  }
  return value;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = Number.isFinite(options.timeout)
    ? options.timeout
    : DEFAULT_TIMEOUT;
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal ?? controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getPosApiToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt - 5000 > now) {
    return tokenCache.accessToken;
  }
  const authUrl = process.env.POSAPI_AUTH_URL;
  const realm = process.env.POSAPI_AUTH_REALM || process.env.POSAPI_REALM;
  const clientId = process.env.POSAPI_CLIENT_ID;
  const clientSecret = process.env.POSAPI_CLIENT_SECRET;
  if (!authUrl) throw new Error('POSAPI_AUTH_URL is not configured');
  if (!realm) throw new Error('POSAPI_AUTH_REALM is not configured');
  if (!clientId) throw new Error('POSAPI_CLIENT_ID is not configured');
  if (!clientSecret) throw new Error('POSAPI_CLIENT_SECRET is not configured');

  const tokenUrl = new URL(
    `/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`,
    authUrl,
  );

  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);

  const response = await fetchWithTimeout(tokenUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error('Failed to obtain POSAPI token');
    err.response = data;
    err.status = response.status;
    throw err;
  }
  const accessToken = data.access_token;
  if (!accessToken) {
    throw new Error('POSAPI token response missing access_token');
  }
  const expiresIn = Number.parseInt(data.expires_in, 10);
  tokenCache.accessToken = accessToken;
  tokenCache.expiresAt = Number.isFinite(expiresIn)
    ? now + expiresIn * 1000
    : now + 60_000;
  return accessToken;
}

export function buildReceiptFromDynamicTransaction(txnData, formConfig = {}) {
  if (!txnData || typeof txnData !== 'object') return null;
  const mapping = formConfig.posApiMapping || {};

  const defaultReceiptType =
    formConfig.posApiType?.trim() ||
    coerceString(getMappedValue(mapping, txnData, 'type', undefined)) ||
    process.env.POSAPI_DEFAULT_RECEIPT_TYPE ||
    'B2C_RECEIPT';

  const defaultTaxType =
    coerceString(getMappedValue(mapping, txnData, 'taxType', undefined)) ||
    process.env.POSAPI_DEFAULT_TAX_TYPE ||
    undefined;

  const receiptsRaw = getMappedValue(mapping, txnData, 'receipts', undefined);
  let receipts = normalizeReceipts(receiptsRaw, defaultTaxType);

  if (!receipts.length) {
    const itemsRaw = getMappedValue(mapping, txnData, 'items', undefined);
    const items = normalizeItems(itemsRaw);
    if (items.length) {
      receipts = [
        {
          taxType: defaultTaxType,
          items,
        },
      ];
    }
  }

  if (!receipts.length) {
    throw new Error('POSAPI payload missing receipt items');
  }

  const totalsFromItems = computeTotals(receipts);

  const payload = {
    branchNo:
      coerceString(
        getMappedValue(mapping, txnData, 'branchNo', process.env.POSAPI_DEFAULT_BRANCH_NO),
      ) || undefined,
    posNo:
      coerceString(
        getMappedValue(mapping, txnData, 'posNo', process.env.POSAPI_DEFAULT_POS_NO),
      ) || undefined,
    merchantTin:
      coerceString(
        getMappedValue(
          mapping,
          txnData,
          'merchantTin',
          process.env.POSAPI_DEFAULT_MERCHANT_TIN,
        ),
      ) || undefined,
    districtCode:
      coerceString(
        getMappedValue(
          mapping,
          txnData,
          'districtCode',
          process.env.POSAPI_DEFAULT_DISTRICT_CODE,
        ),
      ) || undefined,
    type: defaultReceiptType,
    taxType: defaultTaxType,
    customerTin: coerceString(getMappedValue(mapping, txnData, 'customerTin', undefined)),
    consumerNo: coerceString(getMappedValue(mapping, txnData, 'consumerNo', undefined)),
    billId: coerceString(getMappedValue(mapping, txnData, 'billId', undefined)),
    totalAmount: coerceNumber(
      getMappedValue(mapping, txnData, 'totalAmount', totalsFromItems.totalAmount),
      totalsFromItems.totalAmount,
    ),
    totalVAT: coerceNumber(
      getMappedValue(mapping, txnData, 'totalVAT', totalsFromItems.totalVat),
      totalsFromItems.totalVat,
    ),
    totalCityTax: coerceNumber(
      getMappedValue(mapping, txnData, 'totalCityTax', totalsFromItems.totalCityTax),
      totalsFromItems.totalCityTax,
    ),
    receipts,
  };

  const dataField = getMappedValue(mapping, txnData, 'data', undefined);
  if (dataField !== undefined) {
    const parsed = parseJsonIfNeeded(dataField);
    payload.data = parsed && typeof parsed === 'object' ? parsed : dataField;
  }

  const issueDate = getMappedValue(mapping, txnData, 'issuedAt', undefined);
  if (issueDate !== undefined && issueDate !== null && issueDate !== '') {
    payload.issuedAt = coerceString(issueDate) || issueDate;
  }

  if (!payload.branchNo) throw new Error('POSAPI payload missing branchNo');
  if (!payload.posNo) throw new Error('POSAPI payload missing posNo');
  if (!payload.merchantTin) throw new Error('POSAPI payload missing merchantTin');

  payload.receipts = payload.receipts.map((receipt) => cleanObject(receipt));
  const cleaned = cleanObject(payload);

  if (!cleaned || !Array.isArray(cleaned.receipts) || cleaned.receipts.length === 0) {
    throw new Error('POSAPI payload has no valid receipts after cleaning');
  }

  return cleaned;
}

export async function sendReceipt(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('POSAPI payload is required');
  }
  const baseUrl = process.env.POSAPI_EBARIMT_URL;
  if (!baseUrl) throw new Error('POSAPI_EBARIMT_URL is not configured');
  const token = await getPosApiToken();
  const url = new URL('/rest/receipt', baseUrl);
  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const err = new Error('POSAPI receipt submission failed');
    err.status = response.status;
    err.response = data;
    throw err;
  }
  return data;
}

export default {
  getPosApiToken,
  buildReceiptFromDynamicTransaction,
  sendReceipt,
};
