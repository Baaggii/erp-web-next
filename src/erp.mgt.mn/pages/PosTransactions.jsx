import React, {
  useEffect,
  useState,
  useRef,
  useContext,
  useMemo,
  useCallback,
} from 'react';
import formatTimestamp from '../utils/formatTimestamp.js';
import RowFormModal from '../components/RowFormModal.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import buildImageName from '../utils/buildImageName.js';
import slugify from '../utils/slugify.js';
import { debugLog } from '../utils/debug.js';
import { syncCalcFields, normalizeCalcFieldConfig } from '../utils/syncCalcFields.js';
import { preserveManualChangesAfterRecalc } from '../utils/preserveManualChanges.js';
import { fetchTriggersForTables } from '../utils/fetchTriggersForTables.js';
import { valuesEqual } from '../utils/generatedColumns.js';
import { hasTransactionFormAccess } from '../utils/transactionFormAccess.js';
import { resolveWorkplacePositionForContext } from '../utils/workplaceResolver.js';
import normalizeRelationKey from '../utils/normalizeRelationKey.js';
import {
  isModuleLicensed,
  isModulePermissionGranted,
} from '../utils/moduleAccess.js';
import { withPosApiEndpointMetadata } from '../utils/posApiConfig.js';
import {
  isPlainRecord,
  assignArrayMetadata,
  cloneArrayWithMetadata,
  serializeRowsWithMetadata,
  serializeValuesForTransport,
  restoreValuesFromTransport,
  cloneValuesForRecalc,
  createGeneratedColumnPipeline,
  recalcTotals as recalcPosTotals,
} from '../utils/transactionValues.js';

export { syncCalcFields };
export { preserveManualChangesAfterRecalc } from '../utils/preserveManualChanges.js';

function truncateValue(value, maxLength = 200) {
  if (typeof value !== 'string') return value;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

function toReadableString(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
}

function addRelationRowEntry(map, key, row) {
  if (!map || key === undefined || key === null) return;
  if (!Object.prototype.hasOwnProperty.call(map, key)) {
    map[key] = row;
  }
  const stringKey = typeof key === 'string' ? key : String(key);
  if (!Object.prototype.hasOwnProperty.call(map, stringKey)) {
    map[stringKey] = row;
  }
  const normalizedKey = normalizeRelationKey(key);
  if (
    normalizedKey !== null &&
    normalizedKey !== undefined &&
    !Object.prototype.hasOwnProperty.call(map, normalizedKey)
  ) {
    map[normalizedKey] = row;
  }
}

function humanizeKeyName(key) {
  if (!key || typeof key !== 'string') return key;
  const withSpaces = key
    .replace(/[_\-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return withSpaces.replace(/(^|\s)\w/g, (match) => match.toUpperCase());
}

function stringifyDetailed(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return String(value);
  }
}

function buildPosApiPayloadSummary(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const parts = [];
  const add = (label, raw) => {
    if (raw === undefined || raw === null) return;
    const str = toReadableString(raw);
    if (!str) return;
    parts.push(`${label}: ${truncateValue(str, 120)}`);
  };

  add('Branch', payload.branchNo);
  add('POS', payload.posNo);
  add('Merchant TIN', payload.merchantTin);
  add('Receipt type', payload.type);
  add('District', payload.districtCode);
  add('Customer TIN', payload.customerTin);
  add('Consumer No', payload.consumerNo);
  add('Total amount', payload.totalAmount);
  add('Total VAT', payload.totalVAT);
  add('Total city tax', payload.totalCityTax);

  if (Array.isArray(payload.receipts) && payload.receipts.length > 0) {
    const receipt = payload.receipts[0] || {};
    add('Receipt count', payload.receipts.length);
    add('Receipt total', receipt.totalAmount ?? receipt.total);
    add('Receipt VAT', receipt.totalVAT ?? receipt.vat);
    if (Array.isArray(receipt.items) && receipt.items.length > 0) {
      const firstItem = receipt.items[0] || {};
      add('Item count', receipt.items.length);
      add('First item', firstItem.name);
      add('First item price', firstItem.price ?? firstItem.totalAmount);
    }
  }

  return parts.join('\n');
}

function buildPosApiResponseSummary(response) {
  if (!response || typeof response !== 'object') return '';
  const parts = [];
  const seen = new Set();

  const add = (label, raw, key) => {
    if (raw === undefined || raw === null) return;
    const str = toReadableString(raw);
    if (!str) return;
    const normalizedKey = key || label;
    if (normalizedKey) seen.add(normalizedKey);
    parts.push(`${label}: ${truncateValue(str, 160)}`);
  };

  add('Bill ID', response.billId, 'billId');
  add('Inactive ID', response.inactiveId, 'inactiveId');
  add('Lottery number', response.lottery, 'lottery');
  if (response.qrData) {
    const qrData = String(response.qrData);
    parts.push(
      `QR data: ${truncateValue(qrData, 160)}${
        qrData.length > 160 ? ` (length ${qrData.length})` : ''
      }`,
    );
    seen.add('qrData');
  }
  add('Status', response.status, 'status');
  add('Code', response.code, 'code');
  add('Message', response.message, 'message');
  add('Customer name', response.customerName, 'customerName');

  Object.entries(response).forEach(([key, value]) => {
    if (seen.has(key)) return;
    if (value === undefined || value === null) return;
    if (typeof value === 'object') return;
    const readable = toReadableString(value);
    if (!readable) return;
    parts.push(`${humanizeKeyName(key)}: ${truncateValue(readable, 160)}`);
  });

  return parts.join('\n');
}

function normalizePreviewValue(value) {
  if (value === undefined || value === null) return '';
  const str = typeof value === 'string' ? value.trim() : String(value);
  return str.trim();
}

function pickFirstNonEmpty(values = []) {
  for (const value of values) {
    const normalized = normalizePreviewValue(value);
    if (normalized) return normalized;
  }
  return '';
}

function extractQrDataFromResponse(response, visited = new Set()) {
  if (!response || typeof response !== 'object') return '';
  if (visited.has(response)) return '';
  visited.add(response);
  const direct = pickFirstNonEmpty([
    response.qrData,
    response.qr_code,
    response.qrCode,
    response.qrdata,
  ]);
  if (direct) return direct;
  const receipts = Array.isArray(response.receipts) ? response.receipts : [];
  for (const receipt of receipts) {
    const receiptQr = extractQrDataFromResponse(receipt, visited);
    if (receiptQr) return receiptQr;
  }
  if (response.data && typeof response.data === 'object') {
    const nested = extractQrDataFromResponse(response.data, visited);
    if (nested) return nested;
  }
  return '';
}

function buildEbarimtPreviewData(result) {
  if (!result || typeof result !== 'object') return null;
  const response = result?.posApi?.response || {};
  const invoice = result?.invoice || {};
  const billId = pickFirstNonEmpty([
    result.billId,
    result.billid,
    invoice.ebarimt_id,
    invoice.bill_id,
    response.billId,
    response.billid,
    response.receiptId,
    response.receipt_id,
    response.ebarimt_id,
  ]);
  const status = pickFirstNonEmpty([result.status, invoice.status, response.status]);
  const invoiceNo = pickFirstNonEmpty([
    invoice.invoice_no,
    invoice.invoiceNo,
    invoice.invoice_number,
  ]);
  const errorMessage = pickFirstNonEmpty([
    result.errorMessage,
    invoice.error_message,
    response.message,
    response.error,
  ]);
  const lottery = pickFirstNonEmpty([
    response.lottery,
    response.lotteryNo,
    response.lottery_number,
  ]);
  const qrData = pickFirstNonEmpty([extractQrDataFromResponse(response)]);
  return { billId, status, invoiceNo, errorMessage, qrData, lottery };
}

function buildPosApiToastMessage(title, data, summaryBuilder) {
  if (data === undefined || data === null) return '';
  const parts = [];
  const summary = summaryBuilder ? summaryBuilder(data) : '';
  if (summary) parts.push(summary);
  const detailed = stringifyDetailed(data);
  if (detailed) {
    const truncated = truncateValue(detailed, 2000);
    parts.push(truncated);
  }
  if (parts.length === 0) return '';
  return `${title}\n${parts.join('\n\n')}`;
}

function normalizeValueForComparison(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
    return trimmed;
  }
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value.getTime();
  return value;
}

function valuesApproximatelyEqual(a, b) {
  if (a === undefined && b === undefined) return true;
  const normA = normalizeValueForComparison(a);
  const normB = normalizeValueForComparison(b);
  if (normA === undefined && normB === undefined) return true;
  if (normA === undefined || normB === undefined) return false;
  if (typeof normA === 'number' && typeof normB === 'number') {
    return Math.abs(normA - normB) <= 1e-6;
  }
  return normA === normB;
}

function compareCellValues(actualContainer, expectedContainer, field) {
  const actualIsArray = Array.isArray(actualContainer);
  const expectedIsArray = Array.isArray(expectedContainer);

  if (actualIsArray || expectedIsArray) {
    const actualRows = actualIsArray ? actualContainer : [];
    const expectedRows = expectedIsArray ? expectedContainer : [];
    const max = Math.max(actualRows.length, expectedRows.length);

    for (let idx = 0; idx < max; idx += 1) {
      const actualRow = actualRows[idx];
      const expectedRow = expectedRows[idx];
      const actualValue = isPlainRecord(actualRow)
        ? actualRow[field]
        : undefined;
      const expectedValue = isPlainRecord(expectedRow)
        ? expectedRow[field]
        : undefined;

      if (!valuesApproximatelyEqual(actualValue, expectedValue)) {
        return {
          rowIndex: idx,
          actual: actualValue,
          expected: expectedValue,
        };
      }
    }

    return null;
  }

  if (isPlainRecord(actualContainer) || isPlainRecord(expectedContainer)) {
    const actualValue = isPlainRecord(actualContainer)
      ? actualContainer[field]
      : undefined;
    const expectedValue = isPlainRecord(expectedContainer)
      ? expectedContainer[field]
      : undefined;

    if (!valuesApproximatelyEqual(actualValue, expectedValue)) {
      return { actual: actualValue, expected: expectedValue };
    }
  }

  return null;
}

function getCalcFieldCells(map) {
  if (!map || typeof map !== 'object') return [];
  if (Array.isArray(map.__normalizedCalcCells)) {
    return map.__normalizedCalcCells;
  }
  const rawCells = Array.isArray(map?.cells) ? map.cells : [];
  return rawCells.filter(
    (cell) =>
      cell &&
      typeof cell.table === 'string' &&
      cell.table &&
      typeof cell.field === 'string' &&
      cell.field,
  );
}

export function findCalcFieldMismatch(data, calcFields, options = {}) {
  const hasCalc = Array.isArray(calcFields) && calcFields.length > 0;
  const posFieldList = Array.isArray(options?.posFields)
    ? options.posFields.filter((entry) => Array.isArray(entry?.parts) && entry.parts.length >= 2)
    : [];

  if (!hasCalc && posFieldList.length === 0) return null;

  const tablesFilter = Array.isArray(options?.tables)
    ? new Set(
        options.tables
          .map((table) => (typeof table === 'string' ? table.trim() : ''))
          .filter(Boolean),
      )
    : null;

  const base = data && typeof data === 'object' ? data : {};
  const expected = syncCalcFields(base, calcFields);

  for (const map of calcFields) {
    const cells = getCalcFieldCells(map);

    if (cells.length < 2) continue;

    for (const cell of cells) {
      if (tablesFilter && !tablesFilter.has(cell.table)) continue;
      const actualContainer = base[cell.table];
      const expectedContainer = expected[cell.table];
      const mismatch = compareCellValues(actualContainer, expectedContainer, cell.field);

      if (mismatch) {
        const location = [cell.table, cell.field].filter(Boolean).join('.');
        const rowHint =
          typeof mismatch.rowIndex === 'number' ? ` (row ${mismatch.rowIndex + 1})` : '';
        const messageParts = [];
        if (map?.name) {
          messageParts.push(`Map ${map.name}`);
        }
        messageParts.push(`Mismatch for ${location}${rowHint}`);
        if (mismatch.expected !== undefined && mismatch.expected !== null) {
          messageParts.push(`expected ${mismatch.expected}`);
        }
        if (mismatch.actual !== undefined && mismatch.actual !== null) {
          messageParts.push(`found ${mismatch.actual}`);
        }
        return {
          map,
          table: cell.table,
          field: cell.field,
          message: messageParts.join(': '),
          ...mismatch,
        };
      }
    }
  }

  for (const entry of posFieldList) {
    const parts = Array.isArray(entry?.parts) ? entry.parts : [];
    if (parts.length < 2) continue;
    const target = parts[0];
    if (!target?.table || !target?.field) continue;
    if (tablesFilter && !tablesFilter.has(target.table)) continue;

    const actualContainer = base[target.table];
    const expectedContainer = expectedValues[target.table];
    const mismatch = compareCellValues(actualContainer, expectedContainer, target.field);

    if (!mismatch) continue;

    const location = [target.table, target.field].filter(Boolean).join('.');
    const rowHint =
      typeof mismatch.rowIndex === 'number' ? ` (row ${mismatch.rowIndex + 1})` : '';
    const messageParts = [];
    if (entry?.name) {
      messageParts.push(`POS ${entry.name}`);
    }
    messageParts.push(`Mismatch for ${location}${rowHint}`);
    if (mismatch.expected !== undefined && mismatch.expected !== null) {
      messageParts.push(`expected ${mismatch.expected}`);
    }
    if (mismatch.actual !== undefined && mismatch.actual !== null) {
      messageParts.push(`found ${mismatch.actual}`);
    }

    return {
      map: entry,
      table: target.table,
      field: target.field,
      message: messageParts.join(': '),
      ...mismatch,
    };
  }

  return null;
}


function isEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function hash(obj) {
  let str;
  try {
    str = JSON.stringify(obj);
  } catch {
    str = '';
  }
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export function extractSessionFieldsFromConfig(config) {
  if (!config) return [];
  const fields = [];
  const seen = new Set();
  const addField = (table, field) => {
    if (!table || !field) return;
    const tableName = String(table);
    const fieldName = String(field);
    const key = `${tableName}::${fieldName}`;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push({ table: tableName, field: fieldName });
  };
  const isSessionField = (name) =>
    typeof name === 'string' && name.toLowerCase().includes('session');
  (config.calcFields || []).forEach((row = {}) => {
    const cells = Array.isArray(row.cells) ? row.cells : [];
    if (cells.length === 0) return;
    const hasSessionField = cells.some((cell) => isSessionField(cell?.field));
    cells.forEach((cell = {}) => {
      if (!cell.table || !cell.field) return;
      if (hasSessionField || isSessionField(cell.field)) {
        addField(cell.table, cell.field);
      }
    });
  });
  (config.posFields || []).forEach((p = {}) => {
    const parts = Array.isArray(p.parts) ? p.parts : [];
    parts.forEach((part = {}) => {
      if (!part.table || !part.field) return;
      if (isSessionField(part.field)) {
        addField(part.table, part.field);
      }
    });
  });
  fields.sort((a, b) => {
    const tableA = a.table;
    const tableB = b.table;
    if (tableA === tableB) {
      return a.field.localeCompare(b.field);
    }
    return tableA.localeCompare(tableB);
  });
  return fields;
}

function normalizeIdentifier(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

const DEFAULT_EDITABLE_NESTED_KEYS = [
  'fields',
  'fieldList',
  'fieldSet',
  'list',
  'values',
  'columns',
  'items',
  'editableFields',
  'editableDefaultFields',
  'allowedFields',
  'permittedFields',
];

function walkEditableFieldValues(source, callback, options = {}) {
  if (typeof callback !== 'function') return;

  const skipKeys = new Set([
    'hasExplicitConfig',
    '__proto__',
    ...(Array.isArray(options.skipKeys) ? options.skipKeys : []),
  ]);
  const nestedKeySet = new Set(
    Array.isArray(options.nestedKeys)
      ? options.nestedKeys
      : DEFAULT_EDITABLE_NESTED_KEYS,
  );
  const visited = new Set();

  const visit = (value) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' || typeof value === 'number') {
      const raw = String(value).trim();
      if (!raw) return;
      callback(raw);
      return;
    }
    if (value instanceof Set) {
      value.forEach(visit);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value instanceof Map) {
      value.forEach((enabled, key) => {
        if (!enabled) return;
        visit(key);
      });
      return;
    }
    if (!isPlainRecord(value)) return;
    if (visited.has(value)) return;
    visited.add(value);

    nestedKeySet.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        visit(value[key]);
      }
    });

    Object.entries(value).forEach(([key, val]) => {
      if (skipKeys.has(key) || nestedKeySet.has(key)) return;
      if (val === undefined || val === null) return;
      if (typeof val === 'boolean') {
        if (val) visit(key);
        return;
      }
      if (typeof val === 'number' || typeof val === 'string') {
        visit(key);
        return;
      }
      if (val instanceof Set || Array.isArray(val) || val instanceof Map) {
        visit(val);
        return;
      }
      if (isPlainRecord(val)) {
        const flag =
          Object.prototype.hasOwnProperty.call(val, 'editable')
            ? val.editable
            : Object.prototype.hasOwnProperty.call(val, 'enabled')
            ? val.enabled
            : Object.prototype.hasOwnProperty.call(val, 'allow')
            ? val.allow
            : Object.prototype.hasOwnProperty.call(val, 'allowed')
            ? val.allowed
            : null;
        if (flag) visit(key);
        visit(val);
      }
    });
  };

  visit(source);
}

