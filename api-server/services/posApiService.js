import { getSettings } from '../../db/index.js';

const POSAPI_TYPES = new Set([
  'B2C_RECEIPT',
  'B2B_RECEIPT',
  'B2C_INVOICE',
  'B2B_INVOICE',
  'STOCK_QR',
]);

const TAX_TYPES = new Set(['VAT_ABLE', 'VAT_FREE', 'VAT_ZERO', 'NO_VAT']);

const PAYMENT_TYPES = new Set([
  'CASH',
  'PAYMENT_CARD',
  'BANK_TRANSFER',
  'MOBILE_WALLET',
  'EASY_BANK_CARD',
]);

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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonSafe(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!['{', '['].includes(trimmed[0])) return value;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return value;
  }
}

function getValueAtPath(source, path) {
  if (!source || typeof source !== 'object') return undefined;
  if (!path || typeof path !== 'string') return undefined;
  const trimmed = path.trim();
  if (!trimmed) return undefined;
  if (!trimmed.includes('.')) {
    const direct = source[trimmed];
    if (direct !== undefined) {
      if (typeof direct === 'string') {
        return parseJsonSafe(direct);
      }
      return direct;
    }
    return undefined;
  }
  const parts = trimmed.split('.').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  let current = source;
  for (let index = 0; index < parts.length; index += 1) {
    const segment = parts[index];
    if (current === undefined || current === null) return undefined;
    if (index === 0) {
      current = current[segment];
    } else {
      if (typeof current === 'string') {
        current = parseJsonSafe(current);
      }
      if (Array.isArray(current)) {
        const numericIndex = Number(segment);
        if (!Number.isInteger(numericIndex)) {
          return undefined;
        }
        current = current[numericIndex];
      } else if (current && typeof current === 'object') {
        current = current[segment];
      } else {
        return undefined;
      }
    }
  }
  if (typeof current === 'string') {
    return parseJsonSafe(current);
  }
  return current;
}

function normalizeArrayValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseJsonSafe(value);
    if (Array.isArray(parsed) || isPlainObject(parsed)) {
      return normalizeArrayValue(parsed);
    }
    return [];
  }
  if (isPlainObject(value)) {
    if (Array.isArray(value.rows)) {
      return value.rows;
    }
    if (Array.isArray(value.data)) {
      return value.data;
    }
    const numericKeys = Object.keys(value)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));
    if (numericKeys.length) {
      return numericKeys.map((key) => value[key]);
    }
  }
  return [];
}

function normalizePosApiType(value, fallback = '') {
  const raw = toStringValue(value);
  const candidate = raw ? raw.replace(/[-\s]+/g, '_').toUpperCase() : '';
  if (candidate && POSAPI_TYPES.has(candidate)) {
    return candidate;
  }
  if (!candidate && fallback) {
    return normalizePosApiType(fallback);
  }
  if (!candidate) {
    return '';
  }
  const err = new Error(`Invalid POSAPI type: ${value}`);
  err.status = 400;
  err.details = { value };
  throw err;
}

function normalizeTaxType(value, fallback = 'VAT_ABLE') {
  const raw = toStringValue(value);
  let candidate = raw.replace(/[-\s]+/g, '_').toUpperCase();
  if (candidate === 'VATABLE') {
    candidate = 'VAT_ABLE';
  }
  if (!candidate) {
    candidate = fallback;
  }
  if (TAX_TYPES.has(candidate)) {
    return candidate;
  }
  const err = new Error(`Invalid POSAPI tax type: ${value}`);
  err.status = 400;
  err.details = { value };
  throw err;
}

function normalizePaymentType(value) {
  const raw = toStringValue(value);
  const candidate = raw.replace(/[-\s]+/g, '_').toUpperCase();
  if (PAYMENT_TYPES.has(candidate)) {
    return candidate;
  }
  const err = new Error(`Invalid POSAPI payment type: ${value}`);
  err.status = 400;
  err.details = { value };
  throw err;
}

