import { getSettings, pool } from '../../db/index.js';
import { getEndpointById, loadEndpoints } from './posApiRegistry.js';
import { createColumnLookup } from './posApiPersistence.js';

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

function headersToObject(headers) {
  const obj = {};
  if (!headers || typeof headers.forEach !== 'function') return obj;
  headers.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

function toBoolean(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
  }
  return false;
}

function isLikelyTin(value) {
  const normalized = toStringValue(value);
  if (!normalized) return false;
  const digits = normalized.replace(/[^0-9]/g, '');
  if (!digits) return false;
  return digits.length >= 7 && digits.length <= 12;
}

let cachedBaseUrl = '';
let cachedBaseUrlLoaded = false;

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

function resolveColumnName(columnLookup, record, columnName) {
  if (!columnLookup || typeof columnLookup.get !== 'function') return '';
  if (typeof columnName !== 'string') return '';
  const trimmed = columnName.trim();
  if (!trimmed) return '';
  const normalized = trimmed.toLowerCase();
  const underscored = normalized.replace(/[^a-z0-9]+/g, '_');
  const stripped = normalized.replace(/[^a-z0-9]+/g, '');
  const candidates = [normalized, underscored, stripped];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const column = columnLookup.get(candidate);
    if (column) return column;
  }
  if (record && Object.prototype.hasOwnProperty.call(record, trimmed)) {
    return trimmed;
  }
  return '';
}

function getColumnValue(columnLookup, record, columnName) {
  const resolved = resolveColumnName(columnLookup, record, columnName);
  if (!resolved) return undefined;
  return record[resolved];
}

function normalizeMapping(mapping) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return {};
  const normalized = {};
  Object.entries(mapping).forEach(([key, value]) => {
    if (typeof key !== 'string') return;
    if (value === undefined || value === null) return;
    normalized[key] = typeof value === 'string' ? value : String(value);
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
  return next;
}

function normalizePaymentEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const next = { ...entry };
  if (next.method && !next.type) {
    next.type = next.method;
  }
  const amountCandidate = next.amount ?? next.total ?? next.value;
  if (amountCandidate !== undefined) {
    const parsedAmount = toNumber(amountCandidate);
    if (parsedAmount !== null) next.amount = parsedAmount;
  }
  if (next.amount === undefined && next.value !== undefined) {
    const parsedValue = toNumber(next.value);
    if (parsedValue !== null) next.amount = parsedValue;
  }
  return next;
}

export function determinePosApiPayloadType(
  record,
  mapping = {},
  explicitType,
  options = {},
) {
  if (!record || typeof record !== 'object') {
    const fallback =
      toStringValue(explicitType) || toStringValue(process.env.POSAPI_RECEIPT_TYPE);
    return fallback || 'B2C_RECEIPT';
  }
  const normalizedMapping = normalizeMapping(mapping);
  const columnLookup = createColumnLookup(record);
  const customerTin = toStringValue(
    getColumnValue(columnLookup, record, normalizedMapping.customerTin),
  );
  const consumerNo = toStringValue(
    getColumnValue(columnLookup, record, normalizedMapping.consumerNo),
  );
  return resolveReceiptType({
    explicitType,
    typeField: options.typeField || options.posApiTypeField,
    mapping: normalizedMapping,
    record,
    columnLookup,
    customerTin,
    consumerNo,
    options,
  });
}

