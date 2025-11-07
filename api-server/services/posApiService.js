import { getSettings } from '../../db/index.js';

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

const POSAPI_CONFIG_CACHE_TTL = 60 * 1000;
let cachedSettingsRow = null;
let cachedSettingsLoadedAt = 0;
let settingsPromise = null;

function normalizeSettingValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return String(value ?? '').trim();
}

function readSettingsValue(settings, key) {
  if (!settings || typeof settings !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(settings, key)) {
    return normalizeSettingValue(settings[key]);
  }
  const lower = key.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(settings, lower)) {
    return normalizeSettingValue(settings[lower]);
  }
  const camel = lower.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
  if (Object.prototype.hasOwnProperty.call(settings, camel)) {
    return normalizeSettingValue(settings[camel]);
  }
  return '';
}

async function loadSettingsCache() {
  const now = Date.now();
  if (cachedSettingsRow && now - cachedSettingsLoadedAt < POSAPI_CONFIG_CACHE_TTL) {
    return cachedSettingsRow;
  }
  if (settingsPromise) {
    return settingsPromise;
  }
  settingsPromise = getSettings()
    .then((settings) => {
      cachedSettingsRow = settings || {};
      cachedSettingsLoadedAt = Date.now();
      return cachedSettingsRow;
    })
    .catch((err) => {
      console.error('Failed to load POSAPI settings fallback', err);
      cachedSettingsRow = {};
      cachedSettingsLoadedAt = Date.now();
      return cachedSettingsRow;
    })
    .finally(() => {
      settingsPromise = null;
    });
  return settingsPromise;
}

async function resolvePosApiConfig(keys = []) {
  const config = {};
  const missing = [];
  const pending = [];
  (Array.isArray(keys) ? keys : []).forEach((key) => {
    const value = readEnvVar(key);
    if (value) {
      config[key] = value;
    } else {
      pending.push(key);
    }
  });
  if (!pending.length) {
    return { config, missing };
  }
  const settings = await loadSettingsCache();
  pending.forEach((key) => {
    const value = readSettingsValue(settings, key);
    if (value) {
      config[key] = value;
    } else {
      missing.push(key);
    }
  });
  return { config, missing };
}

let cachedBaseUrl = '';
let cachedBaseUrlLoadedAt = 0;