function resolveMappingField(mapping, key) {
  const raw = mapping?.[key];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed || '';
  }
  return '';
}

function resolveMappingObject(mapping, key) {
  const raw = mapping?.[key];
  if (isPlainObject(raw)) {
    return raw;
  }
  return {};
}

function pickItemField(item, mapping, key, fallbackKeys = []) {
  const fields = [];
  const mapped = resolveMappingField(mapping, key);
  if (mapped) fields.push(mapped);
  fallbackKeys.forEach((candidate) => {
    if (candidate && typeof candidate === 'string') {
      fields.push(candidate);
    }
  });
  fields.push(key);
  for (const field of fields) {
    if (!field) continue;
    const value = item?.[field];
    if (value !== undefined) return value;
  }
  return undefined;
}

function toItemNumber(value) {
  const num = toNumber(value);
  return num === null ? null : num;
}

function buildReceiptItem(
  item,
  itemFieldMap,
  defaultTaxField,
  receiptDefaultTaxType,
) {
  if (!item || typeof item !== 'object') return null;
  const taxFieldCandidates = [];
  if (defaultTaxField) taxFieldCandidates.push(defaultTaxField);
  const rawTax = pickItemField(item, itemFieldMap, 'taxType', taxFieldCandidates);
  const taxType = normalizeTaxType(rawTax, receiptDefaultTaxType);
  const name = toStringValue(
    pickItemField(item, itemFieldMap, 'name', ['itemName', 'description']),
  );
  const qty = toItemNumber(pickItemField(item, itemFieldMap, 'qty', ['quantity'])) ?? 1;
  const unitPrice =
    toItemNumber(pickItemField(item, itemFieldMap, 'unitPrice', ['price'])) ?? null;
  const totalAmount =
    toItemNumber(pickItemField(item, itemFieldMap, 'totalAmount', ['amount'])) ??
    (unitPrice !== null ? qty * unitPrice : null);
  const vatAmount =
    toItemNumber(pickItemField(item, itemFieldMap, 'vatAmount', ['vat', 'vatAmount'])) ??
    null;
  const cityTaxAmount =
    toItemNumber(
      pickItemField(item, itemFieldMap, 'cityTaxAmount', ['cityTax', 'cityTaxAmount']),
    ) ?? null;
  const classificationCode = toStringValue(
    pickItemField(item, itemFieldMap, 'classificationCode', ['classCode']),
  );
  const taxProductCode = toStringValue(
    pickItemField(item, itemFieldMap, 'taxProductCode', ['vatCode']),
  );
  const measureUnit = toStringValue(
    pickItemField(item, itemFieldMap, 'measureUnit', ['unit', 'measure']),
  );
  const barCode = toStringValue(
    pickItemField(item, itemFieldMap, 'barCode', ['barcode', 'bar_code']),
  );
  const barCodeType = toStringValue(
    pickItemField(item, itemFieldMap, 'barCodeType', ['barcodeType']),
  );
  const lotNo = toStringValue(pickItemField(item, itemFieldMap, 'lotNo', ['lot']));
  if (!name && totalAmount === null && unitPrice === null) {
    return null;
  }
  const normalized = {
    name: name || 'Item',
    qty,
    price: unitPrice !== null ? unitPrice : totalAmount ?? 0,
    totalAmount: totalAmount ?? (unitPrice !== null ? qty * unitPrice : 0),
    vat: vatAmount ?? undefined,
    cityTax: cityTaxAmount ?? undefined,
    vatTaxType: taxType,
  };
  if (classificationCode) normalized.classificationCode = classificationCode;
  if (taxProductCode) normalized.taxProductCode = taxProductCode;
  if (measureUnit) normalized.measureUnit = measureUnit;
  if (barCode) normalized.barCode = barCode;
  if (barCodeType) normalized.barCodeType = barCodeType;
  if (lotNo) {
    normalized.data = { ...(normalized.data || {}), lotNo };
  }
  return { item: normalized, taxType };
}