function resolveReceiptType({
  explicitType,
  typeField,
  mapping,
  record,
  columnLookup,
  customerTin,
  consumerNo,
  options = {},
}) {
  const candidates = [];
  if (typeField) candidates.push(typeField);
  if (mapping.posApiTypeField) candidates.push(mapping.posApiTypeField);
  if (mapping.typeField) candidates.push(mapping.typeField);
  if (options.typeField) candidates.push(options.typeField);
  for (const candidate of candidates) {
    const value = toStringValue(getColumnValue(columnLookup, record, candidate));
    if (value) return value;
  }

  const normalizedExplicit = toStringValue(explicitType);

  const stockFlagCandidates = new Set(
    [
      options.stockFlagField,
      mapping.stockFlagField,
      mapping.stockFlag,
      mapping.inventoryFlag,
      mapping.inventory,
      mapping.isInventory,
      mapping.isStock,
      'stockFlag',
      'stock',
      'inventoryFlag',
      'inventory',
      'isInventory',
      'isStock',
    ]
      .map((entry) => (typeof entry === 'string' ? entry : ''))
      .filter(Boolean),
  );

  const hasStockFlag = (() => {
    for (const flagField of stockFlagCandidates) {
      const rawValue = getColumnValue(columnLookup, record, flagField);
      if (rawValue !== undefined) {
        if (toBoolean(rawValue)) return true;
        continue;
      }
      if (record && Object.prototype.hasOwnProperty.call(record, flagField)) {
        if (toBoolean(record[flagField])) return true;
      }
    }
    return false;
  })();

  if (hasStockFlag) {
    return 'STOCK_QR';
  }

  const defaultType = normalizedExplicit || toStringValue(process.env.POSAPI_RECEIPT_TYPE);
  const preferInvoice = /INVOICE$/i.test(defaultType);

  if (isLikelyTin(customerTin)) {
    return preferInvoice ? 'B2B_INVOICE' : 'B2B_RECEIPT';
  }

  if (toStringValue(consumerNo)) {
    return preferInvoice ? 'B2C_INVOICE' : 'B2C_RECEIPT';
  }

  if (defaultType) {
    return defaultType;
  }

  return 'B2C_RECEIPT';
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

async function posApiFetch(path, { method = 'GET', body, token, headers, raw = false } = {}) {
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
  const contentType = res.headers.get('content-type') || '';
  let textBody = '';
  try {
    textBody = await res.text();
  } catch {
    textBody = '';
  }
  let payload = textBody;
  if (textBody && contentType.includes('application/json')) {
    try {
      payload = JSON.parse(textBody);
    } catch {
      payload = textBody;
    }
  } else if (!textBody && contentType.includes('application/json')) {
    payload = null;
  }

  if (!res.ok) {
    let message = res.statusText;
    if (payload && typeof payload === 'object') {
      message = payload.message || payload.error || message;
    } else if (textBody) {
      message = textBody;
    }
    const err = new Error(
      `POSAPI request failed with status ${res.status}: ${message || res.statusText}`,
    );
    err.status = res.status;
    err.response = payload;
    err.responseHeaders = headersToObject(res.headers);
    err.isRetryable = res.status >= 500 || res.status === 429;
    throw err;
  }

  if (raw) {
    return {
      status: res.status,
      ok: true,
      headers: headersToObject(res.headers),
      data: payload,
    };
  }

  return payload;
}

export async function getPosApiToken() {
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
  return json.access_token;
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
  if (!taxType) taxType = 'VAT_ABLE';

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
    toStringValue(getColumnValue(columnLookup, record, normalizedMapping.branchNo)) ||
    toStringValue(readEnvVar('POSAPI_BRANCH_NO'));
  const merchantTin =
    toStringValue(getColumnValue(columnLookup, record, normalizedMapping.merchantTin)) ||
    toStringValue(readEnvVar('POSAPI_MERCHANT_TIN'));
  const posNo =
    toStringValue(getColumnValue(columnLookup, record, normalizedMapping.posNo)) ||
    toStringValue(readEnvVar('POSAPI_POS_NO'));
  const districtCode =
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

  const itemsField = normalizedMapping.itemsField || normalizedMapping.items;
  const rawItems = getColumnValue(columnLookup, record, itemsField);
  let items = parseJsonArray(rawItems)
    .map((item) =>
      normalizeItemEntry(item, {
        classificationField,
        headerClassificationCode,
      }),
    )
    .filter(Boolean);

  if (!items.length) {
    const fallbackItem = {
      name: description ? String(description) : 'POS Transaction',
      qty: 1,
      price: totalAmount,
      totalAmount,
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
  } else if (lotNo) {
    items = items.map((item) => {
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

  const paymentsField = normalizedMapping.paymentsField || normalizedMapping.payments;
  const rawPayments = getColumnValue(columnLookup, record, paymentsField);
  let payments = parseJsonArray(rawPayments)
    .map((entry) => normalizePaymentEntry(entry))
    .filter(Boolean);
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
  }

  const receiptType = resolveReceiptType({
    explicitType: type,
    typeField: options.typeField || options.posApiTypeField,
    mapping: normalizedMapping,
    record,
    columnLookup,
    customerTin,
    consumerNo,
    options,
  });

  const receipt = {
    totalAmount,
    totalVAT: totalVAT ?? 0,
    totalCityTax: totalCityTax ?? 0,
    taxType,
    items,
  };

  const payload = {
    branchNo,
    merchantTin,
    posNo,
    type: receiptType,
    totalAmount,
    totalVAT: totalVAT ?? 0,
    totalCityTax: totalCityTax ?? 0,
    receipts: [receipt],
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
    'branchNo',
    'merchantTin',
    'posNo',
    'districtCode',
    'classificationCodeField',
    'posApiTypeField',
    'typeField',
  ]);
  applyAdditionalMappings(payload, normalizedMapping, record, columnLookup, reservedMappingKeys);

  return payload;
}

export async function sendReceipt(payload, options = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('POSAPI receipt payload is required');
  }
  const endpoint = options.endpoint || (await resolvePosApiEndpoint(options.endpointId));
  const method = (endpoint?.method || 'POST').toUpperCase();
  const path = endpoint?.path || '/rest/receipt';
  const token = await getPosApiToken();
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

function toSerializable(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

async function logPosApiInvocation(details = {}) {
  const {
    endpointId,
    endpointName,
    method,
    path,
    request,
    response,
    statusCode,
    companyId,
    userId,
    error,
  } = details;

  const basePayload = {
    endpoint: endpointId || endpointName || path || null,
    method: method || null,
    path: path || null,
    status: statusCode ?? error?.status ?? null,
    companyId: companyId ?? null,
    userId: userId ?? null,
    request: request ? toSerializable(request) : null,
    response: response ? toSerializable(response) : null,
    error: error ? error.message : null,
  };

  if (!pool || typeof pool.query !== 'function') {
    return;
  }

  const primarySql =
    'INSERT INTO ebarimt_api_log (endpoint, method, path, status_code, company_id, user_id, request_payload, response_payload, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())';
  const primaryParams = [
    basePayload.endpoint,
    basePayload.method,
    basePayload.path,
    basePayload.status,
    basePayload.companyId,
    basePayload.userId,
    basePayload.request ? JSON.stringify(basePayload.request).slice(0, 65535) : null,
    basePayload.response ? JSON.stringify(basePayload.response).slice(0, 65535) : null,
    basePayload.error,
  ];

  try {
    await pool.query(primarySql, primaryParams);
    return;
  } catch (err) {
    if (err?.code !== 'ER_BAD_FIELD_ERROR' && err?.code !== 'ER_NO_SUCH_TABLE') {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Failed to log POSAPI lookup (primary)', err);
      }
      return;
    }
  }

  try {
    await pool.query(
      'INSERT INTO ebarimt_api_log (endpoint, payload, response, created_at) VALUES (?, ?, ?, NOW())',
      [
        basePayload.endpoint,
        basePayload.request ? JSON.stringify(basePayload.request).slice(0, 65535) : null,
        basePayload.response ? JSON.stringify(basePayload.response).slice(0, 65535) : null,
      ],
    );
  } catch (fallbackErr) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to log POSAPI lookup (fallback)', fallbackErr);
    }
  }
}

function normalizeParameterObject(params) {
  if (!params || typeof params !== 'object') return {};
  if (Array.isArray(params)) return {};
  const normalized = {};
  Object.entries(params).forEach(([key, value]) => {
    if (!key) return;
    normalized[key] = value;
  });
  return normalized;
}

function prepareEndpointInvocation(endpoint, params = {}, method = 'GET') {
  const normalizedParams = normalizeParameterObject(params);
  const used = new Set();
  const pathTemplate =
    typeof endpoint.path === 'string' && endpoint.path.trim()
      ? endpoint.path.trim()
      : '/';
  const missingPathParams = [];
  const pathParamRegex = /{([^}]+)}/g;
  let resolvedPath = pathTemplate.replace(pathParamRegex, (match, rawName) => {
    const name = rawName.trim();
    const value = normalizedParams[name];
    if (value === undefined || value === null || value === '') {
      missingPathParams.push(name);
      return match;
    }
    used.add(name);
    return encodeURIComponent(String(value));
  });
  if (missingPathParams.length) {
    throw new Error(
      `Missing POSAPI path parameters: ${missingPathParams
        .map((param) => param || '')
        .join(', ')}`,
    );
  }

  const queryParams = new URLSearchParams();
  const bodyPayload = {};
  const headerPayload = {};
  const definitions = Array.isArray(endpoint.parameters) ? endpoint.parameters : [];

  definitions.forEach((definition) => {
    if (!definition || typeof definition !== 'object') return;
    const name = definition.name;
    if (!name) return;
    const value = normalizedParams[name];
    if (value === undefined || value === null || value === '') return;
    used.add(name);
    const location = (definition.in || '').toLowerCase();
    switch (location) {
      case 'query':
        queryParams.append(name, value);
        break;
      case 'header':
        headerPayload[name] = String(value);
        break;
      case 'path':
        // Already applied via path replacement above
        break;
      case 'body':
      case 'json':
      case 'form':
        bodyPayload[name] = value;
        break;
      default:
        if (method === 'GET' || method === 'DELETE') {
          queryParams.append(name, value);
        } else {
          bodyPayload[name] = value;
        }
        break;
    }
  });

  Object.entries(normalizedParams).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (used.has(key)) return;
    if (method === 'GET' || method === 'DELETE') {
      queryParams.append(key, value);
    } else {
      bodyPayload[key] = value;
    }
  });

  const queryObject = Object.fromEntries(queryParams.entries());
  const queryString = queryParams.toString();
  const pathWithQuery = `${resolvedPath}${queryString ? `?${queryString}` : ''}`;

  return {
    path: pathWithQuery,
    headers: headerPayload,
    body: bodyPayload,
    query: queryObject,
  };
}