const LOCK_TRUE_VALUES = new Set([
  'true',
  '1',
  'yes',
  'y',
  'locked',
  'readonly',
  'read-only',
  'noneditable',
  'non-editable',
  'disabled',
  'blocked',
  'forbidden',
  'prevent_edit',
  'prevent-edit',
  'noedit',
]);

const LOCK_FALSE_VALUES = new Set([
  'false',
  '0',
  'no',
  'n',
  'editable',
  'unlocked',
  'allow',
  'allowed',
  'enabled',
  'enable',
  'write',
  'writable',
  'edit',
]);

function coerceLockBoolean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = normalizeIdentifier(String(value));
  if (!normalized) return null;
  const token = normalized.toLowerCase();
  if (LOCK_TRUE_VALUES.has(token)) return true;
  if (LOCK_FALSE_VALUES.has(token)) return false;
  return null;
}

function normalizeLockDescriptor(raw, fallbackTable, fallbackField) {
  if (!raw || typeof raw !== 'object') return null;

  let table =
    normalizeIdentifier(raw.table) ||
    normalizeIdentifier(raw.table_name) ||
    normalizeIdentifier(raw.tableName) ||
    normalizeIdentifier(raw.tbl) ||
    normalizeIdentifier(raw.target?.table) ||
    normalizeIdentifier(raw.cell?.table);
  let field =
    normalizeIdentifier(raw.field) ||
    normalizeIdentifier(raw.field_name) ||
    normalizeIdentifier(raw.fieldName) ||
    normalizeIdentifier(raw.column) ||
    normalizeIdentifier(raw.column_name) ||
    normalizeIdentifier(raw.columnName) ||
    normalizeIdentifier(raw.target?.field) ||
    normalizeIdentifier(raw.cell?.field);

  if (!table && normalizeIdentifier(fallbackTable)) table = normalizeIdentifier(fallbackTable);
  if (!field && normalizeIdentifier(fallbackField)) field = normalizeIdentifier(fallbackField);
  if (!table || !field) return null;

  const explicitNonEditable = coerceLockBoolean(
    raw.nonEditable ??
      raw.locked ??
      raw.isLocked ??
      raw.readOnly ??
      raw.readonly ??
      raw.disabled ??
      raw.preventEdit ??
      raw['prevent_edit'],
  );
  const explicitEditable = coerceLockBoolean(
    raw.editable ?? raw.canEdit ?? raw.allowEdit ?? raw.isEditable ?? raw.enabled,
  );

  let nonEditable = explicitNonEditable;
  if (nonEditable === null && explicitEditable !== null) {
    nonEditable = !explicitEditable;
  }
  if (nonEditable === null) {
    const mode = coerceLockBoolean(raw.mode ?? raw.lockMode ?? raw.accessMode ?? raw.permission);
    if (mode !== null) nonEditable = mode;
  }
  if (nonEditable === null) {
    const status = coerceLockBoolean(
      raw.status ?? raw.lockStatus ?? raw.state ?? raw.stage,
    );
    if (status !== null) nonEditable = status;
  }
  if (nonEditable === null) nonEditable = false;

  const reasons = new Set();
  const addReason = (value) => {
    if (value === undefined || value === null) return;
    const str = String(value).trim();
    if (!str) return;
    reasons.add(str);
  };

  const candidates = [
    raw.reasonCodes,
    raw.reasonCode,
    raw.reasons,
    raw.reason,
    raw.codes,
    raw.code,
    raw.tags,
    raw.tag,
    raw.messages,
    raw.message,
    raw.lockReason,
    raw.lockReasons,
    raw.lock_code,
    raw.lockCode,
  ];
  candidates.forEach((candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach(addReason);
    } else {
      addReason(candidate);
    }
  });

  return {
    table,
    field,
    nonEditable: Boolean(nonEditable),
    reasons: Array.from(reasons),
  };
}

function extractLockDescriptors(entry = {}) {
  const descriptorMap = new Map();

  const registerDescriptor = (raw, fallbackTable, fallbackField) => {
    const normalized = normalizeLockDescriptor(raw, fallbackTable, fallbackField);
    if (!normalized) return;
    const tableKey = normalized.table.toLowerCase();
    const fieldKey = normalized.field.toLowerCase();
    const key = `${tableKey}::${fieldKey}`;
    let existing = descriptorMap.get(key);
    if (!existing) {
      existing = {
        table: normalized.table,
        field: normalized.field,
        nonEditable: Boolean(normalized.nonEditable),
        reasons: new Set(normalized.reasons.map(String)),
      };
      descriptorMap.set(key, existing);
    } else {
      existing.nonEditable = existing.nonEditable || Boolean(normalized.nonEditable);
      normalized.reasons.forEach((code) => {
        if (code === undefined || code === null) return;
        const str = String(code).trim();
        if (!str) return;
        existing.reasons.add(str);
      });
    }
  };

  const addSource = (source, fallbackTable, fallbackField) => {
    if (!source) return;
    if (Array.isArray(source)) {
      source.forEach((item) => addSource(item, fallbackTable, fallbackField));
      return;
    }
    if (typeof source === 'object') {
      const nestedTable =
        normalizeIdentifier(source.table) ||
        normalizeIdentifier(source.table_name) ||
        normalizeIdentifier(source.tableName) ||
        normalizeIdentifier(source.tbl) ||
        fallbackTable;
      const nestedField =
        normalizeIdentifier(source.field) ||
        normalizeIdentifier(source.field_name) ||
        normalizeIdentifier(source.fieldName) ||
        normalizeIdentifier(source.column) ||
        normalizeIdentifier(source.column_name) ||
        normalizeIdentifier(source.columnName) ||
        fallbackField;
      if (Array.isArray(source.locks)) {
        addSource(source.locks, nestedTable, nestedField);
      }
      if (Array.isArray(source.lockCells)) {
        addSource(source.lockCells, nestedTable, nestedField);
      }
      if (Array.isArray(source.cellLocks)) {
        addSource(source.cellLocks, nestedTable, nestedField);
      }
      if (Array.isArray(source.lockEntries)) {
        addSource(source.lockEntries, nestedTable, nestedField);
      }
      if (Array.isArray(source.entries)) {
        addSource(source.entries, nestedTable, nestedField);
      }
      if (Array.isArray(source.items)) {
        addSource(source.items, nestedTable, nestedField);
      }
      if (Array.isArray(source.rows)) {
        addSource(source.rows, nestedTable, nestedField);
      }
      if (source.meta && typeof source.meta === 'object') {
        addSource(source.meta.locks, nestedTable, nestedField);
      }
      if (source.metadata && typeof source.metadata === 'object') {
        addSource(source.metadata.locks, nestedTable, nestedField);
      }
    }
    registerDescriptor(source, fallbackTable, fallbackField);
  };

  const primaryPart =
    Array.isArray(entry.parts) && entry.parts.length > 0 ? entry.parts[0] : null;
  const entryFallbackTable = normalizeIdentifier(primaryPart?.table);
  const entryFallbackField = normalizeIdentifier(primaryPart?.field);

  addSource(entry.locks, entryFallbackTable, entryFallbackField);
  addSource(entry.lockCells, entryFallbackTable, entryFallbackField);
  addSource(entry.cellLocks, entryFallbackTable, entryFallbackField);
  addSource(entry.lockEntries, entryFallbackTable, entryFallbackField);
  addSource(entry.lockList, entryFallbackTable, entryFallbackField);
  addSource(entry.lockMetadata, entryFallbackTable, entryFallbackField);
  addSource(entry.lockInfo, entryFallbackTable, entryFallbackField);
  addSource(entry.lockData, entryFallbackTable, entryFallbackField);
  if (entry.meta && typeof entry.meta === 'object') {
    addSource(entry.meta.locks, entryFallbackTable, entryFallbackField);
  }
  if (entry.metadata && typeof entry.metadata === 'object') {
    addSource(entry.metadata.locks, entryFallbackTable, entryFallbackField);
  }

  if (Array.isArray(entry.parts)) {
    entry.parts.forEach((part) => {
      if (!part || typeof part !== 'object') return;
      const partTable = normalizeIdentifier(part.table);
      const partField = normalizeIdentifier(part.field);
      addSource(part.locks, partTable, partField);
      addSource(part.lockCells, partTable, partField);
      addSource(part.lockMetadata, partTable, partField);
      if (part.metadata && typeof part.metadata === 'object') {
        addSource(part.metadata.locks, partTable, partField);
      }
    });
  }

  return Array.from(descriptorMap.values()).map((entry) => ({
    table: entry.table,
    field: entry.field,
    nonEditable: entry.nonEditable,
    reasons: Array.from(entry.reasons),
  }));
}

export function buildComputedFieldMap(
  calcFields = [],
  posFields = [],
  columnCaseMap = {},
  tables = [],
) {
  const tableCaseMap = {};
  const columnCaseLookup = {};

  const registerTableName = (name) => {
    const normalized = normalizeIdentifier(name);
    if (!normalized) return null;
    const lower = normalized.toLowerCase();
    if (!tableCaseMap[lower]) {
      tableCaseMap[lower] = normalized;
    }
    return tableCaseMap[lower];
  };

  const registerColumnCaseMap = (tableName, map) => {
    const canonicalTable = registerTableName(tableName);
    if (!canonicalTable) return;
    const lowerTable = canonicalTable.toLowerCase();
    const fieldMap = {};
    if (map && typeof map === 'object') {
      Object.entries(map).forEach(([key, value]) => {
        if (typeof key !== 'string') return;
        const lowerKey = key.toLowerCase();
        if (typeof value === 'string' && value) {
          fieldMap[lowerKey] = value;
        }
      });
    }
    columnCaseLookup[lowerTable] = fieldMap;
  };

  (Array.isArray(tables) ? tables : []).forEach((entry) => {
    if (!entry) return;
    const name = typeof entry === 'string' ? entry : entry.table;
    registerTableName(name);
  });

  Object.entries(columnCaseMap || {}).forEach(([tableName, map]) => {
    registerColumnCaseMap(tableName, map);
  });

  const result = {};

  const ensureTableEntry = (tableName) => {
    const canonicalTable = registerTableName(tableName);
    if (!canonicalTable) return null;
    let entry = result[canonicalTable];
    if (!entry) {
      entry = new Set();
      entry.reasonMap = new Map();
      result[canonicalTable] = entry;
    } else if (!(entry.reasonMap instanceof Map)) {
      entry.reasonMap = new Map();
    }
    return entry;
  };

  const canonicalizeField = (tableName, fieldName) => {
    const canonicalTable = registerTableName(tableName);
    if (!canonicalTable) return null;
    const normalizedField = normalizeIdentifier(fieldName);
    if (!normalizedField) return null;
    const lowerTable = canonicalTable.toLowerCase();
    const caseMap = columnCaseLookup[lowerTable] || {};
    const lowerField = normalizedField.toLowerCase();
    const canonicalField = caseMap[lowerField] || normalizedField;
    return {
      table: canonicalTable,
      field: canonicalField,
      lower: canonicalField.toLowerCase(),
    };
  };

  const ensureFieldEntry = (tableName, fieldName) => {
    const canonical = canonicalizeField(tableName, fieldName);
    if (!canonical) return null;
    const entry = ensureTableEntry(canonical.table);
    if (!entry) return;
    entry.add(canonical.lower);
    return { entry, canonical };
  };

  const addReason = (tableName, fieldName, reason) => {
    const info = ensureFieldEntry(tableName, fieldName);
    if (!info) return;
    const { entry, canonical } = info;
    if (!reason && reason !== 0) return;
    let reasonMap = entry.reasonMap;
    if (!(reasonMap instanceof Map)) {
      reasonMap = new Map();
      entry.reasonMap = reasonMap;
    }
    let reasonSet = reasonMap.get(canonical.lower);
    if (!reasonSet) {
      reasonSet = new Set();
      reasonMap.set(canonical.lower, reasonSet);
    }
    reasonSet.add(String(reason));
  };

  (calcFields || []).forEach((map = {}) => {
    const cells = getCalcFieldCells(map);
    if (!cells.length) return;

    const normalizedIndexes = Array.isArray(map.__computedCellIndexes)
      ? map.__computedCellIndexes
          .map((idx) => (Number.isInteger(idx) ? idx : null))
          .filter((idx) => idx !== null && idx >= 0 && idx < cells.length)
      : [];

    if (normalizedIndexes.length === 0) return;

    const hasAggregator = cells.some((cell = {}) => {
      if (typeof cell.__aggKey === 'string' && cell.__aggKey) return true;
      if (typeof cell.agg === 'string') {
        const normalized = cell.agg.trim();
        if (normalized) return true;
      }
      return false;
    });

    const fallsBackToFirstCell =
      !hasAggregator && normalizedIndexes.length === 1 && normalizedIndexes[0] === 0;

    if (fallsBackToFirstCell) return;

    normalizedIndexes.forEach((idx) => {
      const cell = cells[idx];
      if (!cell || !cell.table || !cell.field) return;
      addReason(cell.table, cell.field, 'calcField');
    });
  });

  (posFields || []).forEach((entry = {}) => {
    const parts = Array.isArray(entry.parts) ? entry.parts : [];
    if (parts.length < 2) return;
    const [target, ...calcParts] = parts;
    const targetTable = normalizeIdentifier(target?.table);
    const targetField = normalizeIdentifier(target?.field);
    if (!targetTable || !targetField) return;

    const uniqueSources = new Set();
    calcParts.forEach((cell = {}) => {
      const tbl = normalizeIdentifier(cell.table);
      const fld = normalizeIdentifier(cell.field);
      if (!tbl || !fld) return;
      uniqueSources.add(`${tbl.toLowerCase()}::${fld.toLowerCase()}`);
    });
    if (uniqueSources.size === 0) return;

    addReason(targetTable, targetField, 'posFormula');

  });

  return result;
}

