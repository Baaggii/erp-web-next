import { parseLocalizedNumber } from '../../utils/parseLocalizedNumber.js';

const fetchImpl =
  typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : (await import('node-fetch')).default;

const AUTH_BASE_URL = (process.env.POSAPI_AUTH_URL || '').replace(/\/+$/, '');
const AUTH_REALM = process.env.POSAPI_AUTH_REALM || '';
const CLIENT_ID = process.env.POSAPI_CLIENT_ID || '';
const CLIENT_SECRET = process.env.POSAPI_CLIENT_SECRET || '';
const POSAPI_BASE_URL = (process.env.POSAPI_EBARIMT_URL || '').replace(/\/+$/, '');
const DEFAULT_BRANCH_NO = (process.env.POSAPI_BRANCH_NO || '').trim();
const DEFAULT_MERCHANT_TIN = (process.env.POSAPI_MERCHANT_TIN || '').trim();
const DEFAULT_POS_NO = (process.env.POSAPI_POS_NO || '').trim();
const DEFAULT_DISTRICT_CODE = (process.env.POSAPI_DISTRICT_CODE || '').trim();
const DEFAULT_RECEIPT_TYPE = (process.env.POSAPI_RECEIPT_TYPE || 'B2C_RECEIPT')
  .trim()
  .toUpperCase();

const RECEIPT_TYPES = new Set(['B2C_RECEIPT', 'B2C_INVOICE', 'B2B_INVOICE']);

function logError(message, error) {
  if (error) {
    console.error(`[POSAPI] ${message}`, error);
  } else {
    console.error(`[POSAPI] ${message}`);
  }
}

function joinUrl(base, path) {
  if (!base) return '';
  if (!path) return base;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  const parsed = parseLocalizedNumber(value);
  return parsed === null ? null : parsed;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pickField(obj, fields = []) {
  if (!isPlainObject(obj)) return undefined;
  for (const field of fields) {
    if (field in obj && obj[field] !== undefined && obj[field] !== null) {
      return obj[field];
    }
    const altField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (
      field !== altField &&
      altField in obj &&
      obj[altField] !== undefined &&
      obj[altField] !== null
    ) {
      return obj[altField];
    }
  }
  return undefined;
}

function sanitizeReceiptType(type) {
  if (typeof type !== 'string') return '';
  const upper = type.trim().toUpperCase();
  if (!upper) return '';
  return RECEIPT_TYPES.has(upper) ? upper : '';
}

function extractPrimaryRecord(txnData) {
  if (!txnData || typeof txnData !== 'object') return {};

  const direct = txnData.transactions_pos || txnData.transactionsPos;
  if (isPlainObject(direct)) return direct;

  const singleTransactions = txnData.single?.transactions_pos;
  if (isPlainObject(singleTransactions)) return singleTransactions;

  if (isPlainObject(txnData.single)) {
    for (const value of Object.values(txnData.single)) {
      if (isPlainObject(value)) return value;
    }
  }

  if (isPlainObject(txnData.master)) return txnData.master;

  if (isPlainObject(txnData)) return txnData;

  return {};
}

function extractItemArrays(txnData) {
  if (!txnData || typeof txnData !== 'object') return [];
  const arrays = [];

  const candidates = [
    txnData.transactions_order,
    txnData.transactionsOrder,
    txnData.transactions_inventory,
    txnData.transactionsInventory,
    txnData.items,
  ];
  candidates.forEach((candidate) => {
    if (Array.isArray(candidate) && candidate.length) arrays.push(candidate);
  });

  const multi = txnData.multi;
  if (isPlainObject(multi)) {
    Object.values(multi).forEach((value) => {
      if (Array.isArray(value) && value.length) arrays.push(value);
    });
  }

  return arrays;
}

function buildItemPayload(rawItem) {
  if (!isPlainObject(rawItem)) return null;

  const name =
    pickField(rawItem, ['name', 'itemName', 'productName', 'title']) || '';
  const barCode =
    pickField(rawItem, ['barCode', 'barcode', 'bar_code', 'barcodeNo']) || '';
  const classificationCode =
    pickField(rawItem, ['classificationCode', 'classification_code']) || '';
  const taxProductCode =
    pickField(rawItem, ['taxProductCode', 'tax_product_code']) || '';
  const measureUnit =
    pickField(rawItem, ['measureUnit', 'unit', 'measure_unit']) || '';
  const rawQty = pickField(rawItem, ['qty', 'quantity', 'qty_total']);
  const rawPrice = pickField(rawItem, ['price', 'unitPrice', 'unit_price']);
  const rawVatType = pickField(rawItem, ['vatTaxType', 'vat_type']);
  const rawCityTax = pickField(rawItem, ['cityTax', 'city_tax']);
  const rawTotal = pickField(rawItem, ['totalAmount', 'total_amount', 'total']);
  const lotNo = pickField(rawItem, ['lotNo', 'lot_no']);

  const qty = toNumber(rawQty) ?? 0;
  const price = toNumber(rawPrice) ?? 0;
  const totalAmount = toNumber(rawTotal) ?? qty * price;
  const cityTax = toNumber(rawCityTax) ?? 0;
  const vatTaxType =
    typeof rawVatType === 'number' || typeof rawVatType === 'string'
      ? String(rawVatType).trim() || 'VATABLE'
      : 'VATABLE';

  const itemPayload = {
    name,
    barCode,
    classificationCode,
    taxProductCode,
    measureUnit,
    qty,
    price,
    vatTaxType,
    cityTax,
    totalAmount,
  };

  if (lotNo) {
    itemPayload.data = { lotNo };
  }

  return itemPayload;
}

function summariseItems(txnData) {
  const arrays = extractItemArrays(txnData);
  const items = [];
  arrays.forEach((arr) => {
    arr.forEach((item) => {
      const payload = buildItemPayload(item);
      if (payload) items.push(payload);
    });
  });
  return items;
}

export async function getPosApiToken() {
  if (!AUTH_BASE_URL || !AUTH_REALM || !CLIENT_ID || !CLIENT_SECRET) {
    logError('Missing POSAPI authentication configuration');
    return null;
  }

  try {
    const tokenUrl = joinUrl(
      AUTH_BASE_URL,
      `/realms/${encodeURIComponent(AUTH_REALM)}/protocol/openid-connect/token`,
    );
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });
    const res = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      logError(
        `Token request failed with status ${res.status}: ${text || res.statusText}`,
      );
      return null;
    }
    const json = await res.json();
    const token = json?.access_token;
    if (typeof token !== 'string' || !token) {
      logError('Token response missing access_token');
      return null;
    }
    return token;
  } catch (error) {
    logError('Failed to retrieve POSAPI token', error);
    return null;
  }
}