export async function invokePosApiEndpoint(endpointId, parameters = {}, options = {}) {
  if (!endpointId) {
    throw new Error('endpointId is required to invoke POSAPI');
  }

  const endpoint = await resolvePosApiEndpoint(endpointId);
  const method = (options.method || endpoint?.method || 'GET').toUpperCase();
  const prepared = prepareEndpointInvocation(endpoint, parameters, method);

  const requestBody =
    options.body !== undefined && options.body !== null
      ? options.body
      : prepared.body;

  const serializedBody =
    method === 'GET' || method === 'DELETE'
      ? undefined
      : typeof requestBody === 'string'
      ? requestBody
      : Object.keys(requestBody || {}).length > 0
      ? JSON.stringify(requestBody)
      : undefined;

  const headers = {
    ...(options.headers || {}),
    ...prepared.headers,
  };
  if (serializedBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const token = await getPosApiToken();

  const auditBase = {
    endpointId: endpoint.id,
    endpointName: endpoint.name,
    method,
    path: prepared.path,
    request: {
      query: prepared.query,
      body: requestBody,
      parameters: parameters,
    },
    companyId: options.companyId ?? null,
    userId: options.userId ?? null,
  };

  const attempts = options.autoRetry === false ? 1 : 2;
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await posApiFetch(prepared.path, {
        method,
        token,
        headers,
        body: serializedBody,
        raw: true,
      });
      await logPosApiInvocation({
        ...auditBase,
        statusCode: response.status,
        response: response.data,
      });
      return {
        endpoint: {
          id: endpoint.id,
          name: endpoint.name,
          method,
          path: prepared.path,
        },
        status: response.status,
        headers: response.headers,
        data: response.data,
      };
    } catch (err) {
      await logPosApiInvocation({
        ...auditBase,
        statusCode: err?.status,
        response: err?.response,
        error: err,
      });
      lastError = err;
      if (!err?.isRetryable || attempt === attempts - 1) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  if (lastError) throw lastError;
  throw new Error('POSAPI invocation failed without an error response');
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