export function collectDisabledFieldsAndReasons({
  allFields = [],
  editSet = null,
  caseMap = {},
  sessionFields = [],
}) {
  const normalizedFields = Array.isArray(allFields)
    ? allFields.filter((field) => typeof field === 'string' && field)
    : [];
  const allFieldLowerSet = new Set(normalizedFields.map((field) => field.toLowerCase()));
  const disabledLower = new Set();
  const disabled = [];
  const reasonMap = new Map();

  const addReason = (field, code) => {
    if (!field || !code) return;
    const canonical = String(field);
    if (!reasonMap.has(canonical)) {
      reasonMap.set(canonical, new Set());
    }
    reasonMap.get(canonical).add(String(code));
  };

  if (editSet instanceof Set && editSet.size > 0) {
    normalizedFields.forEach((field) => {
      const lower = field.toLowerCase();
      if (editSet.has(lower)) return;
      if (disabledLower.has(lower)) return;
      disabledLower.add(lower);
      disabled.push(field);
      addReason(field, 'missingEditableConfig');
    });
  }

  (Array.isArray(sessionFields) ? sessionFields : []).forEach((field) => {
    if (typeof field !== 'string' || !field) return;
    const lower = field.toLowerCase();
    if (!allFieldLowerSet.has(lower)) return;
    if (editSet instanceof Set && editSet.has(lower)) return;
    let canonicalField =
      caseMap[lower] ||
      normalizedFields.find((entry) => entry.toLowerCase() === lower) ||
      field;
    if (typeof canonicalField !== 'string') canonicalField = String(canonicalField);
    addReason(canonicalField, 'sessionFieldAutoReset');
  });

  return {
    disabled,
    reasonMap,
  };
}