export function buildReceiptFromPosTransaction(txnData, options = {}) {
  try {
    const master = extractPrimaryRecord(txnData);
    const items = summariseItems(txnData);

    const totals = {
      totalAmount:
        toNumber(
          pickField(master, ['totalAmount', 'total_amount', 'grandTotal']),
        ) ?? 0,
      totalVAT:
        toNumber(pickField(master, ['totalVAT', 'total_vat', 'vatAmount'])) ?? 0,
      totalCityTax:
        toNumber(
          pickField(master, ['totalCityTax', 'total_city_tax', 'cityTax']),
        ) ?? 0,
    };

    const branchNo =
      pickField(master, ['branchNo', 'branch_no']) || DEFAULT_BRANCH_NO;
    const posNo = pickField(master, ['posNo', 'pos_no']) || DEFAULT_POS_NO;
    const merchantTin =
      pickField(master, ['merchantTin', 'merchant_tin', 'tin']) ||
      DEFAULT_MERCHANT_TIN;
    const districtCode =
      pickField(master, ['districtCode', 'district_code']) ||
      DEFAULT_DISTRICT_CODE;

    const resolvedType =
      sanitizeReceiptType(options.posApiType) ||
      sanitizeReceiptType(options.receiptType) ||
      sanitizeReceiptType(master?.type) ||
      (RECEIPT_TYPES.has(DEFAULT_RECEIPT_TYPE)
        ? DEFAULT_RECEIPT_TYPE
        : 'B2C_RECEIPT');

    if (!branchNo || !posNo || !merchantTin || !totals.totalAmount) {
      return null;
    }

    if (!Array.isArray(items) || !items.length) {
      return null;
    }

    const taxType =
      pickField(master, ['taxType', 'tax_type']) || 'VATABLE';

    const payload = {
      branchNo,
      posNo,
      merchantTin,
      districtCode,
      totalAmount: totals.totalAmount,
      totalVAT: totals.totalVAT,
      totalCityTax: totals.totalCityTax,
      type: resolvedType,
      taxType,
      receipts: [
        {
          totalAmount: totals.totalAmount,
          taxType,
          merchantTin,
          totalVAT: totals.totalVAT,
          totalCityTax: totals.totalCityTax,
          items,
        },
      ],
    };

    if (resolvedType === 'B2B_INVOICE') {
      const customerTin =
        pickField(master, ['customerTin', 'customer_tin']) ||
        pickField(master, ['buyerTin', 'buyer_tin']);
      if (!customerTin) return null;
      payload.customerTin = customerTin;
    } else {
      const consumerNo =
        pickField(master, ['consumerNo', 'consumer_no']) ||
        pickField(master, ['customerPhone', 'phone']);
      if (consumerNo) payload.consumerNo = consumerNo;
    }

    if (districtCode) {
      payload.districtCode = districtCode;
    }

    return payload;
  } catch (error) {
    logError('Failed to build POSAPI receipt payload', error);
    return null;
  }
}

async function authorizedRequest(path, { method = 'GET', body, headers } = {}) {
  if (!POSAPI_BASE_URL) {
    logError('POSAPI base URL is not configured');
    return { success: false, error: 'POSAPI base URL is not configured' };
  }

  try {
    const token = await getPosApiToken();
    if (!token) {
      return { success: false, error: 'Unable to acquire POSAPI token' };
    }

    const url = joinUrl(POSAPI_BASE_URL, path);
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      logError(
        `POSAPI request to ${path} failed with status ${response.status}`,
      );
      return {
        success: false,
        status: response.status,
        error: data?.message || response.statusText,
        data,
      };
    }

    return { success: true, status: response.status, data };
  } catch (error) {
    logError(`POSAPI request to ${path} failed`, error);
    return { success: false, error: error.message };
  }
}

export async function sendReceipt(payload) {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'Invalid POSAPI receipt payload' };
  }
  return authorizedRequest('/rest/receipt', { method: 'POST', body: payload });
}

export async function cancelReceipt(cancelPayload) {
  if (!cancelPayload || typeof cancelPayload !== 'object') {
    return { success: false, error: 'Invalid POSAPI cancel payload' };
  }
  return authorizedRequest('/rest/receipt/cancel', {
    method: 'POST',
    body: cancelPayload,
  });
}

export async function getInformation() {
  return authorizedRequest('/rest/getInformation');
}

export async function getBankAccountInfo() {
  return authorizedRequest('/rest/getBankAccountInfo');
}

export async function getDistrictCodes() {
  return authorizedRequest('/rest/getDistrictCode');
}

export async function getVatTaxTypes() {
  return authorizedRequest('/rest/vat_tax_type');
}