function normalizePayments(payments, paymentFieldMap) {
  const list = normalizeArrayValue(payments);
  if (!list.length) return [];
  const normalized = [];
  list.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const typeValue = pickItemField(entry, paymentFieldMap, 'type', []);
    if (typeValue === undefined || typeValue === null) return;
    const amountValue = toItemNumber(
      pickItemField(entry, paymentFieldMap, 'amount', ['value']),
    );
    if (amountValue === null) return;
    const type = normalizePaymentType(typeValue);
    normalized.push({ type, amount: amountValue });
  });
  return normalized;
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
  const hasExplicitTotalVAT =
    totalVATField && record[totalVATField] !== undefined && record[totalVATField] !== null;
  const totalCityTaxField = normalizedMapping.totalCityTax;
  const totalCityTax =
    totalCityTaxField && totalCityTaxField in record
      ? toNumber(record[totalCityTaxField]) ?? 0
      : toNumber(getFieldValue('totalCityTax')) ?? 0;
  const hasExplicitTotalCityTax =
    totalCityTaxField &&
    record[totalCityTaxField] !== undefined &&
    record[totalCityTaxField] !== null;
  const customerTin = toStringValue(getFieldValue('customerTin'));
  const consumerNo = toStringValue(getFieldValue('consumerNo'));
  const taxTypeField = normalizedMapping.taxType;
  const taxTypeRaw = taxTypeField ? record[taxTypeField] : undefined;
  const taxType = toStringValue(taxTypeRaw) || 'VAT_ABLE';
  const descriptionField =
    normalizedMapping.description || normalizedMapping.itemDescription;
  let description = record.description ?? record.remarks ?? '';
  if (descriptionField && record[descriptionField] != null) {
    description = record[descriptionField];
  }
  const lotNoField = normalizedMapping.lotNo;
  const lotNo = lotNoField ? toStringValue(record[lotNoField]) : '';
  const branchNo = readEnvVar('POSAPI_BRANCH_NO');
  const merchantTin = readEnvVar('POSAPI_MERCHANT_TIN');
  const posNo = readEnvVar('POSAPI_POS_NO');
  const districtCode = readEnvVar('POSAPI_DISTRICT_CODE');
  const missingEnv = [];
  if (!branchNo) missingEnv.push('POSAPI_BRANCH_NO');
  if (!merchantTin) missingEnv.push('POSAPI_MERCHANT_TIN');
  if (!posNo) missingEnv.push('POSAPI_POS_NO');
  if (missingEnv.length) {
    const err = new Error(
      `POSAPI receipt configuration is incomplete. Missing: ${missingEnv.join(', ')}`,
    );
    err.status = 500;
    err.details = { missingEnvVars: missingEnv };
    throw err;
  }
  const mappingItems = resolveMappingField(normalizedMapping, 'itemsField');
  const itemFieldMap = resolveMappingObject(normalizedMapping, 'itemFields');
  const itemTaxTypeField = resolveMappingField(normalizedMapping, 'taxTypeField');
  const paymentsField = resolveMappingField(normalizedMapping, 'paymentsField');
  const paymentFieldMap = resolveMappingObject(normalizedMapping, 'paymentFields');
  const posApiTypeField = resolveMappingField(normalizedMapping, 'posApiTypeField');

  const recordSpecifiedType = posApiTypeField
    ? normalizePosApiType(record[posApiTypeField] ?? '', '')
    : '';
  const receiptType = normalizePosApiType(
    recordSpecifiedType || type || process.env.POSAPI_RECEIPT_TYPE || 'B2C_RECEIPT',
  );

  const defaultTaxType = normalizeTaxType(taxType, 'VAT_ABLE');

  const rawItems = mappingItems ? getValueAtPath(record, mappingItems) : undefined;
  const itemsSource = normalizeArrayValue(rawItems);
  const itemGroups = new Map();
  if (itemsSource.length) {
    itemsSource.forEach((entry) => {
      const normalized = buildReceiptItem(
        entry,
        itemFieldMap,
        itemTaxTypeField,
        defaultTaxType,
      );
      if (!normalized) return;
      const { taxType: entryTaxType, item: itemPayload } = normalized;
      const groupKey = entryTaxType || defaultTaxType;
      const group = itemGroups.get(groupKey) || {
        taxType: entryTaxType || defaultTaxType,
        totalAmount: 0,
        totalVAT: 0,
        totalCityTax: 0,
        items: [],
      };
      group.items.push(itemPayload);
      if (typeof itemPayload.totalAmount === 'number') {
        group.totalAmount += itemPayload.totalAmount;
      }
      if (typeof itemPayload.vat === 'number') {
        group.totalVAT += itemPayload.vat;
      }
      if (typeof itemPayload.cityTax === 'number') {
        group.totalCityTax += itemPayload.cityTax;
      }
      itemGroups.set(groupKey, group);
    });
  }

  const receipts = [];
  if (itemGroups.size) {
    for (const group of itemGroups.values()) {
      const normalizedTaxType = normalizeTaxType(group.taxType, defaultTaxType);
      const receipt = {
        taxType: normalizedTaxType,
        totalAmount: group.totalAmount,
        items: group.items,
      };
      const hasVat = group.items.some((entry) => typeof entry.vat === 'number');
      if (hasVat || TAX_TYPES.has(normalizedTaxType)) {
        if (hasVat) {
          receipt.totalVAT = group.totalVAT;
        } else if (normalizedTaxType === 'VAT_ABLE') {
          receipt.totalVAT = group.totalVAT;
        }
      }
      const hasCityTax = group.items.some(
        (entry) => typeof entry.cityTax === 'number',
      );
      if (hasCityTax) {
        receipt.totalCityTax = group.totalCityTax;
      }
      receipts.push(receipt);
    }
  }

  let payments = [];
  if (paymentsField) {
    const paymentSource = getValueAtPath(record, paymentsField);
    payments = normalizePayments(paymentSource, paymentFieldMap);
  }

  const aggregatedTotals = receipts.reduce(
    (acc, group) => {
      acc.totalAmount += typeof group.totalAmount === 'number' ? group.totalAmount : 0;
      if (typeof group.totalVAT === 'number') {
        acc.totalVAT += group.totalVAT;
      }
      if (typeof group.totalCityTax === 'number') {
        acc.totalCityTax += group.totalCityTax;
      }
      return acc;
    },
    { totalAmount: 0, totalVAT: 0, totalCityTax: 0 },
  );

  const payload = {
    branchNo,
    merchantTin,
    posNo,
    type: receiptType,
    totalAmount,
    totalVAT,
    totalCityTax,
    receipts: receipts.length
      ? receipts
      : [
          {
            taxType: defaultTaxType,
            totalAmount,
            totalVAT,
            totalCityTax,
            items: [
              {
                name: description ? String(description) : 'POS Transaction',
                qty: 1,
                price: totalAmount,
                totalAmount,
                vat: totalVAT,
                cityTax: totalCityTax,
                vatTaxType: defaultTaxType,
                ...(lotNo ? { data: { lotNo } } : {}),
              },
            ],
          },
        ],
  };
  if (districtCode) payload.districtCode = districtCode;
  if (customerTin) payload.customerTin = customerTin;
  if (consumerNo) payload.consumerNo = consumerNo;
  if (payments.length) payload.payments = payments;

  if (
    (payload.totalAmount === null || payload.totalAmount === undefined) &&
    receipts.length
  ) {
    payload.totalAmount = aggregatedTotals.totalAmount;
  }
  if (
    ((payload.totalVAT === null || payload.totalVAT === undefined) || !hasExplicitTotalVAT) &&
    receipts.length
  ) {
    payload.totalVAT = aggregatedTotals.totalVAT;
  }
  if (
    (payload.totalCityTax === null ||
      payload.totalCityTax === undefined ||
      !hasExplicitTotalCityTax) &&
    receipts.length
  ) {
    payload.totalCityTax = aggregatedTotals.totalCityTax;
  }
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