function parseErrorField(msg) {
  if (!msg) return null;
  let m = msg.match(/FOREIGN KEY \(`([^`]*)`\)/i);
  if (m) return m[1];
  m = msg.match(/column '([^']+)'/i);
  if (m) return m[1];
  m = msg.match(/for key '([^']+)'/i);
  if (m) return m[1];
  return null;
}

export function hasForeignKey(cols = []) {
  return cols.some(
    (c) =>
      c?.REFERENCED_TABLE_NAME ||
      c?.referenced_table_name ||
      c?.COLUMN_KEY === 'MUL' ||
      c?.column_key === 'MUL' ||
      c?.Key === 'MUL',
  );
}

export function shouldLoadRelations(formConfig, cols = []) {
  const hasView = formConfig
    ? Object.values(formConfig.viewSource || {}).some(Boolean)
    : false;
  return hasView || hasForeignKey(cols);
}

export function buildRelationConfigEntry(relation, displayConfig = {}) {
  if (!relation || typeof relation !== 'object') return null;
  const table = relation.REFERENCED_TABLE_NAME;
  const column = relation.REFERENCED_COLUMN_NAME;
  if (!table || !column) return null;
  const normalizedDisplayFields = Array.isArray(displayConfig?.displayFields)
    ? displayConfig.displayFields
    : [];
  const normalizedRelationFields = Array.isArray(relation.displayFields)
    ? relation.displayFields.filter((field) => typeof field === 'string')
    : [];
  const idFieldCandidate =
    typeof relation.idField === 'string' && relation.idField.trim()
      ? relation.idField.trim()
      : displayConfig?.idField;
  const entry = {
    table,
    column,
    idField: idFieldCandidate || column,
    displayFields:
      normalizedRelationFields.length > 0
        ? normalizedRelationFields
        : normalizedDisplayFields,
  };
  const combinationSource =
    typeof relation.combinationSourceColumn === 'string'
      ? relation.combinationSourceColumn.trim()
      : '';
  const combinationTarget =
    typeof relation.combinationTargetColumn === 'string'
      ? relation.combinationTargetColumn.trim()
      : '';
  if (combinationSource && combinationTarget) {
    entry.combinationSourceColumn = combinationSource;
    entry.combinationTargetColumn = combinationTarget;
  }
  return entry;
}

export function applySessionIdToTables(
  values,
  sessionId,
  sessionFieldsByTable = {},
  tableTypeMap = {},
) {
  if (!sessionId) return values;
  const entries = Object.entries(sessionFieldsByTable || {});
  if (entries.length === 0) return values;
  let nextVals = values || {};
  let mutated = false;
  entries.forEach(([tbl, fields]) => {
    if (!Array.isArray(fields) || fields.length === 0) return;
    const type = tableTypeMap[tbl] === 'multi' ? 'multi' : 'single';
    if (type === 'multi') {
      const existingContainer = nextVals[tbl];
      const currentRows = Array.isArray(existingContainer) ? existingContainer : [];
      let targetRows = currentRows;
      let tableChanged = false;

      if (currentRows.length > 0) {
        let rowsMutated = false;
        const updatedRows = currentRows.map((row) => {
          const baseRow =
            row && typeof row === 'object' && !Array.isArray(row) ? row : {};
          let newRow = baseRow;
          let rowChanged = row === null || row === undefined;
          fields.forEach((field) => {
            if ((newRow?.[field] ?? undefined) !== sessionId) {
              if (newRow === baseRow && !rowChanged) {
                newRow = { ...baseRow };
              }
              newRow[field] = sessionId;
              rowChanged = true;
            }
          });
          if (rowChanged) {
            rowsMutated = true;
            return newRow;
          }
          return row;
        });
        if (rowsMutated) {
          targetRows = updatedRows;
          tableChanged = true;
          if (Array.isArray(existingContainer)) {
            assignArrayMetadata(targetRows, existingContainer);
          }
        }
      }

      const ensureTargetArray = () => {
        if (!Array.isArray(targetRows)) {
          targetRows = [];
          tableChanged = true;
        } else if (!tableChanged && targetRows === currentRows) {
          targetRows = cloneArrayWithMetadata(currentRows);
          tableChanged = true;
        }
      };

      let metadataChanged = false;
      fields.forEach((field) => {
        const currentVal = targetRows?.[field];
        if (currentVal !== sessionId) {
          ensureTargetArray();
          targetRows[field] = sessionId;
          metadataChanged = true;
        }
      });

      if (tableChanged || metadataChanged) {
        if (!mutated) {
          nextVals = { ...nextVals };
          mutated = true;
        }
        nextVals[tbl] = targetRows;
      }
    } else {
      const currentRow = nextVals[tbl];
      const baseRow =
        currentRow && typeof currentRow === 'object' && !Array.isArray(currentRow)
          ? currentRow
          : {};
      let newRow = baseRow;
      let rowChanged = currentRow === undefined || currentRow === null;
      fields.forEach((field) => {
        if (newRow[field] !== sessionId) {
          if (newRow === baseRow && !rowChanged) {
            newRow = { ...baseRow };
          }
          newRow[field] = sessionId;
          rowChanged = true;
        }
      });
      if (rowChanged) {
        if (!mutated) {
          nextVals = { ...nextVals };
          mutated = true;
        }
        nextVals[tbl] = newRow;
      }
    }
  });
  return nextVals;
}

function PendingSelectModal({ visible, list = [], onSelect, onClose }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!visible) return;
    function handleKey(e) {
      if (e.key === 'ArrowDown') {
        setIdx((v) => Math.min(v + 1, list.length - 1));
      } else if (e.key === 'ArrowUp') {
        setIdx((v) => Math.max(v - 1, 0));
      } else if (e.key === 'Enter') {
        onSelect(list[idx]?.id);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible, list, idx, onSelect]);

  if (!visible) return null;

  return (
    <Modal visible={visible} title="Select Pending" onClose={onClose}>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {list.map((rec, i) => (
          <li
            key={rec.id}
            style={{
              padding: '0.25rem 0.5rem',
              background: i === idx ? '#e0e0ff' : 'transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={() => setIdx(i)}
            onClick={() => onSelect(rec.id)}
          >
            {rec.id} {rec.savedAt ? `(${rec.savedAt.slice(0, 19)})` : ''}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

async function postRow(addToast, table, row) {
  try {
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const js = await res.json().catch(() => ({}));
      const msg = js.message || res.statusText;
      const field = parseErrorField(msg);
      const val = field && row ? row[field] : undefined;
      addToast(
        `Request failed: ${msg}${
          field ? ` (field ${field}=${val})` : ''
        }`,
        'error',
      );
      return null;
    }
    return await res.json().catch(() => null);
  } catch (err) {
    addToast(`Request failed: ${err.message}`, 'error');
    return null;
  }
}

async function putRow(addToast, table, id, row) {
  try {
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const js = await res.json().catch(() => ({}));
      const msg = js.message || res.statusText;
      const field = parseErrorField(msg);
      const val = field && row ? row[field] : undefined;
      addToast(
        `Request failed: ${msg}${field ? ` (field ${field}=${val})` : ''}`,
        'error',
      );
      return false;
    }
    return true;
  } catch (err) {
    addToast(`Request failed: ${err.message}`, 'error');
    return false;
  }
}

export default function PosTransactionsPage() {
  const { addToast } = useToast();
  const {
    user,
    company,
    branch,
    department,
    permissions: perms,
    session,
    workplace,
    workplacePositionMap,
  } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const licensed = useCompanyModules(company);
  const [rawConfigs, setRawConfigs] = useState({});
  const configs = useMemo(() => {
    if (!rawConfigs || typeof rawConfigs !== 'object') return {};
    if (
      perms &&
      Object.prototype.hasOwnProperty.call(perms, 'pos_transactions') &&
      !perms.pos_transactions
    ) {
      return {};
    }
    if (
      licensed &&
      Object.prototype.hasOwnProperty.call(licensed, 'pos_transactions') &&
      !licensed.pos_transactions
    ) {
      return {};
    }
    const entries = Object.entries(rawConfigs).filter(([key]) => key !== 'isDefault');
    if (entries.length === 0) return {};
    const filtered = {};
    const userRightId =
      user?.userLevel ??
      user?.userlevel_id ??
      user?.userlevelId ??
      session?.user_level ??
      session?.userlevel_id ??
      session?.userlevelId ??
      null;
    const userRightName =
      session?.user_level_name ??
      session?.userLevelName ??
      user?.userLevelName ??
      user?.userlevel_name ??
      user?.userlevelName ??
      null;
  const workplaceId =
    workplace ??
    session?.workplace_id ??
    session?.workplaceId ??
    null;
  const workplacePositionId =
    resolveWorkplacePositionForContext({
      workplaceId,
      session,
      workplacePositionMap,
    })?.positionId ??
    session?.workplace_position_id ??
    session?.workplacePositionId ??
    null;
    const positionId =
      session?.employment_position_id ??
      session?.position_id ??
      session?.position ??
      user?.position ??
      null;
    entries.forEach(([cfgName, cfgValue]) => {
      if (!cfgValue || typeof cfgValue !== 'object') return;
      if (
        hasTransactionFormAccess(cfgValue, branch, department, {
          allowTemporaryAnyScope: true,
          userRightId,
          userRightName,
          workplaceId,
          positionId,
          workplacePositions: session?.workplace_assignments,
          workplacePositionId,
          workplacePositionMap,
        })
      ) {
        filtered[cfgName] = cfgValue;
      }
    });
    return filtered;
  }, [
    rawConfigs,
    branch,
    department,
    perms,
    licensed,
    session,
    user,
    workplace,
    workplacePositionMap,
  ]);
  const [name, setName] = useState('');
  const [config, setConfig] = useState(null);
  const [formConfigs, setFormConfigs] = useState({});
  const memoFormConfigs = useMemo(() => formConfigs, [formConfigs]);
  // Stable hash of view dependencies in form configs to keep loadView callback
  // from recreating unnecessarily when irrelevant parts mutate.
  const formConfigsViewHash = useMemo(() => {
    const entries = Object.entries(memoFormConfigs).map(([tbl, fc]) => {
      const views = Object.values(fc.viewSource || {})
        .filter(Boolean)
        .sort();
      return `${tbl}:${views.join(',')}`;
    });
    return entries.sort().join('|');
  }, [memoFormConfigs]);
  const [columnMeta, setColumnMeta] = useState({});
  const [values, setValues] = useState({});
  const [layout, setLayout] = useState({});
  const [relationsMap, setRelationsMap] = useState({});
  const [relationConfigs, setRelationConfigs] = useState({});
  const [relationData, setRelationData] = useState({});
  const [viewDisplaysMap, setViewDisplaysMap] = useState({});
  const [viewColumnsMap, setViewColumnsMap] = useState({});
  const [procTriggersMap, setProcTriggersMap] = useState({});
  const [pendingId, setPendingId] = useState(null);
  const [sessionFields, setSessionFields] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [masterId, setMasterId] = useState(null);
  const [pendingList, setPendingList] = useState([]);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [postedId, setPostedId] = useState(null);
  const [isPostingEbarimt, setIsPostingEbarimt] = useState(false);
  const [ebarimtPreview, setEbarimtPreview] = useState(null);
  const [ebarimtQrImage, setEbarimtQrImage] = useState('');
  const [posApiEndpoints, setPosApiEndpoints] = useState([]);
  const [selectedRequestVariation, setSelectedRequestVariation] = useState('');
  const canIssueEbarimt = Boolean(
    config?.masterTable &&
      memoFormConfigs[config.masterTable]?.posApiEnabled,
  );
  const [isNarrow, setIsNarrow] = useState(false);
  const tableTypeMap = useMemo(() => {
    const map = {};
    if (!config) return map;
    if (config.masterTable) {
      map[config.masterTable] =
        config.masterType === 'multi' ? 'multi' : 'single';
    }
    (config.tables || []).forEach((t) => {
      if (!t?.table) return;
      map[t.table] = t.type === 'multi' ? 'multi' : 'single';
    });
    return map;
  }, [config]);
  const transactionEndpoint = useMemo(() => {
    if (!config?.posApiEnabled) return null;
    const endpointId =
      (typeof config.posApiEndpointId === 'string' && config.posApiEndpointId.trim()) ||
      (typeof config.posApiEndpointMeta?.id === 'string' ? config.posApiEndpointMeta.id.trim() : '');
    if (endpointId) {
      const fromList = posApiEndpoints.find((endpoint) => endpoint?.id === endpointId) || null;
      if (fromList) return fromList;
    }
    if (config?.posApiEndpointMeta) {
      return withPosApiEndpointMetadata(config.posApiEndpointMeta);
    }
    return null;
  }, [config, posApiEndpoints]);
  const requestVariations = useMemo(() => {
    if (!transactionEndpoint || !Array.isArray(transactionEndpoint.variations)) return [];
    return transactionEndpoint.variations.filter((variation) => variation && variation.enabled !== false);
  }, [transactionEndpoint]);
  const userSelectedVariationRef = useRef(false);
  useEffect(() => {
    if (!config?.posApiEnabled) {
      setSelectedRequestVariation('');
      userSelectedVariationRef.current = false;
      return;
    }
    const defaultKey =
      typeof config.posApiRequestVariation === 'string'
        ? config.posApiRequestVariation.trim()
        : '';
    setSelectedRequestVariation((prev) => {
      const prevKey = typeof prev === 'string' ? prev : '';
      const hasPrevOption =
        prevKey === '' || requestVariations.some((variation) => variation?.key === prevKey);
      if (userSelectedVariationRef.current && hasPrevOption) {
        return prevKey;
      }
      if (hasPrevOption && prevKey) {
        return prevKey;
      }
      if (defaultKey && requestVariations.some((variation) => variation?.key === defaultKey)) {
        return defaultKey;
      }
      return hasPrevOption ? prevKey : '';
    });
  }, [config?.posApiEnabled, config?.posApiRequestVariation, requestVariations]);
  const clearEbarimtPreview = useCallback(() => {
    setEbarimtPreview(null);
    setEbarimtQrImage('');
  }, []);
  useEffect(() => {
    clearEbarimtPreview();
  }, [name, pendingId, postedId, clearEbarimtPreview]);
  useEffect(() => {
    const qrValue = normalizePreviewValue(ebarimtPreview?.qrData);
    if (!qrValue) {
      setEbarimtQrImage('');
      return;
    }
    const url = `https://quickchart.io/qr?size=220&margin=1&text=${encodeURIComponent(qrValue)}`;
    setEbarimtQrImage(url);
  }, [ebarimtPreview?.qrData]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/posapi/endpoints', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setPosApiEndpoints(data.map(withPosApiEndpointMetadata));
        } else {
          setPosApiEndpoints([]);
        }
      })
      .catch(() => {
        if (!cancelled) setPosApiEndpoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    userSelectedVariationRef.current = false;
  }, [name]);
  const sessionFieldsKey = useMemo(() => {
    if (!sessionFields || sessionFields.length === 0) return '';
    return sessionFields
      .map((sf) => `${sf.table || ''}:${sf.field || ''}`)
      .sort()
      .join('|');
  }, [sessionFields]);
  const sessionFieldsByTable = useMemo(() => {
    const map = {};
    if (!sessionFields || sessionFields.length === 0) return map;
    sessionFields.forEach(({ table, field }) => {
      if (!table || !field) return;
      if (!map[table]) map[table] = [];
      if (!map[table].includes(field)) map[table].push(field);
    });
    return map;
  }, [sessionFieldsKey]);
  const applySessionIdToValues = useCallback(
    (vals, sid) => applySessionIdToTables(vals, sid, sessionFieldsByTable, tableTypeMap),
    [sessionFieldsByTable, tableTypeMap],
  );
  const masterIdRef = useRef(null);
  const refs = useRef({});
  const dragInfo = useRef(null);
  const relationCacheRef = useRef(new Map());
  const loadingTablesRef = useRef(new Set());
  const loadedTablesRef = useRef(new Set());
  const procTriggerFetchesRef = useRef(new Map());
  const procTriggerLoadedRef = useRef(new Set());
  const viewCacheRef = useRef(new Map());
  // Tracks in-flight view fetch promises so multiple tables can share them
  const viewFetchesRef = useRef(new Map());
  // Records view names that finished loading to avoid repeated network calls
  const viewLoadedRef = useRef(new Set());
  const contextReadyRef = useRef({ branch, company });
  const unmountedRef = useRef(false);
  const abortControllersRef = useRef(new Set());

  const fetchWithAbort = (url, options = {}) => {
    const controller = new AbortController();
    abortControllersRef.current.add(controller);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => {
      abortControllersRef.current.delete(controller);
    });
  };

  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // Abort pending requests and reset caches when the transaction name changes
  // to avoid leaking state between sessions.
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((c) => c.abort());
      abortControllersRef.current.clear();
      relationCacheRef.current.clear();
      loadingTablesRef.current.clear();
      viewCacheRef.current.clear();
      viewFetchesRef.current.clear();
      viewLoadedRef.current.clear();
      procTriggerFetchesRef.current.clear();
      procTriggerLoadedRef.current.clear();
    };
  }, [name]);

  useEffect(() => {
    relationCacheRef.current.clear();
    viewCacheRef.current.clear();
    viewFetchesRef.current.clear();
    viewLoadedRef.current.clear();
    procTriggerFetchesRef.current.clear();
    procTriggerLoadedRef.current.clear();
    setFormConfigs({});
    setColumnMeta({});
    setRelationsMap({});
    setRelationConfigs({});
    setRelationData({});
    setViewDisplaysMap({});
    setViewColumnsMap({});
    setProcTriggersMap({});
  }, [branch, department]);

  useEffect(() => {
    const prev = contextReadyRef.current;
    const branchReady = branch != null && prev.branch == null;
    const companyReady = company != null && prev.company == null;
    contextReadyRef.current = { branch, company };
    if (!branchReady && !companyReady) return;

    const tables = Object.entries(memoFormConfigs);
    if (tables.length === 0) return;

    setValues((currentValues) => {
      if (!currentValues || typeof currentValues !== 'object') return currentValues;
      let mutated = false;
      let nextValues = currentValues;

      const fillRecord = (record, branchFields, companyFields) => {
        const base =
          record && typeof record === 'object' && !Array.isArray(record)
            ? record
            : {};
        let updated = base;
        let changed = false;
        const maybeAssign = (field, value) => {
          if (!field) return;
          const current = updated[field];
          if (current !== undefined && current !== null && current !== '') return;
          if (updated === base) {
            updated = { ...base };
          }
          updated[field] = value;
          changed = true;
        };
        if (branchReady && Array.isArray(branchFields) && branchFields.length > 0) {
          branchFields.forEach((field) => maybeAssign(field, branch));
        }
        if (companyReady && Array.isArray(companyFields) && companyFields.length > 0) {
          companyFields.forEach((field) => maybeAssign(field, company));
        }
        return { updated, changed };
      };

      tables.forEach(([tbl, fc]) => {
        if (!fc) return;
        const branchFields = Array.isArray(fc.branchIdFields)
          ? fc.branchIdFields
          : [];
        const companyFields = Array.isArray(fc.companyIdFields)
          ? fc.companyIdFields
          : [];
        if (
          (!branchReady || branchFields.length === 0) &&
          (!companyReady || companyFields.length === 0)
        ) {
          return;
        }

        const container = nextValues[tbl];
        const type = tableTypeMap[tbl] === 'multi' ? 'multi' : 'single';

        if (type === 'multi') {
          const currentRows = Array.isArray(container) ? container : [];
          let targetRows = currentRows;
          let tableChanged = false;
          const ensureClone = () => {
            if (!tableChanged) {
              targetRows = cloneArrayWithMetadata(currentRows);
              tableChanged = true;
            }
          };
          const maybeAssignArrayField = (fields, value) => {
            if (!Array.isArray(fields) || fields.length === 0) return;
            if (value === undefined || value === null) return;
            fields.forEach((field) => {
              if (!field) return;
              const holder = tableChanged ? targetRows : currentRows;
              const current = holder[field];
              if (current !== undefined && current !== null && current !== '') {
                return;
              }
              ensureClone();
              targetRows[field] = value;
            });
          };
          currentRows.forEach((row, idx) => {
            const { updated, changed } = fillRecord(row, branchFields, companyFields);
            if (changed) {
              ensureClone();
              targetRows[idx] = updated;
            }
          });
          if (Array.isArray(container)) {
            Object.keys(container).forEach((key) => {
              if (arrayIndexPattern.test(key)) return;
              const meta = container[key];
              if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return;
              const { updated, changed } = fillRecord(
                meta,
                branchFields,
                companyFields,
              );
              if (changed) {
                ensureClone();
                targetRows[key] = updated;
              }
            });
          }
          if (branchReady) {
            maybeAssignArrayField(branchFields, branch);
          }
          if (companyReady) {
            maybeAssignArrayField(companyFields, company);
          }
          if (tableChanged) {
            if (nextValues === currentValues) {
              nextValues = { ...currentValues };
            }
            nextValues[tbl] = targetRows;
            mutated = true;
          }
        } else {
          const source =
            container && typeof container === 'object' && !Array.isArray(container)
              ? container
              : {};
          const { updated, changed } = fillRecord(
            source,
            branchFields,
            companyFields,
          );
          if (changed) {
            if (nextValues === currentValues) {
              nextValues = { ...currentValues };
            }
            nextValues[tbl] = updated;
            mutated = true;
          }
        }
      });

      if (!mutated) return currentValues;
      return recalcTotals(cloneValuesForRecalc(nextValues));
    });
  }, [branch, company, memoFormConfigs, tableTypeMap]);

  async function loadRelations(tbl) {
    if (loadingTablesRef.current.has(tbl)) {
      return { dataMap: {}, cfgMap: {}, rowMap: {} };
    }
    loadingTablesRef.current.add(tbl);
    try {
      const res = await fetchWithAbort(`/api/tables/${encodeURIComponent(tbl)}/relations`, {
        credentials: 'include',
        skipErrorToast: true,
        skipLoader: true,
      });
      if (!res.ok) return { dataMap: {}, cfgMap: {}, rowMap: {} };
      const rels = await res.json().catch(() => []);
      const dataMap = {};
      const cfgMap = {};
      const rowMap = {};
      const tableCache = relationCacheRef.current;
      const relsByTable = rels.reduce((acc, r) => {
        const refTbl = r.REFERENCED_TABLE_NAME;
        if (!acc[refTbl]) acc[refTbl] = [];
        acc[refTbl].push(r);
        return acc;
      }, {});
      const perPage = 500;
      const maxPages = 20;
      for (const [refTbl, list] of Object.entries(relsByTable)) {
        let cached = tableCache.get(refTbl);
        if (!cached) {
          let cfg = null;
          try {
            const cRes = await fetchWithAbort(
              `/api/display_fields?table=${encodeURIComponent(refTbl)}`,
              { credentials: 'include', skipErrorToast: true },
            );
            if (cRes.ok) cfg = await cRes.json().catch(() => null);
          } catch {
            cfg = null;
          }
          let page = 1;
          let rows = [];
          while (page <= maxPages) {
            const params = new URLSearchParams({ page, perPage });
            const refRes = await fetchWithAbort(
              `/api/tables/${encodeURIComponent(refTbl)}?${params.toString()}`,
              { credentials: 'include', skipErrorToast: true },
            );
            if (!refRes.ok) break;
            const js = await refRes.json().catch(() => ({}));
            if (Array.isArray(js.rows)) {
              rows = rows.concat(js.rows);
              if (rows.length >= (js.count || rows.length) || js.rows.length < perPage) break;
            } else break;
            page += 1;
          }
          cached = { cfg, rows };
          tableCache.set(refTbl, cached);
        }
        const { cfg, rows } = cached;
        for (const r of list) {
          const refCol = r.REFERENCED_COLUMN_NAME;
          const opts = [];
          const rMap = {};
          rows.forEach((row) => {
            const val = row[refCol];
            const parts = [];
            if (val !== undefined) parts.push(val);
            let displayFields = [];
            if (cfg && Array.isArray(cfg.displayFields) && cfg.displayFields.length > 0) {
              displayFields = cfg.displayFields;
            } else {
              displayFields = Object.keys(row).filter((f) => f !== refCol).slice(0, 1);
            }
            parts.push(
              ...displayFields.map((f) => row[f]).filter((v) => v !== undefined),
            );
            const label = parts.join(' - ');
            opts.push({ value: val, label });
            addRelationRowEntry(rMap, val, row);
          });
          if (opts.length > 0) dataMap[r.COLUMN_NAME] = opts;
          if (Object.keys(rMap).length > 0) rowMap[r.COLUMN_NAME] = rMap;
          const relationConfig = buildRelationConfigEntry(r, cfg) || {
            table: refTbl,
            column: refCol,
            idField: cfg?.idField || refCol,
            displayFields: cfg?.displayFields || [],
          };
          cfgMap[r.COLUMN_NAME] = relationConfig;
        }
      }
      return { dataMap, cfgMap, rowMap };
    } catch {
      /* ignore */
      return { dataMap: {}, cfgMap: {}, rowMap: {} };
    } finally {
      loadingTablesRef.current.delete(tbl);
    }
  }

  const loadView = useCallback(
    async (viewName) => {
      const apply = (data) => {
        Object.entries(memoFormConfigs).forEach(([tbl, fc]) => {
          const views = Object.values(fc.viewSource || {});
          if (views.includes(viewName)) {
            setViewDisplaysMap((m) => ({
              ...m,
              [tbl]: { ...(m[tbl] || {}), [viewName]: data.cfg },
            }));
            setViewColumnsMap((m) => ({
              ...m,
              [tbl]: { ...(m[tbl] || {}), [viewName]: data.cols },
            }));
          }
        });
      };
      if (viewLoadedRef.current.has(viewName)) {
        const cached = viewCacheRef.current.get(viewName);
        if (cached) apply(cached);
        return cached;
      }
      const cached = viewCacheRef.current.get(viewName);
      if (cached) {
        apply(cached);
        viewLoadedRef.current.add(viewName);
        return cached;
      }
      let fetchPromise = viewFetchesRef.current.get(viewName);
      if (!fetchPromise) {
        const dfPromise = fetchWithAbort(
          `/api/display_fields?table=${encodeURIComponent(viewName)}`,
          { credentials: 'include' },
        ).then((res) => (res.ok ? res.json() : null));
        const colPromise = fetchWithAbort(
          `/api/tables/${encodeURIComponent(viewName)}/columns`,
          { credentials: 'include' },
        ).then((res) => (res.ok ? res.json() : []));
        fetchPromise = Promise.all([dfPromise, colPromise])
          .then(([cfg, cols]) => {
            const data = {
              cfg: cfg || {},
              cols: (cols || []).map((c) => c.name),
            };
            viewCacheRef.current.set(viewName, data);
            return data;
          })
          .catch(() => null)
          .finally(() => {
            viewFetchesRef.current.delete(viewName);
          });
        viewFetchesRef.current.set(viewName, fetchPromise);
      }
      const data = await fetchPromise;
      if (data) {
        apply(data);
        viewLoadedRef.current.add(viewName);
      }
      return data;
    },
    [formConfigsViewHash],
  );

  useEffect(() => {
    masterIdRef.current = masterId;
  }, [masterId]);

  function focusFirst(table) {
    const wrap = refs.current[table];
    if (!wrap) return;
    const el = wrap.querySelector('input, textarea, select, button');
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (branch !== undefined && branch !== null && String(branch).trim() !== '') {
      params.set('branchId', branch);
    }
    if (department !== undefined && department !== null && String(department).trim() !== '') {
      params.set('departmentId', department);
    }
    const userRightId =
      user?.userLevel ??
      user?.userlevel_id ??
      user?.userlevelId ??
      session?.user_level ??
      session?.userlevel_id ??
      session?.userlevelId ??
      null;
    if (userRightId != null && String(userRightId).trim() !== '') {
      params.set('userRightId', userRightId);
    }
    const workplaceId =
      workplace ??
      session?.workplace_id ??
      session?.workplaceId ??
      null;
    if (workplaceId != null && String(workplaceId).trim() !== '') {
      params.set('workplaceId', workplaceId);
    }
    const positionId =
      session?.employment_position_id ??
      session?.position_id ??
      session?.position ??
      user?.position ??
      null;
    if (positionId != null && String(positionId).trim() !== '') {
      params.set('positionId', positionId);
    }
    const qs = params.toString();
    fetch(`/api/pos_txn_config${qs ? `?${qs}` : ''}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setRawConfigs(data))
      .catch(() => setRawConfigs({}));
  }, [branch, department, session, user, workplace]);

  const initRef = useRef('');

  useEffect(() => {
    if (!name) {
      setConfig(null);
      setLayout({});
      setSessionFields(null);
      setCurrentSessionId(null);
      return;
    }
    if (!configs[name]) {
      setConfig(null);
      setLayout({});
      setSessionFields(null);
      setCurrentSessionId(null);
      return;
    }
    setSessionFields(null);
    setCurrentSessionId(null);
    const params = new URLSearchParams({ name });
    if (branch !== undefined && branch !== null && String(branch).trim() !== '') {
      params.set('branchId', branch);
    }
    if (department !== undefined && department !== null && String(department).trim() !== '') {
      params.set('departmentId', department);
    }
    const userRightId =
      user?.userLevel ??
      user?.userlevel_id ??
      user?.userlevelId ??
      session?.user_level ??
      session?.userlevel_id ??
      session?.userlevelId ??
      null;
    if (userRightId != null && String(userRightId).trim() !== '') {
      params.set('userRightId', userRightId);
    }
    const workplaceId =
      workplace ??
      session?.workplace_id ??
      session?.workplaceId ??
      null;
    if (workplaceId != null && String(workplaceId).trim() !== '') {
      params.set('workplaceId', workplaceId);
    }
    fetch(`/api/pos_txn_config?${params.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (cfg && Array.isArray(cfg.tables) && cfg.tables.length > 0 && !cfg.masterTable) {
          const [master, ...rest] = cfg.tables;
          cfg = { ...cfg, masterTable: master.table || '', masterForm: master.form || '', masterType: master.type || 'single', masterPosition: master.position || 'upper_left', tables: rest };
        }
        setConfig(cfg);
        setFormConfigs((f) => (Object.keys(f).length ? {} : f));
        setValues(recalcTotals(cloneValuesForRecalc({})));
        setRelationsMap({});
        setRelationConfigs({});
        setRelationData({});
      })
      .catch(() => { setConfig(null); });
    fetch(`/api/pos_txn_layout?name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : {})
      .then(data => setLayout(data || {}))
      .catch(() => setLayout({}));
  }, [name, configs, branch, department, session, user, workplace]);

  const { formList, visibleTables } = React.useMemo(() => {
    if (!config) return { formList: [], visibleTables: new Set() };
    const arr = [
      { table: config.masterTable, type: config.masterType, position: config.masterPosition, view: config.masterView },
      ...config.tables,
    ];
    const seen = new Set();
    const filtered = arr.filter((t) => {
      if (!t.table) return false;
      if (seen.has(t.table)) return false;
      seen.add(t.table);
      return true;
    });
    const visibleSet = new Set(
      filtered
        .filter((t) => t.position !== 'hidden')
        .map((t) => t.table),
    );
    const order = [
      'top_row',
      'upper_left',
      'upper_right',
      'left',
      'right',
      'lower_left',
      'lower_right',
      'bottom_row',
      'hidden',
    ];
    return {
      formList: filtered.sort(
        (a, b) => order.indexOf(a.position) - order.indexOf(b.position),
      ),
      visibleTables: visibleSet,
    };
  }, [config]);

  const tableList = useMemo(
    () => formList.map((t) => t.table).filter(Boolean),
    [formList],
  );

  const normalizedCalcFields = useMemo(
    () => normalizeCalcFieldConfig(config?.calcFields),
    [config],
  );

  const multiTableSet = React.useMemo(() => {
    const set = new Set();
    formList.forEach((t) => {
      if (t?.type === 'multi' && t.table) {
        set.add(t.table);
      }
    });
    return set;
  }, [formList]);

  // Stable key used for effect dependencies that care about visible table set
  const visibleTablesKey = React.useMemo(
    () => [...visibleTables].sort().join(','),
    [visibleTables],
  );

  // Stable version identifier derived from memoized form configs.
  const configVersion = React.useMemo(
    () => hash(memoFormConfigs),
    [memoFormConfigs],
  );

  const configVersionRef = useRef(configVersion);

  useEffect(() => {
    configVersionRef.current = configVersion;
  }, [configVersion]);

  useEffect(() => {
    procTriggerFetchesRef.current.clear();
    procTriggerLoadedRef.current.clear();
  }, [configVersion]);

  useEffect(() => {
    loadedTablesRef.current.clear();
    loadingTablesRef.current.clear();
  }, [visibleTablesKey, configVersion, branch, department]);

  // Reload form configs and column metadata when either the visible table set
  // or the form identifiers change. Because configVersion ignores layout-only
  // changes, layout adjustments still avoid reloads.
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    const tables = [config.masterTable, ...config.tables.map((t) => t.table)];
    const forms = [config.masterForm || '', ...config.tables.map((t) => t.form)];

    async function loadAll() {
      const fcMap = {};
      const colMap = {};
      const relMap = {};
      const relCfgMap = {};
      const relDataMap = {};

      const uniqueTables = Array.from(
        new Set(tables.filter((tbl) => typeof tbl === 'string' && tbl)),
      );
      const versionAtStart = configVersionRef.current;

      fetchTriggersForTables({
        tables: uniqueTables,
        fetcher: async (tbl) => {
          try {
            const res = await fetchWithAbort(
              `/api/proc_triggers?table=${encodeURIComponent(tbl)}`,
              { credentials: 'include' },
            );
            if (!res.ok) return {};
            const js = await res.json().catch(() => ({}));
            return js || {};
          } catch {
            return {};
          }
        },
        fetchesRef: procTriggerFetchesRef,
        loadedRef: procTriggerLoadedRef,
        applyResult: (tbl, data) => {
          if (unmountedRef.current) return false;
          if (configVersionRef.current !== versionAtStart) return false;
          setProcTriggersMap((prev) => {
            const prevData = prev[tbl];
            const nextData = isPlainRecord(data) ? data : {};
            if (isEqual(prevData, nextData)) return prev;
            return { ...prev, [tbl]: nextData };
          });
          return true;
        },
      });

      await Promise.all(
        tables.map(async (tbl, idx) => {
          if (!tbl) return;

          const form = forms[idx];
          let cfg = null;
          if (form) {
            try {
              const params = new URLSearchParams({
                table: tbl,
                name: form,
              });
              if (branch !== undefined && branch !== null && `${branch}`.trim() !== '') {
                params.set('branchId', branch);
              }
              if (
                department !== undefined &&
                department !== null &&
                `${department}`.trim() !== ''
              ) {
                params.set('departmentId', department);
              }
              if (userRightId !== undefined && userRightId !== null && `${userRightId}`.trim() !== '') {
                params.set('userRightId', userRightId);
              }
              if (workplaceId !== undefined && workplaceId !== null && `${workplaceId}`.trim() !== '') {
                params.set('workplaceId', workplaceId);
              }
              if (positionId !== undefined && positionId !== null && `${positionId}`.trim() !== '') {
                params.set('positionId', positionId);
              }
              if (
                workplacePositionId !== undefined &&
                workplacePositionId !== null &&
                `${workplacePositionId}`.trim() !== ''
              ) {
                params.set('workplacePositionId', workplacePositionId);
              }
              const res = await fetchWithAbort(
                `/api/transaction_forms?${params.toString()}`,
                { credentials: 'include' },
              );
              cfg = res.ok ? await res.json().catch(() => null) : null;
            } catch {
              cfg = null;
            }
          }

          if (form) {
            fcMap[tbl] = cfg || {};
          } else if (!(tbl in fcMap)) {
            fcMap[tbl] = {};
          }

          if (!loadedTablesRef.current.has(tbl)) {
            try {
              const colRes = await fetchWithAbort(
                `/api/tables/${encodeURIComponent(tbl)}/columns`,
                { credentials: 'include' },
              );
              const cols = colRes.ok ? await colRes.json().catch(() => []) : [];
              colMap[tbl] = cols || [];
              if (shouldLoadRelations(cfg, cols)) {
                const { dataMap, cfgMap, rowMap } = await loadRelations(tbl);
                if (Object.keys(dataMap).length)
                  relMap[tbl] = dataMap;
                if (Object.keys(cfgMap).length)
                  relCfgMap[tbl] = cfgMap;
                if (Object.keys(rowMap).length)
                  relDataMap[tbl] = rowMap;
              } else {
                debugLog(`Skipping relations fetch for ${tbl}`);
              }
            } catch {
              /* ignore */
            } finally {
              loadedTablesRef.current.add(tbl);
            }
          }
        }),
      );

      if (cancelled) return;

      setFormConfigs((prev) => {
        let changed = false;
        const merged = { ...prev };
        Object.entries(fcMap).forEach(([tbl, cfg]) => {
          const prevCfg = prev[tbl];
          const nextCfg = cfg || {};
          if (!isEqual(prevCfg, nextCfg)) {
            merged[tbl] = nextCfg;
            changed = true;
          }
        });
        return changed ? merged : prev;
      });
      if (Object.keys(colMap).length)
        setColumnMeta((prev) => ({ ...prev, ...colMap }));
      if (Object.keys(relMap).length)
        setRelationsMap((prev) => ({ ...prev, ...relMap }));
      if (Object.keys(relCfgMap).length)
        setRelationConfigs((prev) => ({ ...prev, ...relCfgMap }));
      if (Object.keys(relDataMap).length)
        setRelationData((prev) => ({ ...prev, ...relDataMap }));
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [visibleTablesKey, configVersion, branch, department]);

  const memoFieldTypeMap = useMemo(() => {
    const map = {};
    Object.entries(columnMeta).forEach(([tbl, cols]) => {
      if (!visibleTables.has(tbl)) return;
      const inner = {};
      cols.forEach((c) => {
        const typ = (
          c.type ||
          c.columnType ||
          c.dataType ||
          c.DATA_TYPE ||
          ''
        ).toLowerCase();
        if (typ.match(/int|decimal|numeric|double|float|real|number|bigint/)) {
          inner[c.name] = 'number';
        } else if (typ.includes('timestamp') || typ.includes('datetime')) {
          inner[c.name] = 'datetime';
        } else if (typ.includes('date')) {
          inner[c.name] = 'date';
        } else if (typ.includes('time')) {
          inner[c.name] = 'time';
        } else {
          inner[c.name] = 'string';
        }
      });
      map[tbl] = inner;
    });
    return map;
  }, [visibleTablesKey, configVersion, columnMeta]);

  const memoColumnCaseMap = useMemo(() => {
    const map = {};
    Object.entries(columnMeta).forEach(([tbl, cols]) => {
      if (!visibleTables.has(tbl)) return;
      const inner = {};
      cols.forEach((c) => {
        inner[c.name.toLowerCase()] = c.name;
      });
      map[tbl] = inner;
    });
    return map;
  }, [visibleTablesKey, configVersion, columnMeta]);

  const editableFieldLookup = useMemo(() => {
    const lookup = {};

    const normalizeList = (source, caseMap = {}) => {
      const seen = new Set();
      const result = [];
      walkEditableFieldValues(
        source,
        (field) => {
          if (field == null) return;
          const raw = String(field).trim();
          if (!raw) return;
          const lower = raw.toLowerCase();
          const canonical = caseMap[lower] || raw;
          const canonicalLower = canonical.toLowerCase();
          if (!seen.has(canonicalLower)) {
            seen.add(canonicalLower);
            result.push(canonical);
          }
        },
        { skipKeys: ['hasExplicitConfig'] },
      );
      return result;
    };

    Object.entries(memoFormConfigs).forEach(([tbl, fc]) => {
      if (!fc) return;
      const caseMap = memoColumnCaseMap[tbl] || {};
      const sources = [
        { value: fc.editableDefaultFields, explicit: fc.editableDefaultFields !== undefined },
        { value: fc.editableFields, explicit: fc.editableFields !== undefined },
        { value: fc.inlineEditableFields, explicit: fc.inlineEditableFields !== undefined },
        { value: fc.editableFieldMap, explicit: fc.editableFieldMap !== undefined },
      ];
      const combined = new Set();
      let hasExplicitConfig = false;
      sources.forEach(({ value, explicit }) => {
        if (explicit) hasExplicitConfig = true;
        normalizeList(value, caseMap).forEach((field) => combined.add(field));
      });
      if (combined.size > 0 || hasExplicitConfig) {
        lookup[tbl] = {
          fields: combined,
          hasExplicitConfig,
        };
      }
    });

    return lookup;
  }, [memoFormConfigs, memoColumnCaseMap, visibleTablesKey, configVersion]);

  const computedFieldMap = useMemo(
    () =>
      buildComputedFieldMap(
        normalizedCalcFields,
        config?.posFields || [],
        memoColumnCaseMap,
        tableList,
      ),
    [
      normalizedCalcFields,
      config?.posFields,
      memoColumnCaseMap,
      tableList,
    ],
  );

  const memoNumericScaleMap = useMemo(() => {
    const map = {};
    const parseScale = (col) => {
      if (!col || typeof col !== 'object') return null;
      const direct =
        col.numericScale ?? col.NUMERIC_SCALE ?? col.scale ?? col.SCALE ?? null;
      if (direct !== null && direct !== undefined) {
        const num = Number(direct);
        return Number.isNaN(num) ? null : num;
      }
      const typeSource = col.columnType || col.COLUMN_TYPE || col.type || '';
      if (typeof typeSource === 'string') {
        const match = typeSource.match(/\((\d+)\s*,\s*(\d+)\)/);
        if (match) {
          const scale = Number(match[2]);
          return Number.isNaN(scale) ? null : scale;
        }
      }
      return null;
    };
    Object.entries(columnMeta).forEach(([tbl, cols]) => {
      if (!visibleTables.has(tbl)) return;
      const inner = {};
      cols.forEach((c) => {
        const scale = parseScale(c);
        if (scale !== null && scale !== undefined) {
          inner[c.name] = scale;
        }
      });
      map[tbl] = inner;
    });
    return map;
  }, [visibleTablesKey, configVersion, columnMeta]);

  const generatedColumnPipelines = useMemo(() => {
    if (!config) return {};
    const tables = [];
    if (config.masterTable) tables.push(config.masterTable);
    if (Array.isArray(config.tables)) {
      config.tables.forEach((t) => {
        if (t?.table) tables.push(t.table);
      });
    }
    const result = {};
    tables.forEach((tbl) => {
      const columns = columnMeta[tbl] || [];
      if (!Array.isArray(columns) || columns.length === 0) return;
      const caseMap = memoColumnCaseMap[tbl] || {};
      const fc = memoFormConfigs[tbl] || {};
      const collectFields = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') return [value];
        if (typeof value === 'object') {
          const list = [];
          Object.values(value).forEach((item) => {
            if (Array.isArray(item)) list.push(...item);
            else if (typeof item === 'string') list.push(item);
          });
          return list;
        }
        return [];
      };
      const mapFieldName = (field) => {
        if (typeof field !== 'string' || !field) return null;
        const lower = field.toLowerCase();
        const mapped = caseMap[lower] || field;
        return typeof mapped === 'string' ? mapped : field;
      };
      const mainSet = new Set();
      [
        ...collectFields(fc.mainFields),
        ...collectFields(fc.main),
        ...collectFields(fc.visibleFields),
        ...collectFields(fc.fields),
      ].forEach((field) => {
        const mapped = mapFieldName(field);
        if (mapped) mainSet.add(mapped);
      });
      const metadataCandidates = [
        ...collectFields(fc.headerFields),
        ...collectFields(fc.header),
        ...collectFields(fc.footerFields),
        ...collectFields(fc.footer),
        ...collectFields(fc.totalAmountFields),
        ...collectFields(fc.totalCurrencyFields),
      ];
      const metadataSet = new Set();
      metadataCandidates.forEach((field) => {
        const mapped = mapFieldName(field);
        if (mapped && !mainSet.has(mapped)) metadataSet.add(mapped);
      });
      const pipeline = createGeneratedColumnPipeline({
        tableColumns: columns,
        columnCaseMap: caseMap,
        mainFields: mainSet.size > 0 ? mainSet : undefined,
        metadataFields: metadataSet.size > 0 ? metadataSet : undefined,
        equals: valuesEqual,
      });
      if (Object.keys(pipeline.evaluators).length === 0) return;
      result[tbl] = pipeline;
    });
    return result;
  }, [config, columnMeta, memoColumnCaseMap, memoFormConfigs]);

  const recalcTotals = useCallback(
    (vals) =>
      recalcPosTotals(vals, {
        calcFields: normalizedCalcFields,
        pipelines: generatedColumnPipelines,
        posFields: config?.posFields,
      }),
    [normalizedCalcFields, generatedColumnPipelines, config?.posFields],
  );

  const memoRelationConfigs = useMemo(() => {
    const map = {};
    visibleTables.forEach((tbl) => {
      if (relationConfigs[tbl]) map[tbl] = relationConfigs[tbl];
    });
    return map;
  }, [visibleTablesKey, configVersion, relationConfigs]);

  const memoRelationData = useMemo(() => {
    const map = {};
    visibleTables.forEach((tbl) => {
      if (relationData[tbl]) map[tbl] = relationData[tbl];
    });
    return map;
  }, [visibleTablesKey, configVersion, relationData]);

  const memoViewDisplaysMap = useMemo(() => {
    const map = {};
    visibleTables.forEach((tbl) => {
      if (viewDisplaysMap[tbl]) map[tbl] = viewDisplaysMap[tbl];
    });
    return map;
  }, [visibleTablesKey, configVersion, viewDisplaysMap]);

  const memoViewColumnsMap = useMemo(() => {
    const map = {};
    visibleTables.forEach((tbl) => {
      if (viewColumnsMap[tbl]) map[tbl] = viewColumnsMap[tbl];
    });
    return map;
  }, [visibleTablesKey, configVersion, viewColumnsMap]);

  useEffect(() => {
    if (!config) {
      setSessionFields(null);
      return;
    }
    setSessionFields(extractSessionFieldsFromConfig(config));
  }, [visibleTablesKey, configVersion, config]);

  const masterSessionValue = React.useMemo(() => {
    if (!config) return undefined;
    const masterSf = (sessionFields || []).find(
      (f) => f.table === config.masterTable,
    );
    if (!masterSf) return undefined;
    return values[config.masterTable]?.[masterSf.field];
  }, [values, config, sessionFieldsKey]);

  useEffect(() => {
    if (!masterSessionValue) return;
    setCurrentSessionId((prev) => (prev === masterSessionValue ? prev : masterSessionValue));
  }, [masterSessionValue]);

  useEffect(() => {
    if (!currentSessionId) return;
    setValues((prev) => {
      const next = applySessionIdToValues(prev, currentSessionId);
      if (next === prev) return prev;
      return recalcTotals(cloneValuesForRecalc(next));
    });
  }, [currentSessionId, applySessionIdToValues]);

  useEffect(() => {
    if (!config) return;
    if (sessionFields === null) return;
    const tables = [config.masterTable, ...config.tables.map((t) => t.table)];
    if (!tables.every((tbl) => memoFormConfigs[tbl])) return;
    const initKey = `${name}::${sessionFieldsKey}`;
    if (initRef.current === initKey) return;
    const prevKey = initRef.current;
    initRef.current = initKey;
    if (prevKey && prevKey.startsWith(`${name}::`) && currentSessionId) {
      setValues((prev) => {
        const next = applySessionIdToValues(prev, currentSessionId);
        if (next === prev) return prev;
        return recalcTotals(cloneValuesForRecalc(next));
      });
      return;
    }
    handleNew();
  }, [
    visibleTablesKey,
    configVersion,
    name,
    sessionFields,
    sessionFieldsKey,
    currentSessionId,
    applySessionIdToValues,
  ]);


  useEffect(() => {
    if (!config) return;
    if (masterSessionValue === undefined) return;
    const updateSessionValues = (prev) => {
      let next = prev;
      for (const sf of sessionFields || []) {
        if (sf.table === config.masterTable) continue;
        const tblVal = next[sf.table];
        if (Array.isArray(tblVal)) {
          let tableChanged = false;
          const updated = tblVal.map((r) => {
            if (r[sf.field] === masterSessionValue) return r;
            tableChanged = true;
            return { ...r, [sf.field]: masterSessionValue };
          });
          if (tableChanged) next = { ...next, [sf.table]: updated };
          continue;
        }
        const cur = tblVal?.[sf.field];
        if (cur !== masterSessionValue) {
          next = {
            ...next,
            [sf.table]: { ...(tblVal || {}), [sf.field]: masterSessionValue },
          };
        }
      }
      return next;
    };
    setValues((prev) => {
      const next = updateSessionValues(prev);
      if (next === prev) return prev;
      return recalcTotals(cloneValuesForRecalc(next));
    });
  }, [masterSessionValue, visibleTablesKey, configVersion, sessionFieldsKey]);

  const hasData = React.useMemo(() => {
    return Object.values(values).some((v) => {
      if (Array.isArray(v)) return v.length > 0;
      return v && Object.keys(v).length > 0;
    });
  }, [values]);

  function handleChange(tbl, changes) {
    setValues((v) => {
      const prev = v?.[tbl];
      const desiredRow = isPlainRecord(prev)
        ? { ...prev, ...changes }
        : { ...changes };
      const merged = { ...v, [tbl]: desiredRow };
      const recalculated = recalcTotals(merged);
      return preserveManualChangesAfterRecalc({
        table: tbl,
        changes,
        computedFieldMap,
        editableFieldMap: editableFieldLookup,
        desiredRow,
        recalculatedValues: recalculated,
      });
    });
  }

  function handleRowsChange(tbl, rows) {
    setValues((v) => {
      let next = { ...v, [tbl]: Array.isArray(rows) ? rows : [] };
      const sid = currentSessionId || masterSessionValue;
      if (sid) {
        next = applySessionIdToValues(next, sid);
      }
      return recalcTotals(next);
    });
  }

  async function handleSubmit(tbl, row) {
    const js = await postRow(addToast, tbl, row);
    if (js) addToast('Saved', 'success');
  }

  async function handleSaveLayout() {
    if (!name) return;
    const info = {};
    const list = [
      { table: config.masterTable },
      ...config.tables,
    ];
    list.forEach((t) => {
      const el = refs.current[t.table];
      if (el) {
        info[t.table] = {
          width: el.offsetWidth,
          height: el.offsetHeight,
          x: layout[t.table]?.x || 0,
          y: layout[t.table]?.y || 0,
        };
      }
    });
    await fetch('/api/pos_txn_layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, layout: info }),
    });
    addToast('Layout saved', 'success');
  }

  async function handleNew() {
    if (!config) return;
    setPostedId(null);
    clearEbarimtPreview();
    if ((pendingId || masterId) && hasData) {
      const save = window.confirm(
        'Save current transaction before starting new?',
      );
      if (save) await handleSavePending();
    }
    const sid = 'pos_' + Date.now().toString(36);
    let next = {};
    const allTables = [
      { table: config.masterTable, type: config.masterType },
      ...config.tables,
    ];
    allTables.forEach((t) => {
      next[t.table] = t.type === 'multi' ? [] : {};
    });
    next = applySessionIdToValues(next, sid);
    if (
      config.statusField?.table &&
      config.statusField.field &&
      config.statusField.created
    ) {
      const tbl = config.statusField.table;
      if (!next[tbl]) next[tbl] = {};
      next[tbl][config.statusField.field] = config.statusField.created;
    }
    Object.entries(memoFormConfigs).forEach(([tbl, fc]) => {
      const defs = fc.defaultValues || {};
      if (!next[tbl]) next[tbl] = {};
      Object.entries(defs).forEach(([k, v]) => {
        if (next[tbl][k] === undefined) next[tbl][k] = v;
      });
      if (fc.userIdFields && user?.empid !== undefined) {
        fc.userIdFields.forEach((f) => {
          if (next[tbl][f] === undefined) next[tbl][f] = user.empid;
        });
      }
      if (fc.branchIdFields && branch != null) {
        fc.branchIdFields.forEach((f) => {
          if (next[tbl][f] === undefined) next[tbl][f] = branch;
        });
      }
      if (fc.companyIdFields && company != null) {
        fc.companyIdFields.forEach((f) => {
          if (next[tbl][f] === undefined) next[tbl][f] = company;
        });
      }
      if (fc.transactionTypeField && fc.transactionTypeValue) {
        if (next[tbl][fc.transactionTypeField] === undefined) {
          next[tbl][fc.transactionTypeField] = fc.transactionTypeValue;
        }
      }
      if (fc.dateField && Array.isArray(fc.dateField)) {
        const now = formatTimestamp(new Date()).slice(0, 10);
        fc.dateField.forEach((f) => {
          if (next[tbl][f] === undefined || next[tbl][f] === '') {
            next[tbl][f] = now;
          }
        });
      }
    });
    setCurrentSessionId(sid);
    setValues(recalcTotals(cloneValuesForRecalc(next)));
    setMasterId(null);
    masterIdRef.current = null;
    setPendingId(null);
    addToast('New transaction started', 'success');
  }

  async function handleSavePending() {
    if (!name) return;
    let next = { ...values };
    if (
      config?.statusField?.table &&
      config.statusField.field &&
      config.statusField.beforePost
    ) {
      const tbl = config.statusField.table;
      if (!next[tbl]) next[tbl] = {};
      next[tbl][config.statusField.field] = config.statusField.beforePost;
    }
    // fill defaults and system fields when missing
    Object.entries(memoFormConfigs).forEach(([tbl, fc]) => {
      const defs = fc.defaultValues || {};
      if (!next[tbl]) next[tbl] = Array.isArray(values[tbl]) ? [] : {};
      const applyDefaults = (row) => {
        const updated = { ...row };
        Object.entries(defs).forEach(([k, v]) => {
          if (updated[k] === undefined) updated[k] = v;
        });
        if (fc.userIdFields && user?.empid !== undefined) {
          fc.userIdFields.forEach((f) => {
            if (updated[f] === undefined) updated[f] = user.empid;
          });
        }
        if (fc.branchIdFields && branch != null) {
          fc.branchIdFields.forEach((f) => {
            if (updated[f] === undefined) updated[f] = branch;
          });
        }
        if (fc.companyIdFields && company != null) {
          fc.companyIdFields.forEach((f) => {
            if (updated[f] === undefined) updated[f] = company;
          });
        }
        if (fc.transactionTypeField && fc.transactionTypeValue) {
          if (updated[fc.transactionTypeField] === undefined) {
            updated[fc.transactionTypeField] = fc.transactionTypeValue;
          }
        }
        return updated;
      };
      if (Array.isArray(next[tbl])) {
        next[tbl] = next[tbl].map((row) => applyDefaults(row));
      } else {
        next[tbl] = applyDefaults(next[tbl]);
      }
    });

    const mid = masterIdRef.current;
    const masterSf = (sessionFields || []).find(
      (f) => f.table === config.masterTable,
    );
    let sid = masterSf ? next[config.masterTable]?.[masterSf.field] : null;
    if (!sid) {
      sid =
        currentSessionId ||
        pendingId ||
        'pos_' + Date.now().toString(36);
    }
    next = applySessionIdToValues(next, sid);

    const session = {
      employeeId: user?.empid,
      companyId: company,
      branchId: branch,
      departmentId: department,
      date: formatTimestamp(new Date()),
    };
    try {
      const transportData = serializeValuesForTransport(next, multiTableSet);
      const res = await fetch('/api/pos_txn_pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: sid, name, data: transportData, masterId: mid, session }),
      });
      const js = await res.json().catch(() => ({}));
      if (js.id) {
        setPendingId(sid);
        setValues(recalcTotals(cloneValuesForRecalc(next)));
        addToast('Saved', 'success');
        setPostedId(null);
      } else {
        const msg = js.message || res.statusText;
        const field = parseErrorField(msg);
        addToast(`Save failed: ${msg}${field ? ` (field ${field})` : ''}`, 'error');
      }
    } catch (err) {
      addToast(`Save failed: ${err.message}`, 'error');
    }
  }

  async function handleLoadPending() {
    if (!name) return;
    setPostedId(null);
    clearEbarimtPreview();
    const list = await fetch(
      `/api/pos_txn_pending?name=${encodeURIComponent(name)}`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
    const arr = Object.entries(list).map(([id, rec]) => ({ id, ...rec }));
    if (arr.length === 0) { addToast('No pending', 'info'); return; }
    setPendingList(arr);
    setShowLoadModal(true);
  }

  async function selectPending(id) {
    setShowLoadModal(false);
    if (!id) return;
    const rec = await fetch(
      `/api/pos_txn_pending?id=${encodeURIComponent(id)}`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    if (rec && rec.data) {
      const restoredData = restoreValuesFromTransport(rec.data, multiTableSet);
      setValues(recalcTotals(cloneValuesForRecalc(restoredData)));
      setPendingId(String(id).trim());
      setMasterId(rec.masterId || null);
      masterIdRef.current = rec.masterId || null;
      setPostedId(rec.masterId || null);
      clearEbarimtPreview();
      const masterSf = (sessionFields || []).find(
        (f) => f.table === config?.masterTable,
      );
      if (masterSf) {
        const sid = restoredData?.[config.masterTable]?.[masterSf.field];
        setCurrentSessionId(sid || null);
      }
      addToast('Loaded', 'success');
    } else {
      addToast('Load failed', 'error');
    }
  }

  async function handleDeletePending() {
    if (!pendingId) return;
    if (!window.confirm('Delete pending transaction?')) return;
    try {
      const res = await fetch(
        `/api/pos_txn_pending?id=${encodeURIComponent(pendingId)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      if (!res.ok) {
        const js = await res.json().catch(() => ({}));
        addToast(js.message || 'Delete failed', 'error');
        return;
      }
      setPendingId(null);
      setPostedId(null);
      setValues(recalcTotals(cloneValuesForRecalc({})));
      setMasterId(null);
      masterIdRef.current = null;
      setCurrentSessionId(null);
      clearEbarimtPreview();
      addToast('Deleted', 'success');
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  }

  function buildPostRequest() {
    if (!name) return null;
    if (!config) return null;

    const isValueMissing = (val) => {
      if (val === undefined || val === null) return true;
      if (typeof val === 'string') return val.trim() === '';
      return false;
    };

    const resolveFieldLabel = (table, field) => {
      const cols = columnMeta[table];
      if (Array.isArray(cols)) {
        const lower = String(field).toLowerCase();
        for (const col of cols) {
          if (!col || typeof col !== 'object') continue;
          const name =
            col.name ||
            col.columnName ||
            col.column_name ||
            col.COLUMN_NAME ||
            col.COLUMNNAME ||
            '';
          if (typeof name === 'string' && name.toLowerCase() === lower) {
            return (
              col.label ||
              col.LABEL ||
              col.columnLabel ||
              col.COLUMN_COMMENT ||
              col.comment ||
              name
            );
          }
        }
      }
      return field;
    };

    const reportMissingField = (table, field, rowIndex) => {
      const fieldLabel = resolveFieldLabel(table, field);
      const tableLabel = memoFormConfigs[table]?.title || table;
      const rowSuffix =
        typeof rowIndex === 'number' ? ` (row ${rowIndex + 1})` : '';
      addToast(
        `Missing required field ${fieldLabel} in ${tableLabel}${rowSuffix}`,
        'error',
      );
    };

    for (const form of formList) {
      const table = form?.table;
      if (!table) continue;
      const fc = memoFormConfigs[table];
      if (!fc) continue;
      const required = Array.isArray(fc.requiredFields)
        ? fc.requiredFields.filter(Boolean)
        : [];
      if (required.length === 0) continue;

      const tableValues = values[table];
      if (form?.type === 'multi') {
        const rows = Array.isArray(tableValues) ? tableValues : [];

        for (const field of required) {
          if (
            Array.isArray(rows) &&
            Object.prototype.hasOwnProperty.call(rows, field) &&
            isValueMissing(rows[field])
          ) {
            reportMissingField(table, field);
            return null;
          }
        }

        for (let idx = 0; idx < rows.length; idx += 1) {
          const row = rows[idx];
          if (!isPlainRecord(row)) continue;
          for (const field of required) {
            if (
              !Object.prototype.hasOwnProperty.call(row, field) ||
              isValueMissing(row[field])
            ) {
              reportMissingField(table, field, idx);
              return null;
            }
          }
        }
      } else {
        const row = isPlainRecord(tableValues) ? tableValues : {};
        for (const field of required) {
          if (
            !Object.prototype.hasOwnProperty.call(row, field) ||
            isValueMissing(row[field])
          ) {
            reportMissingField(table, field);
            return null;
          }
        }
      }
    }

    let payload = applySessionIdToValues(
      { ...values },
      currentSessionId || masterSessionValue,
    );
    Object.entries(memoFormConfigs).forEach(([tbl, fc]) => {
      const defs = fc.defaultValues || {};
      if (!payload[tbl]) payload[tbl] = {};
      Object.entries(defs).forEach(([k, v]) => {
        if (payload[tbl][k] === undefined) payload[tbl][k] = v;
      });
    });
    const mismatch = findCalcFieldMismatch(payload, normalizedCalcFields);
    if (mismatch) {
      addToast('Mapping mismatch', 'error');
      return null;
    }

    const single = {};
    const multi = {};
    formList.forEach((t) => {
      if (!t?.table) return;
      const value = payload[t.table];
      if (t.type === 'multi') {
        const serialized = serializeRowsWithMetadata(value);
        multi[t.table] = serialized.meta
          ? { rows: serialized.rows, meta: serialized.meta }
          : { rows: serialized.rows };
      } else {
        single[t.table] = value;
      }
    });

    const postData = { masterId: masterIdRef.current, single, multi };
    const session = {
      employeeId: user?.empid,
      companyId: company,
      branchId: branch,
      departmentId: department,
      date: formatTimestamp(new Date()),
    };

    const currentPendingId = pendingId;

    const afterSuccess = async (js = {}) => {
      if (currentPendingId) {
        try {
          await fetch(
            `/api/pos_txn_pending?id=${encodeURIComponent(currentPendingId)}`,
            {
              method: 'DELETE',
              credentials: 'include',
            },
          );
        } catch {
          /* ignore */
        }
      }
      setPendingId(null);
      clearEbarimtPreview();
      if (js.id) setPostedId(js.id);
      if (
        config.statusField?.table &&
        config.statusField.field &&
        config.statusField.posted
      ) {
        setValues((v) => {
          const tbl = config.statusField.table;
          const field = config.statusField.field;
          const postedValue = config.statusField.posted;
          const existing = v?.[tbl]?.[field];
          if (existing === postedValue) return v;
          const next = {
            ...v,
            [tbl]: {
              ...(v?.[tbl] || {}),
              [field]: postedValue,
            },
          };
          return recalcTotals(cloneValuesForRecalc(next));
        });
      }

      const imgCfg = memoFormConfigs[config.masterTable] || {};
      if (!imgCfg.imageIdField || !js.id) return;
      const columnMap = (columnMeta[config.masterTable] || []).reduce(
        (m, c) => {
          m[c.name.toLowerCase()] = c.name;
          return m;
        },
        {},
      );
      const rowBefore = values[config.masterTable] || {};
      const oldImg =
        rowBefore._imageName ||
        buildImageName(rowBefore, imgCfg.imagenameField || [], columnMap).name;
      await new Promise((r) => setTimeout(r, 300));
      let rowAfter = rowBefore;
      try {
        const r2 = await fetch(
          `/api/tables/${encodeURIComponent(config.masterTable)}/${encodeURIComponent(js.id)}`,
          { credentials: 'include' },
        );
        if (r2.ok) {
          rowAfter = await r2.json().catch(() => rowBefore);
        }
      } catch {
        rowAfter = rowBefore;
      }
      const { name: newImg } = buildImageName(
        rowAfter,
        imgCfg.imagenameField || [],
        columnMap,
      );
      const t1 = rowAfter.trtype;
      const t2 =
        rowAfter.uitranstypename || rowAfter.transtype || rowAfter.transtypename;
      const folder = t1 && t2
        ? `${slugify(t1)}/${slugify(String(t2))}`
        : config.masterTable;
      if (oldImg && newImg && oldImg !== newImg) {
        const renameUrl =
          `/api/transaction_images/${config.masterTable}/${encodeURIComponent(oldImg)}/rename/${encodeURIComponent(newImg)}?folder=${encodeURIComponent(folder)}`;
        try {
          const rn = await fetch(renameUrl, {
            method: 'POST',
            credentials: 'include',
          });
          if (rn.ok) {
            const imgs = await rn.json().catch(() => []);
            (Array.isArray(imgs) ? imgs : []).forEach((p) =>
              addToast(`Image saved: ${p}`, 'success'),
            );
          }
        } catch {
          /* ignore */
        }
      }
    };

    return { body: { name, data: postData, session }, afterSuccess };
  }

  async function handlePostAll() {
    const request = buildPostRequest();
    if (!request) return;
    try {
      const res = await fetch('/api/pos_txn_post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request.body),
      });
      if (res.ok) {
        const js = await res.json().catch(() => ({}));
        await request.afterSuccess(js);
        addToast('Posted', 'success');
      } else {
        const js = await res.json().catch(() => ({}));
        const msg = js.message || res.statusText;
        const field = parseErrorField(msg);
        addToast(`Post failed: ${msg}${field ? ` (field ${field})` : ''}`, 'error');
      }
    } catch (err) {
      addToast(`Post failed: ${err.message}`, 'error');
    }
  }

  async function handlePostEbarimt() {
    if (!canIssueEbarimt) return;
    if (!name) {
      addToast('Select a POS layout before issuing Ebarimt.', 'error');
      return;
    }
    if (!postedId) {
      addToast('Post the transaction before issuing Ebarimt.', 'error');
      return;
    }
    setIsPostingEbarimt(true);
    try {
      const res = await fetch('/api/pos-txn-ebarimt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          recordId: postedId,
          posApiRequestVariation: selectedRequestVariation,
        }),
      });
      if (res.ok) {
        const js = await res.json().catch(() => ({}));
        addToast('Posted & Ebarimt issued', 'success');
        if (generalConfig?.general?.ebarimtToastEnabled && js?.posApi) {
          const payloadMessage = buildPosApiToastMessage(
            'POSAPI submission',
            js.posApi.payload,
            buildPosApiPayloadSummary,
          );
          if (payloadMessage) {
            addToast(payloadMessage, 'info');
          }
          const responseMessage = buildPosApiToastMessage(
            'POSAPI response',
            js.posApi.response,
            buildPosApiResponseSummary,
          );
          if (responseMessage) {
            addToast(responseMessage, 'info');
          }
        }
        const preview = buildEbarimtPreviewData(js);
        if (preview) {
          setEbarimtPreview(preview);
        } else {
          clearEbarimtPreview();
        }
      } else {
        const js = await res.json().catch(() => ({}));
        const msg = js.message || res.statusText;
        addToast(`Ebarimt post failed: ${msg}`, 'error');
      }
    } catch (err) {
      addToast(`Ebarimt post failed: ${err.message}`, 'error');
    } finally {
      setIsPostingEbarimt(false);
    }
  }

  function handlePrintEbarimtPreview() {
    if (!ebarimtPreview || !ebarimtQrImage) return;
    const normalizePrintNumber = (value, fallback = null) => {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
      return parsed;
    };
    const receiptFontSize = normalizePrintNumber(generalConfig?.print?.receiptFontSize);
    const receiptWidth = normalizePrintNumber(generalConfig?.print?.receiptWidth);
    const receiptHeight = normalizePrintNumber(generalConfig?.print?.receiptHeight);
    const receiptMargin = normalizePrintNumber(generalConfig?.print?.receiptMargin);
    const fontSizeRule = receiptFontSize ? `${receiptFontSize}px` : 'inherit';
    const pageWidth = receiptWidth ? `${receiptWidth}mm` : null;
    const pageHeight = receiptHeight ? `${receiptHeight}mm` : null;
    const pageMargin = receiptMargin ? `${receiptMargin}mm` : '0';
    const pageSize =
      pageWidth && pageHeight ? `${pageWidth} ${pageHeight}` : 'auto';
    const sheetWidthRule = pageWidth
      ? `width:${pageWidth};max-width:${pageWidth};`
      : 'width:auto;max-width:none;';
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      addToast('Unable to open print window', 'error');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(
      '<!DOCTYPE html><html><head><title>Ebarimt receipt</title>' +
        `<style>@page{size:${pageSize};margin:${pageMargin};}body{margin:0;font-family:sans-serif;font-size:${fontSizeRule};} .receipt-sheet{display:flex;flex-direction:column;align-items:center;gap:0.5rem;padding:${pageMargin};${sheetWidthRule}}</style>` +
        '</head><body><div class="receipt-sheet"></div></body></html>',
    );
    printWindow.document.close();
    const { document: doc } = printWindow;
    const container = doc.querySelector('.receipt-sheet') || doc.body;
    const createRow = (label, value) => {
      if (!value) return null;
      const row = doc.createElement('div');
      row.textContent = `${label}: ${value}`;
      return row;
    };
    const title = doc.createElement('h2');
    title.textContent = 'Ebarimt receipt';
    container.appendChild(title);
    const billRow = createRow('Bill ID', ebarimtPreview.billId || '-');
    if (billRow) container.appendChild(billRow);
    if (ebarimtPreview.invoiceNo) {
      const invoiceRow = createRow('Invoice No', ebarimtPreview.invoiceNo);
      if (invoiceRow) container.appendChild(invoiceRow);
    }
    if (ebarimtPreview.status) {
      const statusRow = createRow('Status', ebarimtPreview.status);
      if (statusRow) container.appendChild(statusRow);
    }
    if (ebarimtPreview.lottery) {
      const lotteryRow = createRow('Lottery', ebarimtPreview.lottery);
      if (lotteryRow) container.appendChild(lotteryRow);
    }
    if (ebarimtPreview.errorMessage) {
      const messageRow = createRow('Message', ebarimtPreview.errorMessage);
      if (messageRow) container.appendChild(messageRow);
    }
    const img = doc.createElement('img');
    img.src = ebarimtQrImage;
    img.alt = 'Ebarimt QR code';
    img.style.width = '260px';
    img.style.height = '260px';
    img.style.border = '1px solid #ccc';
    img.style.padding = '0.5rem';
    container.appendChild(img);
    printWindow.focus();
    printWindow.print();
  }

  function startDrag(table, e) {
    const startX = e.clientX;
    const startY = e.clientY;
    const cur = layout[table] || {};
    dragInfo.current = { table, startX, startY, x: cur.x || 0, y: cur.y || 0 };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
    e.preventDefault();
  }

  function onDrag(e) {
    if (!dragInfo.current) return;
    const { table, startX, startY, x, y } = dragInfo.current;
    const nx = x + e.clientX - startX;
    const ny = y + e.clientY - startY;
    setLayout((l) => ({ ...l, [table]: { ...l[table], x: nx, y: ny } }));
  }

  function endDrag() {
    dragInfo.current = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  }
  const configNames = Object.keys(configs);

  return (
    <div>
      <h2>{config?.label || 'POS Transactions'}</h2>
      {configNames.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <select
            value={name}
            onChange={e => {
              const newName = e.target.value;
              setName(newName);
              initRef.current = '';
            }}
          >
            <option value="">-- select config --</option>
            {configNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}
      {config && (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <button onClick={handleSaveLayout}>Save Layout</button>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <button onClick={handleNew} style={{ marginRight: '0.5rem' }}>New</button>
            <button onClick={handleSavePending} style={{ marginRight: '0.5rem' }} disabled={!name || !hasData}>Save</button>
            <button onClick={handleLoadPending} style={{ marginRight: '0.5rem' }} disabled={!name}>Load</button>
            <button onClick={handleDeletePending} style={{ marginRight: '0.5rem' }} disabled={!pendingId}>Delete</button>
            <button onClick={handlePostAll} disabled={!name}>POST</button>
            {canIssueEbarimt && requestVariations.length > 0 && (
              <label
                style={{
                  marginLeft: '0.5rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span style={{ fontWeight: 600 }}>Request variation</span>
                <select
                  value={selectedRequestVariation}
                  onChange={(e) => {
                    userSelectedVariationRef.current = true;
                    setSelectedRequestVariation(e.target.value);
                  }}
                  disabled={isPostingEbarimt}
                >
                  <option value="">Base request</option>
                  {requestVariations.map((variation, index) => {
                    const value = variation?.key || variation?.name || `variation-${index + 1}`;
                    return (
                      <option key={value} value={value}>
                        {variation?.name || variation?.key || value}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
            {canIssueEbarimt && (
              <button
                onClick={handlePostEbarimt}
                style={{ marginLeft: '0.5rem' }}
                disabled={!name || !postedId || isPostingEbarimt}
              >
                {isPostingEbarimt ? 'Posting…' : 'Post to Ebarimt'}
              </button>
            )}
          </div>
          {(pendingId || postedId) && (
            <div style={{ marginBottom: '0.5rem' }}>
              {pendingId && <span style={{ marginRight: '1rem' }}>Pending ID: {pendingId}</span>}
              {postedId && <span>Posted ID: {postedId}</span>}
            </div>
          )}
          {canIssueEbarimt && ebarimtPreview && (
            <div
              style={{
                marginBottom: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                padding: '0.75rem',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                Latest Ebarimt
              </div>
              <div>Bill ID: {ebarimtPreview.billId || '-'}</div>
              <div>Status: {ebarimtPreview.status || '-'}</div>
              {ebarimtPreview.invoiceNo && <div>Invoice No: {ebarimtPreview.invoiceNo}</div>}
              {ebarimtPreview.lottery && <div>Lottery: {ebarimtPreview.lottery}</div>}
              {ebarimtPreview.errorMessage && (
                <div style={{ color: '#a11' }}>
                  Message: {ebarimtPreview.errorMessage}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  marginTop: '0.5rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {ebarimtQrImage ? (
                  <img
                    src={ebarimtQrImage}
                    alt="Ebarimt QR code"
                    style={{
                      width: '160px',
                      height: '160px',
                      border: '1px solid #ddd',
                      padding: '0.25rem',
                      background: '#fff',
                    }}
                  />
                ) : (
                  <span>No QR code available</span>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {ebarimtQrImage && (
                    <button type="button" onClick={handlePrintEbarimtPreview}>
                      Print Ebarimt
                    </button>
                  )}
                  <button type="button" onClick={clearEbarimtPreview}>
                    Clear preview
                  </button>
                </div>
              </div>
            </div>
          )}
          <div
            style={
              isNarrow
                ? { display: 'flex', flexDirection: 'column', gap: '0.5rem' }
                : {
                    display: 'grid',
                    gap: '0',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gridTemplateRows: 'auto auto auto auto auto',
                  }
            }
          >
            {formList
              .filter(t => t.position !== 'hidden')
              .map((t, idx) => {
                const fc = memoFormConfigs[t.table];
                if (!fc) return <div key={idx}>Loading...</div>;
                const meta = columnMeta[t.table] || [];
                const labels = {};
                meta.forEach((c) => {
                  labels[c.name || c] = c.label || c.name || c;
                });
                const caseMap = memoColumnCaseMap[t.table] || {};
                const canonicalizeFields = (source) => {
                  const seen = new Set();
                  const result = [];
                  walkEditableFieldValues(
                    source,
                    (field) => {
                      if (field == null) return;
                      const raw = String(field).trim();
                      if (!raw) return;
                      const mapped = caseMap[raw.toLowerCase()] || raw;
                      if (!seen.has(mapped)) {
                        seen.add(mapped);
                        result.push(mapped);
                      }
                    },
                    { skipKeys: ['hasExplicitConfig'] },
                  );
                  return result;
                };
                const visible = canonicalizeFields(fc.visibleFields);
                const headerFields = canonicalizeFields(fc.headerFields);
                const mainFields = canonicalizeFields(fc.mainFields);
                const footerFields = canonicalizeFields(fc.footerFields);
                const totalAmountFields = canonicalizeFields(fc.totalAmountFields);
                const totalCurrencyFields = canonicalizeFields(fc.totalCurrencyFields);
                const allFields = Array.from(
                  new Set([...visible, ...headerFields, ...mainFields, ...footerFields]),
                );
                const canonicalizeField = (lowerField) => {
                  if (typeof lowerField !== 'string' || !lowerField) return null;
                  const fromCaseMap = caseMap[lowerField];
                  if (typeof fromCaseMap === 'string' && fromCaseMap) {
                    return fromCaseMap;
                  }
                  const match = allFields.find(
                    (field) => typeof field === 'string' && field.toLowerCase() === lowerField,
                  );
                  if (match) return match;
                  return lowerField;
                };
                const computedEntry = computedFieldMap?.[t.table];
                const disabled = [];
                const disabledLower = new Set();
                const disabledFieldReasons = {};
                const addDisabledField = (fieldName, reasons = []) => {
                  if (typeof fieldName !== 'string' || !fieldName) return;
                  const normalizedLower = fieldName.toLowerCase();
                  if (!disabledLower.has(normalizedLower)) {
                    disabledLower.add(normalizedLower);
                    disabled.push(fieldName);
                  }
                  if (!Array.isArray(reasons) || reasons.length === 0) return;
                  const normalizedReasons = Array.from(
                    new Set(
                      reasons
                        .map((code) => (code === undefined || code === null ? '' : String(code)))
                        .map((code) => code.trim())
                        .filter((code) => code),
                    ),
                  );
                  if (normalizedReasons.length === 0) return;
                  const existingKey = Object.keys(disabledFieldReasons).find(
                    (key) => typeof key === 'string' && key.toLowerCase() === normalizedLower,
                  );
                  const targetKey = existingKey || fieldName;
                  const existing = Array.isArray(disabledFieldReasons[targetKey])
                    ? disabledFieldReasons[targetKey]
                    : [];
                  const merged = Array.from(new Set([...existing, ...normalizedReasons]));
                  if (merged.length > 0) {
                    disabledFieldReasons[targetKey] = merged;
                  }
                };
                if (computedEntry instanceof Set) {
                  const reasonLookup = computedEntry.reasonMap;
                  const allowedReasons = new Set(['calcField', 'posFormula']);
                  computedEntry.forEach((lowerField) => {
                    if (typeof lowerField !== 'string' || !lowerField) return;
                    const canonical = canonicalizeField(lowerField);
                    if (!canonical) return;
                    const reasonSet =
                      reasonLookup instanceof Map ? reasonLookup.get(lowerField) : null;
                    if (reasonSet instanceof Set) {
                      const reasons = Array.from(reasonSet)
                        .map((code) => (code === undefined || code === null ? '' : String(code)))
                        .map((code) => code.trim())
                        .filter((code) => allowedReasons.has(code));
                      if (reasons.length === 0 && reasonSet.size > 0) {
                        return;
                      }
                      addDisabledField(canonical, reasons);
                      return;
                    }
                    addDisabledField(canonical);
                  });
                }
                const editableEntry = editableFieldLookup?.[t.table];
                if (editableEntry?.hasExplicitConfig) {
                  const allowedLower = new Set();
                  const collectAllowed = (field) => {
                    if (typeof field !== 'string' || !field) return;
                    const canonical = canonicalizeField(field.toLowerCase());
                    if (!canonical) return;
                    allowedLower.add(canonical.toLowerCase());
                  };
                  if (editableEntry.fields instanceof Set) {
                    editableEntry.fields.forEach((field) => {
                      collectAllowed(field);
                    });
                  } else if (Array.isArray(editableEntry.fields)) {
                    editableEntry.fields.forEach((field) => {
                      collectAllowed(field);
                    });
                  } else if (editableEntry.fields && typeof editableEntry.fields === 'object') {
                    Object.values(editableEntry.fields).forEach((value) => {
                      if (value instanceof Set) {
                        value.forEach((field) => collectAllowed(field));
                      } else if (Array.isArray(value)) {
                        value.forEach((field) => collectAllowed(field));
                      } else {
                        collectAllowed(value);
                      }
                    });
                  } else {
                    collectAllowed(editableEntry.fields);
                  }
                  allFields.forEach((field) => {
                    if (typeof field !== 'string' || !field) return;
                    const canonical = canonicalizeField(field.toLowerCase());
                    if (!canonical) return;
                    const normalizedLower = canonical.toLowerCase();
                    if (allowedLower.has(normalizedLower)) return;
                    addDisabledField(canonical, ['missingEditableConfig']);
                  });
                }
                const posStyle = {
                  top_row: { gridColumn: '1 / span 3', gridRow: '1' },
                  upper_left: { gridColumn: '1', gridRow: '2' },
                  upper_right: { gridColumn: '3', gridRow: '2' },
                  left: { gridColumn: '1', gridRow: '3' },
                  right: { gridColumn: '3', gridRow: '3' },
                  lower_left: { gridColumn: '1', gridRow: '4' },
                  lower_right: { gridColumn: '3', gridRow: '4' },
                  bottom_row: { gridColumn: '1 / span 3', gridRow: '5' },
                }[t.position] || { gridColumn: '2', gridRow: '3' };
                const saved = layout[t.table] || {};
                return (
                  <div
                    key={idx}
                    ref={(el) => (refs.current[t.table] = el)}
                    style={{
                      border: '1px solid #ccc',
                      resize: 'both',
                      overflow: 'auto',
                      width: saved.width || 'auto',
                      height: saved.height || 'auto',
                      margin: isNarrow ? '0 0 0.5rem 0' : '-1px',
                      transform: isNarrow
                        ? undefined
                        : `translate(${saved.x || 0}px, ${saved.y || 0}px)`,
                      position: 'relative',
                      ...(isNarrow ? {} : posStyle),
                    }}
                  >
                    <h3
                      style={{ margin: '0.5rem', cursor: 'move' }}
                      onMouseDown={(e) => startDrag(t.table, e)}
                    >
                      {t.table}
                    </h3>
                    <RowFormModal
                      key={`rf-${t.table}-${generalConfig.pos.boxWidth}`}
                      inline
                      visible
                      columns={allFields}
                      disabledFields={disabled}
                      disabledFieldReasons={disabledFieldReasons}
                      requiredFields={fc.requiredFields || []}
                      labels={labels}
                      row={values[t.table]}
                      rows={t.type === 'multi' ? values[t.table] : undefined}
                      headerFields={headerFields}
                      mainFields={mainFields}
                      footerFields={footerFields}
                      defaultValues={fc.defaultValues || {}}
                      totalAmountFields={totalAmountFields}
                      totalCurrencyFields={totalCurrencyFields}
                      numericScaleMap={memoNumericScaleMap[t.table] || {}}
                      table={t.table}
                      imagenameField={
                        memoFormConfigs[t.table]?.imagenameField || []
                      }
                      imageIdField={
                        memoFormConfigs[t.table]?.imageIdField || ''
                      }
                      relations={relationsMap[t.table] || {}}
                      relationConfigs={memoRelationConfigs[t.table] || {}}
                      relationData={memoRelationData[t.table] || {}}
                      procTriggers={procTriggersMap[t.table] || {}}
                      viewSource={fc.viewSource || {}}
                      viewDisplays={memoViewDisplaysMap[t.table] || {}}
                      viewColumns={memoViewColumnsMap[t.table] || {}}
                      loadView={loadView}
                      user={user}
                      fieldTypeMap={memoFieldTypeMap[t.table] || {}}
                      columnCaseMap={memoColumnCaseMap[t.table] || {}}
                      tableColumns={columnMeta[t.table] || []}
                      onChange={(changes) => handleChange(t.table, changes)}
                      onRowsChange={(rows) => handleRowsChange(t.table, rows)}
                      onSubmit={() => true}
                      useGrid={t.view === 'table' || t.type === 'multi'}
                      fitted={t.view === 'fitted'}
                      scope="pos"
                      dateField={fc.dateField || []}
                      onNextForm={() => {
                        let next = idx + 1;
                        while (next < formList.length) {
                          const nf = memoFormConfigs[formList[next].table];
                          const provided = Array.isArray(nf?.editableFields)
                            ? nf.editableFields
                            : [];
                          const defaults = Array.isArray(nf?.editableDefaultFields)
                            ? nf.editableDefaultFields
                            : [];
                          const ed = Array.from(new Set([...defaults, ...provided]));
                          if (ed.length > 0) break;
                          next += 1;
                        }
                        if (next < formList.length) focusFirst(formList[next].table);
                      }}
                    />
                  </div>
                );
              })}
          </div>
          <PendingSelectModal
            visible={showLoadModal}
            list={pendingList}
            onSelect={selectPending}
            onClose={() => setShowLoadModal(false)}
          />
        </>
      )}
    </div>
  );
}
