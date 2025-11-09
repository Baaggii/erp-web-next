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

function tryParseJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];
  if (
    (firstChar === '{' && lastChar === '}') ||
    (firstChar === '[' && lastChar === ']')
  ) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      return value;
    }
  }
  return value;
}

function getCaseInsensitiveKey(source, key) {
  if (!source || typeof source !== 'object') return null;
  if (!key && key !== 0) return null;
  const target = String(key);
  const lower = target.toLowerCase();
  const keys = Object.keys(source);
  for (const candidate of keys) {
    if (candidate.toLowerCase() === lower) return candidate;
  }
  return null;
}

function getValueAtPath(source, path) {
  if (!path || typeof path !== 'string') return undefined;
  const segments = path
    .split('.')
    .map((seg) => seg.trim())
    .filter(Boolean);
  if (segments.length === 0) return undefined;
  let current = source;
  for (const segment of segments) {
    if (current === undefined || current === null) return undefined;
    if (typeof current === 'string') {
      const parsed = tryParseJson(current);
      current = parsed;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    const actualKey = getCaseInsensitiveKey(current, segment);
    if (!actualKey) return undefined;
    current = current[actualKey];
  }
  if (typeof current === 'string') {
    const parsed = tryParseJson(current);
    if (parsed !== current) return parsed;
  }
  return current;
}

function toArrayValue(value) {
  if (Array.isArray(value)) return value;
  const parsed = tryParseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function ensureObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  const parsed = tryParseJson(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  return null;
}

function addWarning(warnings, message) {
  if (!message) return;
  if (!Array.isArray(warnings)) return;
  warnings.push(String(message));
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

export async function buildReceiptFromDynamicTransaction(
  record,
  mapping = {},
  typeOrOptions = null,
) {
  if (!record || typeof record !== 'object') {
    return { payload: null, warnings: [] };
  }
  const normalizedMapping =
    mapping && typeof mapping === 'object' && !Array.isArray(mapping)
      ? mapping
      : {};

  const warnings = [];
  let options = {};
  if (typeOrOptions && typeof typeOrOptions === 'object' && !Array.isArray(typeOrOptions)) {
    options = { ...typeOrOptions };
  } else if (typeof typeOrOptions === 'string') {
    options = { defaultType: typeOrOptions };
  }

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
    if (typeof key !== 'string' || !key) return undefined;
    const column = normalizedMapping[key];
    if (typeof column === 'string' && column) {
      const direct = getValueAtPath(record, column);
      if (direct !== undefined) return direct;
    }
    return undefined;
  };

  const totalAmountField = normalizedMapping.totalAmount;
  const totalAmount = toNumber(getValueAtPath(record, totalAmountField));
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
    totalVATField && typeof totalVATField === 'string'
      ? toNumber(getValueAtPath(record, totalVATField)) ?? 0
      : toNumber(getFieldValue('totalVAT')) ?? 0;
  const totalCityTaxField = normalizedMapping.totalCityTax;
  const totalCityTax =
    totalCityTaxField && typeof totalCityTaxField === 'string'
      ? toNumber(getValueAtPath(record, totalCityTaxField)) ?? 0
      : toNumber(getFieldValue('totalCityTax')) ?? 0;
  const customerTin = toStringValue(getFieldValue('customerTin'));
  const consumerNo = toStringValue(getFieldValue('consumerNo'));

  const taxTypeField = normalizedMapping.taxType;
  const taxTypeRaw = taxTypeField
    ? getValueAtPath(record, taxTypeField)
    : undefined;
  const defaultTaxType = toStringValue(taxTypeRaw) || 'VATABLE';

  const descriptionField =
    normalizedMapping.description || normalizedMapping.itemDescription;
  let description = record.description ?? record.remarks ?? '';
  if (descriptionField) {
    const descValue = getValueAtPath(record, descriptionField);
    if (descValue !== undefined && descValue !== null) {
      description = descValue;
    }
  }
  const lotNoField = normalizedMapping.lotNo;
  const lotNo = lotNoField ? toStringValue(getValueAtPath(record, lotNoField)) : '';
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

  const typeFieldCandidates = [];
  if (typeof options.typeField === 'string' && options.typeField.trim()) {
    typeFieldCandidates.push(options.typeField.trim());
  }
  if (
    typeof normalizedMapping.posApiTypeField === 'string' &&
    normalizedMapping.posApiTypeField.trim()
  ) {
    typeFieldCandidates.push(normalizedMapping.posApiTypeField.trim());
  }
  let dynamicType = '';
  for (const field of typeFieldCandidates) {
    const value = getValueAtPath(record, field);
    const normalized = toStringValue(value);
    if (normalized) {
      dynamicType = normalized;
      break;
    }
  }
  const allowedTypes = Array.isArray(options.typeOptions)
    ? options.typeOptions
        .map((entry) => toStringValue(entry))
        .filter((entry) => entry)
    : [];
  const fallbackType =
    toStringValue(options.defaultType) ||
    process.env.POSAPI_RECEIPT_TYPE ||
    toStringValue(normalizedMapping.posApiType) ||
    'B2C_RECEIPT';
  const receiptType = dynamicType || fallbackType || 'B2C_RECEIPT';
  if (allowedTypes.length && receiptType && !allowedTypes.includes(receiptType)) {
    addWarning(
      warnings,
      `Selected POSAPI type "${receiptType}" is not in the configured list of allowed types.`,
    );
  }

  const itemsField = normalizedMapping.itemsField;
  const rawItems = itemsField ? getValueAtPath(record, itemsField) : undefined;
  const itemsArray = toArrayValue(rawItems);
  const itemTaxTypeField = normalizedMapping.taxTypeField;
  const classificationCodeField = normalizedMapping.classificationCodeField;
  const taxProductCodeField = normalizedMapping.taxProductCodeField;

  const receiptsMap = new Map();
  if (Array.isArray(itemsArray) && itemsArray.length > 0) {
    itemsArray.forEach((raw, index) => {
      const itemSource = ensureObject(raw);
      if (!itemSource) {
        addWarning(
          warnings,
          `POSAPI item at index ${index + 1} is not an object and was skipped.`,
        );
        return;
      }
      const itemNameCandidates = [
        getValueAtPath(itemSource, 'name'),
        getValueAtPath(itemSource, 'itemName'),
        getValueAtPath(itemSource, 'productName'),
        getValueAtPath(itemSource, 'description'),
      ];
      let itemName = '';
      for (const candidate of itemNameCandidates) {
        itemName = toStringValue(candidate);
        if (itemName) break;
      }
      if (!itemName) itemName = 'POS Item';

      const quantity =
        toNumber(getValueAtPath(itemSource, 'qty')) ??
        toNumber(getValueAtPath(itemSource, 'quantity')) ??
        1;
      const amountFromItem =
        toNumber(getValueAtPath(itemSource, 'totalAmount')) ??
        toNumber(getValueAtPath(itemSource, 'amount')) ??
        toNumber(getValueAtPath(itemSource, 'lineTotal')) ??
        null;
      const unitPrice =
        toNumber(getValueAtPath(itemSource, 'price')) ??
        toNumber(getValueAtPath(itemSource, 'unitPrice')) ??
        toNumber(getValueAtPath(itemSource, 'unit_price')) ??
        (amountFromItem !== null && quantity ? amountFromItem / quantity : null);
      const totalAmountForItem =
        amountFromItem !== null
          ? amountFromItem
          : quantity && unitPrice !== null
          ? quantity * unitPrice
          : 0;
      const vatAmount =
        toNumber(getValueAtPath(itemSource, 'vat')) ??
        toNumber(getValueAtPath(itemSource, 'vatAmount')) ??
        toNumber(getValueAtPath(itemSource, 'totalVAT')) ??
        0;
      const cityTaxAmount =
        toNumber(getValueAtPath(itemSource, 'cityTax')) ??
        toNumber(getValueAtPath(itemSource, 'cityTaxAmount')) ??
        toNumber(getValueAtPath(itemSource, 'totalCityTax')) ??
        0;
      const itemLotValue = toStringValue(
        getValueAtPath(itemSource, 'lotNo') ||
          getValueAtPath(itemSource, 'lot_no') ||
          lotNo,
      );
      const itemTaxType =
        toStringValue(
          itemTaxTypeField ? getValueAtPath(itemSource, itemTaxTypeField) : '',
        ) || toStringValue(getValueAtPath(itemSource, 'taxType')) || defaultTaxType;
      const classificationCode = toStringValue(
        classificationCodeField
          ? getValueAtPath(itemSource, classificationCodeField)
          : getValueAtPath(itemSource, 'classificationCode'),
      );
      const taxProductCode = toStringValue(
        taxProductCodeField
          ? getValueAtPath(itemSource, taxProductCodeField)
          : getValueAtPath(itemSource, 'taxProductCode'),
      );
      const baseData = ensureObject(getValueAtPath(itemSource, 'data')) || {};
      const itemPayload = {
        name: itemName,
        qty: quantity ?? 1,
        price: unitPrice ?? totalAmountForItem,
        totalAmount: totalAmountForItem,
        vat: vatAmount,
        cityTax: cityTaxAmount,
      };
      if (classificationCode) {
        itemPayload.classificationCode = classificationCode;
      }
      if (taxProductCode) {
        itemPayload.taxProductCode = taxProductCode;
      }
      const lotSource = itemLotValue || lotNo;
      if (lotSource || Object.keys(baseData).length > 0) {
        itemPayload.data = { ...baseData };
        if (lotSource) {
          itemPayload.data.lotNo = lotSource;
        }
      }
      const receiptKey = itemTaxType || defaultTaxType;
      if (!receiptsMap.has(receiptKey)) {
        receiptsMap.set(receiptKey, {
          taxType: receiptKey,
          totalAmount: 0,
          totalVAT: 0,
          totalCityTax: 0,
          items: [],
        });
      }
      const bucket = receiptsMap.get(receiptKey);
      bucket.totalAmount += Number(totalAmountForItem || 0);
      bucket.totalVAT += Number(vatAmount || 0);
      bucket.totalCityTax += Number(cityTaxAmount || 0);
      bucket.items.push(itemPayload);
    });
  }

  let receipts = [];
  if (receiptsMap.size > 0) {
    receipts = Array.from(receiptsMap.values()).map((bucket) => ({
      totalAmount: bucket.totalAmount,
      totalVAT: bucket.totalVAT,
      totalCityTax: bucket.totalCityTax,
      taxType: bucket.taxType || defaultTaxType,
      items: bucket.items,
    }));
    const itemsTotalAmount = receipts.reduce(
      (sum, entry) => sum + Number(entry.totalAmount || 0),
      0,
    );
    const itemsTotalVat = receipts.reduce(
      (sum, entry) => sum + Number(entry.totalVAT || 0),
      0,
    );
    const itemsTotalCityTax = receipts.reduce(
      (sum, entry) => sum + Number(entry.totalCityTax || 0),
      0,
    );
    if (Math.abs(itemsTotalAmount - totalAmount) > 0.01) {
      addWarning(
        warnings,
        `Sum of line items (${itemsTotalAmount.toFixed(2)}) does not match totalAmount (${totalAmount.toFixed(2)}).`,
      );
    }
    if (Math.abs(itemsTotalVat - totalVAT) > 0.01) {
      addWarning(
        warnings,
        `Sum of item VAT (${itemsTotalVat.toFixed(2)}) does not match totalVAT (${totalVAT.toFixed(2)}).`,
      );
    }
    if (Math.abs(itemsTotalCityTax - totalCityTax) > 0.01) {
      addWarning(
        warnings,
        `Sum of item city tax (${itemsTotalCityTax.toFixed(2)}) does not match totalCityTax (${totalCityTax.toFixed(2)}).`,
      );
    }
  }

  if (receipts.length === 0) {
    const fallbackItem = {
      name: description ? String(description) : 'POS Transaction',
      qty: 1,
      price: totalAmount,
      totalAmount,
      vat: totalVAT,
      cityTax: totalCityTax,
    };
    if (lotNo) {
      fallbackItem.data = { lotNo };
    }
    receipts = [
      {
        totalAmount,
        totalVAT,
        totalCityTax,
        taxType: defaultTaxType,
        items: [fallbackItem],
      },
    ];
  }

  const payload = {
    branchNo,
    merchantTin,
    posNo,
    type: receiptType,
    totalAmount,
    totalVAT,
    totalCityTax,
    receipts,
  };
  if (districtCode) payload.districtCode = districtCode;
  if (customerTin) payload.customerTin = customerTin;
  if (consumerNo) payload.consumerNo = consumerNo;

  const paymentsField = normalizedMapping.paymentsField;
  if (paymentsField) {
    const paymentsRaw = getValueAtPath(record, paymentsField);
    const paymentsArray = toArrayValue(paymentsRaw);
    const normalizedPayments = [];
    paymentsArray.forEach((entry, index) => {
      const paymentSource = ensureObject(entry);
      if (!paymentSource) {
        addWarning(
          warnings,
          `Payment entry ${index + 1} is not an object and was skipped.`,
        );
        return;
      }
      const paymentType = toStringValue(
        getValueAtPath(paymentSource, 'type') ||
          getValueAtPath(paymentSource, 'paymentType') ||
          getValueAtPath(paymentSource, 'method') ||
          getValueAtPath(paymentSource, 'code'),
      );
      const paymentAmount =
        toNumber(getValueAtPath(paymentSource, 'amount')) ??
        toNumber(getValueAtPath(paymentSource, 'value')) ??
        toNumber(getValueAtPath(paymentSource, 'paidAmount')) ??
        null;
      if (!paymentType || paymentAmount === null) {
        addWarning(
          warnings,
          `Payment entry ${index + 1} is missing a type or amount and was skipped.`,
        );
        return;
      }
      const payment = { type: paymentType, amount: paymentAmount };
      const currency = toStringValue(getValueAtPath(paymentSource, 'currency'));
      if (currency) payment.currency = currency;
      normalizedPayments.push(payment);
    });
    if (normalizedPayments.length > 0) {
      payload.payments = normalizedPayments;
      const paymentsTotal = normalizedPayments.reduce(
        (sum, entry) => sum + Number(entry.amount || 0),
        0,
      );
      if (Math.abs(paymentsTotal - totalAmount) > 0.01) {
        addWarning(
          warnings,
          `Payments total (${paymentsTotal.toFixed(2)}) does not match totalAmount (${totalAmount.toFixed(2)}).`,
        );
      }
    }
  }

  return { payload, warnings };
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