async function getPosApiBaseUrl() {
  const now = Date.now();
  if (cachedBaseUrl && now - cachedBaseUrlLoadedAt < POSAPI_CONFIG_CACHE_TTL) {
    return cachedBaseUrl;
  }
  const { config, missing } = await resolvePosApiConfig(['POSAPI_EBARIMT_URL']);
  const resolvedMissing = [...missing];
  const baseUrl = trimEndSlash(config.POSAPI_EBARIMT_URL || '');
  if (!baseUrl) {
    if (!resolvedMissing.includes('POSAPI_EBARIMT_URL')) {
      resolvedMissing.push('POSAPI_EBARIMT_URL');
    }
    const err = new Error(
      'POSAPI_EBARIMT_URL is not configured. Set the environment variable or update Settings.',
    );
    err.status = 500;
    err.details = {
      missingEnvVars: resolvedMissing,
      missingConfigKeys: resolvedMissing,
    };
    throw err;
  }
  cachedBaseUrl = baseUrl;
  cachedBaseUrlLoadedAt = Date.now();
  return cachedBaseUrl;
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

async function posApiFetch(path, { method = 'GET', body, token, headers } = {}) {
  const baseUrl = await getPosApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const fetchFn = await getFetch();
  const res = await fetchFn(url, {
    method,
    headers: {
      ...(headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(
      `POSAPI request failed with status ${res.status}: ${text || res.statusText}`,
    );
    err.status = res.status;
    throw err;
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

export async function getPosApiToken() {
  const requiredEnv = ['POSAPI_AUTH_URL', 'POSAPI_AUTH_REALM', 'POSAPI_CLIENT_ID'];
  const optionalEnv = ['POSAPI_CLIENT_SECRET'];
  const { config, missing } = await resolvePosApiConfig([...requiredEnv, ...optionalEnv]);
  const resolvedMissing = missing.filter((key) => requiredEnv.includes(key));
  const baseUrl = trimEndSlash(config.POSAPI_AUTH_URL || '');
  const realm = config.POSAPI_AUTH_REALM || '';
  const clientId = config.POSAPI_CLIENT_ID || '';
  const clientSecret = config.POSAPI_CLIENT_SECRET || '';
  if (!baseUrl && !resolvedMissing.includes('POSAPI_AUTH_URL')) {
    resolvedMissing.push('POSAPI_AUTH_URL');
  }
  if (!realm && !resolvedMissing.includes('POSAPI_AUTH_REALM')) {
    resolvedMissing.push('POSAPI_AUTH_REALM');
  }
  if (!clientId && !resolvedMissing.includes('POSAPI_CLIENT_ID')) {
    resolvedMissing.push('POSAPI_CLIENT_ID');
  }
  if (resolvedMissing.length) {
    const err = new Error(
      `POSAPI authentication configuration is incomplete. Missing: ${resolvedMissing.join(
        ', ',
      )}. Please set the environment variables or update Settings.`,
    );
    err.status = 500;
    err.details = {
      missingEnvVars: resolvedMissing,
      missingConfigKeys: resolvedMissing,
    };
    throw err;
  }
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
  return json.access_token;
}

export async function buildReceiptFromDynamicTransaction(record, mapping = {}, type) {
  if (!record || typeof record !== 'object') return null;
  const normalizedMapping =
    mapping && typeof mapping === 'object' && !Array.isArray(mapping)
      ? mapping
      : {};

  const requiredMapping = ['totalAmount'];
  const missingMapping = requiredMapping.filter((field) => {
    const column = normalizedMapping[field];
    return typeof column !== 'string' || !column.trim();
  });
  if (missingMapping.length) {
    const err = new Error(
      `POSAPI mapping is missing required fields: ${missingMapping.join(', ')}`,
    );
    err.status = 400;
    err.details = { missingMapping };
    throw err;
  }

  const getFieldValue = (key) => {
    const column = normalizedMapping[key];
    if (typeof column !== 'string' || !column) return undefined;
    return record[column];
  };

  const totalAmountField = normalizedMapping.totalAmount;
  const totalAmount = toNumber(record[totalAmountField]);
  if (totalAmount === null) {
    const err = new Error(
      `POSAPI totalAmount is missing or invalid (column: ${totalAmountField})`,
    );
    err.status = 400;
    err.details = { field: 'totalAmount', column: totalAmountField };
    throw err;
  }

  const totalVATField = normalizedMapping.totalVAT;
  const totalVAT =
    totalVATField && totalVATField in record
      ? toNumber(record[totalVATField]) ?? 0
      : toNumber(getFieldValue('totalVAT')) ?? 0;
  const totalCityTaxField = normalizedMapping.totalCityTax;
  const totalCityTax =
    totalCityTaxField && totalCityTaxField in record
      ? toNumber(record[totalCityTaxField]) ?? 0
      : toNumber(getFieldValue('totalCityTax')) ?? 0;
  const customerTin = toStringValue(getFieldValue('customerTin'));
  const consumerNo = toStringValue(getFieldValue('consumerNo'));
  const taxTypeField = normalizedMapping.taxType;
  const taxTypeRaw = taxTypeField ? record[taxTypeField] : undefined;
  const taxType = toStringValue(taxTypeRaw) || 'VATABLE';
  const descriptionField =
    normalizedMapping.description || normalizedMapping.itemDescription;
  let description = record.description ?? record.remarks ?? '';
  if (descriptionField && record[descriptionField] != null) {
    description = record[descriptionField];
  }
  const lotNoField = normalizedMapping.lotNo;
  const lotNo = lotNoField ? toStringValue(record[lotNoField]) : '';
  const optionalKeys = new Set(['POSAPI_DISTRICT_CODE', 'POSAPI_RECEIPT_TYPE']);
  const { config: receiptConfig, missing } = await resolvePosApiConfig([
    'POSAPI_BRANCH_NO',
    'POSAPI_MERCHANT_TIN',
    'POSAPI_POS_NO',
    'POSAPI_DISTRICT_CODE',
    'POSAPI_RECEIPT_TYPE',
  ]);
  const requiredMissing = missing.filter((key) => !optionalKeys.has(key));
  const branchNo = toStringValue(receiptConfig.POSAPI_BRANCH_NO);
  const merchantTin = toStringValue(receiptConfig.POSAPI_MERCHANT_TIN);
  const posNo = toStringValue(receiptConfig.POSAPI_POS_NO);
  const districtCode = toStringValue(receiptConfig.POSAPI_DISTRICT_CODE);
  const missingEnv = [...requiredMissing];
  if (!branchNo && !missingEnv.includes('POSAPI_BRANCH_NO')) {
    missingEnv.push('POSAPI_BRANCH_NO');
  }
  if (!merchantTin && !missingEnv.includes('POSAPI_MERCHANT_TIN')) {
    missingEnv.push('POSAPI_MERCHANT_TIN');
  }
  if (!posNo && !missingEnv.includes('POSAPI_POS_NO')) {
    missingEnv.push('POSAPI_POS_NO');
  }
  if (missingEnv.length) {
    const err = new Error(
      `POSAPI receipt configuration is incomplete. Missing: ${missingEnv.join(
        ', ',
      )}. Please set the environment variables or update Settings.`,
    );
    err.status = 500;
    err.details = {
      missingEnvVars: missingEnv,
      missingConfigKeys: missingEnv,
    };
    throw err;
  }
  const receiptType =
    toStringValue(type) ||
    toStringValue(receiptConfig.POSAPI_RECEIPT_TYPE) ||
    'B2C_RECEIPT';
  const item = {
    name: description ? String(description) : 'POS Transaction',
    qty: 1,
    price: totalAmount,
    totalAmount,
    vat: totalVAT,
    cityTax: totalCityTax,
  };
  if (lotNo) {
    item.data = { lotNo };
  }
  const receipt = {
    totalAmount,
    totalVAT,
    totalCityTax,
    taxType,
    items: [item],
  };
  const payload = {
    branchNo,
    merchantTin,
    posNo,
    type: receiptType,
    totalAmount,
    totalVAT,
    totalCityTax,
    receipts: [receipt],
  };
  if (districtCode) payload.districtCode = districtCode;
  if (customerTin) payload.customerTin = customerTin;
  if (consumerNo) payload.consumerNo = consumerNo;
  return payload;
}

export async function sendReceipt(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('POSAPI receipt payload is required');
  }
  const token = await getPosApiToken();
  return posApiFetch('/rest/receipt', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
