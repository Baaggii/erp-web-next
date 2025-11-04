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

function resolveTimeoutMs(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function getDefaultTimeoutMs() {
  return (
    resolveTimeoutMs(process.env.POSAPI_TIMEOUT_MS) ??
    resolveTimeoutMs(process.env.POSAPI_REQUEST_TIMEOUT) ??
    15000
  );
}

function createAbortController(timeoutMs) {
  const resolved = resolveTimeoutMs(timeoutMs) ?? getDefaultTimeoutMs();
  if (!resolved) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolved);
  return { controller, timer, timeoutMs: resolved };
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
  const baseUrl = trimEndSlash(process.env.POSAPI_EBARIMT_URL || '');
  if (!baseUrl) {
    throw new Error('POSAPI_EBARIMT_URL is not configured');
  }
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const fetchFn = await getFetch();
  const abortConfig = createAbortController();
  try {
    const res = await fetchFn(url, {
      method,
      headers: {
        ...(headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      signal: abortConfig?.controller.signal,
    });
    if (!res.ok) {
      let text = '';
      let parsedBody = null;
      try {
        text = await res.text();
        if (text) {
          parsedBody = JSON.parse(text);
        }
      } catch {
        parsedBody = null;
      }
      let messageText = res.statusText;
      if (text && text.trim()) {
        messageText = text.trim();
      } else if (parsedBody && typeof parsedBody === 'object') {
        if (typeof parsedBody.message === 'string' && parsedBody.message.trim()) {
          messageText = parsedBody.message.trim();
        } else if (
          typeof parsedBody.error_description === 'string' &&
          parsedBody.error_description.trim()
        ) {
          messageText = parsedBody.error_description.trim();
        } else if (
          typeof parsedBody.error === 'string' &&
          parsedBody.error.trim()
        ) {
          messageText = parsedBody.error.trim();
        }
      }
      const err = new Error(
        `POSAPI request failed with status ${res.status}: ${messageText}`,
      );
      err.status = res.status;
      if (parsedBody) {
        err.body = parsedBody;
        if (parsedBody.details !== undefined) {
          err.details = parsedBody.details;
        }
      } else if (text) {
        err.body = text;
      }
      throw err;
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return res.text();
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(
        `POSAPI request timed out after ${abortConfig?.timeoutMs ?? 0} ms`,
      );
      timeoutErr.code = 'POSAPI_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  } finally {
    if (abortConfig?.timer) {
      clearTimeout(abortConfig.timer);
    }
  }
}

export async function getPosApiToken() {
  const baseUrl = trimEndSlash(process.env.POSAPI_AUTH_URL || '');
  const realm = process.env.POSAPI_AUTH_REALM || '';
  const clientId = process.env.POSAPI_CLIENT_ID || '';
  const clientSecret = process.env.POSAPI_CLIENT_SECRET || '';
  if (!baseUrl || !realm || !clientId || !clientSecret) {
    throw new Error('POSAPI authentication environment variables are not fully configured');
  }
  const tokenUrl = `${baseUrl}/realms/${realm}/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);
  const fetchFn = await getFetch();
  const abortConfig = createAbortController();
  try {
    const res = await fetchFn(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: abortConfig?.controller.signal,
    });
    if (!res.ok) {
      let text = '';
      let parsedBody = null;
      try {
        text = await res.text();
        if (text) {
          parsedBody = JSON.parse(text);
        }
      } catch {
        parsedBody = null;
      }
      let messageText = res.statusText;
      if (text && text.trim()) {
        messageText = text.trim();
      } else if (parsedBody && typeof parsedBody === 'object') {
        if (
          typeof parsedBody.error_description === 'string' &&
          parsedBody.error_description.trim()
        ) {
          messageText = parsedBody.error_description.trim();
        } else if (typeof parsedBody.message === 'string' && parsedBody.message.trim()) {
          messageText = parsedBody.message.trim();
        } else if (typeof parsedBody.error === 'string' && parsedBody.error.trim()) {
          messageText = parsedBody.error.trim();
        }
      }
      const err = new Error(
        `Failed to retrieve POSAPI token (${res.status}): ${messageText}`,
      );
      err.status = res.status;
      if (parsedBody) {
        err.body = parsedBody;
        if (parsedBody.error_description) {
          err.details = parsedBody.error_description;
        }
      } else if (text) {
        err.body = text;
      }
      throw err;
    }
    const json = await res.json();
    if (!json?.access_token) {
      throw new Error('POSAPI token response missing access_token');
    }
    return json.access_token;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(
        `POSAPI token request timed out after ${abortConfig?.timeoutMs ?? 0} ms`,
      );
      timeoutErr.code = 'POSAPI_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  } finally {
    if (abortConfig?.timer) {
      clearTimeout(abortConfig.timer);
    }
  }
}

export function buildReceiptFromDynamicTransaction(record, mapping = {}, type) {
  if (!record || typeof record !== 'object') return null;
  const normalizedMapping =
    mapping && typeof mapping === 'object' && !Array.isArray(mapping)
      ? mapping
      : {};
  const getFieldValue = (key) => {
    const column = normalizedMapping[key];
    if (typeof column !== 'string' || !column) return undefined;
    return record[column];
  };
  const totalAmount = toNumber(getFieldValue('totalAmount'));
  if (totalAmount === null) {
    return null;
  }
  const totalVAT = toNumber(getFieldValue('totalVAT')) ?? 0;
  const totalCityTax = toNumber(getFieldValue('totalCityTax')) ?? 0;
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
  const branchNo = process.env.POSAPI_BRANCH_NO || '';
  const merchantTin = process.env.POSAPI_MERCHANT_TIN || '';
  const posNo = process.env.POSAPI_POS_NO || '';
  const districtCode = process.env.POSAPI_DISTRICT_CODE || '';
  if (!branchNo || !merchantTin || !posNo) {
    return null;
  }
  const receiptType = type || process.env.POSAPI_RECEIPT_TYPE || 'B2C_RECEIPT';
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
