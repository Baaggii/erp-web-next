function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function addLookupEntry(map, key, value) {
  if (!key || !value) return;
  const lower = key.toLowerCase();
  if (!map.has(lower)) {
    map.set(lower, value);
  }
  const underscored = lower.replace(/[^a-z0-9]+/g, '_');
  if (underscored && !map.has(underscored)) {
    map.set(underscored, value);
  }
  const stripped = lower.replace(/[^a-z0-9]+/g, '');
  if (stripped && !map.has(stripped)) {
    map.set(stripped, value);
  }
}

export function createColumnLookup(source) {
  const map = new Map();
  if (!source) return map;
  if (source instanceof Map) {
    for (const [key, value] of source.entries()) {
      const column = typeof value === 'string' && value ? value : key;
      if (typeof column === 'string' && column) {
        addLookupEntry(map, column, column);
      }
    }
    return map;
  }
  if (Array.isArray(source)) {
    source.forEach((column) => {
      if (typeof column === 'string' && column) {
        addLookupEntry(map, column, column);
      }
    });
    return map;
  }
  if (isPlainObject(source)) {
    Object.keys(source).forEach((column) => {
      if (typeof column === 'string' && column) {
        addLookupEntry(map, column, column);
      }
    });
  }
  return map;
}

function tokenizePath(path) {
  if (typeof path !== 'string' || !path) return [];
  const tokens = [];
  const regex = /([^\.\[\]]+)|(\[(\d+)\])|(\[\])/g;
  let match;
  while ((match = regex.exec(path))) {
    if (match[1]) {
      tokens.push(match[1]);
    } else if (match[3] !== undefined) {
      tokens.push(Number(match[3]));
    } else if (match[0] === '[]') {
      tokens.push('[]');
    }
  }
  return tokens;
}

export function extractPosApiFieldValue(response, path) {
  if (!path) return undefined;
  if (!response || typeof response !== 'object') return undefined;
  const tokens = tokenizePath(path);
  if (!tokens.length) return undefined;
  let current = response;
  for (const token of tokens) {
    if (current === undefined || current === null) return undefined;
    if (typeof token === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[token];
      continue;
    }
    if (token === '[]') {
      if (!Array.isArray(current)) return undefined;
      current = current[0];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = current[token];
  }
  return current;
}

const SPECIAL_FIELD_CANDIDATES = new Map([
  ['lottery', ['lottery', 'lottery_no', 'lottery_number', 'ddtd']],
  ['qrdata', ['qr_data', 'qrdata', 'qr_code']],
  ['qr_code', ['qr_code', 'qr_data', 'qrdata']],
  ['qr_data', ['qr_data', 'qr_code', 'qrdata']],
  ['status', ['posapi_status', 'receipt_status', 'status', 'ebarimt_status']],
  ['billid', ['bill_id', 'billid', 'receipt_no', 'receipt_number', 'ebarimt_id']],
  ['id', ['ebarimt_id', 'posapi_id', 'receipt_id', 'tax_receipt_id', 'bill_id']],
  ['receiptid', ['receipt_id', 'posapi_id', 'ebarimt_id', 'bill_id']],
  ['receiptstatus', ['receipt_status', 'posapi_status', 'status']],
]);

function normalizeKey(key) {
  if (typeof key !== 'string') return '';
  return key.trim().toLowerCase();
}

function sanitizeKey(key) {
  return normalizeKey(key).replace(/[^a-z0-9]+/g, '');
}

function findColumnForField(columnLookup, field) {
  if (!(columnLookup instanceof Map)) return null;
  const normalized = normalizeKey(field);
  if (!normalized) return null;
  const stripped = sanitizeKey(field);
  const candidates = new Set([
    normalized,
    normalized.replace(/[^a-z0-9]+/g, '_'),
    stripped,
  ]);
  const special = SPECIAL_FIELD_CANDIDATES.get(stripped) || SPECIAL_FIELD_CANDIDATES.get(normalized);
  if (Array.isArray(special)) {
    special.forEach((cand) => candidates.add(cand));
    special
      .map((cand) => cand.replace(/[^a-z0-9]+/g, ''))
      .forEach((cand) => candidates.add(cand));
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    const column = columnLookup.get(candidate);
    if (!column) continue;
    if (column.toLowerCase() === 'id') continue;
    return column;
  }
  return null;
}

function shouldPersistValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'number' && Number.isNaN(value)) return false;
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (typeof value === 'object') {
    if (value instanceof Date) return true;
    return Object.keys(value).length > 0;
  }
  return true;
}

function normalizePersistValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

function getLastToken(path) {
  if (typeof path !== 'string') return '';
  const tokens = tokenizePath(path);
  if (!tokens.length) return '';
  const last = tokens[tokens.length - 1];
  return typeof last === 'number' ? String(last) : last;
}

export function computePosApiUpdates(columnLookup, response, options = {}) {
  if (!(columnLookup instanceof Map)) return {};
  if (!response || typeof response !== 'object') return {};
  const fieldsFromPosApi = Array.isArray(options.fieldsFromPosApi)
    ? options.fieldsFromPosApi.filter((field) => typeof field === 'string' && field.trim())
    : [];
  const responseFieldMapping =
    options.responseFieldMapping && typeof options.responseFieldMapping === 'object'
      ? options.responseFieldMapping
      : {};
  const entries = [];

  const pushEntry = (key, value) => {
    if (!shouldPersistValue(value)) return;
    entries.push({ key, value });
  };

  const firstReceipt = Array.isArray(response.receipts) ? response.receipts[0] : null;

  if (response.status !== undefined) pushEntry('status', response.status);
  if (response.id !== undefined) pushEntry('id', response.id);
  if (response.billId !== undefined) pushEntry('billId', response.billId);

  if (firstReceipt && typeof firstReceipt === 'object') {
    if (firstReceipt.billId !== undefined) pushEntry('billId', firstReceipt.billId);
    if (firstReceipt.id !== undefined) pushEntry('receiptId', firstReceipt.id);
    if (firstReceipt.status !== undefined) pushEntry('receiptStatus', firstReceipt.status);
  }

  fieldsFromPosApi.forEach((fieldPath) => {
    const value = extractPosApiFieldValue(response, fieldPath);
    if (value === undefined) return;
    const key = getLastToken(fieldPath) || fieldPath;
    pushEntry(key, value);
  });

  Object.entries(responseFieldMapping).forEach(([fieldPath, targetColumn]) => {
    if (typeof fieldPath !== 'string' || !fieldPath.trim()) return;
    const value = extractPosApiFieldValue(response, fieldPath.trim());
    if (value === undefined) return;
    const columnName =
      typeof targetColumn === 'string'
        ? targetColumn.trim()
        : targetColumn && typeof targetColumn === 'object'
          ? String(
              targetColumn.column ||
                targetColumn.value ||
                targetColumn.path ||
                targetColumn.field ||
                '',
            ).trim()
          : '';
    const mappedColumn = findColumnForField(columnLookup, columnName || fieldPath.trim()) || columnName || fieldPath.trim();
    if (!mappedColumn) return;
    pushEntry(mappedColumn, value);
  });

  const updates = {};
  entries.forEach(({ key, value }) => {
    const column = findColumnForField(columnLookup, key) || key;
    if (!column) return;
    if (Object.prototype.hasOwnProperty.call(updates, column)) return;
    updates[column] = normalizePersistValue(value);
  });
  return updates;
}
