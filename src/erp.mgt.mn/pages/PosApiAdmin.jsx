import React, { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../utils/apiBase.js';
import { useToast } from '../context/ToastContext.jsx';

const POSAPI_TRANSACTION_TYPES = [
  { value: 'B2C', label: 'B2C receipt' },
  { value: 'B2B_SALE', label: 'B2B sale invoice' },
  { value: 'B2B_PURCHASE', label: 'B2B purchase invoice' },
  { value: 'STOCK_QR', label: 'Stock QR' },
];

const POSAPI_INFO_TYPES = [{ value: 'LOOKUP', label: 'Information lookup' }];
const POSAPI_ADMIN_TYPES = [
  { value: 'AUTH', label: 'Authentication / Token' },
  { value: 'ADMIN', label: 'Admin utility' },
];
const ALL_POSAPI_TYPES = [
  ...POSAPI_TRANSACTION_TYPES,
  ...POSAPI_INFO_TYPES,
  ...POSAPI_ADMIN_TYPES,
];
const USAGE_TYPE_OPTIONS = {
  transaction: POSAPI_TRANSACTION_TYPES,
  info: POSAPI_INFO_TYPES,
  admin: POSAPI_ADMIN_TYPES,
  auth: POSAPI_ADMIN_TYPES.filter((type) => type.value === 'AUTH'),
};
const USAGE_DEFAULT_TYPE = {
  transaction: '',
  info: 'LOOKUP',
  admin: 'ADMIN',
  auth: 'AUTH',
};

const TAX_TYPES = [
  { value: 'VAT_ABLE', label: 'VAT-able' },
  { value: 'VAT_FREE', label: 'VAT-free' },
  { value: 'VAT_ZERO', label: 'VAT zero' },
  { value: 'NO_VAT', label: 'No VAT' },
];

const PAYMENT_TYPES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'PAYMENT_CARD', label: 'Payment card' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'MOBILE_WALLET', label: 'Mobile wallet' },
  { value: 'EASY_BANK_CARD', label: 'Easy Bank card' },
  { value: 'SERVICE_PAYMENT', label: 'Service payment' },
];

const PAYMENT_DESCRIPTIONS = {
  CASH: 'Cash payment received at the point of sale.',
  PAYMENT_CARD: 'Payment settled through a credit or debit card.',
  BANK_TRANSFER: 'Funds received via inter-bank transfer.',
  MOBILE_WALLET: 'Payment collected through a registered mobile wallet.',
  EASY_BANK_CARD: 'Payment made with an Easy Bank issued card.',
  SERVICE_PAYMENT: 'Payment processed through a service-only channel.',
};

const PAYMENT_BADGES = {
  CASH: '#047857',
  PAYMENT_CARD: '#7c3aed',
  BANK_TRANSFER: '#2563eb',
  MOBILE_WALLET: '#0f766e',
  EASY_BANK_CARD: '#d97706',
  SERVICE_PAYMENT: '#db2777',
};

const METHOD_BADGES = {
  GET: '#38bdf8',
  POST: '#34d399',
  PUT: '#818cf8',
  PATCH: '#fbbf24',
  DELETE: '#f87171',
};

const TYPE_BADGES = {
  B2C: '#1d4ed8',
  B2B_SALE: '#0f172a',
  B2B_PURCHASE: '#7c3aed',
  STOCK_QR: '#0ea5e9',
  AUTH: '#047857',
  LOOKUP: '#0ea5e9',
  ADMIN: '#7f1d1d',
};

const TAX_PRODUCT_OPTIONS = [
  { value: 'A12345', label: 'Example – VAT exemption (A12345)' },
  { value: 'B20000', label: 'Example – zero-rated export (B20000)' },
  { value: 'C30000', label: 'Example – non-VAT product (C30000)' },
];

const USAGE_OPTIONS = [
  { value: 'transaction', label: 'Transaction – triggered during form submission' },
  { value: 'info', label: 'Information lookup – fetches reference data' },
  { value: 'admin', label: 'Admin utility – management-only endpoints' },
  { value: 'auth', label: 'Authentication' },
];

const USAGE_BADGES = {
  transaction: '#047857',
  info: '#1d4ed8',
  admin: '#78350f',
  auth: '#047857',
};

const DEFAULT_RECEIPT_TYPES = POSAPI_TRANSACTION_TYPES.map((type) => type.value);
const DEFAULT_TAX_TYPES = TAX_TYPES.map((tax) => tax.value);
const DEFAULT_PAYMENT_METHODS = PAYMENT_TYPES.map((payment) => payment.value);
const VALID_RECEIPT_TYPES = new Set(DEFAULT_RECEIPT_TYPES);
const VALID_TAX_TYPES = new Set(DEFAULT_TAX_TYPES);
const VALID_PAYMENT_METHODS = new Set(DEFAULT_PAYMENT_METHODS);
const VALID_USAGE_VALUES = new Set(USAGE_OPTIONS.map((opt) => opt.value));
const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000;
const DEFAULT_INFO_TABLE_OPTIONS = [
  { value: 'posapi_reference_codes', label: 'POSAPI reference codes' },
];
const BASE_COMBINATION_KEY = '__posapi-base__';
const BASE_COMPLEX_REQUEST_SCHEMA = createReceiptTemplate('B2C');
const TRANSACTION_POSAPI_TYPES = new Set(['B2C', 'B2B_SALE', 'B2B_PURCHASE', 'TRANSACTION', 'STOCK_QR']);

const DEFAULT_ENV_RESOLVER = () => ({ found: false, value: '', error: '' });

function extractUserParameters(values) {
  if (!values || typeof values !== 'object') return {};
  const entries = Object.entries(values).filter(([key, value]) => {
    if (key === '_endpointId') return false;
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') {
      return value.trim() !== '';
    }
    return true;
  });
  return Object.fromEntries(entries);
}

function normalizeHeaderList(headers) {
  if (!headers) return [];
  if (Array.isArray(headers)) {
    return headers
      .map((entry) => {
        if (Array.isArray(entry) && entry.length >= 2) return { name: entry[0], value: entry[1] };
        if (entry && typeof entry === 'object' && entry.name) return { name: entry.name, value: entry.value };
        return null;
      })
      .filter((item) => item && item.name);
  }
  if (typeof headers === 'object') {
    return Object.entries(headers).map(([name, value]) => ({ name, value }));
  }
  return [];
}

function formatDurationMs(duration) {
  const numeric = Number(duration);
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  return `${numeric.toLocaleString()} ms`;
}

function normalizeUsage(value) {
  return VALID_USAGE_VALUES.has(value) ? value : 'transaction';
}

function sanitizeCodeList(list, fallback, allowedValues) {
  const allowedSet =
    allowedValues instanceof Set
      ? allowedValues
      : Array.isArray(allowedValues)
        ? new Set(allowedValues)
        : null;
  const source = Array.isArray(list) ? list : fallback;
  const cleaned = source
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value && (!allowedSet || allowedSet.has(value)));
  const fallbackList = Array.isArray(fallback) ? fallback : [];
  const fallbackCleaned = fallbackList
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value && (!allowedSet || allowedSet.has(value)));
  const effective = cleaned.length > 0 ? cleaned : fallbackCleaned;
  const deduped = Array.from(new Set(effective));
  return allowedSet ? deduped.filter((value) => allowedSet.has(value)) : deduped;
}

function sanitizeTemplateMap(value, allowedValues) {
  if (!value) return {};
  const allowedSet = allowedValues ? new Set(allowedValues) : null;
  const entries = Array.isArray(value)
    ? value
        .map((entry) => {
          if (!entry) return null;
          if (Array.isArray(entry) && entry.length >= 2) {
            return entry;
          }
          if (typeof entry === 'object') {
            const key =
              typeof entry.code === 'string'
                ? entry.code
                : typeof entry.value === 'string'
                  ? entry.value
                  : typeof entry.key === 'string'
                    ? entry.key
                    : '';
            const text =
              typeof entry.json === 'string'
                ? entry.json
                : typeof entry.text === 'string'
                  ? entry.text
                  : typeof entry.sample === 'string'
                    ? entry.sample
                    : entry.payload && typeof entry.payload === 'string'
                      ? entry.payload
                      : entry.json && typeof entry.json === 'object'
                        ? JSON.stringify(entry.json, null, 2)
                        : '';
            return [key, text];
          }
          return null;
        })
        .filter(Boolean)
    : Object.entries(value);
  const normalized = {};
  entries.forEach(([rawKey, rawValue]) => {
    const code = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!code) return;
    if (allowedSet && !allowedSet.has(code)) return;
    let text = '';
    if (typeof rawValue === 'string') {
      text = rawValue.trim();
    } else if (rawValue && typeof rawValue === 'object') {
      text = JSON.stringify(rawValue, null, 2);
    }
    if (!text) return;
    normalized[code] = text;
  });
  return normalized;
}

function hasObjectEntries(value) {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function sanitizeTemplateList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      if (entry && typeof entry === 'object') {
        if (typeof entry.json === 'string') {
          return entry.json.trim();
        }
        return JSON.stringify(entry, null, 2);
      }
      return '';
    })
    .map((text) => text.trim())
    .filter(Boolean);
}

function buildTemplateMap(source, allowedValues) {
  if (!source || typeof source !== 'object') return {};
  const allowedSet = allowedValues ? new Set(allowedValues) : null;
  return Object.entries(source).reduce((acc, [rawKey, rawText]) => {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key) return acc;
    if (allowedSet && !allowedSet.has(key)) return acc;
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) return acc;
    acc[key] = text;
    return acc;
  }, {});
}

function buildTemplateList(list, allowMultiple) {
  const sanitized = sanitizeTemplateList(list);
  if (!allowMultiple) {
    return sanitized.slice(0, 1);
  }
  return sanitized;
}

function buildDefaultRequestSchema(type, supportsItems = true, supportsMultiplePayments = true) {
  const normalizedType = type || 'B2C';
  return normaliseBuilderForType(BASE_COMPLEX_REQUEST_SCHEMA, normalizedType, supportsItems, supportsMultiplePayments);
}

function applySchemaFeatureFlags(schema, supportsItems = true, supportsMultiplePayments = true) {
  const working = deepClone(schema) || {};
  if (!supportsItems && Array.isArray(working.receipts)) {
    working.receipts = working.receipts.map((receipt) => {
      if (!receipt || typeof receipt !== 'object') return receipt;
      const { items, ...rest } = receipt;
      return rest;
    });
  }
  if (!supportsMultiplePayments) {
    delete working.payments;
  }
  return working;
}

function formatTableLabel(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  return normalized
    .split(/[_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function normalizeTableValue(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  const match = normalized.match(/\(([A-Za-z0-9_]+)\)$/);
  if (match && match[1]) {
    return match[1];
  }
  return normalized;
}

function formatTableDisplay(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized) return normalized;
  const baseLabel = typeof label === 'string' ? label.trim() : '';
  return baseLabel || '';
}

function buildTableOptions(tables) {
  if (!Array.isArray(tables)) return [];
  return tables
    .map((table) => {
      if (!table) return null;
      if (typeof table === 'string') {
        const normalizedValue = normalizeTableValue(table);
        return { value: normalizedValue, label: formatTableDisplay(normalizedValue) };
      }
      if (typeof table === 'object') {
        const value = [
          table.value,
          table.table_name,
          table.tableName,
          table.name,
        ]
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .find(Boolean);
        if (!value) return null;
        const normalizedValue = normalizeTableValue(value);
        const label = table.label || table.table_comment || table.comment || table.description;
        return { value: normalizedValue, label: formatTableDisplay(normalizedValue, label) };
      }
      return null;
    })
    .filter(Boolean);
}

function sanitizeTableSelection(selection, options) {
  const allowedValues = Array.isArray(options) ? options.map((option) => option.value) : [];
  const allowedSet = new Set(allowedValues.filter(Boolean));
  const values = Array.isArray(selection) ? selection : [];
  const normalized = values
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object' && typeof entry.value === 'string') {
        return entry.value.trim();
      }
      return '';
    })
    .filter(Boolean);
  const unique = Array.from(new Set(normalized));
  if (allowedSet.size === 0) return unique;
  return unique.filter((value) => allowedSet.has(value));
}

function sanitizeInfoFieldMappings(mappings, allowedTables) {
  const result = {};
  const allowedSet = new Set((allowedTables || []).filter(Boolean));
  if (!mappings || typeof mappings !== 'object') return result;
  Object.entries(mappings).forEach(([endpointId, fieldMap]) => {
    if (!endpointId || !fieldMap || typeof fieldMap !== 'object') return;
    const tableMap = {};
    Object.entries(fieldMap).forEach(([sourceField, target]) => {
      const source = typeof sourceField === 'string' ? sourceField.trim() : '';
      const table = typeof target?.table === 'string' ? target.table.trim() : '';
      const column = typeof target?.column === 'string' ? target.column.trim() : '';
      if (!source || !table || !column) return;
      if (allowedSet.size > 0 && !allowedSet.has(table)) return;
      tableMap[source] = { table, column };
    });
    if (Object.keys(tableMap).length > 0) {
      result[endpointId] = tableMap;
    }
  });
  return result;
}

function extractFieldName(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return (
    field.field ||
    field.column ||
    field.column_name ||
    field.columnName ||
    field.COLUMN_NAME ||
    field.COLUMN ||
    field.field_name ||
    field.fieldName ||
    field.name ||
    ''
  );
}

function normalizeFieldList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const extractFromObject = (obj = {}) => {
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj).map(([key, value]) => {
      if (value && typeof value === 'object') {
        const name = extractFieldName(value) || key;
        return { name, ...value };
      }
      return { name: key, value };
    });
  };

  const mapObjectFieldsToList = (fieldsObj = {}) => {
    return Object.entries(fieldsObj).map(([key, value]) => {
      if (value && typeof value === 'object') {
        const name = extractFieldName(value) || key;
        return { name, ...value };
      }
      const name = typeof value === 'string' ? value : key;
      return { name };
    });
  };

  if (Array.isArray(payload.fields)) return payload.fields;
  if (Array.isArray(payload.data?.fields)) return payload.data.fields;
  if (payload.data?.fields && typeof payload.data.fields === 'object') {
    const values = Object.values(payload.data.fields);
    if (values.every((value) => value && (typeof value === 'object' || typeof value === 'string'))) {
      return values;
    }
  }
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.columns)) return payload.columns;
  if (Array.isArray(payload.data?.columns)) return payload.data.columns;

  if (payload.fields && typeof payload.fields === 'object') {
    const entries = mapObjectFieldsToList(payload.fields);
    if (entries.every((value) => value && (typeof value === 'object' || typeof value === 'string'))) {
      return entries;
    }
  }
  if (payload.result && typeof payload.result === 'object') {
    const entries = extractFromObject(payload.result);
    if (entries.length > 0) return entries;
  }
  if (payload.data && typeof payload.data === 'object') {
    const entries = extractFromObject(payload.data);
    if (entries.length > 0) return entries;
  }

  return [];
}

function deriveEndpointId(endpoint) {
  if (!endpoint || typeof endpoint !== 'object') return '';
  const candidates = [endpoint.id, endpoint.name, endpoint.path, endpoint.url, endpoint.endpoint];
  const raw = candidates
    .map((value) => (value === undefined || value === null ? '' : `${value}`))
    .find((value) => value.trim());
  if (raw) {
    return raw
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-_./]+/g, '-');
  }
  if (endpoint.method && endpoint.path) {
    return `${endpoint.method}-${endpoint.path}`
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-_./]+/g, '-');
  }
  return '';
}

function withEndpointMetadata(endpoint) {
  if (!endpoint || typeof endpoint !== 'object') return endpoint;
  const normalizedId = deriveEndpointId(endpoint)
    || (endpoint.id === undefined || endpoint.id === null ? '' : `${endpoint.id}`);
  const normalizeUrlSelection = (literal, envVar, mode) => {
    const trimmedLiteral = typeof literal === 'string' ? literal.trim() : '';
    const trimmedEnv = typeof envVar === 'string' ? envVar.trim() : '';
    const normalizedMode = normalizeUrlMode(mode, trimmedEnv);
    if (normalizedMode === 'env' && trimmedEnv) {
      return { literal: trimmedLiteral, envVar: trimmedEnv, mode: 'env' };
    }
    if (normalizedMode === 'env' && !trimmedEnv && trimmedLiteral) {
      return { literal: trimmedLiteral, envVar: '', mode: 'literal' };
    }
    if (!trimmedLiteral && trimmedEnv) {
      return { literal: '', envVar: trimmedEnv, mode: 'env' };
    }
    return { literal: trimmedLiteral, envVar: trimmedEnv, mode: 'literal' };
  };
  const usage = endpoint.posApiType === 'AUTH'
    ? 'auth'
    : endpoint.posApiType === 'LOOKUP'
      ? 'info'
      : normalizeUsage(endpoint.usage);
  const isTransaction = usage === 'transaction';
  const enableReceiptTypes = isTransaction ? endpoint.enableReceiptTypes !== false : false;
  const enableReceiptTaxTypes = isTransaction ? endpoint.enableReceiptTaxTypes !== false : false;
  const enablePaymentMethods = isTransaction ? endpoint.enablePaymentMethods !== false : false;
  const enableReceiptItems = isTransaction ? endpoint.enableReceiptItems !== false : false;
  const allowMultipleReceiptTypes = enableReceiptTypes ? endpoint.allowMultipleReceiptTypes !== false : false;
  const allowMultipleReceiptTaxTypes = enableReceiptTaxTypes
    ? endpoint.allowMultipleReceiptTaxTypes !== false
    : false;
  const allowMultiplePaymentMethods = enablePaymentMethods
    ? endpoint.allowMultiplePaymentMethods !== false
    : false;
  const allowMultipleReceiptItems = enableReceiptItems
    ? endpoint.allowMultipleReceiptItems !== false
    : false;
  const receiptTypes = enableReceiptTypes
    ? sanitizeCodeList(endpoint.receiptTypes, DEFAULT_RECEIPT_TYPES, VALID_RECEIPT_TYPES)
    : [];
  const taxTypes = enableReceiptTaxTypes
    ? sanitizeCodeList(
        endpoint.taxTypes || endpoint.receiptTaxTypes,
        DEFAULT_TAX_TYPES,
        VALID_TAX_TYPES,
      )
    : [];
  const paymentMethods = enablePaymentMethods
    ? sanitizeCodeList(endpoint.paymentMethods, DEFAULT_PAYMENT_METHODS, VALID_PAYMENT_METHODS)
    : [];
  const receiptTypeTemplates = enableReceiptTypes
    ? sanitizeTemplateMap(endpoint.receiptTypeTemplates, VALID_RECEIPT_TYPES)
    : {};
  const taxTypeTemplates = enableReceiptTaxTypes
    ? sanitizeTemplateMap(endpoint.taxTypeTemplates, VALID_TAX_TYPES)
    : {};
  const paymentMethodTemplates = enablePaymentMethods
    ? sanitizeTemplateMap(endpoint.paymentMethodTemplates, VALID_PAYMENT_METHODS)
    : {};
  const receiptItemTemplates = enableReceiptItems
    ? buildTemplateList(endpoint.receiptItemTemplates, allowMultipleReceiptItems)
    : [];
  let supportsItems = false;
  if (isTransaction) {
    if (endpoint.supportsItems === false) {
      supportsItems = false;
    } else if (endpoint.supportsItems === true) {
      supportsItems = true;
    } else {
      supportsItems = endpoint.posApiType === 'STOCK_QR' ? false : true;
    }
  }
  return {
    ...endpoint,
    id: normalizedId,
    usage,
    defaultForForm: isTransaction ? Boolean(endpoint.defaultForForm) : false,
    supportsMultipleReceipts: isTransaction ? Boolean(endpoint.supportsMultipleReceipts) : false,
    supportsMultiplePayments: isTransaction ? Boolean(endpoint.supportsMultiplePayments) : false,
    supportsItems,
    enableReceiptTypes,
    allowMultipleReceiptTypes: enableReceiptTypes ? allowMultipleReceiptTypes : false,
    receiptTypeTemplates,
    enableReceiptTaxTypes,
    allowMultipleReceiptTaxTypes: enableReceiptTaxTypes ? allowMultipleReceiptTaxTypes : false,
    taxTypeTemplates,
    enablePaymentMethods,
    allowMultiplePaymentMethods: enablePaymentMethods ? allowMultiplePaymentMethods : false,
    paymentMethodTemplates,
    enableReceiptItems,
    allowMultipleReceiptItems: enableReceiptItems ? allowMultipleReceiptItems : false,
    receiptItemTemplates,
    receiptTypes,
    taxTypes,
    paymentMethods,
    notes: typeof endpoint.notes === 'string' ? endpoint.notes : '',
    serverUrl: typeof endpoint.serverUrl === 'string' ? endpoint.serverUrl : '',
    productionServerUrl: typeof endpoint.productionServerUrl === 'string'
      ? endpoint.productionServerUrl
      : '',
    testServerUrl: typeof endpoint.testServerUrl === 'string' ? endpoint.testServerUrl : '',
    testServerUrlProduction: typeof endpoint.testServerUrlProduction === 'string'
      ? endpoint.testServerUrlProduction
      : '',
    authEndpointId: typeof endpoint.authEndpointId === 'string' ? endpoint.authEndpointId : '',
    serverUrlEnvVar: typeof endpoint.serverUrlEnvVar === 'string' ? endpoint.serverUrlEnvVar.trim() : '',
    testServerUrlEnvVar:
      typeof endpoint.testServerUrlEnvVar === 'string' ? endpoint.testServerUrlEnvVar.trim() : '',
    productionServerUrlEnvVar: typeof endpoint.productionServerUrlEnvVar === 'string'
      ? endpoint.productionServerUrlEnvVar.trim()
      : '',
    testServerUrlProductionEnvVar: typeof endpoint.testServerUrlProductionEnvVar === 'string'
      ? endpoint.testServerUrlProductionEnvVar.trim()
      : '',
    ...(() => {
      const normalizedServer = normalizeUrlSelection(
        endpoint.serverUrl,
        endpoint.serverUrlEnvVar,
        endpoint.serverUrlMode,
      );
      const normalizedTest = normalizeUrlSelection(
        endpoint.testServerUrl,
        endpoint.testServerUrlEnvVar,
        endpoint.testServerUrlMode,
      );
      const normalizedProd = normalizeUrlSelection(
        endpoint.productionServerUrl,
        endpoint.productionServerUrlEnvVar,
        endpoint.productionServerUrlMode,
      );
      const normalizedTestProd = normalizeUrlSelection(
        endpoint.testServerUrlProduction,
        endpoint.testServerUrlProductionEnvVar,
        endpoint.testServerUrlProductionMode,
      );
      return {
        serverUrl: normalizedServer.literal,
        serverUrlEnvVar: normalizedServer.envVar,
        serverUrlMode: normalizedServer.mode,
        testServerUrl: normalizedTest.literal,
        testServerUrlEnvVar: normalizedTest.envVar,
        testServerUrlMode: normalizedTest.mode,
        productionServerUrl: normalizedProd.literal,
        productionServerUrlEnvVar: normalizedProd.envVar,
        productionServerUrlMode: normalizedProd.mode,
        testServerUrlProduction: normalizedTestProd.literal,
        testServerUrlProductionEnvVar: normalizedTestProd.envVar,
        testServerUrlProductionMode: normalizedTestProd.mode,
      };
    })(),
  };
}

function normalizeEndpointList(list = []) {
  const seen = new Set();
  return list.map((endpoint, index) => {
    if (!endpoint || typeof endpoint !== 'object') return endpoint;
    const baseId = (endpoint.id === undefined || endpoint.id === null ? '' : `${endpoint.id}`)
      || deriveEndpointId(endpoint)
      || `endpoint-${index + 1}`;
    let id = baseId;
    let counter = 2;
    while (seen.has(id)) {
      id = `${baseId}-${counter}`;
      counter += 1;
    }
    seen.add(id);
    return { ...endpoint, id };
  });
}

function badgeStyle(color) {
  return {
    background: color,
    color: '#fff',
    borderRadius: '999px',
    padding: '0.1rem 0.5rem',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    display: 'inline-block',
  };
}

const EMPTY_ENDPOINT = {
  id: '',
  name: '',
  category: '',
  method: 'GET',
  path: '',
  parametersText: '[]',
  requestDescription: '',
  requestSchemaText: '{}',
  requestSampleText: '{}',
  requestSampleNotes: '',
  responseDescription: '',
  responseSchemaText: '',
  fieldDescriptionsText: '',
  requestFieldsText: '[]',
  responseFieldsText: '[]',
  examplesText: '[]',
  variations: [],
  requestFieldVariations: [],
  preRequestScript: '',
  testScript: '',
  testable: false,
  serverUrl: '',
  serverUrlEnvVar: '',
  serverUrlMode: 'literal',
  testServerUrl: '',
  testServerUrlEnvVar: '',
  testServerUrlMode: 'literal',
  productionServerUrl: '',
  productionServerUrlEnvVar: '',
  productionServerUrlMode: 'literal',
  testServerUrlProduction: '',
  testServerUrlProductionEnvVar: '',
  testServerUrlProductionMode: 'literal',
  authEndpointId: '',
  docUrl: '',
  posApiType: '',
  usage: 'transaction',
  settingsId: '',
  defaultForForm: false,
  supportsMultipleReceipts: false,
  supportsMultiplePayments: false,
  supportsItems: true,
  enableReceiptTypes: true,
  allowMultipleReceiptTypes: true,
  receiptTypeTemplates: {},
  enableReceiptTaxTypes: true,
  allowMultipleReceiptTaxTypes: true,
  taxTypeTemplates: {},
  enablePaymentMethods: true,
  allowMultiplePaymentMethods: true,
  paymentMethodTemplates: {},
  enableReceiptItems: true,
  allowMultipleReceiptItems: true,
  receiptItemTemplates: [''],
  receiptTypes: DEFAULT_RECEIPT_TYPES.slice(),
  taxTypes: DEFAULT_TAX_TYPES.slice(),
  paymentMethods: DEFAULT_PAYMENT_METHODS.slice(),
  topLevelFieldsText: '[]',
  nestedPathsText: '{}',
  notes: '',
  requestEnvMap: {},
  responseFieldMappings: {},
  responseTables: [],
};

const PAYMENT_FIELD_DESCRIPTIONS = {
  payments: 'Breakdown of how the receipt or invoice was paid.',
  'payments[].type':
    'Payment method code. Supported values: CASH, PAYMENT_CARD, BANK_TRANSFER, MOBILE_WALLET, EASY_BANK_CARD.',
  'payments[].amount': 'Amount paid with the selected payment method.',
};

function createReceiptTemplate(type, overrides = {}) {
  const isB2B = type.startsWith('B2B');
  const base = {
    type,
    taxType: 'VAT_ABLE',
    branchNo: '101',
    posNo: 'POS-01',
    merchantTin: '2099099123',
    totalAmount: 110000,
    totalVAT: 10000,
    totalCityTax: 1000,
    receipts: [
      {
        taxType: 'VAT_ABLE',
        totalAmount: 110000,
        totalVAT: 10000,
        totalCityTax: 1000,
        items: [
          {
            name: 'Sample good or service',
            barCode: '1234567890123',
            barCodeType: 'EAN_13',
            classificationCode: 'G1234',
            taxProductCode: 'A12345',
            measureUnit: 'PCS',
            qty: 1,
            price: 100000,
            vatTaxType: 'VAT_ABLE',
            cityTax: 1000,
            lotNo: 'LOT-01',
          },
        ],
      },
    ],
    payments: [
      {
        type: 'CASH',
        amount: 110000,
      },
    ],
  };
  if (isB2B) {
    base.customerTin = '5012345';
  } else {
    base.consumerNo = '99001122';
  }
  return { ...base, ...overrides };
}

function createStockQrTemplate() {
  return {
    type: 'STOCK_QR',
    merchantTin: '<merchant-tin>',
    branchNo: '<branch-number>',
    posNo: '<pos-number>',
    stockCodes: [
      {
        code: '<stock-code>',
        name: 'Sample item',
        classificationCode: '<classification-code>',
        qty: 1,
        measureUnit: 'PCS',
        lotNo: '',
      },
    ],
  };
}

function resolveTemplate(type) {
  switch (type) {
    case 'B2C':
    case 'B2B_SALE':
    case 'B2B_PURCHASE':
      return createReceiptTemplate(type);
    case 'STOCK_QR':
      return createStockQrTemplate();
    default:
      return { type };
  }
}

function deepClone(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    console.error('Failed to clone value', err);
    return undefined;
  }
}

function createReceiptGroup(taxType = 'VAT_ABLE', withItems = true) {
  return {
    taxType,
    totalAmount: 0,
    totalVAT: taxType === 'VAT_ABLE' ? 0 : undefined,
    totalCityTax: taxType === 'VAT_ABLE' ? 0 : undefined,
    taxProductCode: taxType === 'VAT_FREE' || taxType === 'VAT_ZERO' ? '' : undefined,
    items: withItems ? [createReceiptItem(taxType)] : undefined,
  };
}

function createReceiptItem(taxType = 'VAT_ABLE') {
  return {
    name: '',
    barCode: '',
    barCodeType: 'EAN_13',
    classificationCode: '',
    taxProductCode: taxType === 'VAT_FREE' || taxType === 'VAT_ZERO' ? '' : undefined,
    measureUnit: 'PCS',
    qty: 1,
    price: 0,
    vatTaxType: taxType,
    cityTax: taxType === 'VAT_ABLE' ? 0 : undefined,
    lotNo: '',
  };
}

function normalizeReceiptByTaxType(receipt, taxType) {
  const updated = { ...receipt, taxType };
  if (taxType === 'VAT_ABLE') {
    updated.totalVAT = updated.totalVAT ?? 0;
    updated.totalCityTax = updated.totalCityTax ?? 0;
    updated.taxProductCode = undefined;
  } else if (taxType === 'VAT_FREE' || taxType === 'VAT_ZERO') {
    updated.totalVAT = undefined;
    updated.totalCityTax = undefined;
    updated.taxProductCode = updated.taxProductCode ?? '';
  } else {
    updated.totalVAT = undefined;
    updated.totalCityTax = undefined;
    updated.taxProductCode = undefined;
  }
  const items = Array.isArray(updated.items) ? updated.items : [];
  updated.items = items.map((item) => ({
    ...item,
    vatTaxType: taxType,
    taxProductCode: taxType === 'VAT_FREE' || taxType === 'VAT_ZERO'
      ? item.taxProductCode ?? ''
      : undefined,
    cityTax: taxType === 'VAT_ABLE' ? item.cityTax ?? 0 : undefined,
  }));
  if (updated.items.length === 0) {
    updated.items = undefined;
  }
  return updated;
}

function createStockItem() {
  return {
    code: '',
    name: '',
    classificationCode: '',
    qty: 1,
    measureUnit: 'PCS',
    lotNo: '',
  };
}

function normaliseBuilderForType(builder, type, withItems = true, withPayments = true) {
  const template = resolveTemplate(type);
  const base = typeof builder === 'object' && builder !== null ? deepClone(builder) : {};
  const next = { ...template, ...base, type };

  if (type === 'STOCK_QR') {
    const stock = Array.isArray(base?.stockCodes) && base.stockCodes.length > 0
      ? base.stockCodes
      : template.stockCodes;
    next.stockCodes = deepClone(stock) || template.stockCodes || [createStockItem()];
    delete next.receipts;
    delete next.payments;
    delete next.totalAmount;
    delete next.totalVAT;
    delete next.totalCityTax;
    delete next.taxType;
    delete next.consumerNo;
    delete next.customerTin;
  } else {
    if (type.startsWith('B2B')) {
      next.customerTin = base?.customerTin || template.customerTin || '<buyer-tin>';
      delete next.consumerNo;
    } else {
      next.consumerNo = base?.consumerNo || template.consumerNo || '<consumer-id-or-phone>';
      delete next.customerTin;
    }
    const receipts = Array.isArray(base?.receipts) && base.receipts.length > 0
      ? base.receipts
      : template.receipts;
    next.receipts = deepClone(receipts) || template.receipts || [createReceiptGroup('VAT_ABLE', withItems)];
    if (!Array.isArray(next.receipts)) {
      next.receipts = [createReceiptGroup('VAT_ABLE', withItems)];
    }
    if (!withItems) {
      next.receipts = next.receipts.map((receipt) => {
        const cleaned = { ...receipt };
        delete cleaned.items;
        return cleaned;
      });
    } else {
      next.receipts = next.receipts.map((receipt) => {
        const items = Array.isArray(receipt.items) && receipt.items.length > 0
          ? receipt.items
          : [createReceiptItem(receipt.taxType || 'VAT_ABLE')];
        return { ...receipt, items };
      });
    }
    if (withPayments) {
      const payments = Array.isArray(base?.payments) && base.payments.length > 0
        ? base.payments
        : template.payments;
      next.payments = deepClone(payments) || template.payments || [
        {
          type: 'CASH',
          amount: next.totalAmount || 0,
        },
      ];
    } else {
      delete next.payments;
    }
    next.totalAmount = base?.totalAmount ?? template.totalAmount;
    next.totalVAT = base?.totalVAT ?? template.totalVAT;
    next.totalCityTax = base?.totalCityTax ?? template.totalCityTax;
    next.taxType = base?.taxType ?? template.taxType;
  }

  return next;
}

function formatTypeLabel(type) {
  if (!type) return '';
  const hit = ALL_POSAPI_TYPES.find((opt) => opt.value === type);
  return hit ? hit.label : type;
}

function formatUsageLabel(usage) {
  if (!usage) return '';
  const hit = USAGE_OPTIONS.find((opt) => opt.value === usage);
  if (!hit) return usage;
  const [shortLabel] = hit.label.split(' – ');
  return shortLabel || hit.label;
}

function toPrettyJson(value, fallback = '') {
  if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) {
    return fallback;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback || '';
  }
}

function parseHintPreview(text, arrayErrorMessage) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { state: 'empty', items: [], error: '' };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return {
        state: 'error',
        items: [],
        error: arrayErrorMessage || 'Hint list must be a JSON array',
      };
    }
    return { state: 'ok', items: parsed, error: '' };
  } catch (err) {
    return { state: 'error', items: [], error: err.message || 'Invalid JSON' };
  }
}

function parseParametersPreview(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { state: 'empty', items: [], error: '' };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return { state: 'error', items: [], error: 'Parameters must be a JSON array' };
    }
    return { state: 'ok', items: normalizeParametersFromSpec(parsed), error: '' };
  } catch (err) {
    return { state: 'error', items: [], error: err.message || 'Invalid JSON' };
  }
}

const DEFAULT_POSAPI_ENV_VARS = ['POSAPI_CLIENT_ID', 'POSAPI_CLIENT_SECRET'];

function listPosApiEnvVariables(extraKeys = []) {
  const keys = new Set(DEFAULT_POSAPI_ENV_VARS);
  (extraKeys || [])
    .map((key) => normalizeEnvVarName(typeof key === 'string' ? key : ''))
    .filter(Boolean)
    .forEach((key) => keys.add(key));
  return Array.from(keys).sort();
}

function normalizeUrlMode(mode, envVar) {
  if (mode === 'env') return 'env';
  if (mode === 'literal') return 'literal';
  return envVar ? 'env' : 'literal';
}

function hasUrlSelectionValue(selection) {
  if (!selection) return false;
  const literal = typeof selection.literal === 'string' ? selection.literal.trim() : '';
  const envVar = typeof selection.envVar === 'string' ? selection.envVar.trim() : '';
  const mode = normalizeUrlMode(selection.mode, envVar);
  if (literal) return true;
  return mode === 'env' && Boolean(envVar);
}

function normalizeEnvVarName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/^{{\s*/, '').replace(/\s*}}$/, '').trim();
}

function splitScriptText(text = '') {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveUrlWithEnv({ literal, envVar, mode }) {
  const trimmedLiteral = typeof literal === 'string' ? literal.trim() : '';
  const trimmedEnvVar = normalizeEnvVarName(envVar);
  const normalizedMode = normalizeUrlMode(mode, trimmedEnvVar);
  const hasEnvVar = normalizedMode === 'env' && Boolean(trimmedEnvVar);
  return {
    resolved: trimmedLiteral,
    display: trimmedLiteral || (hasEnvVar ? `(env: ${trimmedEnvVar})` : ''),
    hasValue: Boolean(trimmedLiteral || hasEnvVar),
    missing: false,
    mode: normalizedMode,
    envVar: trimmedEnvVar,
    literal: trimmedLiteral,
  };
}

function tokenizeFieldPath(path) {
  if (!path) return [];
  return String(path)
    .split('.')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => ({ key: token.replace(/\[\]/g, ''), isArray: /\[\]/.test(token) }));
}

function readValueAtPath(source, path) {
  if (!source || typeof source !== 'object') return undefined;
  const tokens = tokenizeFieldPath(path);
  let current = source;
  for (const token of tokens) {
    if (current === undefined || current === null) return undefined;
    if (token.isArray) {
      if (!Array.isArray(current[token.key])) return undefined;
      current = current[token.key][0];
    } else {
      current = current[token.key];
    }
  }
  return current;
}

function setValueAtPath(target, path, value) {
  if (!path || !target || typeof target !== 'object') return false;
  const tokens = tokenizeFieldPath(path);
  if (!tokens.length) return false;
  let current = target;
  tokens.forEach((token, index) => {
    if (typeof current !== 'object' || current === null) {
      current = null;
      return;
    }
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
  return current !== null;
}

function buildRequestSampleFromSelections(
  baseSample,
  selections,
  {
    resolveEnv = false,
    preferPlaceholders = false,
    fallbackToLiteral = true,
    onError,
    useEnvPlaceholders = true,
  } = {},
) {
  const result = baseSample && typeof baseSample === 'object' && !Array.isArray(baseSample)
    ? { ...baseSample }
    : {};
  Object.entries(selections || {}).forEach(([fieldPath, entry]) => {
    if (!fieldPath) return;
    const mode = entry?.mode || 'literal';
    const placeholder = entry?.envVar ? `{{${entry.envVar}}}` : '';
    if (mode === 'env' && entry?.envVar) {
      if (!resolveEnv) {
        const sampleValue = useEnvPlaceholders
          ? placeholder
          : entry?.literal !== undefined && entry.literal !== null
            ? entry.literal
            : '';
        setValueAtPath(result, fieldPath, sampleValue);
        return;
      }

      const { found, value, error } = resolveEnvironmentVariable(entry.envVar, { parseJson: true });
      if (!found) {
        const fallbackValue = fallbackToLiteral && entry?.literal !== undefined && entry.literal !== ''
          ? parseScalarValue(entry.literal)
          : placeholder;
        if (typeof onError === 'function') {
          const fallbackLabel = fallbackToLiteral ? 'literal' : 'placeholder';
          onError(
            error
              ? `Environment variable ${entry.envVar} is invalid: ${error}`
              : `Environment variable ${entry.envVar} is not configured; using ${fallbackLabel} value for ${fieldPath}.`,
          );
        }
        if (!setValueAtPath(result, fieldPath, fallbackValue) && typeof onError === 'function') {
          onError(`Could not assign environment value for ${fieldPath}.`);
        }
        return;
        }

      const parsedValue = preferPlaceholders ? placeholder : value;
      if (!isPrimitiveValue(parsedValue)) {
        const fallbackValue = fallbackToLiteral && entry?.literal !== undefined && entry.literal !== ''
          ? parseScalarValue(entry.literal)
          : placeholder;
        if (typeof onError === 'function') {
          const fallbackLabel = fallbackToLiteral ? 'literal' : 'placeholder';
          onError(
            `Environment variable ${entry.envVar} must resolve to a primitive value; using ${fallbackLabel} value for ${fieldPath}.`,
          );
        }
        setValueAtPath(result, fieldPath, fallbackValue);
        return;
      }
      if (!setValueAtPath(result, fieldPath, parsedValue) && typeof onError === 'function') {
        onError(`Could not assign environment value for ${fieldPath}.`);
      }
      return;
    }
    if (mode === 'literal') {
      const raw = entry?.literal ?? '';
      const parsedValue = typeof raw === 'string' ? parseScalarValue(raw) : raw;
      if (!setValueAtPath(result, fieldPath, parsedValue) && typeof onError === 'function') {
        onError(`Could not assign value for ${fieldPath}.`);
      }
    }
  });
  return result;
}

function buildRequestEnvMap(selections = {}) {
  return Object.entries(selections || {}).reduce((acc, [fieldPath, entry]) => {
    if (entry?.mode === 'env' && entry.envVar) {
      acc[fieldPath] = { envVar: entry.envVar, applyToBody: entry.applyToBody !== false };
    }
    return acc;
  }, {});
}

function buildUrlEnvMap(selections = {}) {
  return Object.entries(selections || {}).reduce((acc, [key, entry]) => {
    const mode = normalizeUrlMode(entry?.mode, entry?.envVar);
    if (mode === 'env' && entry?.envVar) {
      acc[key] = entry.envVar.trim();
    }
    return acc;
  }, {});
}

function normalizeHintEntry(entry) {
  if (entry === null || entry === undefined) {
    return { field: '', required: undefined, description: '' };
  }
  if (typeof entry === 'string') {
    return { field: entry, required: undefined, description: '' };
  }
  if (typeof entry === 'object') {
    return {
      field: typeof entry.field === 'string' ? entry.field : '',
      required: typeof entry.required === 'boolean' ? entry.required : undefined,
      description: typeof entry.description === 'string' ? entry.description : '',
      location: typeof entry.location === 'string' ? entry.location : '',
      defaultValue: entry.defaultValue,
      requiredCommon: typeof entry.requiredCommon === 'boolean' ? entry.requiredCommon : undefined,
      requiredByVariation: normalizeFieldRequirementMap(
        entry.requiredByVariation || entry.requiredVariations,
      ),
      defaultByVariation: normalizeFieldValueMap(entry.defaultByVariation || entry.defaultVariations),
    };
  }
  return {
    field: String(entry),
    required: undefined,
    description: '',
  };
}

function sanitizeResponseFieldMappings(mappings = {}) {
  if (!mappings || typeof mappings !== 'object') return {};
  const result = {};
  Object.entries(mappings).forEach(([field, target]) => {
    const normalizedField = typeof field === 'string' ? field.trim() : '';
    const table = typeof target?.table === 'string' ? target.table.trim() : '';
    const column = typeof target?.column === 'string' ? target.column.trim() : '';
    if (!normalizedField || !table || !column) return;
    result[normalizedField] = { table, column };
  });
  return result;
}

function collectEndpointTables(endpoint) {
  const tables = new Set();
  const addTable = (value) => {
    const normalized = normalizeTableValue(value);
    if (normalized) tables.add(normalized);
  };
  if (Array.isArray(endpoint?.responseTables)) {
    endpoint.responseTables.forEach(addTable);
  }
  if (Array.isArray(endpoint?.tables)) {
    endpoint.tables.forEach(addTable);
  }
  const mappings = extractResponseFieldMappings(endpoint);
  Object.values(mappings).forEach(({ table }) => addTable(table));
  return Array.from(tables);
}

function normalizeFieldRequirementMap(map = {}) {
  if (!map || typeof map !== 'object') return {};
  const result = {};
  Object.entries(map).forEach(([field, required]) => {
    const normalizedField = typeof field === 'string' ? field.trim() : '';
    if (!normalizedField) return;
    if (typeof required === 'boolean') {
      result[normalizedField] = required;
    }
  });
  return result;
}

function normalizeFieldValueMap(map = {}) {
  if (!map || typeof map !== 'object') return {};
  const result = {};
  Object.entries(map).forEach(([field, value]) => {
    const normalizedField = typeof field === 'string' ? field.trim() : '';
    if (!normalizedField) return;
    if (value === undefined || value === null) return;
    result[normalizedField] = value;
  });
  return result;
}

function parseExampleBody(body) {
  if (body === undefined || body === null) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return { value: body };
    }
  }
  if (typeof body === 'object') return body;
  return { value: body };
}

function flattenExampleFields(example, prefix = '') {
  const fields = [];
  if (Array.isArray(example)) {
    const nextPrefix = prefix ? `${prefix}[]` : '[]';
    if (example.length === 0) {
      fields.push({ field: nextPrefix, defaultValue: undefined });
      return fields;
    }
    fields.push(...flattenExampleFields(example[0], nextPrefix));
    return fields;
  }
  if (example && typeof example === 'object') {
    Object.entries(example).forEach(([key, value]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      fields.push(...flattenExampleFields(value, nextPrefix));
    });
    return fields;
  }
  if (prefix) {
    fields.push({ field: prefix, defaultValue: example });
  }
  return fields;
}

function stripRequestDecorations(value, parentIsSchema = false) {
  if (Array.isArray(value)) {
    return value.map((entry) => stripRequestDecorations(entry, parentIsSchema));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      return value
        .replace(/<\/?details[^>]*>/gi, '')
        .replace(/<\/?summary[^>]*>/gi, '')
        .trim();
    }
    return value;
  }

  const isSchemaLike =
    parentIsSchema
    || Object.prototype.hasOwnProperty.call(value, 'properties')
    || Object.prototype.hasOwnProperty.call(value, 'required')
    || Object.prototype.hasOwnProperty.call(value, 'type');

  const keysToOmit = new Set([
    'description',
    'properties',
    'required',
    'additionalProperties',
    'example',
    'examples',
    'title',
    'type',
    'format',
    'schema',
    'notes',
  ]);

  return Object.entries(value).reduce((acc, [key, val]) => {
    if (keysToOmit.has(key)) {
      if (isSchemaLike) return acc;
      if (key === 'description' || key === 'notes') return acc;
    }
    acc[key] = stripRequestDecorations(val, isSchemaLike);
    return acc;
  }, {});
}

function sanitizeRequestExampleForSample(example) {
  if (!example) return {};
  const isSchemaLike =
    typeof example === 'object'
    && !Array.isArray(example)
    && Object.prototype.hasOwnProperty.call(example, 'type')
    && (Object.prototype.hasOwnProperty.call(example, 'properties')
      || Object.prototype.hasOwnProperty.call(example, 'required'));
  if (!isSchemaLike) return stripRequestDecorations(example);

  if (example.example && typeof example.example === 'object') {
    return stripRequestDecorations(example.example);
  }
  if (example.examples && typeof example.examples === 'object') {
    const first = Object.values(example.examples)[0];
    if (first && typeof first === 'object') {
      if (first.value && typeof first.value === 'object') return stripRequestDecorations(first.value);
      if (first.example && typeof first.example === 'object') return stripRequestDecorations(first.example);
    }
  }
  return {};
}

function parseExamplePayload(raw) {
  if (!raw && raw !== 0) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function toSamplePayload(raw) {
  return parseExamplePayload(raw);
}

function cleanSampleText(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function buildVariationsFromExamples(examples = []) {
  return examples
    .map((example, index) => {
      const key =
        (example && typeof example.key === 'string' && example.key)
        || (example && typeof example.name === 'string' && example.name)
        || (example && typeof example.title === 'string' && example.title)
        || `example-${index + 1}`;
      if (!key) return null;
      const name =
        (example && typeof example.name === 'string' && example.name)
        || (example && typeof example.title === 'string' && example.title)
        || key;
      const body = parseExampleBody(example?.request?.body ?? example?.request ?? example?.body);
      const fields = flattenExampleFields(body).map((entry) => ({
        field: entry.field,
        requiredCommon: false,
        requiredByVariation: { [key]: true },
        defaultByVariation:
          entry.defaultValue === undefined
            ? {}
            : { [key]: entry.defaultValue },
        description: '',
      }));
      return {
        key,
        name,
        enabled: true,
        requestExample: body,
        requestFields: fields,
        description: '',
      };
    })
    .filter(Boolean);
}

function mergeRequestFieldHints(existing = [], variationFields = []) {
  const map = new Map();

  const mergeEntry = (entry, variationKey = '') => {
    const normalized = normalizeHintEntry(entry);
    const field = normalized.field?.trim();
    if (!field) return;
    const current = map.get(field) || {
      field,
      description: '',
      requiredCommon: false,
      requiredByVariation: {},
      defaultByVariation: {},
    };
    const requiredByVariation = {
      ...current.requiredByVariation,
      ...normalized.requiredByVariation,
    };
    const defaultByVariation = {
      ...current.defaultByVariation,
      ...normalized.defaultByVariation,
    };

    if (variationKey && normalized.requiredByVariation?.[variationKey] === undefined) {
      const existingRequired = current.requiredByVariation?.[variationKey];
      if (typeof existingRequired === 'boolean') {
        requiredByVariation[variationKey] = existingRequired;
      } else {
        requiredByVariation[variationKey] = true;
      }
    }
    if (
      variationKey
      && normalized.defaultByVariation?.[variationKey] === undefined
      && normalized.defaultValue !== undefined
    ) {
      defaultByVariation[variationKey] = normalized.defaultValue;
    }

    const requiredCommon =
      typeof current.requiredCommon === 'boolean'
        ? current.requiredCommon
        : typeof normalized.requiredCommon === 'boolean'
          ? normalized.requiredCommon
          : typeof normalized.required === 'boolean'
            ? normalized.required
            : false;

    map.set(field, {
      field,
      description: normalized.description || current.description,
      requiredCommon,
      requiredByVariation,
      defaultByVariation,
    });
  };

  variationFields.forEach((entry) => mergeEntry(entry.entry || entry, entry.variationKey));
  existing.forEach((entry) => mergeEntry(entry));

  return Array.from(map.values());
}

function mergeVariationsWithExamples(existing = [], examples = []) {
  const generated = buildVariationsFromExamples(examples);
  const map = new Map();
  generated.forEach((variation) => {
    if (variation?.key) {
      map.set(variation.key, variation);
    }
  });
  existing.forEach((variation, index) => {
    const key = variation?.key || variation?.name || `variation-${index + 1}`;
    if (!key) return;
    const base = map.get(key) || {};
    map.set(key, {
      ...base,
      ...variation,
      key,
      name: variation.name || base.name || key,
      requestExample: variation.requestExample || base.requestExample,
      requestExampleText:
        variation.requestExampleText
        || (base.requestExample ? toPrettyJson(base.requestExample, '{}') : undefined),
      requestFields: mergeRequestFieldHints(base.requestFields || [], variation.requestFields || []),
    });
  });
  return Array.from(map.values());
}

function extractResponseFieldMappings(definition) {
  const explicit = sanitizeResponseFieldMappings(definition?.responseFieldMappings);
  if (Object.keys(explicit).length > 0) return explicit;
  const derived = {};
  const responseFields = Array.isArray(definition?.responseFields) ? definition.responseFields : [];
  responseFields.forEach((entry) => {
    const normalized = normalizeHintEntry(entry);
    const field = normalized.field;
    const mapping = entry?.mapTo || entry?.mapping || entry?.target;
    const table = typeof mapping?.table === 'string' ? mapping.table.trim() : '';
    const column = typeof mapping?.column === 'string' ? mapping.column.trim() : '';
    if (field && table && column) {
      derived[field] = { table, column };
    }
  });
  return sanitizeResponseFieldMappings(derived);
}

function buildRequestFieldDisplayFromState(state) {
  const requestFieldHints = parseHintPreview(
    state.requestFieldsText,
    'Request field hints must be a JSON array',
  );
  const parameterPreview = parseParametersPreview(state.parametersText);
  if (requestFieldHints.state === 'error') return requestFieldHints;
  if (parameterPreview.state === 'error') return parameterPreview;

  const parameterDefaults = buildDraftParameterDefaults(parameterPreview.items || []);
  const items = [];
  const seen = new Set();

  if (requestFieldHints.state === 'ok') {
    requestFieldHints.items.forEach((entry) => {
      const normalized = normalizeHintEntry(entry);
      if (!normalized.field || seen.has(normalized.field)) return;
      seen.add(normalized.field);
      items.push({ ...normalized, source: 'hint' });
    });
  }

  if (parameterPreview.state === 'ok') {
    parameterPreview.items
      .filter((param) => param.name && ['query', 'path', 'header'].includes(param.in))
      .forEach((param) => {
        if (seen.has(param.name)) return;
        seen.add(param.name);
        items.push({
          field: param.name,
          required: Boolean(param.required),
          description: param.description || `${param.in} parameter`,
          location: param.in,
          source: 'parameter',
          defaultValue:
            param.testValue
            ?? param.example
            ?? param.default
            ?? param.sample
            ?? parameterDefaults[param.name],
        });
      });
  }

  if (items.length === 0) return { state: 'empty', items: [], error: '' };
  return { state: 'ok', items, error: '' };
}

function deriveRequestFieldSelections({ requestSampleText, requestEnvMap, displayItems }) {
  const seenFields = new Set();
  let parsedSample = {};
  try {
    parsedSample = JSON.parse(requestSampleText || '{}');
  } catch {
    parsedSample = {};
  }

  const derivedSelections = {};

  displayItems.forEach((entry) => {
    const normalized = normalizeHintEntry(entry);
    const fieldPath = normalized.field;
    if (!fieldPath || seenFields.has(fieldPath)) return;
    seenFields.add(fieldPath);

    const currentValue = readValueAtPath(parsedSample, fieldPath);
    const defaultValue = entry.defaultValue;
    const applyToBodyDefault = entry.source !== 'parameter';
    const envEntry = requestEnvMap?.[fieldPath];
    const envVar = typeof envEntry === 'string' ? envEntry : envEntry?.envVar;
    const applyToBody = envEntry && typeof envEntry.applyToBody === 'boolean'
      ? envEntry.applyToBody
      : applyToBodyDefault;
    if (envVar) {
      derivedSelections[fieldPath] = {
        mode: 'env',
        envVar,
        literal: currentValue === undefined || currentValue === null ? '' : String(currentValue),
        applyToBody,
      };
      return;
    }

    if (currentValue !== undefined && currentValue !== null) {
      derivedSelections[fieldPath] = { mode: 'literal', literal: String(currentValue), applyToBody };
      return;
    }

    if (defaultValue !== undefined && defaultValue !== null) {
      derivedSelections[fieldPath] = { mode: 'literal', literal: String(defaultValue), applyToBody };
      return;
    }

    derivedSelections[fieldPath] = { mode: 'literal', literal: '', applyToBody };
  });

  return derivedSelections;
}

function extractExampleFieldPaths(example, prefix = '') {
  const paths = new Set();
  if (Array.isArray(example)) {
    example.forEach((item) => {
      const childPrefix = prefix ? `${prefix}[]` : '[]';
      extractExampleFieldPaths(item, childPrefix).forEach((path) => paths.add(path));
    });
    return Array.from(paths);
  }
  if (!example || typeof example !== 'object') {
    if (prefix) paths.add(prefix);
    return Array.from(paths);
  }
  Object.entries(example).forEach(([key, value]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      extractExampleFieldPaths(value, nextPrefix).forEach((path) => paths.add(path));
    } else {
      paths.add(nextPrefix);
    }
  });
  return Array.from(paths);
}

function createFormState(definition) {
  if (!definition) return { ...EMPTY_ENDPOINT };
  const declaredUsage = definition.usage && VALID_USAGE_VALUES.has(definition.usage)
    ? definition.usage
    : 'transaction';
  const rawUsage = definition.posApiType === 'AUTH'
    ? 'auth'
    : definition.posApiType === 'LOOKUP'
      ? 'info'
      : definition.posApiType === 'ADMIN'
        ? 'admin'
        : declaredUsage;
  const isTransaction = rawUsage === 'transaction';
  const supportsItems = isTransaction
    ? definition.supportsItems !== undefined
      ? Boolean(definition.supportsItems)
      : definition.posApiType === 'STOCK_QR'
        ? false
        : true
    : false;
  const supportsMultiplePayments = isTransaction ? Boolean(definition.supportsMultiplePayments) : false;
  const resolvedReceiptTypes = Array.isArray(definition.receiptTypes)
    ? definition.receiptTypes.slice()
    : [];
  const resolvedPaymentMethods = Array.isArray(definition.paymentMethods)
    ? definition.paymentMethods.slice()
    : [];
  const resolvedTaxTypes = Array.isArray(definition.taxTypes)
    ? definition.taxTypes.slice()
    : Array.isArray(definition.receiptTaxTypes)
      ? definition.receiptTaxTypes.slice()
      : [];
  const mergedVariations = mergeVariationsWithExamples(
    Array.isArray(definition.variations) ? definition.variations : [],
    Array.isArray(definition.examples) ? definition.examples : [],
  );
  const variationFieldHints = mergedVariations.flatMap((variation, index) =>
    (variation.requestFields || []).map((field) => ({
      entry: {
        ...field,
        requiredByVariation: field?.requiredByVariation || field?.requiredVariations,
        defaultByVariation: field?.defaultByVariation || field?.defaultVariations,
      },
      variationKey: variation?.key || variation?.name || `variation-${index + 1}`,
    })),
  );
  const sanitizeRequestHints = (value) => {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => {
      const normalized = normalizeHintEntry(entry);
      if (!normalized.field) {
        return normalized;
      }
      const hint = {
        field: normalized.field,
        requiredCommon:
          typeof normalized.requiredCommon === 'boolean'
            ? normalized.requiredCommon
            : typeof normalized.required === 'boolean'
              ? normalized.required
              : false,
        ...(normalized.description ? { description: normalized.description } : {}),
        ...(normalized.defaultByVariation && Object.keys(normalized.defaultByVariation).length
          ? { defaultByVariation: normalized.defaultByVariation }
          : {}),
        ...(normalized.requiredByVariation && Object.keys(normalized.requiredByVariation).length
          ? { requiredByVariation: normalized.requiredByVariation }
          : {}),
      };
      if (normalized.location) {
        hint.location = normalized.location;
      }
      if (normalized.defaultValue !== undefined) {
        hint.defaultValue = normalized.defaultValue;
      }
      return hint;
    });
  };
  const receiptTypesEnabled = isTransaction ? supportsItems && definition.enableReceiptTypes !== false : false;
  const receiptTaxTypesEnabled = isTransaction
    ? supportsItems && definition.enableReceiptTaxTypes !== false
    : false;
  const paymentMethodsEnabled = isTransaction
    ? supportsMultiplePayments && definition.enablePaymentMethods !== false
    : false;
  const receiptItemsEnabled = isTransaction ? supportsItems && definition.enableReceiptItems !== false : false;
  const allowMultipleReceiptTypes = receiptTypesEnabled
    ? definition.allowMultipleReceiptTypes !== false
    : false;
  const allowMultipleReceiptTaxTypes = receiptTaxTypesEnabled
    ? definition.allowMultipleReceiptTaxTypes !== false
    : false;
  const allowMultiplePaymentMethods = paymentMethodsEnabled
    ? definition.allowMultiplePaymentMethods !== false
    : false;
  const allowMultipleReceiptItems = receiptItemsEnabled
    ? definition.allowMultipleReceiptItems !== false
    : false;
  const receiptTypeTemplates = receiptTypesEnabled
    ? sanitizeTemplateMap(definition.receiptTypeTemplates, VALID_RECEIPT_TYPES)
    : {};
  const taxTypeTemplates = receiptTaxTypesEnabled
    ? sanitizeTemplateMap(definition.taxTypeTemplates, VALID_TAX_TYPES)
    : {};
  const paymentMethodTemplates = paymentMethodsEnabled
    ? sanitizeTemplateMap(definition.paymentMethodTemplates, VALID_PAYMENT_METHODS)
    : {};
  const receiptItemTemplates = receiptItemsEnabled
    ? (() => {
        const list = buildTemplateList(definition.receiptItemTemplates, allowMultipleReceiptItems);
        if (list.length === 0) {
          return [''];
        }
        return list;
      })()
    : [];
  const requestFieldVariations = Array.isArray(definition.requestFieldVariations)
    ? definition.requestFieldVariations.map((entry) => ({
      key: entry?.key || entry?.label || '',
      label: entry?.label || entry?.key || '',
      enabled: entry?.enabled !== false,
      requiredFields: normalizeFieldRequirementMap(entry?.requiredFields),
      defaultValues: normalizeFieldValueMap(entry?.defaultValues),
    })).filter((entry) => entry.key)
    : [];
  const variations = mergedVariations.map((variation, index) => {
    const fields = Array.isArray(variation.requestFields)
      ? variation.requestFields.map((field) => ({
        field: field?.field || '',
        description: field?.description || '',
        requiredCommon: Boolean(
          field?.requiredCommon
          ?? field?.required
          ?? field?.requiredVariations
          ?? field?.requiredByVariation,
        ),
        requiredByVariation: normalizeFieldRequirementMap(
          field?.requiredByVariation || field?.requiredVariations,
        ),
        defaultByVariation: normalizeFieldValueMap(
          field?.defaultByVariation || field?.defaultVariations,
        ),
      }))
      : [];
    const requestExample = variation.requestExample || variation.request?.body || {};
    const requestExamplePayload = toSamplePayload(requestExample);
    return {
      key: variation.key || variation.name || `variation-${index + 1}`,
      name: variation.name || variation.key || `Variation ${index + 1}`,
      description: variation.description || '',
      enabled: variation.enabled !== false,
      requestExample: requestExamplePayload,
      requestExampleText: variation.requestExampleText || toPrettyJson(requestExamplePayload, '{}'),
      requestFields: fields,
    };
  });
  const hasRequestSchema = hasObjectEntries(definition.requestBody?.schema);
  const requestSchema = hasRequestSchema ? definition.requestBody.schema : {};
  const requestSchemaFallback = '{}';
  const rawRequestSample = parseExamplePayload(
    definition.requestSample
      || definition.requestBody?.example
      || definition.requestExample
      || definition.requestBody?.schema,
  );

  const sanitizedRequestSample = sanitizeRequestExampleForSample(rawRequestSample);
  const requestSamplePayload =
    sanitizedRequestSample && Object.keys(sanitizedRequestSample).length > 0
      ? sanitizedRequestSample
      : stripRequestDecorations(rawRequestSample);

  const buildUrlFieldState = (key) => {
    const literalCandidate = definition[key];
    const literal = typeof literalCandidate === 'string' && literalCandidate
      ? literalCandidate
      : '';
    const envVarFromMap = normalizeEnvVarName(definition.urlEnvMap?.[key]);
    const envVarFromField = normalizeEnvVarName(definition[`${key}EnvVar`]);
    const envVar = envVarFromMap || envVarFromField;
    const mode = normalizeUrlMode(definition[`${key}Mode`], envVar);
    return { literal, envVar, mode };
  };

  const serverUrlField = buildUrlFieldState('serverUrl');
  const testServerUrlField = buildUrlFieldState('testServerUrl');
  const productionServerUrlField = buildUrlFieldState('productionServerUrl');
  const testServerUrlProductionField = buildUrlFieldState('testServerUrlProduction');

  return {
    id: definition.id || '',
    name: definition.name || '',
    category: definition.category || '',
    method: definition.method || 'GET',
    path: definition.path || '',
    parametersText: toPrettyJson(definition.parameters, '[]'),
    requestDescription: definition.requestBody?.description || '',
    requestSampleText: toPrettyJson(
      requestSamplePayload && Object.keys(requestSamplePayload).length > 0
        ? requestSamplePayload
        : requestSchema,
      requestSchemaFallback,
    ),
    requestSampleNotes: definition.requestSampleNotes || '',
    requestSchemaText: toPrettyJson(requestSchema, requestSchemaFallback),
    responseDescription: definition.responseBody?.description || '',
    responseSchemaText: toPrettyJson(definition.responseBody?.schema, '{}'),
    fieldDescriptionsText: toPrettyJson(definition.fieldDescriptions, '{}'),
    requestFieldsText: toPrettyJson(
      sanitizeRequestHints(
        mergeRequestFieldHints(definition.requestFields || [], variationFieldHints),
      ),
      '[]',
    ),
    responseFieldsText: toPrettyJson(definition.responseFields, '[]'),
    examplesText: toPrettyJson(definition.examples, '[]'),
    variations,
    preRequestScript:
      Array.isArray(definition.scripts?.preRequest)
        ? definition.scripts.preRequest.join('\n\n')
        : definition.preRequestScript || '',
    testScript:
      Array.isArray(definition.scripts?.test)
        ? definition.scripts.test.join('\n\n')
        : definition.testScript || '',
    testable: Boolean(definition.testable),
    serverUrl: serverUrlField.literal,
    serverUrlEnvVar: serverUrlField.envVar,
    serverUrlMode: serverUrlField.mode,
    testServerUrl: testServerUrlField.literal,
    testServerUrlEnvVar: testServerUrlField.envVar,
    testServerUrlMode: testServerUrlField.mode,
    productionServerUrl: productionServerUrlField.literal,
    productionServerUrlEnvVar: productionServerUrlField.envVar,
    productionServerUrlMode: productionServerUrlField.mode,
    testServerUrlProduction: testServerUrlProductionField.literal,
    testServerUrlProductionEnvVar: testServerUrlProductionField.envVar,
    testServerUrlProductionMode: testServerUrlProductionField.mode,
    authEndpointId: definition.authEndpointId || '',
    docUrl: '',
    posApiType: definition.posApiType || definition.requestBody?.schema?.type || '',
    usage: rawUsage,
    defaultForForm: isTransaction ? Boolean(definition.defaultForForm) : false,
    supportsMultipleReceipts: isTransaction ? Boolean(definition.supportsMultipleReceipts) : false,
    supportsMultiplePayments,
    supportsItems,
    enableReceiptTypes: receiptTypesEnabled,
    allowMultipleReceiptTypes,
    receiptTypeTemplates,
    receiptTypes: receiptTypesEnabled
      ? resolvedReceiptTypes.length > 0
        ? resolvedReceiptTypes
        : []
      : [],
    enableReceiptTaxTypes: receiptTaxTypesEnabled,
    allowMultipleReceiptTaxTypes,
    taxTypeTemplates,
    taxTypes: receiptTaxTypesEnabled
      ? resolvedTaxTypes.length > 0
        ? resolvedTaxTypes
        : []
      : [],
    enablePaymentMethods: paymentMethodsEnabled,
    allowMultiplePaymentMethods,
    paymentMethodTemplates,
    paymentMethods: paymentMethodsEnabled
      ? resolvedPaymentMethods.length > 0
        ? resolvedPaymentMethods
        : []
      : [],
    enableReceiptItems: receiptItemsEnabled,
    allowMultipleReceiptItems,
    receiptItemTemplates,
    topLevelFieldsText: toPrettyJson(definition.mappingHints?.topLevelFields, '[]'),
    nestedPathsText: toPrettyJson(definition.mappingHints?.nestedPaths, '{}'),
    notes: definition.notes || '',
    requestEnvMap: definition.requestEnvMap || {},
    requestFieldVariations,
    responseFieldMappings: extractResponseFieldMappings(definition),
    responseTables: sanitizeTableSelection(
      definition.responseTables && definition.responseTables.length > 0
        ? definition.responseTables
        : collectEndpointTables(definition),
      [],
    ),
  };
}

function pruneUnavailableControls(endpointState) {
  const next = { ...endpointState };
  const isTransaction = next.usage === 'transaction';

  if (!isTransaction) {
    next.supportsMultipleReceipts = false;
    next.supportsMultiplePayments = false;
    next.supportsItems = false;
  }

  if (!isTransaction || !next.supportsItems) {
    next.enableReceiptTypes = false;
    next.allowMultipleReceiptTypes = false;
    next.receiptTypes = [];
    next.receiptTypeTemplates = {};
    next.enableReceiptTaxTypes = false;
    next.allowMultipleReceiptTaxTypes = false;
    next.taxTypes = [];
    next.taxTypeTemplates = {};
    next.enableReceiptItems = false;
    next.allowMultipleReceiptItems = false;
    next.receiptItemTemplates = [];
  }

  if (!isTransaction || !next.supportsMultiplePayments) {
    next.enablePaymentMethods = false;
    next.allowMultiplePaymentMethods = false;
    next.paymentMethods = [];
    next.paymentMethodTemplates = {};
  }

  return next;
}

function parseJsonInput(label, text, defaultValue) {
  const trimmed = (text || '').trim();
  if (!trimmed) return defaultValue;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const error = new Error(`${label} must be valid JSON`);
    error.cause = err;
    throw error;
  }
}

function validateEndpoint(endpoint, existingIds, originalId) {
  const id = (endpoint.id || '').trim();
  if (!id) throw new Error('ID is required');
  if (existingIds.has(id) && id !== originalId) {
    throw new Error(`An endpoint with id "${id}" already exists`);
  }
  if (!endpoint.name) throw new Error('Name is required');
  if (!endpoint.method) throw new Error('HTTP method is required');
  if (!endpoint.path) throw new Error('Path is required');
  const allowedUsage = new Set(USAGE_OPTIONS.map((opt) => opt.value));
  if (!allowedUsage.has(endpoint.usage)) {
    throw new Error('Usage must be set to a recognised option');
  }
  const hasBaseUrl = ['serverUrl', 'testServerUrl', 'productionServerUrl', 'testServerUrlProduction'].some(
    (key) => typeof endpoint?.[key] === 'string' && endpoint[key].trim(),
  );
  if (!hasBaseUrl) {
    throw new Error('At least one base URL (staging or production) is required');
  }
}

function parseScalarValue(text) {
  if (text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  const asNumber = Number(text);
  if (!Number.isNaN(asNumber) && text.trim() !== '') {
    return asNumber;
  }
  if (
    (text.startsWith('{') && text.endsWith('}')) ||
    (text.startsWith('[') && text.endsWith(']'))
  ) {
    try {
      return JSON.parse(text);
    } catch {
      // ignore
    }
  }
  return text;
}

function isPrimitiveValue(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function parseLooseYaml(text) {
  const lines = text.replace(/\t/g, '  ').split(/\r?\n/);
  const filtered = lines
    .map((line) => line.replace(/#.*$/, ''))
    .map((line) => ({ indent: line.match(/^ */)[0].length, content: line.trim() }))
    .filter((line) => line.content);

  function walk(startIndex, expectedIndent) {
    let index = startIndex;
    let result = null;
    while (index < filtered.length) {
      const { indent, content } = filtered[index];
      if (indent < expectedIndent) break;
      if (indent > expectedIndent) {
        index += 1;
        continue;
      }

      if (content.startsWith('- ')) {
        if (!Array.isArray(result)) result = [];
        const valuePart = content.slice(2).trim();
        if (!valuePart) {
          const [child, nextIndex] = walk(index + 1, expectedIndent + 2);
          result.push(child);
          index = nextIndex;
          continue;
        }
        if (valuePart.includes(':') && !valuePart.startsWith('{') && !valuePart.startsWith('[')) {
          const [keyPart, rest] = valuePart.split(/:(.*)/);
          const base = {};
          if (rest && rest.trim()) {
            base[keyPart.trim()] = parseScalarValue(rest.trim());
          }
          const [child, nextIndex] = walk(index + 1, expectedIndent + 2);
          result.push({ ...base, ...(child && typeof child === 'object' ? child : {}) });
          index = nextIndex;
          continue;
        }
        result.push(parseScalarValue(valuePart));
        index += 1;
        continue;
      }

      if (content.includes(':')) {
        if (!result || Array.isArray(result)) {
          if (result === null) result = {};
        }
        const [keyPart, rest] = content.split(/:(.*)/);
        const key = keyPart.trim();
        const remaining = (rest || '').trim();
        if (!remaining) {
          const [child, nextIndex] = walk(index + 1, expectedIndent + 2);
          result[key] = child;
          index = nextIndex;
          continue;
        }
        result[key] = parseScalarValue(remaining);
        index += 1;
        continue;
      }

      index += 1;
    }
    return [result, index];
  }

  const [parsed] = walk(0, filtered[0]?.indent ?? 0);
  return parsed;
}

function parseApiSpecText(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Specification file is empty');
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to YAML parsing
  }
  const parsed = parseLooseYaml(trimmed);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Unable to parse the supplied specification file');
  }
  return parsed;
}

function normalizeParametersFromSpec(params) {
  const list = Array.isArray(params) ? params : [];
  const deduped = [];
  const seen = new Set();
  list.forEach((param) => {
    if (!param || typeof param !== 'object') return;
    const name = typeof param.name === 'string' ? param.name.trim() : '';
    const loc = typeof param.in === 'string' ? param.in.trim() : '';
    if (!name || !loc) return;
    const key = `${name}:${loc}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push({
      name,
      in: loc,
      required: Boolean(param.required),
      description: param.description || '',
      example:
        param.example ?? param.default ?? param.testValue
        ?? param.sample ?? (param.examples && Object.values(param.examples)[0]?.value),
      ...(param.default !== undefined ? { default: param.default } : {}),
      ...(param.testValue !== undefined ? { testValue: param.testValue } : {}),
      ...(param.sample !== undefined ? { sample: param.sample } : {}),
    });
  });
  return deduped;
}

function extractRequestExample(requestBody) {
  if (!requestBody || typeof requestBody !== 'object') return undefined;
  const content = requestBody.content || {};
  const mediaType =
    content['application/json'] || content['*/*'] || Object.values(content)[0] || null;
  if (!mediaType) return undefined;
  if (mediaType.example !== undefined) return mediaType.example;
  if (mediaType.examples) {
    const first = Object.values(mediaType.examples).find((entry) => entry && entry.value !== undefined);
    if (first) return first.value;
  }
  if (mediaType.schema && typeof mediaType.schema === 'object') {
    if (mediaType.schema.example !== undefined) return mediaType.schema.example;
    if (mediaType.schema.default !== undefined) return mediaType.schema.default;
  }
  return undefined;
}

function inferPosApiTypeFromHints(tags = [], path = '', summary = '') {
  const text = `${tags.join(' ')} ${path} ${summary}`.toLowerCase();
  if (path.includes('/protocol/openid-connect/token') || /auth|token/.test(text)) {
    return 'AUTH';
  }
  if (path.includes('/api/info') || text.includes('info') || text.includes('lookup')) {
    return 'LOOKUP';
  }
  if (text.includes('stock') || text.includes('qr')) return 'STOCK_QR';
  if (path.includes('/rest/')) {
    if (text.includes('b2b') || text.includes('sale') || text.includes('invoice')) return 'B2B_SALE';
    if (text.includes('purchase')) return 'B2B_PURCHASE';
    return 'B2C';
  }
  if (text.includes('purchase')) return 'B2B_PURCHASE';
  if (text.includes('sale') || text.includes('invoice') || text.includes('b2b')) return 'B2B_SALE';
  if (text.includes('b2c') || text.includes('receipt') || text.includes('transaction')) return 'B2C';
  return '';
}

function extractOperationsFromOpenApi(spec) {
  if (!spec || typeof spec !== 'object') return [];
  const paths = spec.paths && typeof spec.paths === 'object' ? spec.paths : {};
  const serverUrl =
    Array.isArray(spec.servers) && spec.servers.length && spec.servers[0]?.url
      ? spec.servers[0].url
      : '';
  const entries = [];
  Object.entries(paths).forEach(([path, definition]) => {
    if (!definition || typeof definition !== 'object') return;
    const sharedParams = normalizeParametersFromSpec(definition.parameters);
    Object.entries(definition).forEach(([methodKey, operation]) => {
      const method = methodKey.toUpperCase();
      if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) return;
      const op = operation && typeof operation === 'object' ? operation : {};
      const opParams = normalizeParametersFromSpec([...(op.parameters || []), ...sharedParams]);
      const example = extractRequestExample(op.requestBody);
      const idSource = op.operationId || `${method}-${path}`;
      const id = idSource.replace(/[^a-zA-Z0-9-_]+/g, '-');
      entries.push({
        id: id || `${method}-${entries.length + 1}`,
        name: op.summary || op.operationId || `${method} ${path}`,
        method,
        path,
        summary: op.summary || op.description || '',
        parameters: opParams,
        requestExample: example,
        posApiType: inferPosApiTypeFromHints(op.tags || [], path, op.summary || op.description || ''),
        serverUrl,
        tags: Array.isArray(op.tags) ? op.tags : [],
      });
    });
  });
  return entries;
}

function parsePostmanUrl(urlObj) {
  const detectPathParams = (rawPath) => {
    const params = new Set();
    const colonMatches = rawPath.match(/:\w+/g) || [];
    colonMatches.forEach((segment) => params.add(segment.slice(1)));
    const braceMatches = rawPath.match(/{{\s*([\w-]+)\s*}}/g) || [];
    braceMatches.forEach((segment) => {
      const key = segment.replace(/^{+|}+$/g, '').replace(/\s+/g, '');
      if (key) params.add(key);
    });
    const normalizedMatches = rawPath.match(/{([^}]+)}/g) || [];
    normalizedMatches.forEach((segment) => {
      const key = segment.replace(/^{|}$/g, '');
      if (key) params.add(key);
    });
    return Array.from(params);
  };

  if (!urlObj) return { path: '/', query: [], baseUrl: '', pathParams: [] };
  if (typeof urlObj === 'string') {
    const urlString = urlObj.startsWith('http') ? urlObj : `https://placeholder.local${urlObj}`;
    try {
      const parsed = new URL(urlString);
      const path = parsed.pathname || '/';
      const query = [];
      parsed.searchParams.forEach((value, key) => {
        query.push({ name: key, in: 'query', value });
      });
      const baseUrl = `${parsed.protocol}//${parsed.host}`;
      return { path, query, baseUrl, pathParams: detectPathParams(path) };
    } catch {
      return { path: '/', query: [], baseUrl: '', pathParams: [] };
    }
  }
  const pathParts = Array.isArray(urlObj.path) ? urlObj.path : [];
  const rawPath = `/${pathParts.join('/')}`;
  const normalizedPath = rawPath.replace(/\/:([\w-]+)/g, '/{$1}').replace(/{{\s*([\w-]+)\s*}}/g, '{$1}');
  const query = Array.isArray(urlObj.query)
    ? urlObj.query.map((entry) => ({
      name: entry.key,
      in: 'query',
      example: entry.value,
      default: entry?.value,
      description: entry?.description || '',
    }))
    : [];
  const host = Array.isArray(urlObj.host) ? urlObj.host.join('.') : '';
  const protocol = Array.isArray(urlObj.protocol) ? urlObj.protocol[0] : urlObj.protocol;
  const baseUrl = host ? `${protocol || 'https'}://${host}` : '';
  return { path: normalizedPath || '/', query, baseUrl, pathParams: detectPathParams(rawPath) };
}

function extractOperationsFromPostman(spec) {
  const items = spec?.item;
  if (!Array.isArray(items)) return [];
  const entries = [];

  const variables = Array.isArray(spec?.variable)
    ? spec.variable
      .map((variable) => (typeof variable?.key === 'string' ? variable.key.trim() : ''))
      .filter(Boolean)
    : [];

  function flattenResponseFields(body, parent = '') {
    const fields = [];
    const pathPrefix = parent ? `${parent}.` : '';

    if (Array.isArray(body)) {
      if (body.length === 0) {
        fields.push({ field: `${parent}[]`, description: 'Array response' });
        return fields;
      }
      const child = body[0];
      const nextPrefix = parent ? `${parent}[]` : '[]';
      fields.push(...flattenResponseFields(child, nextPrefix));
      return fields;
    }

    if (body && typeof body === 'object') {
      Object.entries(body).forEach(([key, value]) => {
        const fieldPath = `${pathPrefix}${key}`;
        if (value !== null && typeof value === 'object') {
          fields.push(...flattenResponseFields(value, fieldPath));
        } else {
          fields.push({ field: fieldPath, description: '' });
        }
      });
      return fields;
    }

    if (parent) {
      fields.push({ field: parent, description: '' });
    } else {
      fields.push({ field: 'response', description: 'Raw response content' });
    }
    return fields;
  }

  function buildSchemaFromExample(example) {
    const detectType = (value) => {
      if (value === null) return 'null';
      if (Array.isArray(value)) return 'array';
      return typeof value;
    };

    const walkSchema = (value) => {
      const type = detectType(value);
      switch (type) {
        case 'object': {
          const properties = {};
          Object.entries(value).forEach(([key, val]) => {
            properties[key] = walkSchema(val);
          });
          const required = Object.keys(properties);
          return { type: 'object', properties, required };
        }
        case 'array': {
          const first = value.length ? walkSchema(value[0]) : {};
          return { type: 'array', items: first };
        }
        case 'number':
          return { type: Number.isInteger(value) ? 'integer' : 'number' };
        case 'boolean':
          return { type: 'boolean' };
        case 'null':
          return { type: 'string', nullable: true };
        default:
          return { type: 'string' };
      }
    };

    return walkSchema(example);
  }

  function mergeExampleSchemas(examples) {
    if (!Array.isArray(examples) || examples.length === 0) return undefined;
    const objectExamples = examples.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
    if (!objectExamples.length) return undefined;
    const properties = {};
    const counts = {};
    objectExamples.forEach((obj) => {
      Object.entries(obj).forEach(([key, value]) => {
        properties[key] = buildSchemaFromExample(value);
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    const required = Object.keys(counts).filter((key) => counts[key] === objectExamples.length);
    return {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
    };
  }

  function parseRequestBody(body) {
    if (!body || typeof body !== 'object') return {};
    if (body.mode === 'raw') {
      const rawText = typeof body.raw === 'string' ? body.raw.trim() : '';
      if (!rawText) return {};
      try {
        const parsed = JSON.parse(rawText);
        return { requestExample: parsed, requestSchema: buildSchemaFromExample(parsed) };
      } catch {
        return { requestExample: body.raw };
      }
    }
    if (body.mode === 'urlencoded' && Array.isArray(body.urlencoded)) {
      const example = {};
      body.urlencoded
        .filter((entry) => !entry?.disabled)
        .forEach((entry) => {
          const key = entry?.key || '';
          example[key] = entry?.value ?? '';
        });
      return { requestExample: example, requestSchema: buildSchemaFromExample(example) };
    }
    if (body.mode === 'formdata' && Array.isArray(body.formdata)) {
      const example = {};
      const schemaProperties = {};
      body.formdata
        .filter((entry) => !entry?.disabled)
        .forEach((entry) => {
          const key = entry?.key || '';
          if (!key) return;
          if (entry.type === 'file') {
            example[key] = entry?.src || 'file';
            schemaProperties[key] = { type: 'string', format: 'binary' };
          } else {
            example[key] = entry?.value ?? '';
            schemaProperties[key] = { type: 'string' };
          }
        });
      const requestSchema = Object.keys(schemaProperties).length
        ? { type: 'object', properties: schemaProperties, required: Object.keys(schemaProperties) }
        : undefined;
      return { requestExample: example, requestSchema };
    }
    return {};
  }

  function parseResponses(responses = []) {
    const examples = [];
    const jsonBodies = [];
    const responseFields = new Map();
    const warnings = [];
    responses
      .filter((resp) => resp && resp.body)
      .forEach((resp) => {
        const headers = Array.isArray(resp.header)
          ? resp.header.reduce((acc, h) => {
            if (h?.key) acc[h.key] = h?.value;
            return acc;
          }, {})
          : {};
        const contentType = headers['Content-Type'] || headers['content-type'] || '';
        let parsedBody = resp.body;
        let parsedOk = false;
        if (typeof resp.body === 'string') {
          const attemptJson = () => {
            const trimmed = resp.body.trim();
            if (!trimmed) return false;
            try {
              const parsed = JSON.parse(trimmed);
              parsedBody = parsed;
              parsedOk = true;
              if (parsed && typeof parsed === 'object') {
                jsonBodies.push(parsed);
                flattenResponseFields(parsed).forEach((entry) => {
                  if (entry?.field && !responseFields.has(entry.field)) {
                    responseFields.set(entry.field, entry);
                  }
                });
              } else {
                flattenResponseFields(parsed).forEach((entry) => {
                  if (entry?.field && !responseFields.has(entry.field)) {
                    responseFields.set(entry.field, entry);
                  }
                });
              }
              return true;
            } catch {
              return false;
            }
          };
          if (/json/i.test(contentType)) {
            if (!attemptJson()) {
              warnings.push('Failed to parse a JSON response body; captured raw text instead.');
            }
          } else if (attemptJson()) {
            warnings.push('Parsed JSON response body without an explicit JSON content-type header.');
          }
        }
        if (!parsedOk) {
          warnings.push('Captured a non-JSON or unparsed response body; added a generic response field.');
          flattenResponseFields(parsedBody).forEach((entry) => {
            if (entry?.field && !responseFields.has(entry.field)) {
              responseFields.set(entry.field, entry);
            }
          });
        }
        const originalRequest = resp.originalRequest && resp.originalRequest.url
          ? parsePostmanUrl(resp.originalRequest.url)
          : null;
        examples.push({
          key: resp.id || resp.name || `${resp.code || resp.status}-${examples.length + 1}`,
          status: resp.code || resp.status,
          name: resp.name || resp.status || '',
          body: parsedBody,
          headers,
          request: originalRequest
            ? {
                path: originalRequest.path,
                queryParams: originalRequest.query,
                pathParams: (originalRequest.pathParams || []).map((name) => ({ name, in: 'path' })),
              }
            : undefined,
        });
      });
    const responseSchema = jsonBodies.length ? mergeExampleSchemas(jsonBodies) : undefined;
    return {
      examples,
      responseSchema,
      responseFields: Array.from(responseFields.values()),
      warnings,
    };
  }

  function walk(list, folderTags = [], folderPath = []) {
    list.forEach((item) => {
      if (item?.item) {
        walk(item.item, [...folderTags, item.name || ''], [...folderPath, item.name || '']);
        return;
      }
      if (!item?.request) return;
      const method = (item.request.method || 'GET').toUpperCase();
      const { path, query, baseUrl, pathParams } = parsePostmanUrl(item.request.url || '/');
      const body = item.request.body;
      const { requestExample, requestSchema } = parseRequestBody(body);
      const { examples: responseExamples, responseSchema, responseFields, warnings = [] } = parseResponses(
        item.response,
      );
      const parameters = normalizeParametersFromSpec([
        ...query,
        ...pathParams.map((name) => ({ name, in: 'path', required: true })),
        ...(Array.isArray(item.request.header)
          ? item.request.header.map((header) => ({
            name: header?.key,
            in: 'header',
            required: header?.disabled === false || header?.required === true,
            example: header?.value,
            description: header?.description || '',
          }))
          : []),
      ]);
      const idSource = `${method}-${path}`;
      const id = idSource.replace(/[^a-zA-Z0-9-_]+/g, '-');
      const description = item.request.description || item.description || '';
      const posApiType = inferPosApiTypeFromHints(folderTags, path, item.request.description || '');
      const usage = posApiType === 'AUTH' ? 'auth' : posApiType === 'LOOKUP' ? 'info' : 'transaction';
      const requestBody = requestSchema
        ? { schema: requestSchema, description }
        : usage === 'transaction'
          ? undefined
          : { schema: {}, description };
      const requestFields = [
        ...flattenResponseFields(requestExample || {}),
        ...parameters
          .filter((param) => ['query', 'path'].includes(param.in) && param?.name)
          .map((param) => ({
            field: param.name,
            location: param.in,
            required: Boolean(param.required),
            description: param.description || `${param.in} parameter`,
            defaultValue: param.example ?? param.default ?? param.sample ?? '',
          })),
      ];
      entries.push({
        id: id || `${method}-${entries.length + 1}`,
        name: item.name || `${method} ${path}`,
        method,
        path,
        summary: description,
        parameters,
        requestExample,
        requestBody,
      responseBody: responseSchema
        ? {
          schema: responseSchema,
          description: responseExamples?.[0]?.name || responseExamples?.[0]?.status || '',
        }
        : undefined,
      responseExamples,
      examples: responseExamples.map((example, idx) => ({
        key: example.key || `${id}-example-${idx + 1}`,
        name: example.name || example.status || `Example ${idx + 1}`,
        request: example.request,
        response: example.body,
        status: example.status,
      })),
      responseFields,
      requestFields,
      posApiType,
      usage,
      serverUrl: baseUrl,
        tags: [...folderPath],
        variables,
        warnings,
      });
    });
  }

  walk(items, []);
  return entries;
}

function buildDraftParameterDefaults(parameters) {
  const values = {};
  const envFallbacks = {
    client_id: '{{POSAPI_CLIENT_ID}}',
    client_secret: '{{POSAPI_CLIENT_SECRET}}',
    username: '{{POSAPI_USERNAME}}',
    password: '{{POSAPI_PASSWORD}}',
  };
  const defaultSamples = {
    regNo: '1234567',
    tin: '1234567890',
    stockQr: '0123456789012',
  };
  parameters.forEach((param) => {
    if (!param?.name) return;
    const candidates = [param.testValue, param.example, param.default, param.sample, param.value];
    const hit = candidates.find((val) => val !== undefined && val !== null);
    if (hit !== undefined && hit !== null) {
      values[param.name] = hit;
      return;
    }
    const normalizedName = typeof param.name === 'string' ? param.name.toLowerCase() : param.name;
    const envKey = envFallbacks[normalizedName];
    if (envKey) {
      values[param.name] = envKey;
      return;
    }
    const sampleKey = Object.keys(defaultSamples).find((key) => key.toLowerCase() === normalizedName);
    if (sampleKey) {
      values[param.name] = defaultSamples[sampleKey];
    }
  });
  return values;
}

function buildFilledParams(parameters, providedValues = {}) {
  const byLocation = { path: {}, query: {}, header: {} };
  if (!Array.isArray(parameters)) return byLocation;
  parameters.forEach((param) => {
    const name = typeof param?.name === 'string' ? param.name : '';
    const loc = typeof param?.in === 'string' ? param.in : 'query';
    if (!name) return;
    const raw = providedValues[name];
    if (raw === undefined || raw === null || `${raw}`.trim() === '') return;
    if (loc === 'path') {
      byLocation.path[name] = raw;
    } else if (loc === 'header') {
      byLocation.header[name] = raw;
    } else {
      byLocation.query[name] = raw;
    }
  });
  return byLocation;
}

function groupParametersByLocation(parameters = []) {
  const groups = { path: [], query: [], header: [] };
  parameters.forEach((param) => {
    const loc = typeof param?.in === 'string' ? param.in : 'query';
    if (loc === 'path') groups.path.push(param);
    else if (loc === 'header') groups.header.push(param);
    else groups.query.push(param);
  });
  return groups;
}

export default function PosApiAdmin() {
  const { addToast } = useToast();
  const [endpoints, setEndpoints] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [formState, setFormState] = useState({ ...EMPTY_ENDPOINT });
  const [baseRequestJson, setBaseRequestJson] = useState('');
  const [requestSampleText, setRequestSampleText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingDoc, setFetchingDoc] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('');
  const [usageFilter, setUsageFilter] = useState('all');
  const [testState, setTestState] = useState({ running: false, error: '', result: null });
  const [testEnvironment, setTestEnvironment] = useState('staging');
  const [useCachedToken, setUseCachedToken] = useState(true);
  const [docExamples, setDocExamples] = useState([]);
  const [selectedDocBlock, setSelectedDocBlock] = useState('');
  const [docFieldDescriptions, setDocFieldDescriptions] = useState({});
  const [docMetadata, setDocMetadata] = useState({});
  const [requestBuilder, setRequestBuilder] = useState(null);
  const [requestBuilderError, setRequestBuilderError] = useState('');
  const [importSpecText, setImportSpecText] = useState('');
  const [importDrafts, setImportDrafts] = useState([]);
  const [importError, setImportError] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [selectedImportId, setSelectedImportId] = useState('');
  const [importAuthEndpointId, setImportAuthEndpointId] = useState('');
  const [importTestValues, setImportTestValues] = useState({});
  const [importRequestBody, setImportRequestBody] = useState('');
  const [importTestResult, setImportTestResult] = useState(null);
  const [importTestRunning, setImportTestRunning] = useState(false);
  const [importTestError, setImportTestError] = useState('');
  const [importSelectedExampleKey, setImportSelectedExampleKey] = useState('');
  const [importExampleResponse, setImportExampleResponse] = useState(null);
  const [importUseCachedToken, setImportUseCachedToken] = useState(true);
  const [importBaseUrl, setImportBaseUrl] = useState('');
  const [importBaseUrlEnvVar, setImportBaseUrlEnvVar] = useState('');
  const [importBaseUrlMode, setImportBaseUrlMode] = useState('literal');
  const infoSyncPreloadedRef = useRef(false);
  const [requestFieldValues, setRequestFieldValues] = useState({});
  const [requestFieldMeta, setRequestFieldMeta] = useState({});
  const [selectedVariationKey, setSelectedVariationKey] = useState('');
  const [combinationBaseKey, setCombinationBaseKey] = useState('');
  const [combinationModifierKeys, setCombinationModifierKeys] = useState([]);
  const [combinationPayloadText, setCombinationPayloadText] = useState('');
  const [combinationError, setCombinationError] = useState('');
  const [tokenMeta, setTokenMeta] = useState({ lastFetchedAt: null, expiresAt: null });
  const [paymentDataDrafts, setPaymentDataDrafts] = useState({});
  const [paymentDataErrors, setPaymentDataErrors] = useState({});
  const [taxTypeListText, setTaxTypeListText] = useState(DEFAULT_TAX_TYPES.join(', '));
  const [taxTypeListError, setTaxTypeListError] = useState('');
  const taxTypeInputDirtyRef = useRef(false);
  const importAuthSelectionDirtyRef = useRef(false);
  const [activeTab, setActiveTab] = useState('endpoints');
  const [infoSyncSettings, setInfoSyncSettings] = useState({
    autoSyncEnabled: false,
    intervalMinutes: 720,
    usage: 'all',
    endpointIds: [],
    tables: [],
  });
  const [infoSyncLogs, setInfoSyncLogs] = useState([]);
  const [infoSyncStatus, setInfoSyncStatus] = useState('');
  const [infoSyncError, setInfoSyncError] = useState('');
  const [infoSyncLoading, setInfoSyncLoading] = useState(false);
  const [infoSyncUsage, setInfoSyncUsage] = useState('all');
  const [infoSyncEndpointIds, setInfoSyncEndpointIds] = useState([]);
  const [infoSyncTableOptionsBase, setInfoSyncTableOptionsBase] = useState([]);
  const [tableOptions, setTableOptions] = useState([]);
  const [tableOptionsError, setTableOptionsError] = useState('');
  const [tableOptionsLoading, setTableOptionsLoading] = useState(false);
  const [tableFields, setTableFields] = useState({});
  const [tableFieldLoading, setTableFieldLoading] = useState({});
  const [infoUploadCodeType, setInfoUploadCodeType] = useState('classification');
  const [adminSelectionId, setAdminSelectionId] = useState('');
  const [adminParamValues, setAdminParamValues] = useState({});
  const [adminRequestBody, setAdminRequestBody] = useState('');
  const [adminResult, setAdminResult] = useState(null);
  const [adminError, setAdminError] = useState('');
  const [adminRunning, setAdminRunning] = useState(false);
  const [adminHistory, setAdminHistory] = useState([]);
  const [adminUseCachedToken, setAdminUseCachedToken] = useState(true);
  const [adminAuthEndpointId, setAdminAuthEndpointId] = useState('');
  const builderSyncRef = useRef(false);
  const requestSampleSyncRef = useRef(false);
  const refreshInfoSyncLogsRef = useRef(() => Promise.resolve());

  function showToast(message, type = 'info') {
    if (typeof addToast === 'function') {
      addToast(message, type);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const originalResolver = window.resolveEnvironmentVariable;
    if (typeof originalResolver !== 'function') {
      window.resolveEnvironmentVariable = DEFAULT_ENV_RESOLVER;
    }
    return () => {
      if (window.resolveEnvironmentVariable === DEFAULT_ENV_RESOLVER) {
        if (typeof originalResolver === 'function') {
          window.resolveEnvironmentVariable = originalResolver;
        } else {
          delete window.resolveEnvironmentVariable;
        }
      }
    };
  }, []);

  const groupedEndpoints = useMemo(() => {
    const normalized = endpoints.map(withEndpointMetadata);
    const filtered = normalized.filter(
      (endpoint) => usageFilter === 'all' || endpoint.usage === usageFilter,
    );
    const usageOrder = ['transaction', 'info', 'admin', 'auth'];
    return usageOrder
      .map((usage) => {
        const label = formatUsageLabel(usage);
        const list = filtered
          .filter((ep) => ep.usage === usage)
          .slice()
          .sort((a, b) => {
            const left = a.name || a.id || '';
            const right = b.name || b.id || '';
            return left.localeCompare(right);
          })
          .map((ep) => {
            const type = ep.posApiType || ep.requestBody?.schema?.type || '';
            const preview = [];
            if (ep.requestBody?.schema && typeof ep.requestBody.schema === 'object') {
              const keys = Object.keys(ep.requestBody.schema)
                .filter((key) => key !== 'type')
                .slice(0, 5);
              if (keys.length > 0) {
                preview.push(`Request: ${keys.join(', ')}`);
              }
            }
            if (ep.responseBody?.schema && typeof ep.responseBody.schema === 'object') {
              const keys = Object.keys(ep.responseBody.schema).slice(0, 5);
              if (keys.length > 0) {
                preview.push(`Response: ${keys.join(', ')}`);
              }
            }
            if (ep.supportsMultipleReceipts) {
              preview.push('Handles multiple receipts[] groups');
            }
            if (ep.supportsMultiplePayments) {
              preview.push('Handles multiple payments[] entries');
            }
            if (usage === 'transaction' && ep.supportsItems === false) {
              preview.push('Service-only: no receipt items');
            }
            if (Array.isArray(ep.receiptTypes) && ep.receiptTypes.length > 0) {
              preview.push(`Receipt types: ${ep.receiptTypes.join(', ')}`);
            }
            if (Array.isArray(ep.paymentMethods) && ep.paymentMethods.length > 0) {
              preview.push(`Payment methods: ${ep.paymentMethods.join(', ')}`);
            }
            return {
              ...ep,
              _preview: preview.join('\n'),
              _type: type,
              _usage: usage,
            };
          });
        if (list.length === 0) {
          return null;
        }
        return {
          usage,
          label,
          endpoints: list,
        };
      })
      .filter(Boolean);
  }, [endpoints, usageFilter]);

  const adminEndpoints = useMemo(() => {
    return endpoints
      .map(withEndpointMetadata)
      .filter((endpoint) => endpoint.usage !== 'transaction' && endpoint.usage !== 'auth');
  }, [endpoints]);

  const activeAdminEndpoint = useMemo(() => {
    if (!adminSelectionId) return adminEndpoints[0] || null;
    return (
      adminEndpoints.find((endpoint) => endpoint.id === adminSelectionId) || adminEndpoints[0] || null
    );
  }, [adminEndpoints, adminSelectionId]);

  const adminParameterDefaults = useMemo(
    () => buildDraftParameterDefaults(activeAdminEndpoint?.parameters || []),
    [activeAdminEndpoint],
  );

  const activeImportDraft = useMemo(
    () => importDrafts.find((entry) => entry.id === selectedImportId) || importDrafts[0] || null,
    [importDrafts, selectedImportId],
  );

  const activeImportParameterGroups = useMemo(
    () => groupParametersByLocation(activeImportDraft?.parameters || []),
    [activeImportDraft],
  );

  useEffect(() => {
    if (adminEndpoints.length === 0) {
      setAdminSelectionId('');
      setAdminParamValues({});
      setAdminRequestBody('');
      return;
    }
    if (!adminSelectionId || !adminEndpoints.some((endpoint) => endpoint.id === adminSelectionId)) {
      setAdminSelectionId(adminEndpoints[0].id);
    }
  }, [adminEndpoints, adminSelectionId]);

  useEffect(() => {
    if (!activeAdminEndpoint) {
      setAdminParamValues({});
      setAdminRequestBody('');
      setAdminAuthEndpointId('');
      return;
    }
    setAdminParamValues((prev) => {
      if (prev._endpointId === activeAdminEndpoint.id) return prev;
      const defaults = buildDraftParameterDefaults(activeAdminEndpoint.parameters || []);
      return { ...defaults, _endpointId: activeAdminEndpoint.id };
    });
    setAdminRequestBody((prev) => {
      if (prev && adminResult?.endpointId === activeAdminEndpoint.id) return prev;
      if (!activeAdminEndpoint.requestExample) return '';
      try {
        return JSON.stringify(activeAdminEndpoint.requestExample, null, 2);
      } catch {
        return prev;
      }
    });
    setAdminAuthEndpointId((prev) => prev || activeAdminEndpoint.authEndpointId || '');
  }, [activeAdminEndpoint, adminResult]);

  const infoSyncEndpointOptions = useMemo(() => {
    const normalized = endpoints.map(withEndpointMetadata);
    return normalized
      .filter((endpoint) => infoSyncUsage === 'all' || !infoSyncUsage || endpoint.usage === infoSyncUsage)
      .map((endpoint) => ({
        id: endpoint.id,
        name: endpoint.name || endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
        usage: endpoint.usage,
      }));
  }, [endpoints, infoSyncUsage]);

  const infoSyncTableOptions = useMemo(() => {
    const seen = new Set();
    const merged = [
      ...DEFAULT_INFO_TABLE_OPTIONS,
      ...infoSyncTableOptionsBase,
      ...buildTableOptions(infoSyncSettings.tables),
    ];
    return merged
      .map((option) => {
        const value = option?.value;
        if (!value || seen.has(value)) return null;
        seen.add(value);
        return { value, label: formatTableDisplay(value, option.label) };
      })
      .filter(Boolean);
  }, [infoSyncSettings.tables, infoSyncTableOptionsBase]);

  const responseTableOptions = useMemo(() => {
    const seen = new Set();
    const merged = [
      ...tableOptions,
      ...buildTableOptions(formState.responseTables),
    ];

    return merged
      .map((option) => {
        const value = option?.value;
        if (!value || seen.has(value)) return null;
        seen.add(value);
        return { value, label: formatTableDisplay(value, option.label) };
      })
      .filter(Boolean);
  }, [formState.responseTables, tableOptions]);

  const responseTablesUnavailableReason = useMemo(() => {
    if (responseTableOptions.length > 0) return '';
    if (tableOptionsError) return tableOptionsError;
    return 'No database tables were loaded. Verify access permissions or try again later.';
  }, [responseTableOptions.length, tableOptionsError]);

  const responseTableSelectionBlockers = useMemo(() => {
    const blockers = [];
    if (tableOptionsLoading) blockers.push('Tables are still loading.');
    if (tableOptionsError) blockers.push(tableOptionsError);
    if (!tableOptionsLoading && tableOptions.length === 0)
      blockers.push('No database tables were returned from the server.');
    return blockers;
  }, [tableOptions, tableOptionsError, tableOptionsLoading]);

  const responseFieldOptions = useMemo(() => {
    const options = [];
    formState.responseTables.forEach((table) => {
      const fields = tableFields[table];
      if (!Array.isArray(fields) || fields.length === 0) return;
      fields.forEach((field) => {
        const name = extractFieldName(field);
        if (!name) return;
        const display = field.label || field.column_comment || field.description || name;
        const tableLabel = formatTableDisplay(table);
        options.push({
          value: `${table}.${name}`,
          label: `${tableLabel} – ${display} (${name})`,
        });
      });
    });
    return options;
  }, [formState.responseTables, tableFields]);

  useEffect(() => {
    setFormState((prev) => {
      const sanitizedTables = sanitizeTableSelection(prev.responseTables, responseTableOptions);
      const allowedTables = new Set(sanitizedTables.map((table) => normalizeTableValue(table)));
      const filteredMappings = Object.fromEntries(
        Object.entries(sanitizeResponseFieldMappings(prev.responseFieldMappings)).filter(([, target]) =>
          allowedTables.has(normalizeTableValue(target.table)),
        ),
      );
      const tablesChanged = JSON.stringify(sanitizedTables) !== JSON.stringify(prev.responseTables || []);
      const mappingsChanged =
        JSON.stringify(filteredMappings) !== JSON.stringify(prev.responseFieldMappings || {});
      if (!tablesChanged && !mappingsChanged) return prev;
      return { ...prev, responseTables: sanitizedTables, responseFieldMappings: filteredMappings };
    });
  }, [responseTableOptions]);

  const infoMappingEndpoints = useMemo(() => {
    const selected = new Set(infoSyncEndpointIds.filter(Boolean));
    const desiredUsage = infoSyncUsage === 'all' ? null : infoSyncUsage;
    return endpoints
      .map(withEndpointMetadata)
      .filter((endpoint) => !desiredUsage || endpoint.usage === desiredUsage)
      .filter((endpoint) => selected.size === 0 || selected.has(endpoint.id));
  }, [endpoints, infoSyncEndpointIds, infoSyncUsage]);

  const infoSyncEndpointUnavailableReason = useMemo(() => {
    if (infoSyncEndpointOptions.length > 0) return '';
    if (loading) return 'POSAPI endpoints are still loading.';
    if (loadError) return loadError;
    if (error) return error;
    return 'No GET endpoints available for the selected usage.';
  }, [error, infoSyncEndpointOptions.length, infoSyncUsage, loadError, loading]);

  useEffect(() => {
    setInfoSyncEndpointIds((prev) => {
      if (loading || infoSyncEndpointOptions.length === 0) return prev;
      const filtered = prev.filter((id) => infoSyncEndpointOptions.some((ep) => ep.id === id));
      if (filtered.length !== prev.length) {
        setInfoSyncSettings((settings) => ({ ...settings, endpointIds: filtered }));
      }
      return filtered;
    });
  }, [infoSyncEndpointOptions, loading]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadResponseTables() {
      try {
        setTableOptionsLoading(true);
        setTableOptionsError('');
        const res = await fetch(`${API_BASE}/report_builder/tables`, {
          credentials: 'include',
          skipLoader: true,
          signal: controller.signal,
        });
        if (!res.ok) {
          let details = '';
          try {
            const body = await res.json();
            details = body?.message || body?.error || '';
          } catch {}
          const reason =
            res.status === 401 || res.status === 403
              ? 'You do not have permission to view database tables for response mappings.'
              : 'Failed to load database tables.';
          const suffix = details ? ` Details: ${details}` : '';
          const errorMessage = `${reason}${suffix}`;
          setTableOptions([]);
          setTableOptionsError(errorMessage);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const options = buildTableOptions(Array.isArray(data.tables) ? data.tables : []);
        // Allow selecting from all available tables so response mappings can be configured even when
        // POSAPI-specific prefixes are absent. Prefer prefixed tables when they exist, but fall back
        // to the full list to avoid presenting an empty, unusable selector.
          const prefixed = options.filter((option) =>
            normalizeTableValue(option?.value || '').startsWith('ebarimt_'),
          );
          const remainder = options.filter((option) =>
            !normalizeTableValue(option?.value || '').startsWith('ebarimt_'),
          );
          setTableOptions(prefixed.length > 0 ? [...prefixed, ...remainder] : options);
      } catch (err) {
        if (!cancelled && err?.name !== 'AbortError') {
          setTableOptionsError(err?.message || 'Unable to load POSAPI response tables.');
          setTableOptions([]);
          console.warn('Unable to load POSAPI response tables', err);
        }
      } finally {
        if (!cancelled) {
          setTableOptionsLoading(false);
        }
      }
    }

    loadResponseTables();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const missingTables = formState.responseTables.filter(
      (table) => table && !tableFields[table] && !tableFieldLoading[table],
    );
    if (missingTables.length === 0) return undefined;
    let cancelled = false;
    const abortController = new AbortController();
    missingTables.forEach((table) => {
      setTableFieldLoading((prev) => ({ ...prev, [table]: true }));
      fetch(`${API_BASE}/report_builder/fields?table=${encodeURIComponent(table)}`, {
        credentials: 'include',
        skipLoader: true,
        signal: abortController.signal,
      })
        .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          if (cancelled) return;
          if (!ok) {
            setTableFieldLoading((prev) => ({ ...prev, [table]: false }));
            return;
          }
          const normalized = normalizeFieldList(data);
          setTableFields((prev) => ({ ...prev, [table]: normalized }));
          setTableFieldLoading((prev) => ({ ...prev, [table]: false }));
        })
        .catch(() => {
          if (cancelled) return;
          setTableFieldLoading((prev) => ({ ...prev, [table]: false }));
        });
    });
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [formState.responseTables, tableFields, tableFieldLoading]);

  const isTransactionUsage = formState.usage === 'transaction';
  const supportsItems = isTransactionUsage ? formState.supportsItems !== false : false;
  const supportsMultiplePayments = isTransactionUsage && Boolean(formState.supportsMultiplePayments);
  const receiptTypesEnabled = isTransactionUsage && supportsItems && formState.enableReceiptTypes !== false;
  const receiptTaxTypesEnabled = isTransactionUsage && supportsItems && formState.enableReceiptTaxTypes !== false;
  const paymentMethodsEnabled = isTransactionUsage
    ? supportsMultiplePayments && formState.enablePaymentMethods !== false
    : false;
  const receiptItemsEnabled = isTransactionUsage && supportsItems && formState.enableReceiptItems !== false;

  const formReceiptTypes = useMemo(() => {
    if (!receiptTypesEnabled) return [];
    if (Array.isArray(formState.receiptTypes) && formState.receiptTypes.length > 0) {
      return formState.receiptTypes;
    }
    return DEFAULT_RECEIPT_TYPES;
  }, [formState.receiptTypes, receiptTypesEnabled]);

  const formTaxTypes = useMemo(() => {
    if (!receiptTaxTypesEnabled) return [];
    if (Array.isArray(formState.taxTypes) && formState.taxTypes.length > 0) {
      return formState.taxTypes;
    }
    return DEFAULT_TAX_TYPES;
  }, [formState.taxTypes, receiptTaxTypesEnabled]);

  const formPaymentMethods = useMemo(() => {
    if (!paymentMethodsEnabled) return [];
    if (Array.isArray(formState.paymentMethods) && formState.paymentMethods.length > 0) {
      return formState.paymentMethods;
    }
    return DEFAULT_PAYMENT_METHODS;
  }, [formState.paymentMethods, paymentMethodsEnabled]);

  const formSupportsItems = supportsItems;

  const requestFieldHints = useMemo(
    () =>
      parseHintPreview(
        formState.requestFieldsText,
        'Request field hints must be a JSON array',
      ),
    [formState.requestFieldsText],
  );

  const responseFieldHints = useMemo(
    () =>
      parseHintPreview(
        formState.responseFieldsText,
        'Response field hints must be a JSON array',
      ),
    [formState.responseFieldsText],
  );

  useEffect(() => {
    if (responseFieldHints.state !== 'ok') return;
    const allowedFields = new Set(
      responseFieldHints.items
        .map((entry) => normalizeHintEntry(entry).field)
        .filter(Boolean),
    );
    setFormState((prev) => {
      const current = sanitizeResponseFieldMappings(prev.responseFieldMappings);
      const next = Object.fromEntries(
        Object.entries(current).filter(([field]) => allowedFields.has(field)),
      );
      if (JSON.stringify(next) === JSON.stringify(prev.responseFieldMappings || {})) return prev;
      return { ...prev, responseFieldMappings: next };
    });
  }, [responseFieldHints]);

  useEffect(() => {
    setFormState((prev) => {
      const allowedTables = new Set((prev.responseTables || []).map((table) => normalizeTableValue(table)));
      const current = sanitizeResponseFieldMappings(prev.responseFieldMappings);
      const next = Object.fromEntries(
        Object.entries(current).filter(([, target]) =>
          allowedTables.has(normalizeTableValue(target.table)),
        ),
      );
      if (JSON.stringify(next) === JSON.stringify(prev.responseFieldMappings || {})) return prev;
      return { ...prev, responseFieldMappings: next };
    });
  }, [formState.responseTables]);

  const parameterPreview = useMemo(
    () => parseParametersPreview(formState.parametersText),
    [formState.parametersText],
  );

  const parameterDefaults = useMemo(
    () => buildDraftParameterDefaults(parameterPreview.items || []),
    [parameterPreview.items],
  );

  const parsedExamples = useMemo(() => {
    try {
      const raw = JSON.parse(formState.examplesText || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (err) {
      console.warn('Unable to parse request examples', err);
      return [];
    }
  }, [formState.examplesText]);

  const exampleVariationChoices = useMemo(
    () =>
      parsedExamples.map((example, idx) => {
        const key =
          (example && typeof example.key === 'string' && example.key)
          || (example && typeof example.name === 'string' && example.name)
          || (example && typeof example.title === 'string' && example.title)
          || `example-${idx + 1}`;
        const label =
          (example && typeof example.name === 'string' && example.name)
          || (example && typeof example.title === 'string' && example.title)
          || `Example ${idx + 1}`;
        return { key, label, example };
      }),
    [parsedExamples],
  );
  const exampleVariationMap = useMemo(
    () => new Map(exampleVariationChoices.map((entry) => [entry.key, entry.example])),
    [exampleVariationChoices],
  );

  const requestFieldVariations = Array.isArray(formState.requestFieldVariations)
    ? formState.requestFieldVariations
    : [];
  const variations = Array.isArray(formState.variations) ? formState.variations : [];
  const activeVariations = variations.filter((entry) => entry.enabled !== false);
  useEffect(() => {
    setCombinationBaseKey(BASE_COMBINATION_KEY);
    setCombinationModifierKeys([]);
    setCombinationPayloadText('');
    setCombinationError('Select a base variation to build a combination.');
  }, [formState.id]);
  const enabledRequestFieldVariations = useMemo(
    () => requestFieldVariations.filter((entry) => entry?.key && entry.enabled !== false),
    [requestFieldVariations],
  );
  const requestFieldVariationMap = useMemo(
    () => new Map(enabledRequestFieldVariations.map((entry) => [entry.key, entry])),
    [enabledRequestFieldVariations],
  );
  useEffect(() => {
    const variationSnapshot = Array.isArray(formState.variations) ? formState.variations : [];
    setFormState((prev) => {
      const existingMeta = Array.isArray(prev.requestFieldVariations)
        ? prev.requestFieldVariations
        : [];
      const nextMeta = variationSnapshot.map((variation, index) => {
        const key = variation.key || variation.name || `variation-${index + 1}`;
        const existing = existingMeta.find((entry) => entry.key === key) || {};
        return {
          ...existing,
          key,
          label: variation.name || variation.label || key,
          enabled: variation.enabled !== false,
          requiredFields: {
            ...normalizeFieldRequirementMap(existing.requiredFields),
            ...normalizeFieldRequirementMap(variation.requiredFields),
          },
          defaultValues: {
            ...normalizeFieldValueMap(existing.defaultValues),
            ...normalizeFieldValueMap(variation.defaultValues),
          },
        };
      });

      if (JSON.stringify(nextMeta) === JSON.stringify(existingMeta)) return prev;
      return { ...prev, requestFieldVariations: nextMeta };
    });
  }, [formState.variations]);
  const variationColumns = useMemo(
    () =>
      activeVariations.map((variation, index) => ({
        key: variation.key || variation.name || `variation-${index + 1}`,
        label: variation.name || variation.label || variation.key,
        type: 'variation',
        fieldSet: Array.isArray(variation.requestFields)
          ? new Set(
            variation.requestFields
              .map((field) => normalizeHintEntry(field).field)
              .filter(Boolean),
          )
          : null,
      })),
    [activeVariations],
  );
  const variationFieldSets = useMemo(() => {
    const map = new Map();
    variationColumns.forEach((variation) => {
      const fields = variation.fieldSet ? Array.from(variation.fieldSet) : [];
      map.set(variation.key, fields.length > 0 ? new Set(fields) : null);
    });
    return map;
  }, [variationColumns]);
  useEffect(() => {
    if (!combinationBaseKey) {
      setCombinationBaseKey(BASE_COMBINATION_KEY);
    }
    setCombinationModifierKeys((prev) =>
      prev.filter((key) =>
        variationColumns.some((variation) => variation.key === key)
        || enabledRequestFieldVariations.some((variation) => variation.key === key),
      ),
    );
  }, [combinationBaseKey, enabledRequestFieldVariations, variationColumns]);
  const requestFieldColumnTemplate = useMemo(
    () => {
      const baseColumns = ['150px', '250px', '80px'];
      const variationCells = variationColumns.map(() => '200px');
      return [...baseColumns, ...variationCells].join(' ');
    },
    [variationColumns],
  );

  useEffect(() => {
    const allowedKeys = new Set(exampleVariationChoices.map((entry) => entry.key));
    if (allowedKeys.size === 0) return;
    setFormState((prev) => {
      const current = Array.isArray(prev.requestFieldVariations)
        ? prev.requestFieldVariations
        : [];
      const filtered = current.filter((entry) => allowedKeys.has(entry.key));
      if (JSON.stringify(filtered) === JSON.stringify(current)) return prev;
      return { ...prev, requestFieldVariations: filtered };
    });
  }, [exampleVariationChoices]);

  const requestFieldDisplay = useMemo(
    () => buildRequestFieldDisplayFromState(formState),
    [formState, parameterDefaults, parameterPreview, requestFieldHints],
  );

  const visibleRequestFieldItems = useMemo(() => {
    if (requestFieldDisplay.state !== 'ok') return requestFieldDisplay.items || [];
    if (variationColumns.length === 0) return requestFieldDisplay.items;

    return requestFieldDisplay.items.filter((entry) => {
      const normalized = normalizeHintEntry(entry);
      const fieldLabel = normalized.field;
      if (!fieldLabel) return false;

      return variationColumns.some((variation) => {
        const key = variation.key;
        if (!key) return false;
        const variationFieldSet = variationFieldSets.get(key);
        return !variationFieldSet || variationFieldSet.has(fieldLabel);
      });
    });
  }, [requestFieldDisplay, variationColumns, variationFieldSets]);

  useEffect(() => {
    if (requestFieldDisplay.state !== 'ok') {
      setRequestFieldMeta({});
      return;
    }

    setRequestFieldMeta((prev) => {
      const next = {};
      visibleRequestFieldItems.forEach((hint) => {
        const normalized = normalizeHintEntry(hint);
        const fieldLabel = normalized.field;
        if (!fieldLabel) return;
        const existing = prev[fieldLabel] || {};
        const requiredCommon =
          typeof existing.requiredCommon === 'boolean'
            ? existing.requiredCommon
            : typeof normalized.requiredCommon === 'boolean'
              ? normalized.requiredCommon
              : typeof normalized.required === 'boolean'
                ? normalized.required
                : false;
        const requiredByVariation = {
          ...normalized.requiredByVariation,
          ...existing.requiredByVariation,
        };
        const defaultByVariation = {
          ...normalized.defaultByVariation,
          ...existing.defaultByVariation,
        };

        variationColumns.forEach((variation) => {
          const key = variation.key;
          if (!key) return;
          if (!(key in requiredByVariation)) {
            requiredByVariation[key] = requiredCommon;
          }
          const variationDefaults = normalized.defaultByVariation || {};
          if (
            variationDefaults
            && variationDefaults[key] !== undefined
            && defaultByVariation[key] === undefined
          ) {
            defaultByVariation[key] = variationDefaults[key];
          }
          const combination = requestFieldVariationMap.get(key);
          if (combination?.requiredFields?.[fieldLabel] && !requiredByVariation[key]) {
            requiredByVariation[key] = true;
          }
          if (combination?.defaultValues?.[fieldLabel] !== undefined
            && defaultByVariation[key] === undefined) {
            defaultByVariation[key] = combination.defaultValues[fieldLabel];
          }
        });
        next[fieldLabel] = {
          description: normalized.description || existing.description || '',
          requiredCommon,
          requiredByVariation,
          defaultByVariation,
        };
      });
      return next;
    });
  }, [requestFieldDisplay.state, variationColumns, visibleRequestFieldItems, requestFieldVariationMap]);

  useEffect(() => {
    const variationKeys = new Set(
      variations.map((variation, index) => variation.key || variation.name || `variation-${index + 1}`),
    );
    const variationMetaByField = new Map();

    variations.forEach((variation, index) => {
      const variationKey = variation.key || variation.name || `variation-${index + 1}`;
      if (!variationKey) return;

      const requiredMap = normalizeFieldRequirementMap(variation.requiredFields);
      Object.entries(requiredMap).forEach(([fieldPath, required]) => {
        if (!fieldPath) return;
        const existing = variationMetaByField.get(fieldPath) || { requiredByVariation: {}, defaultByVariation: {} };
        existing.requiredByVariation[variationKey] = required !== false;
        variationMetaByField.set(fieldPath, existing);
      });

      const defaultMap = normalizeFieldValueMap(variation.defaultValues);
      Object.entries(defaultMap).forEach(([fieldPath, defaultValue]) => {
        if (!fieldPath) return;
        const existing = variationMetaByField.get(fieldPath) || { requiredByVariation: {}, defaultByVariation: {} };
        existing.defaultByVariation[variationKey] = defaultValue;
        variationMetaByField.set(fieldPath, existing);
      });

      (variation.requestFields || []).forEach((field) => {
        const normalized = normalizeHintEntry(field);
        const fieldPath = normalized.field;
        if (!fieldPath) return;
        const existing = variationMetaByField.get(fieldPath) || { requiredByVariation: {}, defaultByVariation: {} };
        existing.requiredByVariation[variationKey] = normalized.required !== false;
        variationMetaByField.set(fieldPath, existing);
      });
    });

    setRequestFieldMeta((prev) => {
      let changed = false;
      const next = { ...prev };

      Object.entries(next).forEach(([fieldPath, entry]) => {
        const requiredByVariation = { ...(entry.requiredByVariation || {}) };
        const defaultByVariation = { ...(entry.defaultByVariation || {}) };
        let entryChanged = false;

        Object.keys(requiredByVariation).forEach((key) => {
          if (!variationKeys.has(key)) {
            delete requiredByVariation[key];
            entryChanged = true;
          }
        });

        Object.keys(defaultByVariation).forEach((key) => {
          if (!variationKeys.has(key)) {
            delete defaultByVariation[key];
            entryChanged = true;
          }
        });

        if (entryChanged) {
          next[fieldPath] = { ...entry, requiredByVariation, defaultByVariation };
          changed = true;
        }
      });

      variationMetaByField.forEach((updates, fieldPath) => {
        const existing = next[fieldPath] || {};
        const requiredByVariation = { ...(existing.requiredByVariation || {}) };
        const defaultByVariation = { ...(existing.defaultByVariation || {}) };
        let entryChanged = false;

        Object.keys(requiredByVariation).forEach((key) => {
          if (!(key in updates.requiredByVariation)) {
            delete requiredByVariation[key];
            entryChanged = true;
          }
        });

        Object.keys(defaultByVariation).forEach((key) => {
          if (!(key in updates.defaultByVariation)) {
            delete defaultByVariation[key];
            entryChanged = true;
          }
        });

        Object.entries(updates.requiredByVariation).forEach(([key, value]) => {
          if (requiredByVariation[key] !== value) {
            requiredByVariation[key] = value;
            entryChanged = true;
          }
        });

        Object.entries(updates.defaultByVariation).forEach(([key, value]) => {
          if (defaultByVariation[key] !== value) {
            defaultByVariation[key] = value;
            entryChanged = true;
          }
        });

        if (entryChanged) {
          next[fieldPath] = { ...existing, requiredByVariation, defaultByVariation };
          changed = true;
        }
      });

      if (!changed) return prev;
      return next;
    });
  }, [variations]);

  useEffect(() => {
    const derivedSelections = deriveRequestFieldSelections({
      requestSampleText,
      requestEnvMap: formState.requestEnvMap,
      displayItems: requestFieldDisplay.items,
    });

    setRequestFieldValues((prev) => {
      const next = { ...prev };
      let changed = false;

      const isSameSelection = (a = {}, b = {}) =>
        a.mode === b.mode
        && (a.literal ?? '') === (b.literal ?? '')
        && (a.envVar ?? '') === (b.envVar ?? '')
        && (a.applyToBody ?? true) === (b.applyToBody ?? true);

      Object.entries(derivedSelections).forEach(([fieldPath, selection]) => {
        const existing = prev[fieldPath];
        const mergedSelection = existing
          ? { ...selection, ...existing, applyToBody: selection.applyToBody }
          : selection;

        if (existing && isSameSelection(existing, mergedSelection)) return;

        next[fieldPath] = mergedSelection;
        changed = true;
      });

      const derivedKeys = new Set(Object.keys(derivedSelections));
      Object.keys(next).forEach((key) => {
        if (!derivedKeys.has(key)) {
          delete next[key];
          changed = true;
        }
      });

      if (changed) {
        if (requestSampleSyncRef.current) {
          requestSampleSyncRef.current = false;
          return next;
        }
        syncRequestSampleFromSelections(next);
        return next;
      }

      return prev;
    });
  }, [formState.requestSchemaText, formState.requestEnvMap, requestFieldDisplay.items, requestSampleText]);

  useEffect(() => {
    if (selectedVariationKey && !variationColumns.some((entry) => entry.key === selectedVariationKey)) {
      setSelectedVariationKey('');
    }
  }, [selectedVariationKey, variationColumns]);

  useEffect(() => {
    if (!selectedVariationKey) return;
    const variationPayload = resolveVariationRequestExample(selectedVariationKey)
      || cleanSampleText(baseRequestJson || '{}');
    const formattedSample = JSON.stringify(variationPayload || {}, null, 2);
    requestSampleSyncRef.current = true;
    setRequestSampleText(formattedSample);
    const selectionsFromSample = deriveRequestFieldSelections({
      requestSampleText: formattedSample,
      requestEnvMap: formState.requestEnvMap,
      displayItems: requestFieldDisplay.items,
    });
    const variationSelections = buildSelectionsForVariation(selectedVariationKey);
    const mergedSelections = { ...selectionsFromSample, ...variationSelections };
    setRequestFieldValues(mergedSelections);
    setFormState((prev) => ({
      ...prev,
      requestEnvMap: buildRequestEnvMap(mergedSelections),
    }));
  }, [
    selectedVariationKey,
    activeVariations,
    requestFieldDisplay.items,
    formState.requestEnvMap,
    baseRequestJson,
    exampleVariationMap,
  ]);

  useEffect(() => {
    if (!combinationBaseKey) {
      setCombinationPayloadText('');
      setCombinationError('Select a base variation to build a combination.');
      return;
    }
    try {
      const mergedPayload = buildCombinationPayload(combinationBaseKey, combinationModifierKeys);
      setCombinationPayloadText(JSON.stringify(mergedPayload, null, 2));
      setCombinationError('');
    } catch (err) {
      setCombinationError(err.message || 'Failed to build combination payload.');
    }
  }, [combinationBaseKey, combinationModifierKeys, activeVariations, exampleVariationMap, baseRequestJson]);

  const selectedReceiptTypes = receiptTypesEnabled && Array.isArray(formState.receiptTypes)
    ? formState.receiptTypes
    : [];
  const selectedTaxTypes = receiptTaxTypesEnabled && Array.isArray(formState.taxTypes)
    ? formState.taxTypes
    : [];
  const selectedPaymentMethods = paymentMethodsEnabled && Array.isArray(formState.paymentMethods)
    ? formState.paymentMethods
    : [];
  const receiptTypeTemplates = formState.receiptTypeTemplates || {};
  const taxTypeTemplates = formState.taxTypeTemplates || {};
  const paymentMethodTemplates = formState.paymentMethodTemplates || {};
  const receiptItemTemplates = Array.isArray(formState.receiptItemTemplates)
    ? formState.receiptItemTemplates
    : [];

  useEffect(() => {
    if (!receiptTaxTypesEnabled) {
      setTaxTypeListText('');
      setTaxTypeListError('');
      taxTypeInputDirtyRef.current = false;
      return;
    }
    if (taxTypeInputDirtyRef.current) {
      return;
    }
    const source = selectedTaxTypes.length > 0 ? selectedTaxTypes : DEFAULT_TAX_TYPES;
    setTaxTypeListText(source.join(', '));
  }, [receiptTaxTypesEnabled, selectedTaxTypes]);

  const allowedTaxTypes = useMemo(() => {
    if (!receiptTaxTypesEnabled) return [];
    const values = selectedTaxTypes.length > 0 ? selectedTaxTypes : DEFAULT_TAX_TYPES;
    const unique = Array.from(new Set(values));
    return TAX_TYPES.filter((tax) => unique.includes(tax.value));
  }, [receiptTaxTypesEnabled, selectedTaxTypes]);

  const allowedPaymentTypes = useMemo(() => {
    if (!paymentMethodsEnabled) return [];
    const values = selectedPaymentMethods.length > 0 ? selectedPaymentMethods : DEFAULT_PAYMENT_METHODS;
    const unique = Array.from(new Set(values));
    return PAYMENT_TYPES.filter((payment) => unique.includes(payment.value));
  }, [paymentMethodsEnabled, selectedPaymentMethods]);

  const combinationModifierOptions = useMemo(() => {
    const seen = new Set();
    const baseOptions = activeVariations.map((variation, index) => ({
      key: variation.key || variation.name || `variation-${index + 1}`,
      label: variation.name || variation.label || variation.key,
      type: 'variation',
    }));
    const requestBased = enabledRequestFieldVariations.map((entry) => ({
      key: entry.key,
      label: entry.label || entry.key,
      type: 'combination',
    }));
    return [...baseOptions, ...requestBased].filter((option) => {
      if (!option?.key) return false;
      if (seen.has(option.key)) return false;
      seen.add(option.key);
      return true;
    });
  }, [activeVariations, enabledRequestFieldVariations]);

  const combinationBaseOptions = useMemo(
    () => [{ key: BASE_COMBINATION_KEY, label: 'Base request', type: 'base' }, ...variationColumns],
    [variationColumns],
  );

  const authEndpointOptions = useMemo(
    () => endpoints.filter((endpoint) => endpoint?.posApiType === 'AUTH'),
    [endpoints],
  );

  const urlSelections = useMemo(
    () => {
      const buildSelection = (field) => ({
        literal: formState[field] || '',
        envVar: formState[`${field}EnvVar`] || '',
        mode: formState[`${field}Mode`],
      });
      return {
        serverUrl: buildSelection('serverUrl'),
        testServerUrl: buildSelection('testServerUrl'),
        productionServerUrl: buildSelection('productionServerUrl'),
        testServerUrlProduction: buildSelection('testServerUrlProduction'),
      };
    },
    [
      formState.productionServerUrl,
      formState.productionServerUrlEnvVar,
      formState.productionServerUrlMode,
      formState.serverUrl,
      formState.serverUrlEnvVar,
      formState.serverUrlMode,
      formState.testServerUrl,
      formState.testServerUrlEnvVar,
      formState.testServerUrlMode,
      formState.testServerUrlProduction,
      formState.testServerUrlProductionEnvVar,
      formState.testServerUrlProductionMode,
    ],
  );

  const resolvedUrlSelections = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(urlSelections).map(([key, entry]) => [key, resolveUrlWithEnv(entry)]),
      ),
    [urlSelections],
  );

  const importBaseUrlSelection = useMemo(
    () => ({
      literal: importBaseUrl,
      envVar: importBaseUrlEnvVar,
      mode: normalizeUrlMode(importBaseUrlMode, importBaseUrlEnvVar),
    }),
    [importBaseUrl, importBaseUrlEnvVar, importBaseUrlMode],
  );

  const resolvedImportBaseSelection = useMemo(
    () => resolveUrlWithEnv(importBaseUrlSelection),
    [importBaseUrlSelection],
  );

  const resolvedTestServerUrl = ((testEnvironment === 'production'
    ? resolvedUrlSelections.productionServerUrl.resolved
      || resolvedUrlSelections.testServerUrlProduction.resolved
      || resolvedUrlSelections.testServerUrl.resolved
    : resolvedUrlSelections.testServerUrl.resolved
      || resolvedUrlSelections.testServerUrlProduction.resolved
      || resolvedUrlSelections.productionServerUrl.resolved
  ) || '').trim();

  const resolvedTestSelection = (testEnvironment === 'production'
    ? [
        resolvedUrlSelections.productionServerUrl,
        resolvedUrlSelections.testServerUrlProduction,
        resolvedUrlSelections.testServerUrl,
      ]
    : [
        resolvedUrlSelections.testServerUrl,
        resolvedUrlSelections.testServerUrlProduction,
        resolvedUrlSelections.productionServerUrl,
      ]).find((entry) => entry?.hasValue)
    || null;

  const selectedTestUrl = resolvedTestSelection?.display || resolvedTestSelection?.resolved || '';

  const hasTestServerUrl = Boolean(resolvedTestSelection?.hasValue || resolvedTestServerUrl);
  const urlEnvironmentVariables = useMemo(
    () => Object.values(urlSelections).map((entry) => entry.envVar).filter(Boolean),
    [urlSelections],
  );
  const envVariableOptions = useMemo(
    () =>
      listPosApiEnvVariables([
        ...Object.values(requestFieldValues || {})
          .map((entry) => entry?.envVar)
          .filter(Boolean),
        ...urlEnvironmentVariables,
        ...Object.values(formState.requestEnvMap || {}),
      ]),
    [formState.requestEnvMap, requestFieldValues, urlEnvironmentVariables],
  );

  const renderUrlField = (label, fieldKey, placeholder) => {
    const rawSelection = urlSelections[fieldKey] || { literal: '', envVar: '', mode: 'literal' };
    const resolvedSelection = resolvedUrlSelections[fieldKey]
      || { resolved: '', missing: false, envVar: '', mode: 'literal', literal: '' };
    const mode = normalizeUrlMode(rawSelection.mode, rawSelection.envVar);
    const envMode = mode === 'env';
    const envVarValue = rawSelection.envVar || '';
    const literalValue = rawSelection.literal || '';
    const resolvedValue = resolvedSelection.display || resolvedSelection.resolved || literalValue;
    return (
      <label style={{ ...styles.label, flex: 1 }}>
        {label}
        <div style={styles.urlFieldControls}>
          <div style={styles.requestFieldModes}>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name={`${fieldKey}-mode`}
                checked={!envMode}
                onChange={() => handleUrlFieldChange(fieldKey, { mode: 'literal' })}
              />
              Literal URL
            </label>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name={`${fieldKey}-mode`}
                checked={envMode}
                onChange={() => handleUrlFieldChange(fieldKey, { mode: 'env' })}
              />
              Environment variable
            </label>
          </div>
          {envMode ? (
            <div style={styles.urlEnvFields}>
              <input
                type="text"
                list={`env-options-${fieldKey}`}
                value={envVarValue}
                onChange={(e) =>
                  handleUrlFieldChange(fieldKey, { envVar: e.target.value, mode: 'env' })
                }
                placeholder="Enter environment variable name"
                style={styles.input}
              />
              <datalist id={`env-options-${fieldKey}`}>
                {envVariableOptions.map((opt) => (
                  <option key={`env-${fieldKey}-${opt}`} value={opt} />
                ))}
              </datalist>
              <input
                type="text"
                value={literalValue}
                onChange={(e) => handleUrlFieldChange(fieldKey, { literal: e.target.value })}
                placeholder={placeholder}
                style={styles.input}
              />
              <div style={styles.fieldHelp}>Resolved URL: {resolvedValue || 'Not set'}</div>
            </div>
          ) : (
            <div style={styles.urlEnvFields}>
              <input
                type="text"
                value={literalValue}
                onChange={(e) => handleUrlFieldChange(fieldKey, { literal: e.target.value })}
                placeholder={placeholder}
                style={styles.input}
              />
              <div style={styles.fieldHelp}>Resolved URL: {resolvedValue || 'Not set'}</div>
            </div>
          )}
        </div>
      </label>
    );
  };

  const supportsMultipleReceipts = isTransactionUsage && Boolean(formState.supportsMultipleReceipts);
  const receiptTypeOptions = receiptTypesEnabled && formReceiptTypes.length > 0
    ? POSAPI_TRANSACTION_TYPES.filter((type) => formReceiptTypes.includes(type.value))
    : POSAPI_TRANSACTION_TYPES;
  const taxTypeOptions = allowedTaxTypes.length > 0 ? allowedTaxTypes : TAX_TYPES;
  const paymentTypeOptions = allowedPaymentTypes.length > 0 ? allowedPaymentTypes : PAYMENT_TYPES;

  useEffect(() => {
    if (!isTransactionUsage) {
      setRequestBuilder(null);
      setRequestBuilderError('');
      return;
    }
    if (builderSyncRef.current) {
      builderSyncRef.current = false;
      return;
    }
    const text = (baseRequestJson || '').trim();
    if (!text) {
      setRequestBuilder(null);
      setRequestBuilderError('');
      return;
    }
    try {
      const parsed = JSON.parse(text);
      setRequestBuilder(parsed);
      setRequestBuilderError('');
    } catch (err) {
      setRequestBuilder(null);
      setRequestBuilderError(err.message || 'Invalid JSON');
    }
  }, [baseRequestJson, isTransactionUsage]);

  useEffect(() => {
    const payments = Array.isArray(requestBuilder?.payments) ? requestBuilder.payments : [];
    setPaymentDataDrafts((prev) => {
      const next = {};
      payments.forEach((payment, index) => {
        if (payment.type === 'PAYMENT_CARD') {
          const key = String(index);
          if (Object.prototype.hasOwnProperty.call(prev, key)) {
            next[key] = prev[key];
          } else {
            next[key] = JSON.stringify(payment.data ?? {}, null, 2);
          }
        }
      });
      return next;
    });
    setPaymentDataErrors((prev) => {
      const next = {};
      payments.forEach((payment, index) => {
        const key = String(index);
        if (payment.type === 'PAYMENT_CARD' && prev[key]) {
          next[key] = prev[key];
        }
      });
      return next;
    });
  }, [requestBuilder]);

  const updateRequestBuilder = (updater) => {
    setRequestBuilder((prev) => {
      const working = deepClone(prev) || {};
      const next = typeof updater === 'function' ? updater(working) : updater;
      if (!next || typeof next !== 'object') {
        return prev;
      }
      builderSyncRef.current = true;
      try {
        setBaseRequestJson(JSON.stringify(next, null, 2));
      } catch {
        // ignore formatting errors
      }
      setFormState((prevState) => ({
        ...prevState,
        posApiType: next.type || prevState.posApiType,
      }));
      return next;
    });
  };

  const handlePaymentDataChange = (index, text) => {
    const key = String(index);
    setPaymentDataDrafts((prev) => ({ ...prev, [key]: text }));
    const trimmed = text.trim();
    if (!trimmed) {
      setPaymentDataErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      updateRequestBuilder((prev) => {
        const payments = Array.isArray(prev.payments) ? prev.payments.slice() : [];
        if (!payments[index]) return prev;
        const updated = { ...payments[index] };
        delete updated.data;
        payments[index] = updated;
        return { ...prev, payments };
      });
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed !== 'object') {
        throw new Error('Payment data must be a JSON object');
      }
      setPaymentDataErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      updateRequestBuilder((prev) => {
        const payments = Array.isArray(prev.payments) ? prev.payments.slice() : [];
        if (!payments[index]) return prev;
        payments[index] = { ...payments[index], data: parsed };
        return { ...prev, payments };
      });
    } catch (err) {
      setPaymentDataErrors((prev) => ({ ...prev, [key]: err.message || 'Invalid JSON' }));
    }
  };

  const handleEasyBankDataChange = (index, field, value) => {
    updateRequestBuilder((prev) => {
      const payments = Array.isArray(prev.payments) ? prev.payments.slice() : [];
      if (!payments[index]) return prev;
      const existing = payments[index];
      if (existing.type !== 'EASY_BANK_CARD') return prev;
      const baseData =
        existing && typeof existing.data === 'object' && existing.data !== null
          ? { ...existing.data }
          : { rrn: '', approvalCode: '', terminalId: '' };
      baseData[field] = value;
      payments[index] = { ...existing, data: baseData };
      return { ...prev, payments };
    });
  };

  const toggleReceiptType = (code) => {
    if (!receiptTypesEnabled) return;
    resetTestState();
    setFormState((prev) => {
      const allowMultiple = prev.allowMultipleReceiptTypes !== false;
      let current = Array.isArray(prev.receiptTypes) ? prev.receiptTypes.slice() : [];
      const index = current.indexOf(code);
      if (allowMultiple) {
        if (index >= 0) {
          current.splice(index, 1);
        } else {
          current.push(code);
        }
      } else {
        current = index >= 0 ? [] : [code];
      }
      const nextValues = sanitizeCodeList(current, DEFAULT_RECEIPT_TYPES, VALID_RECEIPT_TYPES);
      return { ...prev, receiptTypes: nextValues };
    });
  };

  const handleUsageChange = (value) => {
    const normalized = VALID_USAGE_VALUES.has(value) ? value : 'transaction';
    const nextType = normalized === 'info'
      ? 'LOOKUP'
      : normalized === 'admin'
        ? 'ADMIN'
        : normalized === 'auth'
          ? 'AUTH'
          : TRANSACTION_POSAPI_TYPES.has(formState.posApiType)
            ? formState.posApiType
            : '';
    const isTransactionType = normalized === 'transaction';
    setFormState((prev) => ({
      ...prev,
      usage: normalized,
      posApiType: nextType,
      supportsItems: isTransactionType ? prev.supportsItems !== false : false,
      supportsMultiplePayments: isTransactionType ? prev.supportsMultiplePayments : false,
      supportsMultipleReceipts: isTransactionType ? prev.supportsMultipleReceipts : false,
      enableReceiptTypes: isTransactionType ? prev.enableReceiptTypes : false,
      enableReceiptTaxTypes: isTransactionType ? prev.enableReceiptTaxTypes : false,
      enablePaymentMethods: isTransactionType ? prev.enablePaymentMethods : false,
      enableReceiptItems: isTransactionType ? prev.enableReceiptItems : false,
    }));
    if (!isTransactionType) {
      setRequestBuilder(null);
      setRequestBuilderError('');
    }
  };

  const handleTypeChange = (type) => {
    const nextUsage = 'transaction';
    const isTransactionType = true;
    setFormState((prev) => ({
      ...prev,
      posApiType: type,
      usage: nextUsage,
      supportsItems: prev.supportsItems,
      supportsMultiplePayments: prev.supportsMultiplePayments,
      supportsMultipleReceipts: prev.supportsMultipleReceipts,
      enableReceiptTypes: prev.enableReceiptTypes,
      enableReceiptTaxTypes: prev.enableReceiptTaxTypes,
      enablePaymentMethods: prev.enablePaymentMethods,
      enableReceiptItems: prev.enableReceiptItems,
      allowMultiplePaymentMethods: prev.allowMultiplePaymentMethods,
      allowMultipleReceiptTypes: prev.allowMultipleReceiptTypes,
      allowMultipleReceiptTaxTypes: prev.allowMultipleReceiptTaxTypes,
      allowMultipleReceiptItems: prev.allowMultipleReceiptItems,
      requestSchemaText: prev.requestSchemaText,
      requestFieldsText: prev.requestFieldsText,
    }));
    if (!type) return;
    updateRequestBuilder((prev) => normaliseBuilderForType(prev, type, supportsItems, supportsMultiplePayments));
  };

  const handleResetRequestSchema = () => {
    builderSyncRef.current = true;
    setRequestBuilder(null);
    setRequestBuilderError('');
    setFormState((prev) => ({ ...prev, requestSchemaText: '{}' }));
  };

  const handleBuilderFieldChange = (field, value) => {
    updateRequestBuilder((prev) => ({ ...prev, [field]: value }));
  };

  const handleReceiptChange = (index, field, value) => {
    let nextValue = value;
      if (field === 'taxType') {
        const allowedValues = allowedTaxTypes.map((option) => option.value);
      if (allowedValues.length > 0 && !allowedValues.includes(nextValue)) {
        [nextValue] = allowedValues;
      }
    }
    updateRequestBuilder((prev) => {
      const receipts = Array.isArray(prev.receipts) ? prev.receipts.slice() : [];
      if (!receipts[index]) return prev;
      const existing = receipts[index];
      const updated =
        field === 'taxType'
          ? normalizeReceiptByTaxType(existing, nextValue)
          : { ...existing, [field]: nextValue };
      receipts[index] = updated;
      return { ...prev, receipts };
    });
  };

  const addReceiptGroup = () => {
    const defaultType = allowedTaxTypes[0]?.value || 'VAT_ABLE';
    updateRequestBuilder((prev) => ({
      ...prev,
      receipts: [
        ...(Array.isArray(prev.receipts) ? prev.receipts : []),
        createReceiptGroup(defaultType, supportsItems),
      ],
    }));
  };

  const removeReceiptGroup = (index) => {
    updateRequestBuilder((prev) => {
      const receipts = Array.isArray(prev.receipts) ? prev.receipts.slice() : [];
      receipts.splice(index, 1);
      return { ...prev, receipts };
    });
  };

  const handleReceiptItemChange = (receiptIndex, itemIndex, field, value) => {
    if (!supportsItems) return;
    updateRequestBuilder((prev) => {
      const receipts = Array.isArray(prev.receipts) ? prev.receipts.slice() : [];
      const receipt = receipts[receiptIndex];
      if (!receipt) return prev;
      const items = Array.isArray(receipt.items) ? receipt.items.slice() : [];
      if (!items[itemIndex]) return prev;
      items[itemIndex] = { ...items[itemIndex], [field]: value };
      receipts[receiptIndex] = { ...receipt, items };
      return { ...prev, receipts };
    });
  };

  const addReceiptItem = (receiptIndex) => {
    if (!supportsItems) return;
    updateRequestBuilder((prev) => {
      const receipts = Array.isArray(prev.receipts) ? prev.receipts.slice() : [];
      const receipt = receipts[receiptIndex];
      if (!receipt) return prev;
      const items = Array.isArray(receipt.items) ? receipt.items.slice() : [];
      items.push(createReceiptItem(receipt.taxType || 'VAT_ABLE'));
      receipts[receiptIndex] = { ...receipt, items };
      return { ...prev, receipts };
    });
  };

  const removeReceiptItem = (receiptIndex, itemIndex) => {
    if (!supportsItems) return;
    updateRequestBuilder((prev) => {
      const receipts = Array.isArray(prev.receipts) ? prev.receipts.slice() : [];
      const receipt = receipts[receiptIndex];
      if (!receipt) return prev;
      const items = Array.isArray(receipt.items) ? receipt.items.slice() : [];
      items.splice(itemIndex, 1);
      receipts[receiptIndex] = { ...receipt, items };
      return { ...prev, receipts };
    });
  };

  const handleRequestVariationToggle = (key, enabled) => {
    const example = exampleVariationChoices.find((entry) => entry.key === key);
    if (!example) return;
    const examplePaths = enabled ? extractExampleFieldPaths(example.example) : [];
    setFormState((prev) => {
      const current = Array.isArray(prev.requestFieldVariations)
        ? prev.requestFieldVariations
        : [];
      const existing = current.find((entry) => entry.key === key);
      const nextRequired = existing?.requiredFields ? { ...existing.requiredFields } : {};
      if (enabled && !existing?.enabled) {
        examplePaths.forEach((path) => {
          if (path) nextRequired[path] = true;
        });
      }
      const updatedEntry = {
        key,
        label: existing?.label || example.label,
        enabled,
        requiredFields: nextRequired,
        defaultValues: existing?.defaultValues ? { ...existing.defaultValues } : {},
      };
      const others = current.filter((entry) => entry.key !== key);
      return { ...prev, requestFieldVariations: [...others, updatedEntry] };
    });
  };

  const handleRequestVariationLabelChange = (key, label) => {
    setFormState((prev) => {
      const current = Array.isArray(prev.requestFieldVariations)
        ? prev.requestFieldVariations
        : [];
      const existing = current.find((entry) => entry.key === key);
      const updatedEntry = existing
        ? { ...existing, label }
        : { key, label, enabled: true, requiredFields: {}, defaultValues: {} };
      const others = current.filter((entry) => entry.key !== key);
      return { ...prev, requestFieldVariations: [...others, updatedEntry] };
    });
  };

  const toggleCombinationModifier = (key) => {
    setCombinationModifierKeys((prev) => {
      if (prev.includes(key)) return prev.filter((item) => item !== key);
      return [...prev, key];
    });
  };

  const handleVariationRequiredToggle = (key, fieldPath, value) => {
    setFormState((prev) => {
      const current = Array.isArray(prev.requestFieldVariations)
        ? prev.requestFieldVariations
        : [];
      const updated = current.map((entry) => {
        if (entry.key !== key) return entry;
        const requiredFields = { ...(entry.requiredFields || {}) };
        if (value) {
          requiredFields[fieldPath] = true;
        } else {
          delete requiredFields[fieldPath];
        }
        return { ...entry, requiredFields };
      });
      return { ...prev, requestFieldVariations: updated };
    });
  };

  const handleVariationDefaultChange = (key, fieldPath, value) => {
    setFormState((prev) => {
      const current = Array.isArray(prev.requestFieldVariations)
        ? prev.requestFieldVariations
        : [];
      const updated = current.map((entry) => {
        if (entry.key !== key) return entry;
        const defaultValues = { ...(entry.defaultValues || {}) };
        if (value !== '' && value !== undefined && value !== null) {
          defaultValues[fieldPath] = value;
        } else {
          delete defaultValues[fieldPath];
        }
        return { ...entry, defaultValues };
      });
      return { ...prev, requestFieldVariations: updated };
    });
  };

  function ensureVariationFieldSelection(variationKey, fieldPath) {
    if (!variationKey || !fieldPath) return;

    setFormState((prev) => {
      let changed = false;
      const variations = Array.isArray(prev.variations) ? prev.variations.slice() : [];
      const variationIndex = variations.findIndex((entry) => (entry.key || entry.name) === variationKey);

      if (variationIndex >= 0) {
        const variation = variations[variationIndex];
        const requiredFields = variation.requiredFields ? { ...variation.requiredFields } : {};
        if (!requiredFields[fieldPath]) {
          requiredFields[fieldPath] = true;
          variations[variationIndex] = { ...variation, requiredFields };
          changed = true;
        }
      }

      const requestFieldVariations = Array.isArray(prev.requestFieldVariations)
        ? prev.requestFieldVariations.slice()
        : [];
      const variationMetaIndex = requestFieldVariations.findIndex((entry) => entry.key === variationKey);
      if (variationMetaIndex >= 0) {
        const meta = requestFieldVariations[variationMetaIndex];
        const requiredFields = meta.requiredFields ? { ...meta.requiredFields } : {};
        if (!requiredFields[fieldPath]) {
          requiredFields[fieldPath] = true;
          requestFieldVariations[variationMetaIndex] = { ...meta, requiredFields };
          changed = true;
        }
      }

      if (!changed) return prev;
      return { ...prev, variations, requestFieldVariations };
    });
  }

  const syncVariationDefaultChange = (variationKey, fieldPath, value) => {
    if (!variationKey || !fieldPath) return;
    const segments = parsePathSegments(fieldPath);
    if (segments.length === 0) return;

    setFormState((prev) => {
      let changed = false;
      const variations = Array.isArray(prev.variations) ? prev.variations.slice() : [];
      const variationIndex = variations.findIndex(
        (entry) => (entry.key || entry.name) === variationKey,
      );

      if (variationIndex >= 0) {
        const variation = variations[variationIndex];
        const defaultValues = variation.defaultValues ? { ...variation.defaultValues } : {};
        const examplePayload = cleanSampleText(
          variation.requestExampleText || variation.requestExample || {},
        );
        const beforeState = JSON.stringify(examplePayload);
        const beforeDefaults = JSON.stringify(defaultValues);
        if (value !== '' && value !== undefined && value !== null) {
          setNestedValue(examplePayload, segments, value);
          defaultValues[fieldPath] = value;
        } else {
          removeNestedValue(examplePayload, segments);
          delete defaultValues[fieldPath];
        }
        const afterState = JSON.stringify(examplePayload);
        const afterDefaults = JSON.stringify(defaultValues);
        if (beforeState !== afterState || beforeDefaults !== afterDefaults) {
          variations[variationIndex] = {
            ...variation,
            defaultValues,
            requestExample: examplePayload,
            requestExampleText: JSON.stringify(examplePayload, null, 2),
          };
          changed = true;
        }
      }

      const requestFieldVariations = Array.isArray(prev.requestFieldVariations)
        ? prev.requestFieldVariations.slice()
        : [];
      const variationMetaIndex = requestFieldVariations.findIndex((entry) => entry.key === variationKey);
      if (variationMetaIndex >= 0) {
        const meta = requestFieldVariations[variationMetaIndex];
        const defaultValues = { ...(meta.defaultValues || {}) };
        const requiredFields = { ...(meta.requiredFields || {}) };
        const defaultExists = Object.prototype.hasOwnProperty.call(defaultValues, fieldPath);
        const requiredExists = Object.prototype.hasOwnProperty.call(requiredFields, fieldPath);

        if (value !== '' && value !== undefined && value !== null) {
          defaultValues[fieldPath] = value;
        } else {
          delete defaultValues[fieldPath];
        }
        if (requiredExists && !value) {
          delete requiredFields[fieldPath];
        }

        if (
          defaultExists !== Object.prototype.hasOwnProperty.call(defaultValues, fieldPath)
          || requiredExists !== Object.prototype.hasOwnProperty.call(requiredFields, fieldPath)
          || (value && defaultValues[fieldPath] !== meta.defaultValues?.[fieldPath])
        ) {
          requestFieldVariations[variationMetaIndex] = {
            ...meta,
            defaultValues,
            requiredFields,
          };
          changed = true;
        }
      }

      if (!changed) return prev;
      return { ...prev, variations, requestFieldVariations };
    });
  };

  const clearVariationFieldSelection = (variationKey, fieldPath) => {
    if (!variationKey || !fieldPath) return;

    setRequestFieldMeta((prev) => {
      const existing = prev[fieldPath];
      if (!existing) return prev;
      const requiredByVariation = { ...(existing.requiredByVariation || {}) };
      const defaultByVariation = { ...(existing.defaultByVariation || {}) };
      let changed = false;

      if (requiredByVariation[variationKey]) {
        delete requiredByVariation[variationKey];
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(defaultByVariation, variationKey)) {
        delete defaultByVariation[variationKey];
        changed = true;
      }

      if (!changed) return prev;
      return { ...prev, [fieldPath]: { ...existing, requiredByVariation, defaultByVariation } };
    });

    setFormState((prev) => {
      let changed = false;
      const variations = Array.isArray(prev.variations) ? prev.variations.slice() : [];
      const variationIndex = variations.findIndex(
        (entry) => (entry.key || entry.name) === variationKey,
      );

      if (variationIndex >= 0) {
        const variation = variations[variationIndex];
        const requiredFields = variation.requiredFields ? { ...variation.requiredFields } : {};
        const defaultValues = variation.defaultValues ? { ...variation.defaultValues } : {};
        const examplePayload = cleanSampleText(
          variation.requestExampleText || variation.requestExample || {},
        );
        const beforeExample = JSON.stringify(examplePayload);
        const beforeDefaults = JSON.stringify(defaultValues);
        const beforeRequired = JSON.stringify(requiredFields);

        delete requiredFields[fieldPath];
        delete defaultValues[fieldPath];
        removeNestedValue(examplePayload, parsePathSegments(fieldPath));

        const afterExample = JSON.stringify(examplePayload);
        const variationChanged =
          beforeExample !== afterExample
          || beforeDefaults !== JSON.stringify(defaultValues)
          || beforeRequired !== JSON.stringify(requiredFields);

        if (variationChanged) {
          variations[variationIndex] = {
            ...variation,
            requiredFields,
            defaultValues,
            requestExample: examplePayload,
            requestExampleText: JSON.stringify(examplePayload, null, 2),
          };
          changed = true;
        }
      }

      const requestFieldVariations = Array.isArray(prev.requestFieldVariations)
        ? prev.requestFieldVariations.slice()
        : [];
      const variationMetaIndex = requestFieldVariations.findIndex((entry) => entry.key === variationKey);
      if (variationMetaIndex >= 0) {
        const meta = requestFieldVariations[variationMetaIndex];
        const defaultValues = { ...(meta.defaultValues || {}) };
        const requiredFields = { ...(meta.requiredFields || {}) };
        const defaultHad = Object.prototype.hasOwnProperty.call(defaultValues, fieldPath);
        const requiredHad = Object.prototype.hasOwnProperty.call(requiredFields, fieldPath);

        delete defaultValues[fieldPath];
        delete requiredFields[fieldPath];

        if (defaultHad || requiredHad) {
          requestFieldVariations[variationMetaIndex] = {
            ...meta,
            defaultValues,
            requiredFields,
          };
          changed = true;
        }
      }

      if (!changed) return prev;
      return { ...prev, variations, requestFieldVariations };
    });
  };

  const handleVariationToggle = (index, enabled) => {
    setFormState((prev) => {
      const list = Array.isArray(prev.variations) ? prev.variations.slice() : [];
      if (!list[index]) return prev;
      list[index] = { ...list[index], enabled };
      return { ...prev, variations: list };
    });
  };

  const handleVariationChange = (index, key, value) => {
    setFormState((prev) => {
      const list = Array.isArray(prev.variations) ? prev.variations.slice() : [];
      if (!list[index]) return prev;
      list[index] = { ...list[index], [key]: value };
      return { ...prev, variations: list };
    });
  };

  const handleVariationExampleChange = (index, text) => {
    handleVariationChange(index, 'requestExampleText', text);
  };

  const handleVariationRequestFieldChange = (variationIndex, fieldIndex, updates) => {
    setFormState((prev) => {
      const list = Array.isArray(prev.variations) ? prev.variations.slice() : [];
      const variation = list[variationIndex];
      if (!variation) return prev;
      const fields = Array.isArray(variation.requestFields) ? variation.requestFields.slice() : [];
      if (!fields[fieldIndex]) return prev;
      fields[fieldIndex] = { ...fields[fieldIndex], ...updates };
      list[variationIndex] = { ...variation, requestFields: fields };
      return { ...prev, variations: list };
    });
  };

  const handleAddVariationField = (variationIndex) => {
    setFormState((prev) => {
      const list = Array.isArray(prev.variations) ? prev.variations.slice() : [];
      const variation = list[variationIndex];
      if (!variation) return prev;
      const fields = Array.isArray(variation.requestFields) ? variation.requestFields.slice() : [];
      fields.push({ field: '', required: true });
      list[variationIndex] = { ...variation, requestFields: fields };
      return { ...prev, variations: list };
    });
  };

  const handleRemoveVariationField = (variationIndex, fieldIndex) => {
    let removedFieldPath = '';
    let variationKey = '';
    setFormState((prev) => {
      const list = Array.isArray(prev.variations) ? prev.variations.slice() : [];
      const variation = list[variationIndex];
      if (!variation) return prev;
      variationKey = variation.key || variation.name;
      const fields = Array.isArray(variation.requestFields) ? variation.requestFields.slice() : [];
      if (fieldIndex < 0 || fieldIndex >= fields.length) return prev;
      removedFieldPath = normalizeHintEntry(fields[fieldIndex]).field || '';
      fields.splice(fieldIndex, 1);
      list[variationIndex] = { ...variation, requestFields: fields };
      return { ...prev, variations: list };
    });

    if (removedFieldPath && variationKey) {
      clearVariationFieldSelection(variationKey, removedFieldPath);
    }
  };

  const handleAddVariation = () => {
    setFormState((prev) => {
      const list = Array.isArray(prev.variations) ? prev.variations.slice() : [];
      list.push({
        key: `variation-${list.length + 1}`,
        name: `Variation ${list.length + 1}`,
        description: '',
        enabled: true,
        requestExampleText: '{}',
        requestFields: [],
      });
      return { ...prev, variations: list };
    });
  };

  const handlePaymentChange = (index, field, value) => {
    let finalType = null;
    let cardDraftText = '';
    updateRequestBuilder((prev) => {
      const payments = Array.isArray(prev.payments) ? prev.payments.slice() : [];
      if (!payments[index]) return prev;
      const existing = payments[index];
      const updated = { ...existing };
      if (field === 'type') {
        let nextValue = value;
        const allowedValues = allowedPaymentTypes.map((option) => option.value);
        if (allowedValues.length > 0 && !allowedValues.includes(nextValue)) {
          [nextValue] = allowedValues;
        }
        updated.type = nextValue;
        if (nextValue === 'PAYMENT_CARD') {
          const baseData =
            existing && typeof existing.data === 'object' && existing.data !== null
              ? existing.data
              : {};
          updated.data = baseData;
          cardDraftText = JSON.stringify(baseData, null, 2);
        } else if (nextValue === 'EASY_BANK_CARD') {
          const baseData =
            existing && typeof existing.data === 'object' && existing.data !== null
              ? existing.data
              : {};
          updated.data = {
            rrn: baseData.rrn || '',
            approvalCode: baseData.approvalCode || '',
            terminalId: baseData.terminalId || '',
          };
        } else {
          delete updated.data;
        }
      } else {
        updated[field] = value;
      }
      payments[index] = updated;
      finalType = updated.type;
      if (!cardDraftText && finalType === 'PAYMENT_CARD') {
        cardDraftText = JSON.stringify(updated.data ?? {}, null, 2);
      }
      return { ...prev, payments };
    });
    if (field === 'type') {
      const key = String(index);
      if (finalType === 'PAYMENT_CARD') {
        setPaymentDataDrafts((prev) => ({ ...prev, [key]: cardDraftText || prev[key] || '{}'}));
      } else {
        setPaymentDataDrafts((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
      setPaymentDataErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const addPayment = () => {
    const defaultPayment = allowedPaymentTypes[0]?.value || 'CASH';
    updateRequestBuilder((prev) => ({
      ...prev,
      payments: [
        ...(Array.isArray(prev.payments) ? prev.payments : []),
        {
          type: defaultPayment,
          amount: 0,
          ...(defaultPayment === 'PAYMENT_CARD'
            ? { data: {} }
            : defaultPayment === 'EASY_BANK_CARD'
              ? { data: { rrn: '', approvalCode: '', terminalId: '' } }
              : {}),
        },
      ],
    }));
  };

  const removePayment = (index) => {
    updateRequestBuilder((prev) => {
      const payments = Array.isArray(prev.payments) ? prev.payments.slice() : [];
      payments.splice(index, 1);
      return { ...prev, payments };
    });
    const reindex = (source) => {
      const next = {};
      Object.entries(source).forEach(([key, value]) => {
        const currentIndex = Number(key);
        if (Number.isNaN(currentIndex)) return;
        if (currentIndex === index) return;
        const newIndex = currentIndex > index ? currentIndex - 1 : currentIndex;
        next[String(newIndex)] = value;
      });
      return next;
    };
    setPaymentDataDrafts((prev) => reindex(prev));
    setPaymentDataErrors((prev) => reindex(prev));
  };

  const parseTaxTypeListInput = (value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      return { hasInput: false, values: [], invalid: [] };
    }
    const tokens = value
      .split(/[\s,]+/)
      .map((token) => token.trim().toUpperCase())
      .filter(Boolean);
    const normalized = sanitizeCodeList(tokens, [], VALID_TAX_TYPES);
    const invalid = tokens.filter((token) => !VALID_TAX_TYPES.has(token));
    return { hasInput: tokens.length > 0, values: normalized, invalid };
  };

  const applyTaxTypeListText = () => {
    if (!receiptTaxTypesEnabled) return;
    const { hasInput, values, invalid } = parseTaxTypeListInput(taxTypeListText);
    if (hasInput && values.length === 0) {
      setTaxTypeListError('Enter VAT_ABLE, VAT_FREE, VAT_ZERO or NO_VAT values separated by commas or new lines.');
      return;
    }
    if (invalid.length > 0) {
      setTaxTypeListError(`Ignored invalid codes: ${invalid.join(', ')}`);
    } else {
      setTaxTypeListError('');
    }
    resetTestState();
    taxTypeInputDirtyRef.current = false;
    const nextText = values.length > 0 ? values.join(', ') : '';
    setTaxTypeListText(nextText);
    setFormState((prev) => ({ ...prev, taxTypes: values }));
  };

  const handleTaxTypeListChange = (value) => {
    if (!receiptTaxTypesEnabled) return;
    taxTypeInputDirtyRef.current = true;
    setTaxTypeListText(value);
    if (taxTypeListError) {
      setTaxTypeListError('');
    }
  };

  const handleTaxTypeListFocus = () => {
    if (!receiptTaxTypesEnabled) return;
    taxTypeInputDirtyRef.current = true;
  };

  const handleTaxTypeListBlur = () => {
    if (!receiptTaxTypesEnabled) return;
    applyTaxTypeListText();
  };

  const handleTaxTypeListApplyClick = () => {
    if (!receiptTaxTypesEnabled) return;
    applyTaxTypeListText();
  };

  const toggleTaxType = (code) => {
    if (!receiptTaxTypesEnabled) return;
    resetTestState();
    setFormState((prev) => {
      const allowMultiple = prev.allowMultipleReceiptTaxTypes !== false;
      let current = Array.isArray(prev.taxTypes) ? prev.taxTypes.slice() : [];
      const index = current.indexOf(code);
      if (allowMultiple) {
        if (index >= 0) {
          current.splice(index, 1);
        } else {
          current.push(code);
        }
      } else {
        current = index >= 0 ? [] : [code];
      }
      const nextValues = sanitizeCodeList(current, DEFAULT_TAX_TYPES, VALID_TAX_TYPES);
      return { ...prev, taxTypes: nextValues };
    });
    taxTypeInputDirtyRef.current = false;
    setTaxTypeListError('');
  };

  const togglePaymentMethod = (code) => {
    if (!paymentMethodsEnabled) return;
    resetTestState();
    setFormState((prev) => {
      const allowMultiple = prev.allowMultiplePaymentMethods !== false;
      let current = Array.isArray(prev.paymentMethods) ? prev.paymentMethods.slice() : [];
      const index = current.indexOf(code);
      if (allowMultiple) {
        if (index >= 0) {
          current.splice(index, 1);
        } else {
          current.push(code);
        }
      } else {
        current = index >= 0 ? [] : [code];
      }
      const nextValues = sanitizeCodeList(current, DEFAULT_PAYMENT_METHODS, VALID_PAYMENT_METHODS);
      return { ...prev, paymentMethods: nextValues };
    });
  };

  const handleTemplateTextChange = (field, code, text) => {
    if (!code) return;
    setFormState((prev) => {
      const current = prev[field] && typeof prev[field] === 'object' ? { ...prev[field] } : {};
      const value = typeof text === 'string' ? text : '';
      if (!value.trim()) {
        delete current[code];
      } else {
        current[code] = value;
      }
      return { ...prev, [field]: current };
    });
  };

  const handleReceiptItemTemplateChange = (index, value) => {
    setFormState((prev) => {
      const list = Array.isArray(prev.receiptItemTemplates) ? prev.receiptItemTemplates.slice() : [];
      list[index] = value;
      return { ...prev, receiptItemTemplates: list };
    });
  };

  const addReceiptItemTemplate = () => {
    if (!receiptItemsEnabled) return;
    setFormState((prev) => {
      const allowMultiple = prev.allowMultipleReceiptItems !== false;
      const list = Array.isArray(prev.receiptItemTemplates) ? prev.receiptItemTemplates.slice() : [];
      if (!allowMultiple && list.length >= 1) {
        return prev;
      }
      list.push('');
      return { ...prev, receiptItemTemplates: list };
    });
  };

  const removeReceiptItemTemplate = (index) => {
    setFormState((prev) => {
      const list = Array.isArray(prev.receiptItemTemplates) ? prev.receiptItemTemplates.slice() : [];
      if (list.length <= 1) return prev;
      list.splice(index, 1);
      return { ...prev, receiptItemTemplates: list };
    });
  };

  useEffect(() => {
    if (!isTransactionUsage) return;
    updateRequestBuilder((prev) => {
      if (!prev || typeof prev !== 'object') return prev;
      const receipts = Array.isArray(prev.receipts) ? prev.receipts.slice() : [];
      if (receipts.length === 0) return prev;
      let changed = false;
      const shouldIncludeItems = supportsItems && receiptItemsEnabled;
      const nextReceipts = receipts.map((receipt) => {
        if (!shouldIncludeItems) {
          if (receipt && Object.prototype.hasOwnProperty.call(receipt, 'items')) {
            const clone = { ...receipt };
            delete clone.items;
            changed = true;
            return clone;
          }
          return receipt;
        }
        const items = Array.isArray(receipt.items) && receipt.items.length > 0
          ? receipt.items
          : [createReceiptItem(receipt.taxType || 'VAT_ABLE')];
        if (!Array.isArray(receipt.items) || receipt.items.length === 0) {
          changed = true;
          return { ...receipt, items };
        }
        return receipt;
      });
      if (!changed) return prev;
      return { ...prev, receipts: nextReceipts };
    });
  }, [isTransactionUsage, receiptItemsEnabled, supportsItems]);

  useEffect(() => {
    if (!receiptTaxTypesEnabled) return;
    if (allowedTaxTypes.length === 0) return;
    const allowedValues = allowedTaxTypes.map((option) => option.value);
    updateRequestBuilder((prev) => {
      const receipts = Array.isArray(prev.receipts) ? prev.receipts.slice() : [];
      if (receipts.length === 0) return prev;
      let changed = false;
      const nextReceipts = receipts.map((receipt) => {
        if (allowedValues.includes(receipt.taxType)) {
          return receipt;
        }
        changed = true;
        return normalizeReceiptByTaxType(receipt, allowedValues[0]);
      });
      if (!changed) return prev;
      return { ...prev, receipts: nextReceipts };
    });
  }, [allowedTaxTypes, receiptTaxTypesEnabled]);

  useEffect(() => {
    if (!paymentMethodsEnabled) return;
    if (allowedPaymentTypes.length === 0) return;
    const allowedValues = allowedPaymentTypes.map((option) => option.value);
    updateRequestBuilder((prev) => {
      const payments = Array.isArray(prev.payments) ? prev.payments.slice() : [];
      if (payments.length === 0) return prev;
      let changed = false;
      const nextPayments = payments.map((payment) => {
        if (allowedValues.includes(payment.type)) {
          return payment;
        }
        changed = true;
        return { ...payment, type: allowedValues[0] };
      });
      if (!changed) return prev;
      return { ...prev, payments: nextPayments };
    });
  }, [allowedPaymentTypes, paymentMethodsEnabled]);

  const handleStockItemChange = (index, field, value) => {
    updateRequestBuilder((prev) => {
      const stockCodes = Array.isArray(prev.stockCodes) ? prev.stockCodes.slice() : [];
      if (!stockCodes[index]) return prev;
      stockCodes[index] = { ...stockCodes[index], [field]: value };
      return { ...prev, stockCodes };
    });
  };

  const addStockItem = () => {
    updateRequestBuilder((prev) => ({
      ...prev,
      stockCodes: [...(Array.isArray(prev.stockCodes) ? prev.stockCodes : []), createStockItem()],
    }));
  };

  const removeStockItem = (index) => {
    updateRequestBuilder((prev) => {
      const stockCodes = Array.isArray(prev.stockCodes) ? prev.stockCodes.slice() : [];
      stockCodes.splice(index, 1);
      return { ...prev, stockCodes };
    });
  };

  const paymentsTotal = useMemo(() => {
    if (!Array.isArray(requestBuilder?.payments)) return 0;
    return requestBuilder.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }, [requestBuilder]);

  const paymentsBalanced = useMemo(() => {
    if (!supportsMultiplePayments) return true;
    const totalAmount = Number(requestBuilder?.totalAmount || 0);
    return Math.abs(paymentsTotal - totalAmount) < 0.01;
  }, [paymentsTotal, requestBuilder, supportsMultiplePayments]);

  const isReceiptType = formState.posApiType && formState.posApiType !== 'STOCK_QR';
  const isStockType = formState.posApiType === 'STOCK_QR';
  const receiptBuilderEnabled = isReceiptType && supportsItems;
  const paymentBuilderEnabled = isReceiptType && supportsMultiplePayments;

  useEffect(() => {
    if (!formState.posApiType) return;
    setRequestBuilder((prev) => {
      if (!prev || prev.type === formState.posApiType) {
        return prev;
      }
      const next = normaliseBuilderForType(
        prev,
        formState.posApiType,
        supportsItems,
        supportsMultiplePayments,
      );
      builderSyncRef.current = true;
      setFormState((prevState) => ({
        ...prevState,
        requestSchemaText: JSON.stringify(next, null, 2),
      }));
      return next;
    });
  }, [formState.posApiType, supportsItems, supportsMultiplePayments]);

  useEffect(() => {
    if (!formState.authEndpointId && authEndpointOptions.length > 0) {
      setFormState((prev) => ({ ...prev, authEndpointId: prev.authEndpointId || authEndpointOptions[0].id }));
    }
    if (importAuthSelectionDirtyRef.current) return;
    const isAuthDraft = activeImportDraft?.posApiType === 'AUTH' || formState.posApiType === 'AUTH';
    if (isAuthDraft) {
      if (importAuthEndpointId !== '') {
        setImportAuthEndpointId('');
      }
      return;
    }
    if (!importAuthEndpointId && authEndpointOptions.length > 0) {
      setImportAuthEndpointId(authEndpointOptions[0].id || '');
    }
  }, [
    activeImportDraft?.posApiType,
    authEndpointOptions,
    formState.authEndpointId,
    formState.posApiType,
    importAuthEndpointId,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function preloadInfoSync() {
      try {
        setInfoSyncLoading(true);
        const [settingsRes, tablesRes] = await Promise.all([
          fetch(`${API_BASE}/posapi/reference-codes`, {
            credentials: 'include',
            skipLoader: true,
            signal: controller.signal,
          }),
          fetch(`${API_BASE}/report_builder/tables`, {
            credentials: 'include',
            skipLoader: true,
            signal: controller.signal,
          }),
        ]);
        if (!settingsRes.ok || !tablesRes.ok) {
          const detail = !settingsRes.ok ? settingsRes : tablesRes;
          let reason = 'Failed to preload POSAPI information sync settings.';
          if (detail.status === 401 || detail.status === 403) {
            reason = 'You do not have permission to view POSAPI information sync settings.';
          }
          try {
            const body = await detail.json();
            const message = body?.message || body?.error || '';
            if (message) reason += ` Details: ${message}`;
          } catch {}
          setInfoSyncError(reason);
          return;
        }
        const [settingsData, tableData] = await Promise.all([settingsRes.json(), tablesRes.json()]);
        if (cancelled) return;
        const tableOptions = buildTableOptions(Array.isArray(tableData.tables) ? tableData.tables : []);
        setInfoSyncTableOptionsBase(tableOptions);
        const usage = settingsData.settings?.usage && VALID_USAGE_VALUES.has(settingsData.settings.usage)
          ? settingsData.settings.usage
          : 'all';
        const endpointIds = Array.isArray(settingsData.settings?.endpointIds)
          ? settingsData.settings.endpointIds.filter((value) => typeof value === 'string' && value)
          : [];
        const tables = sanitizeTableSelection(
          settingsData.settings?.tables,
          tableOptions.length > 0 ? tableOptions : DEFAULT_INFO_TABLE_OPTIONS,
        );
        setInfoSyncSettings((prev) => ({
          ...prev,
          autoSyncEnabled: Boolean(settingsData.settings?.autoSyncEnabled),
          intervalMinutes: Number(settingsData.settings?.intervalMinutes) || 720,
          usage,
          endpointIds,
          tables,
        }));
        setInfoSyncUsage(usage);
        setInfoSyncEndpointIds(endpointIds);
        setInfoSyncLogs(Array.isArray(settingsData.logs) ? settingsData.logs : []);
        infoSyncPreloadedRef.current = true;
      } catch (err) {
        if (!cancelled) {
          setInfoSyncError(err?.message || 'Unable to preload POSAPI information sync settings');
          console.warn('Unable to preload POSAPI information sync settings', err);
        }
      } finally {
        if (!cancelled) setInfoSyncLoading(false);
      }
    }

    if (!infoSyncPreloadedRef.current) {
      preloadInfoSync();
    }

    async function fetchEndpoints() {
      try {
        setLoading(true);
        setLoadError('');
        setError('');
        const res = await fetch(`${API_BASE}/posapi/endpoints`, {
          credentials: 'include',
          signal: controller.signal,
          skipLoader: true,
        });
        if (!res.ok) {
          let details = '';
          try {
            const body = await res.json();
            details = body?.message || body?.error || '';
          } catch {}
          const prefix = res.status === 401 || res.status === 403
            ? 'You do not have permission to view POSAPI endpoints.'
            : 'Failed to load POSAPI endpoints.';
          const message = details ? `${prefix} Details: ${details}` : prefix;
          throw new Error(message);
        }
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const normalized = normalizeEndpointList(list.map(withEndpointMetadata));
        setEndpoints(normalized);
        if (normalized.length > 0) {
          handleSelect(normalized[0].id, normalized[0]);
          setTestEnvironment('staging');
          setImportAuthEndpointId(normalized[0].authEndpointId || '');
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        setLoadError(err.message || 'Failed to load endpoints');
        setError(err.message || 'Failed to load endpoints');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchEndpoints();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!Array.isArray(endpoints) || endpoints.length === 0) return;
    const missing = endpoints.filter((endpoint) => {
      const selectionFor = (key) => ({
        literal: endpoint?.[key],
        envVar: endpoint?.[`${key}EnvVar`] || endpoint?.urlEnvMap?.[key],
        mode: endpoint?.[`${key}Mode`],
      });
      const selections = [
        selectionFor('testServerUrl'),
        selectionFor('productionServerUrl'),
        selectionFor('serverUrl'),
        selectionFor('testServerUrlProduction'),
      ];
      return !selections.some(hasUrlSelectionValue);
    });

    if (missing.length > 0) {
      const sample = missing[0].name || missing[0].id || 'endpoint';
      setStatus(
        `Warning: ${missing.length} endpoint(s) are missing a base URL or environment variable mapping (for example: ${sample}).`,
      );
    }
  }, [endpoints]);

  useEffect(() => {
    if (activeTab !== 'info') {
      refreshInfoSyncLogsRef.current = () => Promise.resolve();
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;
    let intervalId;

    async function refreshInfoSyncLogs() {
      try {
        const res = await fetch(`${API_BASE}/posapi/reference-codes`, {
          credentials: 'include',
          skipLoader: true,
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setInfoSyncLogs(Array.isArray(data.logs) ? data.logs : []);
        }
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return;
        setInfoSyncError(err?.message || 'Failed to refresh POSAPI information logs');
        console.warn('Failed to refresh POSAPI info sync logs', err);
      }
    }

    async function loadInfoSync() {
      try {
        setInfoSyncLoading(true);
        setInfoSyncError('');
        const [settingsRes, tablesRes] = await Promise.all([
          fetch(`${API_BASE}/posapi/reference-codes`, {
            credentials: 'include',
            skipLoader: true,
            signal: controller.signal,
          }),
          fetch(`${API_BASE}/report_builder/tables`, {
            credentials: 'include',
            skipLoader: true,
            signal: controller.signal,
          }),
        ]);
        if (!settingsRes.ok) {
          let details = '';
          try {
            const body = await settingsRes.json();
            details = body?.message || body?.error || '';
          } catch {}
          const prefix = settingsRes.status === 401 || settingsRes.status === 403
            ? 'You do not have permission to view POSAPI information settings.'
            : 'Failed to load POSAPI information settings.';
          const message = details ? `${prefix} Details: ${details}` : prefix;
          throw new Error(message);
        }
        if (!tablesRes.ok) {
          let details = '';
          try {
            const body = await tablesRes.json();
            details = body?.message || body?.error || '';
          } catch {}
          const prefix = tablesRes.status === 401 || tablesRes.status === 403
            ? 'You do not have permission to view database tables for POSAPI information sync.'
            : 'Failed to load database tables.';
          const message = details ? `${prefix} Details: ${details}` : prefix;
          throw new Error(message);
        }
        const [settingsData, tableData] = await Promise.all([settingsRes.json(), tablesRes.json()]);
        if (cancelled) return;
        const tableOptions = buildTableOptions(Array.isArray(tableData.tables) ? tableData.tables : []);
        setInfoSyncTableOptionsBase(tableOptions);
        const usage = settingsData.settings?.usage && VALID_USAGE_VALUES.has(settingsData.settings.usage)
          ? settingsData.settings.usage
          : 'all';
        const endpointIds = Array.isArray(settingsData.settings?.endpointIds)
          ? settingsData.settings.endpointIds.filter((value) => typeof value === 'string' && value)
          : [];
        const tables = sanitizeTableSelection(
          settingsData.settings?.tables,
          tableOptions.length > 0 ? tableOptions : DEFAULT_INFO_TABLE_OPTIONS,
        );
        setInfoSyncSettings({
          autoSyncEnabled: Boolean(settingsData.settings?.autoSyncEnabled),
          intervalMinutes: Number(settingsData.settings?.intervalMinutes) || 720,
          usage,
          endpointIds,
          tables,
        });
        setInfoSyncUsage(usage);
        setInfoSyncEndpointIds(endpointIds);
        setInfoSyncLogs(Array.isArray(settingsData.logs) ? settingsData.logs : []);
      } catch (err) {
        if (!cancelled) {
          setInfoSyncError(err.message || 'Unable to load POSAPI information sync settings');
        }
      } finally {
        if (!cancelled) {
          setInfoSyncLoading(false);
        }
      }
    }

    loadInfoSync();
    intervalId = window.setInterval(refreshInfoSyncLogs, 30000);
    return () => {
      cancelled = true;
      controller.abort();
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [activeTab]);

  function handleSelect(id, explicitDefinition = null) {
    const targetId = id || explicitDefinition?.id;
    if (!targetId && !explicitDefinition) {
      return;
    }

    const definition = explicitDefinition || endpoints.find((ep) => ep.id === targetId);
    if (!definition) {
      return;
    }

    let nextFormState = { ...EMPTY_ENDPOINT };
    let nextRequestFieldValues = {};
    let formattedSample = '';

    try {
      nextFormState = pruneUnavailableControls(createFormState(definition));
    } catch (err) {
      console.error('Failed to prepare form state for selected endpoint', err);
      setError('Failed to load the selected endpoint. Please review its configuration.');
      nextFormState = pruneUnavailableControls({ ...EMPTY_ENDPOINT, ...(definition || {}) });
    }

    try {
      const nextDisplay = buildRequestFieldDisplayFromState(nextFormState);
      if (nextDisplay.state === 'error') {
        setError(nextDisplay.error || 'Unable to load endpoint details.');
      }
      if (nextDisplay.state === 'ok') {
        nextRequestFieldValues = deriveRequestFieldSelections({
          requestSampleText: nextFormState.requestSampleText,
          requestEnvMap: nextFormState.requestEnvMap,
          displayItems: nextDisplay.items,
        });
      }
    } catch (err) {
      console.error('Failed to select endpoint', err);
      setError('Failed to load the selected endpoint. Please review its configuration.');
      nextFormState = pruneUnavailableControls({ ...EMPTY_ENDPOINT, ...(definition || {}) });
      nextRequestFieldValues = {};
    }

    try {
      const resolvedSample = sanitizeRequestExampleForSample(
        parseExamplePayload(nextFormState.requestSampleText),
      );
      formattedSample = Object.keys(resolvedSample).length > 0
        ? JSON.stringify(resolvedSample, null, 2)
        : (nextFormState.requestSampleText || '');
    } catch (err) {
      console.error('Failed to parse request sample for selected endpoint', err);
      setError('Unable to load the selected endpoint request sample.');
      formattedSample = nextFormState.requestSampleText || '';
    }
    setBaseRequestJson(formattedSample);
    setRequestSampleText(formattedSample);
    setCombinationBaseKey(BASE_COMBINATION_KEY);
    setCombinationModifierKeys([]);
    setCombinationPayloadText('');
    setCombinationError(selectedVariationKey ? '' : 'Select a base variation to build a combination.');
    setSelectedVariationKey('');

    setStatus('');
    resetTestState();
    setDocExamples([]);
    setSelectedDocBlock('');
    setDocMetadata({});
    setDocFieldDescriptions({});
    setImportStatus('');
    setImportError('');
    setImportDrafts([]);
    setImportTestRunning(false);
    setImportTestError('');
    setImportTestResult(null);
    setImportSelectedExampleKey('');
    setImportExampleResponse(null);
    setImportRequestBody('');
    setImportSpecText('');
    setImportBaseUrl('');
    setImportBaseUrlEnvVar('');
    setImportBaseUrlMode('literal');
    setSelectedImportId('');
    setRequestBuilder(null);
    setRequestBuilderError('');
    setRequestFieldValues(nextRequestFieldValues);
    setFormState(nextFormState);
    setTestEnvironment('staging');
    setImportAuthEndpointId(definition?.authEndpointId || '');
    setSelectedId(definition.id);
  }

  function handleChange(field, value) {
    setFormState((prev) => {
      if (field === 'usage') {
        handleUsageChange(value);
        return prev;
      }
      const next = { ...prev, [field]: value };
      if (field === 'supportsItems' && value === false) {
        next.supportsMultipleReceipts = false;
        next.enableReceiptItems = false;
      }
      if (field === 'supportsMultiplePayments' && value === false) {
        next.enablePaymentMethods = false;
        next.paymentMethods = [];
      }
      if (field === 'enableReceiptTypes' && value === true) {
        if (!Array.isArray(next.receiptTypes) || next.receiptTypes.length === 0) {
          next.receiptTypes = DEFAULT_RECEIPT_TYPES.slice(
            0,
            next.allowMultipleReceiptTypes === false ? 1 : DEFAULT_RECEIPT_TYPES.length,
          );
        }
      }
      if (field === 'enableReceiptTaxTypes' && value === true) {
        if (!Array.isArray(next.taxTypes) || next.taxTypes.length === 0) {
          next.taxTypes = DEFAULT_TAX_TYPES.slice(
            0,
            next.allowMultipleReceiptTaxTypes === false ? 1 : DEFAULT_TAX_TYPES.length,
          );
        }
      }
      if (field === 'enablePaymentMethods' && value === true) {
        if (!Array.isArray(next.paymentMethods) || next.paymentMethods.length === 0) {
          next.paymentMethods = DEFAULT_PAYMENT_METHODS.slice(
            0,
            next.allowMultiplePaymentMethods === false ? 1 : DEFAULT_PAYMENT_METHODS.length,
          );
        }
      }
      if (field === 'enableReceiptItems' && value === true) {
        if (!Array.isArray(next.receiptItemTemplates) || next.receiptItemTemplates.length === 0) {
          next.receiptItemTemplates = [''];
        }
      }
      if (field === 'allowMultipleReceiptTypes' && value === false) {
        next.receiptTypes = Array.isArray(next.receiptTypes) ? next.receiptTypes.slice(0, 1) : [];
      }
      if (field === 'allowMultipleReceiptTaxTypes' && value === false) {
        next.taxTypes = Array.isArray(next.taxTypes) ? next.taxTypes.slice(0, 1) : [];
      }
      if (field === 'allowMultiplePaymentMethods' && value === false) {
        next.paymentMethods = Array.isArray(next.paymentMethods)
          ? next.paymentMethods.slice(0, 1)
          : [];
      }
      if (field === 'allowMultipleReceiptItems' && value === false) {
        next.receiptItemTemplates = Array.isArray(next.receiptItemTemplates)
          ? next.receiptItemTemplates.slice(0, 1)
          : [];
      }
      if (field === 'posApiType') {
        const inferredUsage = value === 'AUTH'
          ? 'auth'
          : value === 'ADMIN'
            ? 'admin'
            : value === 'LOOKUP'
              ? 'info'
              : next.usage;
        if (inferredUsage !== next.usage) {
          next.usage = inferredUsage;
          const allowedTypes = USAGE_TYPE_OPTIONS[inferredUsage] || [];
          const allowedCodes = new Set(allowedTypes.map((type) => type.value));
          if (!allowedCodes.has(value)) {
            next.posApiType = USAGE_DEFAULT_TYPE[inferredUsage] ?? '';
          }
        }
      }
      return next;
    });
    if (field !== 'docUrl') {
      resetTestState();
    }
  }

  function handleResponseTableSelection(event) {
    const values = Array.from(event.target.selectedOptions || []).map((opt) => opt.value);
    const sanitized = sanitizeTableSelection(values, responseTableOptions);
    setFormState((prev) => {
      const allowedTables = new Set(sanitized.map((table) => normalizeTableValue(table)));
      const currentMappings = sanitizeResponseFieldMappings(prev.responseFieldMappings);
      const filteredMappings = Object.fromEntries(
        Object.entries(currentMappings).filter(([, target]) =>
          allowedTables.has(normalizeTableValue(target.table)),
        ),
      );
      return { ...prev, responseTables: sanitized, responseFieldMappings: filteredMappings };
    });
  }

  function handleResponseFieldMappingChange(field, value) {
    setFormState((prev) => {
      const current = sanitizeResponseFieldMappings(prev.responseFieldMappings);
      const next = { ...current };
      if (!value) {
        delete next[field];
      } else {
        const [table, ...columnParts] = value.split('.');
        const column = columnParts.join('.') || '';
        if (table && column) {
          next[field] = { table, column };
        }
      }
      if (JSON.stringify(next) === JSON.stringify(prev.responseFieldMappings || {})) return prev;
      return { ...prev, responseFieldMappings: next };
    });
  }

  function resetImportTestState() {
    setImportTestResult(null);
    setImportTestError('');
    setImportTestRunning(false);
  }

  function applyImportExample(example, draft) {
    if (!example) return;
    const targetDraft = draft || activeImportDraft;
    setImportSelectedExampleKey(example.key || example.name || '');
    const baseDefaults = buildDraftParameterDefaults(targetDraft?.parameters || []);
    const nextValues = { ...baseDefaults };
    const request = example.request || {};
    const queryParams = request.queryParams || request.query || example.queryParams || [];
    const pathParams = request.pathParams || request.pathParameters || example.pathParams || [];
    const headers = request.headers || request.header || example.headers || {};

    const assignParamValue = (name, value) => {
      if (!name) return;
      nextValues[name] = value ?? '';
    };

    const normalizeParamList = (params) => {
      if (!params) return [];
      if (Array.isArray(params)) return params;
      if (typeof params === 'object') {
        return Object.entries(params).map(([name, value]) => ({ name, value }));
      }
      return [];
    };

    normalizeParamList(queryParams).forEach((param) => {
      assignParamValue(param?.name ?? param?.key ?? param?.param ?? param, param?.value ?? param?.example);
    });

    normalizeParamList(pathParams).forEach((param) => {
      assignParamValue(param?.name ?? param?.key ?? param?.param ?? param, param?.value ?? param?.example);
    });

    if (headers && typeof headers === 'object') {
      Object.entries(headers).forEach(([name, value]) => assignParamValue(name, value));
    }
    setImportTestValues(nextValues);
    const bodyCandidate = request.body ?? example.body ?? example.requestBody;
    if (bodyCandidate !== undefined) {
      try {
        setImportRequestBody(
          typeof bodyCandidate === 'string'
            ? bodyCandidate
            : JSON.stringify(bodyCandidate, null, 2),
        );
      } catch {
        setImportRequestBody(String(bodyCandidate));
      }
    }
    setImportExampleResponse(example.response || null);
  }

  function prepareDraftDefaults(draft) {
    if (!draft) return;
    importAuthSelectionDirtyRef.current = false;
    setSelectedImportId(draft.id || '');
    setImportSelectedExampleKey('');
    setImportExampleResponse(null);
    setImportTestValues(buildDraftParameterDefaults(draft.parameters || []));
    if (draft.requestExample !== undefined) {
      if (typeof draft.requestExample === 'string') {
        setImportRequestBody(draft.requestExample);
      } else {
        try {
          setImportRequestBody(JSON.stringify(draft.requestExample, null, 2));
        } catch {
          setImportRequestBody(String(draft.requestExample));
        }
      }
    } else if (draft.requestBody?.schema) {
      setImportRequestBody(toPrettyJson(draft.requestBody.schema, ''));
    } else {
      setImportRequestBody('');
    }
    const preferredBaseUrl = draft.testServerUrl
      || draft.serverUrl
      || draft.productionServerUrl
      || draft.testServerUrlProduction;
    if (preferredBaseUrl) {
      setImportBaseUrl(preferredBaseUrl);
      setImportBaseUrlEnvVar('');
      setImportBaseUrlMode('literal');
    }
    if (!importAuthEndpointId && formState.authEndpointId) {
      setImportAuthEndpointId(formState.authEndpointId);
    }
    if (Array.isArray(draft.examples) && draft.examples.length > 0) {
      applyImportExample(draft.examples[0], draft);
    }
    resetImportTestState();
  }

  async function applyImportedSpec({ files = [], inlineText = '' }) {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    const trimmedText = (inlineText || '').trim();
    if (normalizedFiles.length === 0 && !trimmedText) {
      setImportError('Upload or paste an OpenAPI/Postman specification first.');
      return;
    }
    try {
      setImportError('');
      setImportStatus('Parsing specification files…');
      resetImportTestState();
      const formData = new FormData();
      normalizedFiles.forEach((file) => formData.append('files', file));
      if (trimmedText) {
        formData.append('files', new Blob([trimmedText], { type: 'text/plain' }), 'pasted-spec.yaml');
      }
      const res = await fetch(`${API_BASE}/posapi/endpoints/import/parse`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Failed to parse the supplied file(s).');
      }
      const data = await res.json();
      const operations = Array.isArray(data?.operations) ? data.operations : [];
      if (!operations.length) {
        throw new Error('No operations were found in the supplied files.');
      }
      const enhancedOperations = operations.map((operation) => {
        const merged = mergeVariationsWithExamples(
          Array.isArray(operation.variations) ? operation.variations : [],
          Array.isArray(operation.examples) ? operation.examples : [],
        );
        const variationFieldHints = merged.flatMap((variation, index) =>
          (variation.requestFields || []).map((field) => ({
            entry: field,
            variationKey: variation?.key || variation?.name || `variation-${index + 1}`,
          })),
        );
        const requestFields = mergeRequestFieldHints(
          operation.requestFields || [],
          variationFieldHints,
        );
        return { ...operation, variations: merged, requestFields };
      });
      setImportDrafts(enhancedOperations);
      const fileCount = normalizedFiles.length + (trimmedText ? 1 : 0);
      setImportStatus(`Found ${enhancedOperations.length} operations from ${fileCount} file(s). Select one to test.`);
      const first = enhancedOperations[0];
      prepareDraftDefaults(first);
      setImportSpecText(trimmedText);
    } catch (err) {
      setImportError(err.message || 'Failed to parse the supplied files.');
      setImportDrafts([]);
      setImportStatus('');
      resetImportTestState();
    }
  }

  async function handleImportFileChange(event) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (!files.length) return;
    await applyImportedSpec({ files });
    event.target.value = '';
  }

  function handleParseImportText() {
    if (!importSpecText.trim()) {
      setImportError('Paste an OpenAPI YAML/JSON or Postman collection first.');
      return;
    }
    applyImportedSpec({ inlineText: importSpecText });
  }

  function handleSelectImportDraft(draftId) {
    const draft = importDrafts.find((entry) => entry.id === draftId);
    if (!draft) return;
    prepareDraftDefaults(draft);
  }

  async function handleTestImportDraft() {
    if (!activeImportDraft) {
      setImportTestError('Select an imported operation to test.');
      showToast('Select an imported operation to test first.', 'error');
      return;
    }
    const selectedAuthEndpointId = (importAuthEndpointId || formState.authEndpointId || '').trim();
    if (selectedAuthEndpointId && !authEndpointOptions.some((ep) => ep.id === selectedAuthEndpointId)) {
      setImportTestError('The selected token endpoint is not implemented. Add it under the AUTH tab first.');
      showToast('The selected token endpoint is not implemented. Add it under the AUTH tab first.', 'error');
      return;
    }
    const baseUrlResolution = resolveUrlWithEnv(importBaseUrlSelection);
    const resolvedBaseUrl = (baseUrlResolution.resolved || '').trim();
    if (!baseUrlResolution.hasValue) {
      setImportTestError('Provide a staging base URL or environment variable to run the test.');
      showToast('Provide a staging base URL or environment variable to run the test.', 'error');
      return;
    }
    let parsedBody;
    if (importRequestBody.trim()) {
      try {
        parsedBody = JSON.parse(importRequestBody);
      } catch (err) {
        setImportTestError(err.message || 'Request body must be valid JSON.');
        showToast(err.message || 'Request body must be valid JSON.', 'error');
        return;
      }
    }
    resetImportTestState();
    setImportTestRunning(true);
    showToast(
      `Calling staging endpoint ${activeImportDraft.method} ${activeImportDraft.path} against ${resolvedBaseUrl || importBaseUrl}`,
      'info',
    );
    if (selectedAuthEndpointId) {
      showToast(
        `${importUseCachedToken ? 'Reusing cached token from' : 'Requesting token from'} ${selectedAuthEndpointId} before calling the endpoint.`,
        'info',
      );
    } else {
      showToast('No token endpoint selected; running staging call without authentication.', 'info');
    }
    try {
      const filteredParams = buildFilledParams(activeImportDraft.parameters || [], importTestValues);
      const mergedParams = { ...filteredParams.path, ...filteredParams.query, ...filteredParams.header };
      const res = await fetch(`${API_BASE}/posapi/endpoints/import/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          endpoint: {
            id: activeImportDraft.id,
            name: activeImportDraft.name,
            method: activeImportDraft.method,
            path: activeImportDraft.path,
            parameters: activeImportDraft.parameters || [],
            posApiType: activeImportDraft.posApiType,
            testServerUrl: importBaseUrl,
            urlEnvMap:
              importBaseUrlSelection.mode === 'env' && importBaseUrlEnvVar
                ? { testServerUrl: importBaseUrlEnvVar.trim() }
                : {},
          },
          payload: {
            params: mergedParams,
            pathParams: filteredParams.path,
            queryParams: filteredParams.query,
            headers: filteredParams.header,
            body: parsedBody,
          },
          baseUrl: resolvedBaseUrl || undefined,
          environment: testEnvironment,
          authEndpointId: selectedAuthEndpointId,
          useCachedToken: importUseCachedToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Test request failed.');
      }
      const responseStatus = data?.response?.status ?? res.status;
      const responseText = data?.response?.statusText || res.statusText || '';
      const success = data?.response?.ok !== undefined ? data.response.ok : res.ok;
      setImportTestResult(data);
      setImportStatus('Test call completed. Review the response below.');
      showToast(`Staging request URL: ${data?.request?.url || 'Unknown'}`, 'info');
      showToast(`Staging response status: ${responseStatus} ${responseText}`.trim(), success ? 'success' : 'error');
    } catch (err) {
      setImportTestError(err.message || 'Failed to call the imported endpoint.');
      showToast(err.message || 'Failed to call the imported endpoint.', 'error');
    } finally {
      setImportTestRunning(false);
    }
  }

  function handleLoadDraftIntoForm() {
    if (!activeImportDraft) return;

    const inferredUsage = activeImportDraft.posApiType === 'AUTH'
      ? 'auth'
      : activeImportDraft.posApiType === 'LOOKUP'
        ? 'info'
        : activeImportDraft.posApiType === 'ADMIN'
          ? 'admin'
          : 'transaction';

    const draftDefinition = {
      ...EMPTY_ENDPOINT,
      ...activeImportDraft,
      id: activeImportDraft.id || '',
      name: activeImportDraft.name || '',
      method: activeImportDraft.method || 'GET',
      path: activeImportDraft.path || '/',
      usage: inferredUsage,
      posApiType: activeImportDraft.posApiType || '',
      parameters: activeImportDraft.parameters || [],
      requestBody: activeImportDraft.requestBody,
      responseBody: activeImportDraft.responseBody,
      requestFields: activeImportDraft.requestFields || [],
      responseFields: activeImportDraft.responseFields || [],
      examples: activeImportDraft.examples || [],
      scripts: activeImportDraft.scripts || {},
      mappingHints: activeImportDraft.mappingHints || {},
      supportsItems: activeImportDraft.supportsItems ?? inferredUsage === 'transaction',
      supportsMultiplePayments: activeImportDraft.supportsMultiplePayments ?? false,
      supportsMultipleReceipts: activeImportDraft.supportsMultipleReceipts ?? false,
      receiptTypes: activeImportDraft.receiptTypes || [],
      taxTypes: activeImportDraft.taxTypes || [],
      paymentMethods: activeImportDraft.paymentMethods || [],
      requestEnvMap: activeImportDraft.requestEnvMap || {},
      serverUrl: activeImportDraft.serverUrl || activeImportDraft.testServerUrl || '',
      testServerUrl: activeImportDraft.testServerUrl || activeImportDraft.serverUrl || '',
      productionServerUrl:
        activeImportDraft.productionServerUrl
        || activeImportDraft.testServerUrlProduction
        || '',
      testServerUrlProduction:
        activeImportDraft.testServerUrlProduction
        || activeImportDraft.productionServerUrl
        || '',
      authEndpointId: activeImportDraft.authEndpointId || '',
      testable: Boolean(
        activeImportDraft.testServerUrl
          || activeImportDraft.serverUrl
          || activeImportDraft.productionServerUrl,
      ),
    };

    const nextState = createFormState(draftDefinition);

    resetEditorState(nextState);
    setStatus('Loaded the imported draft into the editor. Add details and save to finalize.');
    setActiveTab('endpoints');
  }

  function resetTestState() {
    setTestState({ running: false, error: '', result: null });
  }

  function updateInfoSetting(field, value) {
    setInfoSyncSettings((prev) => ({ ...prev, [field]: value }));
  }

  function handleInfoEndpointSelection(event) {
    const selected = Array.from(event.target.selectedOptions || []).map((option) => option.value);
    setInfoSyncEndpointIds(selected);
    updateInfoSetting('endpointIds', selected);
  }

  async function saveInfoSettings() {
    try {
      setInfoSyncLoading(true);
      setInfoSyncError('');
      const res = await fetch(`${API_BASE}/posapi/reference-codes/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(infoSyncSettings),
      });
      if (!res.ok) {
        throw new Error('Failed to save sync settings');
      }
      const saved = await res.json();
      const savedUsage = saved.usage && VALID_USAGE_VALUES.has(saved.usage)
        ? saved.usage
        : infoSyncSettings.usage;
      const savedEndpointIds = Array.isArray(saved.endpointIds)
        ? saved.endpointIds.filter((value) => typeof value === 'string' && value)
        : infoSyncEndpointIds;
      const savedTables = sanitizeTableSelection(saved.tables, infoSyncTableOptions);
      setInfoSyncSettings((prev) => ({
        ...prev,
        ...saved,
        usage: savedUsage,
        endpointIds: savedEndpointIds,
        tables: savedTables,
      }));
      setInfoSyncUsage(savedUsage);
      setInfoSyncEndpointIds(savedEndpointIds);
      setInfoSyncStatus('Saved synchronization settings.');
    } catch (err) {
      setInfoSyncError(err.message || 'Unable to save synchronization settings');
    } finally {
      setInfoSyncLoading(false);
    }
  }

  async function handleManualSync() {
    try {
      setInfoSyncLoading(true);
      setInfoSyncError('');
      setInfoSyncStatus('');
      const payload = {};
      if (infoSyncUsage && infoSyncUsage !== 'all') {
        payload.usage = infoSyncUsage;
      }
      if (infoSyncEndpointIds.length > 0) {
        payload.endpointIds = infoSyncEndpointIds;
      }
      const tablesFromEndpoints = Array.from(
        new Set(
          infoMappingEndpoints
            .map((endpoint) => collectEndpointTables(endpoint))
            .flat()
            .map((table) => normalizeTableValue(table))
            .filter(Boolean),
        ),
      );
      if (tablesFromEndpoints.length > 0) {
        payload.tables = tablesFromEndpoints;
      }
      const hasPayload = Object.keys(payload).length > 0;
      const res = await fetch(`${API_BASE}/posapi/reference-codes/sync`, {
        method: 'POST',
        credentials: 'include',
        ...(hasPayload
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
          : {}),
      });
      if (!res.ok) {
        let errorMessage = 'Failed to refresh reference codes';
        try {
          const errorBody = await res.json();
          if (errorBody?.message) {
            errorMessage = errorBody.message;
          }
        } catch (err) {
          // ignore parse errors and fall back to default message
        }
        throw new Error(errorMessage);
      }
      const data = await res.json();
      const usageLabel = infoSyncUsage === 'all' ? 'all usages' : formatUsageLabel(infoSyncUsage);
      const endpointLabel =
        infoSyncEndpointIds.length > 0
          ? `${infoSyncEndpointIds.length} endpoint(s)`
          : 'all endpoints';
      setInfoSyncStatus(
        `Synced reference codes (${usageLabel}, ${endpointLabel}) – added ${data.added || 0}, updated ${
          data.updated || 0
        }, deactivated ${data.deactivated || 0}.`,
      );
      await refreshInfoSyncLogsRef.current();
    } catch (err) {
      setInfoSyncError(err.message || 'Unable to refresh reference codes');
    } finally {
      setInfoSyncLoading(false);
    }
  }

  function formatSyncErrors(log) {
    if (!log || !Array.isArray(log.errors) || log.errors.length === 0) return '—';
    return log.errors
      .map((entry) => {
        const endpoint = entry?.endpoint ? `${entry.endpoint}: ` : '';
        const message = typeof entry === 'string' ? entry : entry?.message;
        return `${endpoint}${message || 'Error'}`.trim();
      })
      .join('; ');
  }

  function formatSyncResult(log) {
    if (!log) return '—';
    const usageValue = log.usage && VALID_USAGE_VALUES.has(log.usage) ? log.usage : 'all';
    const usageLabel = usageValue === 'all' ? 'all usages' : formatUsageLabel(usageValue);
    const endpointIds = Array.isArray(log.endpointIds)
      ? log.endpointIds.filter((value) => typeof value === 'string' && value)
      : [];
    const endpointCount = Number.isFinite(log.endpointCount) ? log.endpointCount : endpointIds.length;
    const endpointLabel = endpointCount > 0 ? `${endpointCount} endpoint(s)` : 'all endpoints';
    const added = log.added ?? 0;
    const updated = log.updated ?? 0;
    const deactivated = log.deactivated ?? 0;
    return `Synced reference codes (${usageLabel}, ${endpointLabel}) – added ${added}, updated ${updated}, deactivated ${deactivated}.`;
  }

  async function handleStaticUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const fileName = (file.name || '').toLowerCase();
    const mime = (file.type || '').toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || mime.includes('sheet');
    const isCsv = fileName.endsWith('.csv') || mime.includes('csv');
    if (!isExcel && !isCsv) {
      setInfoSyncError('Please upload a CSV or Excel (.xlsx) file');
      event.target.value = '';
      return;
    }
    try {
      setInfoSyncLoading(true);
      setInfoSyncError('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('codeType', infoUploadCodeType);
      const endpoint = isExcel ? 'import-xlsx' : 'upload';
      const res = await fetch(`${API_BASE}/posapi/reference-codes/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        let errorMessage = isExcel ? 'Failed to import Excel file' : 'Failed to import CSV';
        try {
          const errorBody = await res.json();
          if (errorBody?.message) {
            errorMessage = errorBody.message;
          }
        } catch (err) {
          // ignore parse errors and fall back to default message
        }
        throw new Error(errorMessage);
      }
      const data = await res.json();
      setInfoSyncStatus(
        `${data.message || 'Imported'} – added ${data.result?.added || 0}, updated ${
          data.result?.updated || 0
        }, deactivated ${data.result?.deactivated || 0}.`,
      );
    } catch (err) {
      setInfoSyncError(err.message || 'Unable to import file');
    } finally {
      setInfoSyncLoading(false);
      event.target.value = '';
    }
  }

  function buildDefinition() {
    const parameters = parseJsonInput('Parameters', formState.parametersText, []);
    if (!Array.isArray(parameters)) {
      throw new Error('Parameters must be a JSON array');
    }
    const parametersWithValues = parameters.map((param) => {
      if (!param || typeof param !== 'object') return param;
      const selection = param?.name ? requestFieldValues[param.name] || {} : {};
      const fallbackDefault = parameterDefaults[param?.name];
      const literalValue = typeof selection.literal === 'string'
        ? selection.literal
        : selection.literal ?? '';
      const envVarValue = selection.mode === 'env' && selection.envVar
        ? selection.envVar
        : formState.requestEnvMap?.[param.name];
      const next = { ...param };
      if (next.in === 'path') {
        next.required = true;
      }
      const defaultCandidate = next.default ?? fallbackDefault;
      if (defaultCandidate !== undefined && defaultCandidate !== null) {
        next.default = defaultCandidate;
      }
      if (envVarValue) {
        next.envVar = envVarValue;
      }
      if (literalValue && `${literalValue}`.trim() !== '') {
        next.testValue = literalValue;
        if (next.example === undefined) {
          next.example = literalValue;
        }
      } else if (fallbackDefault !== undefined && fallbackDefault !== null) {
        next.testValue = fallbackDefault;
      }
      if (typeof next.required !== 'boolean') {
        next.required = Boolean(param.required);
      }
      return next;
    });
    let requestSchema = parseJsonInput(
      'Request body schema',
      formState.requestSchemaText,
      {},
    );
    const requestSample = parseJsonInput(
      'Base request sample',
      baseRequestJson,
      {},
    );
    const responseSchema = parseJsonInput(
      'Response body schema',
      formState.responseSchemaText,
      {},
    );
    const requestFieldsRaw = parseJsonInput(
      'Request field hints',
      formState.requestFieldsText,
      [],
    );
    if (!Array.isArray(requestFieldsRaw)) {
      throw new Error('Request field hints must be a JSON array');
    }

    const responseFields = parseJsonInput(
      'Response field hints',
      formState.responseFieldsText,
      [],
    );
    if (!Array.isArray(responseFields)) {
      throw new Error('Response field hints must be a JSON array');
    }

    const responseFieldMappings = sanitizeResponseFieldMappings(formState.responseFieldMappings);
    const responseFieldsWithMapping = responseFields.map((entry) => {
      const normalized = normalizeHintEntry(entry);
      const mapping = normalized.field ? responseFieldMappings[normalized.field] : null;
      const baseEntry = entry && typeof entry === 'object' ? { ...entry } : null;
      if (baseEntry && baseEntry.mapTo) {
        delete baseEntry.mapTo;
      }
      if (!mapping || !normalized.field) return baseEntry || entry;
      if (baseEntry) {
        return { ...baseEntry, mapTo: mapping };
      }
      const base = { field: normalized.field };
      if (typeof normalized.required === 'boolean') base.required = normalized.required;
      if (normalized.description) base.description = normalized.description;
      return { ...base, mapTo: mapping };
    });

    const examples = parseJsonInput('Examples', formState.examplesText, []);
    if (!Array.isArray(examples)) {
      throw new Error('Examples must be a JSON array');
    }

    const scripts = {
      preRequest: splitScriptText(formState.preRequestScript),
      test: splitScriptText(formState.testScript),
    };

    const getFieldMeta = (field) => requestFieldMeta[field] || {};

    const buildFieldWithMeta = (normalized, fallbackRequired) => {
      const meta = getFieldMeta(normalized.field);
      const requiredCommon =
        typeof meta.requiredCommon === 'boolean'
          ? meta.requiredCommon
          : typeof normalized.requiredCommon === 'boolean'
            ? normalized.requiredCommon
            : typeof fallbackRequired === 'boolean'
              ? fallbackRequired
              : typeof normalized.required === 'boolean'
                ? normalized.required
                : false;
      const description = meta.description || normalized.description;
      const requiredByVariation = normalizeFieldRequirementMap({
        ...normalized.requiredByVariation,
        ...meta.requiredByVariation,
      });
      const defaultByVariation = normalizeFieldValueMap({
        ...normalized.defaultByVariation,
        ...meta.defaultByVariation,
      });
      const hint = {
        field: normalized.field,
        required: requiredCommon,
        requiredCommon,
        requiredByVariation,
        requiredVariations: requiredByVariation,
        defaultByVariation,
        defaultVariations: defaultByVariation,
        ...(description ? { description } : {}),
      };
      if (normalized.location) {
        hint.location = normalized.location;
      }
      if (normalized.defaultValue !== undefined) {
        hint.defaultValue = normalized.defaultValue;
      }
      return hint;
    };

    const sanitizedRequestFields = requestFieldsRaw.map((entry) => {
      const normalized = normalizeHintEntry(entry);
      if (!normalized.field) {
        return normalized;
      }
      return buildFieldWithMeta(normalized, normalized.required);
    });

    const parameterFieldHints = parametersWithValues
      .filter((param) => param?.name && ['query', 'path'].includes(param.in))
      .map((param) =>
        buildFieldWithMeta(
          {
            field: param.name,
            required: Boolean(param.required),
            description: param.description || `${param.in} parameter`,
            location: param.in,
            defaultValue:
              param.testValue
              ?? param.example
              ?? param.default
              ?? param.sample
              ?? parameterDefaults[param.name],
          },
          param.required,
        ),
      );

    const combinedRequestFields = [];
    const seenRequestFields = new Set();
    [...sanitizedRequestFields, ...parameterFieldHints].forEach((entry) => {
      const normalized = normalizeHintEntry(entry);
      if (!normalized.field || seenRequestFields.has(normalized.field)) return;
      seenRequestFields.add(normalized.field);
      combinedRequestFields.push(normalized);
    });

    const variationRequirementByKey = {};
    const variationDefaultsByKey = {};

    if (requestFieldDisplay.state === 'ok') {
      variationColumns.forEach((variation) => {
        const key = variation.key;
        if (!key) return;
        variationRequirementByKey[key] = {};
        variationDefaultsByKey[key] = {};
      });

      visibleRequestFieldItems.forEach((entry) => {
        const normalized = normalizeHintEntry(entry);
        const fieldLabel = normalized.field;
        if (!fieldLabel) return;
        const meta = requestFieldMeta[fieldLabel] || {};
        const requiredCommon =
          typeof meta.requiredCommon === 'boolean'
            ? meta.requiredCommon
            : typeof normalized.requiredCommon === 'boolean'
              ? normalized.requiredCommon
              : typeof normalized.required === 'boolean'
                ? normalized.required
                : false;

        variationColumns.forEach((variation) => {
          const key = variation.key;
          if (!key) return;
          const variationFieldSet = variationFieldSets.get(key);
          const showForVariation = !variationFieldSet || variationFieldSet.has(fieldLabel);
          if (!showForVariation) return;
          const required = requiredCommon
            ? true
            : meta.requiredByVariation?.[key]
              ?? normalized.requiredByVariation?.[key]
              ?? false;
          const defaultValue =
            meta.defaultByVariation?.[key]
            ?? normalized.defaultByVariation?.[key];

          if (required) {
            variationRequirementByKey[key][fieldLabel] = true;
          }
          if (defaultValue !== undefined && defaultValue !== '') {
            variationDefaultsByKey[key][fieldLabel] = defaultValue;
          }
        });
      });
    }

    const sanitizedRequestFieldVariations = (requestFieldVariations || [])
      .filter((entry) => entry && entry.key)
      .map((entry) => {
        const variationKey = entry.key;
        const metaRequired = variationRequirementByKey[variationKey] || {};
        const metaDefaults = variationDefaultsByKey[variationKey] || {};
        return {
          key: variationKey,
          label: entry.label || entry.key,
          enabled: Boolean(entry.enabled),
          requiredFields: {
            ...normalizeFieldRequirementMap(entry.requiredFields),
            ...metaRequired,
          },
          defaultValues: {
            ...normalizeFieldValueMap(entry.defaultValues),
            ...metaDefaults,
          },
        };
      });

    const sanitizedVariations = (variations || []).map((variation, index) => {
      const variationKey = variation.key || variation.name || `variation-${index + 1}`;
      const requestExampleText = variation.requestExampleText
        || toPrettyJson(variation.requestExample || {}, '{}');
      const requestExample = parseJsonInput(
        `Request example for variation ${variation.name || index + 1}`,
        requestExampleText,
        {},
      );
      const requestFields = Array.isArray(variation.requestFields)
        ? variation.requestFields
          .map((field) => {
            const normalized = normalizeHintEntry(field);
            const meta = normalized.field ? requestFieldMeta[normalized.field] || {} : {};
            const requiredCommon =
              typeof meta.requiredCommon === 'boolean'
                ? meta.requiredCommon
                : typeof normalized.requiredCommon === 'boolean'
                  ? normalized.requiredCommon
                  : typeof normalized.required === 'boolean'
                    ? normalized.required
                    : false;
            const requiredByVariation = normalizeFieldRequirementMap({
              ...normalized.requiredByVariation,
              ...meta.requiredByVariation,
            });
            const defaultByVariation = normalizeFieldValueMap({
              ...normalized.defaultByVariation,
              ...meta.defaultByVariation,
            });

            return {
              field: normalized.field || '',
              description: meta.description || normalized.description || '',
              requiredCommon,
              required: requiredCommon,
              requiredByVariation,
              requiredVariations: requiredByVariation,
              defaultByVariation,
              defaultVariations: defaultByVariation,
            };
          })
          .filter((field) => field.field)
        : [];
      return {
        key: variationKey,
        name: variation.name || variation.key || `Variation ${index + 1}`,
        description: variation.description || '',
        enabled: variation.enabled !== false,
        requestExample,
        requestExampleText: toPrettyJson(requestExample, '{}'),
        requestFields,
        requiredFields: {
          ...(variationRequirementByKey[variationKey] || {}),
          ...normalizeFieldRequirementMap(variation.requiredFields),
        },
        defaultValues: {
          ...(variationDefaultsByKey[variationKey] || {}),
          ...normalizeFieldValueMap(variation.defaultValues),
        },
      };
    });

    const usage = formState.posApiType === 'AUTH'
      ? 'auth'
      : VALID_USAGE_VALUES.has(formState.usage)
        ? formState.usage
        : 'transaction';
    const isTransaction = usage === 'transaction';
    const resolvedPosApiType = isTransaction ? '' : formState.posApiType || USAGE_DEFAULT_TYPE[usage] || '';
    const supportsItems = isTransaction ? formState.supportsItems !== false : false;
    const supportsMultiplePayments = isTransaction ? Boolean(formState.supportsMultiplePayments) : false;
    const receiptTypesEnabled = isTransaction && supportsItems && formState.enableReceiptTypes !== false;
    const receiptTaxTypesEnabled = isTransaction
      ? supportsItems && formState.enableReceiptTaxTypes !== false
      : false;
    const paymentMethodsEnabled = isTransaction
      ? supportsMultiplePayments && formState.enablePaymentMethods !== false
      : false;
    const receiptItemsEnabled = isTransaction && supportsItems && formState.enableReceiptItems !== false;
    const allowMultipleReceiptItems = receiptItemsEnabled
      ? Boolean(formState.allowMultipleReceiptItems)
      : false;
    const uniqueReceiptTypes = receiptTypesEnabled
      ? sanitizeCodeList(formState.receiptTypes, DEFAULT_RECEIPT_TYPES, VALID_RECEIPT_TYPES)
      : [];
    const uniqueTaxTypes = receiptTaxTypesEnabled
      ? sanitizeCodeList(formState.taxTypes, DEFAULT_TAX_TYPES, VALID_TAX_TYPES)
      : [];
    const uniquePaymentMethods = paymentMethodsEnabled
      ? sanitizeCodeList(formState.paymentMethods, DEFAULT_PAYMENT_METHODS, VALID_PAYMENT_METHODS)
      : [];
    const receiptTypeTemplates = receiptTypesEnabled
      ? buildTemplateMap(formState.receiptTypeTemplates, VALID_RECEIPT_TYPES)
      : {};
    const taxTypeTemplates = receiptTaxTypesEnabled
      ? buildTemplateMap(formState.taxTypeTemplates, VALID_TAX_TYPES)
      : {};
    const paymentMethodTemplates = paymentMethodsEnabled
      ? buildTemplateMap(formState.paymentMethodTemplates, VALID_PAYMENT_METHODS)
      : {};
    const receiptItemTemplates = receiptItemsEnabled
      ? buildTemplateList(formState.receiptItemTemplates, allowMultipleReceiptItems)
      : [];
    const settingsId = usage === 'transaction' ? 'defaultTransaction' : '';

    if (requestSchema && typeof requestSchema === 'object' && resolvedPosApiType) {
      requestSchema.type = resolvedPosApiType;
    }
    if (isTransaction && hasObjectEntries(requestSchema)) {
      requestSchema = applySchemaFeatureFlags(requestSchema, supportsItems, supportsMultiplePayments);
    }

    const buildUrlField = (key) => {
      const envVarKey = `${key}EnvVar`;
      const modeKey = `${key}Mode`;
      const literalValue = (formState[key] || '').trim();
      const envVarValue = (formState[envVarKey] || '').trim();
      const modeValue = normalizeUrlMode(formState[modeKey], envVarValue);
      return { literal: literalValue, envVar: envVarValue, mode: modeValue };
    };

    const serverUrlField = buildUrlField('serverUrl');
    const testServerUrlField = buildUrlField('testServerUrl');
    const productionServerUrlField = buildUrlField('productionServerUrl');
    const testServerUrlProductionField = buildUrlField('testServerUrlProduction');

    const urlEnvMap = buildUrlEnvMap({
      serverUrl: serverUrlField,
      testServerUrl: testServerUrlField,
      productionServerUrl: productionServerUrlField,
      testServerUrlProduction: testServerUrlProductionField,
    });

    const urlSelectionsForValidation = [
      testServerUrlField,
      productionServerUrlField,
      serverUrlField,
      testServerUrlProductionField,
    ];

    if (!urlSelectionsForValidation.some(hasUrlSelectionValue)) {
      throw new Error('Provide at least one base URL or environment variable mapping for this endpoint.');
    }

    const hasRequestBodySchema = hasObjectEntries(requestSchema);
    const hasRequestBodyDescription = Boolean((formState.requestDescription || '').trim());
    const requestBody = hasRequestBodySchema || hasRequestBodyDescription
      ? {
          schema: requestSchema,
          description: formState.requestDescription || '',
        }
      : null;

    const endpoint = {
      id: formState.id.trim(),
      name: formState.name.trim(),
      category: formState.category.trim(),
      method: formState.method.trim().toUpperCase(),
      path: formState.path.trim(),
      ...(resolvedPosApiType ? { posApiType: resolvedPosApiType } : {}),
      usage,
      defaultForForm: isTransaction ? Boolean(formState.defaultForForm) : false,
      ...(settingsId ? { settingsId } : {}),
      supportsMultipleReceipts: isTransaction ? Boolean(formState.supportsMultipleReceipts) : false,
      supportsMultiplePayments,
      supportsItems,
      enableReceiptTypes: receiptTypesEnabled,
      allowMultipleReceiptTypes: receiptTypesEnabled
        ? Boolean(formState.allowMultipleReceiptTypes)
        : false,
      receiptTypeTemplates,
      receiptTypes: receiptTypesEnabled ? uniqueReceiptTypes : [],
      enableReceiptTaxTypes: receiptTaxTypesEnabled,
      allowMultipleReceiptTaxTypes: receiptTaxTypesEnabled
        ? Boolean(formState.allowMultipleReceiptTaxTypes)
        : false,
      taxTypeTemplates,
      taxTypes: receiptTaxTypesEnabled ? uniqueTaxTypes : [],
      ...(receiptTaxTypesEnabled ? { receiptTaxTypes: uniqueTaxTypes } : {}),
      enablePaymentMethods: paymentMethodsEnabled,
      allowMultiplePaymentMethods: paymentMethodsEnabled
        ? Boolean(formState.allowMultiplePaymentMethods)
        : false,
      paymentMethodTemplates,
      paymentMethods: paymentMethodsEnabled ? uniquePaymentMethods : [],
      enableReceiptItems: receiptItemsEnabled,
      allowMultipleReceiptItems,
      receiptItemTemplates,
      notes: formState.notes ? formState.notes.trim() : '',
      parameters: parametersWithValues,
      ...(requestBody ? { requestBody } : {}),
      responseBody: {
        schema: responseSchema,
        description: formState.responseDescription || '',
      },
      responseTables: sanitizeTableSelection(formState.responseTables, responseTableOptions),
      requestEnvMap: buildRequestEnvMap(requestFieldValues),
      requestFields: combinedRequestFields,
      requestFieldVariations: sanitizedRequestFieldVariations,
      variations: sanitizedVariations,
      responseFields: responseFieldsWithMapping,
      requestSample,
      requestSampleNotes: formState.requestSampleNotes || '',
      ...(Object.keys(responseFieldMappings).length
        ? { responseFieldMappings }
        : {}),
      examples,
      scripts,
      testable: Boolean(formState.testable),
      serverUrl: serverUrlField.literal,
      serverUrlEnvVar: serverUrlField.envVar,
      serverUrlMode: serverUrlField.mode,
      testServerUrl: testServerUrlField.literal,
      testServerUrlEnvVar: testServerUrlField.envVar,
      testServerUrlMode: testServerUrlField.mode,
      productionServerUrl: productionServerUrlField.literal,
      productionServerUrlEnvVar: productionServerUrlField.envVar,
      productionServerUrlMode: productionServerUrlField.mode,
      testServerUrlProduction: testServerUrlProductionField.literal,
      testServerUrlProductionEnvVar: testServerUrlProductionField.envVar,
      testServerUrlProductionMode: testServerUrlProductionField.mode,
      urlEnvMap,
      authEndpointId: formState.authEndpointId || '',
    };

    if (settingsId) {
      delete endpoint.supportsMultipleReceipts;
      delete endpoint.supportsMultiplePayments;
      delete endpoint.receiptTypes;
      delete endpoint.paymentMethods;
    }

    const existingIds = new Set(
      endpoints
        .filter((ep) => ep?.id && ep.id !== selectedId && ep.id !== endpoint.id)
        .map((ep) => ep.id),
    );
    validateEndpoint(endpoint, existingIds, selectedId || endpoint.id);

    return endpoint;
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError('');
      setStatus('');
      resetTestState();
      const definition = buildDefinition();
      const preparedDefinition = withEndpointMetadata(definition);
      const replacementIndex = endpoints.findIndex(
        (ep) => ep.id === selectedId || ep.id === preparedDefinition.id,
      );
      const updated = replacementIndex >= 0
        ? endpoints.map((ep, index) => (index === replacementIndex ? preparedDefinition : ep))
        : [...endpoints, preparedDefinition];

      let normalized = updated.map(withEndpointMetadata);
      if (preparedDefinition.usage === 'transaction' && preparedDefinition.defaultForForm) {
        normalized = normalized.map((ep) => (
          ep.id === preparedDefinition.id
            ? ep
            : {
                ...ep,
                defaultForForm:
                  ep.usage === 'transaction' ? false : Boolean(ep.defaultForForm),
              }
        ));
      }

      const normalizedWithIds = normalizeEndpointList(normalized);

      const res = await fetch(`${API_BASE}/posapi/endpoints`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoints: normalizedWithIds }),
        skipLoader: true,
      });
      if (!res.ok) {
        let message = 'Failed to save endpoints';
        try {
          const errorBody = await res.json();
          if (Array.isArray(errorBody?.issues) && errorBody.issues.length > 0) {
            message = `${errorBody.message || message}: ${errorBody.issues.join('; ')}`;
          } else if (errorBody?.message) {
            message = errorBody.message;
          }
        } catch (err) {
          // ignore parse errors and fall back to default message
        }
        throw new Error(message);
      }
      const saved = await res.json();
      const nextRaw = Array.isArray(saved) ? saved : normalizedWithIds;
      const next = normalizeEndpointList(nextRaw.map(withEndpointMetadata));
      setEndpoints(next);
      const selected = next.find((ep) => ep.id === preparedDefinition.id) || preparedDefinition;
      handleSelect(selected.id, selected);
      setStatus('Changes saved');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save endpoints');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId) {
      setFormState({ ...EMPTY_ENDPOINT });
      return;
    }
    const existing = endpoints.find((ep) => ep.id === selectedId);
    if (!existing) {
      setFormState({ ...EMPTY_ENDPOINT });
      setSelectedId('');
      return;
    }
    const confirmed = window.confirm(
      `Delete endpoint "${existing.name || existing.id}"?`,
    );
    if (!confirmed) return;
    try {
      setLoading(true);
      setError('');
      setStatus('');
      resetTestState();
      const updated = endpoints.filter((ep) => ep.id !== selectedId);
      const res = await fetch(`${API_BASE}/posapi/endpoints`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoints: updated }),
        skipLoader: true,
      });
      if (!res.ok) {
        throw new Error('Failed to delete endpoint');
      }
      const saved = await res.json();
      const nextRaw = Array.isArray(saved) ? saved : updated;
      const nextEndpoints = normalizeEndpointList(nextRaw.map(withEndpointMetadata));
      setEndpoints(nextEndpoints);
      if (nextEndpoints.length > 0) {
        setSelectedId(nextEndpoints[0].id);
        setFormState(createFormState(nextEndpoints[0]));
      } else {
        setSelectedId('');
        setFormState({ ...EMPTY_ENDPOINT });
      }
      setStatus('Endpoint deleted');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to delete endpoint');
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchDoc() {
    if (!formState.docUrl.trim()) {
      setError('Documentation URL is required');
      return;
    }
    try {
      setFetchingDoc(true);
      setError('');
      setStatus('');
      resetTestState();
      const res = await fetch(`${API_BASE}/posapi/endpoints/fetch-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: formState.docUrl.trim() }),
        skipLoader: true,
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Failed to fetch documentation');
      }
      const data = await res.json();
      if (!data.blocks || data.blocks.length === 0) {
        throw new Error('No JSON examples were found in the documentation');
      }
      setDocExamples(data.blocks);
      setSelectedDocBlock(data.blocks[0]?.label || '');
      setDocMetadata(data.metadata || {});
      if (data.fieldDescriptions && Object.keys(data.fieldDescriptions).length > 0) {
        setDocFieldDescriptions(data.fieldDescriptions);
        try {
          const existing = JSON.parse(formState.fieldDescriptionsText || '{}');
          const merged = { ...existing, ...data.fieldDescriptions };
          setFormState((prev) => ({
            ...prev,
            fieldDescriptionsText: JSON.stringify(merged, null, 2),
          }));
        } catch {
          setFormState((prev) => ({
            ...prev,
            fieldDescriptionsText: JSON.stringify(data.fieldDescriptions, null, 2),
          }));
        }
      }
      if (data.metadata?.method) {
        setFormState((prev) => ({ ...prev, method: data.metadata.method }));
      }
      if (data.metadata?.path) {
        setFormState((prev) => ({ ...prev, path: data.metadata.path }));
      }
      if (!formState.testServerUrl.trim() && data.metadata?.testServerUrl) {
        setFormState((prev) => ({ ...prev, testServerUrl: data.metadata.testServerUrl }));
      }
      setStatus('Documentation fetched. Select a block to insert.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to fetch documentation');
    } finally {
      setFetchingDoc(false);
    }
  }

  function handleApplyDocBlock(target) {
    if (docExamples.length === 0) {
      setError('Fetch documentation first');
      return;
    }
    const selected = docExamples.find((block) => block.label === selectedDocBlock) || docExamples[0];
    if (!selected) {
      setError('Selected block not found');
      return;
    }
    const pretty = JSON.stringify(selected.json, null, 2);
    if (target === 'request') {
      handleChange('requestSchemaText', pretty);
    } else if (target === 'response') {
      handleChange('responseSchemaText', pretty);
    } else {
      handleChange('fieldDescriptionsText', pretty);
    }
    setStatus(`Applied ${selected.label} to ${target} schema`);
  }

  function syncRequestSampleFromSelections(nextSelections, baseOverride) {
    const baseText = baseOverride ?? baseRequestJson ?? '{}';
    const baseSample = cleanSampleText(baseText);
    const activeSelections = Object.entries(nextSelections || {}).reduce((acc, [path, entry]) => {
      if (entry?.applyToBody === false) return acc;
      acc[path] = entry;
      return acc;
    }, {});
    const updated = buildRequestSampleFromSelections(baseSample, activeSelections, {
      resolveEnv: false,
      useEnvPlaceholders: false,
    });
    try {
      const formatted = JSON.stringify(updated, null, 2);
      setRequestSampleText(formatted);
      setBaseRequestJson(formatted);
    } catch {
      // ignore formatting errors
    }
    return updated;
  }

  function buildSelectionsForVariation(variationKey) {
    if (!variationKey || requestFieldDisplay.state !== 'ok') return {};
    const selections = {};
    visibleRequestFieldItems.forEach((entry) => {
      const normalized = normalizeHintEntry(entry);
      const fieldPath = normalized.field;
      if (!fieldPath) return;
      const meta = requestFieldMeta[fieldPath] || {};
      const defaultValue = meta.defaultByVariation?.[variationKey]
        ?? normalized.defaultByVariation?.[variationKey];
      if (defaultValue === undefined || defaultValue === '') return;
      selections[fieldPath] = {
        mode: 'literal',
        literal: String(defaultValue),
        envVar: '',
        applyToBody: entry.source !== 'parameter',
      };
    });
    return selections;
  }

  function mergeArrays(base, modifier, path) {
    if (!Array.isArray(base)) return Array.isArray(modifier) ? modifier : base;
    if (!Array.isArray(modifier) || modifier.length === 0) return base;
    if (path.endsWith('payments')) {
      const merged = base.map((entry) => ({ ...entry }));
      modifier.forEach((payment) => {
        if (!payment || typeof payment !== 'object') return;
        const targetIndex = merged.findIndex((item) => item?.type === payment.type);
        if (targetIndex >= 0) {
          merged[targetIndex] = mergePayloads(merged[targetIndex], payment, `${path}[${targetIndex}]`);
        } else {
          merged.push(payment);
        }
      });
      return merged;
    }
    const merged = base.map((entry) => entry);
    modifier.forEach((value, idx) => {
      if (idx < merged.length && merged[idx] && typeof merged[idx] === 'object' && typeof value === 'object') {
        merged[idx] = mergePayloads(merged[idx], value, `${path}[${idx}]`);
      } else if (idx >= merged.length) {
        merged.push(value);
      } else {
        merged[idx] = value;
      }
    });
    return merged;
  }

  function mergePayloads(base, modifier, path = '') {
    if (Array.isArray(base) || Array.isArray(modifier)) {
      return mergeArrays(Array.isArray(base) ? base : [], Array.isArray(modifier) ? modifier : [], path);
    }
    if (!modifier || typeof modifier !== 'object') return base;
    const source = base && typeof base === 'object' ? { ...base } : {};
    Object.entries(modifier).forEach(([key, value]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (Array.isArray(value) || typeof value === 'object') {
        source[key] = mergePayloads(source[key], value, nextPath);
      } else {
        source[key] = value;
      }
    });
    return source;
  }

  function applyPayloadOverlay(base, modifier) {
    const baseClone = deepClone(base);
    const normalizedBase =
      baseClone && typeof baseClone === 'object'
        ? baseClone
        : Array.isArray(modifier)
          ? []
          : {};
    if (!modifier || typeof modifier !== 'object') return normalizedBase;
    return mergePayloads(normalizedBase, modifier);
  }

  function parsePathSegments(path) {
    return String(path || '')
      .split('.')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => ({ key: segment.replace(/\[\]/g, ''), isArray: segment.endsWith('[]') }));
  }

  function getNestedValue(source, segments) {
    let current = source;
    for (let i = 0; i < segments.length; i += 1) {
      const { key, isArray } = segments[i];
      if (!current || typeof current !== 'object') return undefined;
      current = current[key];
      if (isArray) {
        if (!Array.isArray(current) || current.length === 0) return undefined;
        current = current[0];
      }
    }
    return current;
  }

  function setNestedValue(target, segments, value) {
    let current = target;
    segments.forEach((segment, index) => {
      const isLast = index === segments.length - 1;
      if (segment.isArray) {
        if (!Array.isArray(current[segment.key])) {
          current[segment.key] = [{}];
        } else if (current[segment.key].length === 0) {
          current[segment.key].push({});
        }
        if (isLast) {
          current[segment.key][0] = value;
        } else {
          if (!current[segment.key][0] || typeof current[segment.key][0] !== 'object') {
            current[segment.key][0] = {};
          }
          current = current[segment.key][0];
        }
      } else {
        if (isLast) {
          current[segment.key] = value;
        } else {
          if (!current[segment.key] || typeof current[segment.key] !== 'object') {
            current[segment.key] = {};
          }
          current = current[segment.key];
        }
      }
    });
  }

  function removeNestedValue(target, segments) {
    const stack = [];
    let current = target;

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      if (!current || typeof current !== 'object') return;
      stack.push({ parent: current, segment });
      current = current[segment.key];
      if (segment.isArray) {
        if (!Array.isArray(current) || current.length === 0) return;
        current = current[0];
      }
    }

    while (stack.length > 0) {
      const { parent, segment } = stack.pop();
      if (!parent || typeof parent !== 'object') continue;

      if (segment.isArray) {
        if (Array.isArray(parent[segment.key])) {
          parent[segment.key].splice(0, 1);
          if (parent[segment.key].length === 0) {
            delete parent[segment.key];
          }
        }
      } else if (Object.prototype.hasOwnProperty.call(parent, segment.key)) {
        delete parent[segment.key];
      }

      if (Object.keys(parent).length > 0) {
        break;
      }
    }
  }

  function pickPayloadFields(payload, fieldPaths = []) {
    if (!payload || typeof payload !== 'object' || fieldPaths.length === 0) return payload;
    const picked = {};
    fieldPaths.forEach((path) => {
      const segments = parsePathSegments(path);
      if (segments.length === 0) return;
      const value = getNestedValue(payload, segments);
      if (value === undefined) return;
      setNestedValue(picked, segments, value);
    });
    return picked;
  }

  function getAllowedFieldsForVariation(key) {
    const variationFieldSet = variationFieldSets.get(key);
    if (variationFieldSet && variationFieldSet.size > 0) {
      return Array.from(variationFieldSet);
    }
    const variationMeta = requestFieldVariationMap.get(key);
    if (variationMeta) {
      const combined = new Set([
        ...Object.keys(variationMeta.requiredFields || {}),
        ...Object.keys(variationMeta.defaultValues || {}),
      ]);
      return Array.from(combined);
    }
    return [];
  }

  function resolveVariationRequestExample(key) {
    if (!key) return null;
    const variation = activeVariations.find((entry) => (entry.key || entry.name) === key);
    if (variation) {
      return toSamplePayload(variation.requestExample ?? variation.requestExampleText ?? {});
    }
    const exampleEntry = exampleVariationMap.get(key);
    if (exampleEntry) {
      return toSamplePayload(
        exampleEntry.requestExample ?? exampleEntry.request?.body ?? exampleEntry.body ?? exampleEntry,
      );
    }
    return null;
  }

  function resolveVariationExampleForTesting(key) {
    if (!key) return null;
    const variationExample = resolveVariationRequestExample(key);
    if (variationExample) return variationExample;
    return null;
  }

  function buildCombinationPayload(baseKey = combinationBaseKey, modifierKeys = combinationModifierKeys) {
    if (!baseKey) {
      throw new Error('Select a base variation to build a combination.');
    }
    const baseFromText = cleanSampleText(baseRequestJson);
    const variationBase = baseKey && baseKey !== BASE_COMBINATION_KEY
      ? resolveVariationRequestExample(baseKey)
      : null;
    let mergedPayload = deepClone(variationBase || baseFromText || {});
    modifierKeys.forEach((key) => {
      const modifierPayload = getVariationExamplePayload(key, false, true);
      if (!modifierPayload || Object.keys(modifierPayload).length === 0) return;
      mergedPayload = applyPayloadOverlay(mergedPayload, modifierPayload);
    });
    return mergedPayload;
  }

  function getVariationExamplePayload(key, skipFieldFilter = false, isModifier = false) {
    let payloadCandidate = {};
    let allowedFields = [];
    if (key === BASE_COMBINATION_KEY) {
      payloadCandidate = cleanSampleText(baseRequestJson);
    } else {
      const variationExample = resolveVariationRequestExample(key);
      if (variationExample) {
        payloadCandidate = variationExample;
      }
      allowedFields = getAllowedFieldsForVariation(key);
    }
    if (isModifier) {
      if (allowedFields.length === 0) {
        return {};
      }
      return pickPayloadFields(payloadCandidate, allowedFields);
    }
    if (skipFieldFilter || !allowedFields.length) {
      return payloadCandidate;
    }
    return pickPayloadFields(payloadCandidate, allowedFields);
  }

  function handleRequestFieldValueChange(fieldPath, updates) {
    if (!fieldPath) return;
    setRequestFieldValues((prev) => {
      const current = prev[fieldPath] || { mode: 'literal', literal: '', envVar: '' };
      const trimmedEnvVar = typeof updates.envVar === 'string' ? updates.envVar.trim() : updates.envVar;
      const nextEntry = {
        ...current,
        ...updates,
        mode: updates.mode || current.mode || 'literal',
        ...(trimmedEnvVar !== undefined ? { envVar: trimmedEnvVar } : {}),
      };

      if (updates.mode === 'literal') {
        nextEntry.envVar = trimmedEnvVar !== undefined ? trimmedEnvVar : '';
      }

      const nextSelections = { ...prev, [fieldPath]: nextEntry };
      syncRequestSampleFromSelections(nextSelections);
      setFormState((prevState) => ({
        ...prevState,
        requestEnvMap: buildRequestEnvMap(nextSelections),
      }));
      return nextSelections;
    });
  }

  function handleRequestFieldDescriptionChange(fieldPath, value) {
    if (!fieldPath) return;
    setRequestFieldMeta((prev) => {
      const current = prev[fieldPath] || { requiredByVariation: {}, defaultByVariation: {} };
      return { ...prev, [fieldPath]: { ...current, description: value } };
    });
  }

  function handleCommonRequiredToggle(fieldPath, value) {
    if (!fieldPath) return;
    setRequestFieldMeta((prev) => {
      const current = prev[fieldPath] || { requiredByVariation: {}, defaultByVariation: {} };
      const requiredByVariation = value
        ? variationColumns.reduce((acc, variation) => {
          const key = variation.key;
          if (key) {
            acc[key] = true;
          }
          return acc;
        }, {})
        : {};
      return {
        ...prev,
        [fieldPath]: { ...current, requiredCommon: value, requiredByVariation },
      };
    });
  }

  function handleVariationRequirementChange(fieldPath, variationKey, value) {
    if (!fieldPath || !variationKey) return;
    if (!value) {
      clearVariationFieldSelection(variationKey, fieldPath);
      return;
    }
    setRequestFieldMeta((prev) => {
      const current = prev[fieldPath] || { requiredByVariation: {}, defaultByVariation: {} };
      return {
        ...prev,
        [fieldPath]: {
          ...current,
          requiredByVariation: { ...current.requiredByVariation, [variationKey]: value },
        },
      };
    });

    ensureVariationFieldSelection(variationKey, fieldPath);
  }

  function handleVariationDefaultUpdate(fieldPath, variationKey, value) {
    if (!fieldPath || !variationKey) return;
    setRequestFieldMeta((prev) => {
      const current = prev[fieldPath] || { requiredByVariation: {}, defaultByVariation: {} };
      const defaultByVariation = { ...current.defaultByVariation };
      if (value !== '' && value !== undefined && value !== null) {
        defaultByVariation[variationKey] = value;
      } else {
        delete defaultByVariation[variationKey];
      }
      return { ...prev, [fieldPath]: { ...current, defaultByVariation } };
    });
    syncVariationDefaultChange(variationKey, fieldPath, value);
  }

  function handleAdminParamChange(name, value) {
    if (!name) return;
    setAdminParamValues((prev) => ({
      ...prev,
      [name]: value,
      _endpointId: activeAdminEndpoint?.id || prev._endpointId,
    }));
  }

  function buildAdminTestEndpoint() {
    if (!activeAdminEndpoint) {
      throw new Error('Select a non-transaction endpoint to manage');
    }
    let parsedBody = null;
    if (adminRequestBody && adminRequestBody.trim()) {
      try {
        parsedBody = JSON.parse(adminRequestBody);
      } catch {
        throw new Error('Request body must be valid JSON');
      }
    }
    const parameters = Array.isArray(activeAdminEndpoint.parameters)
      ? activeAdminEndpoint.parameters.map((param) => {
        const name = typeof param?.name === 'string' ? param.name : '';
        const value = name ? adminParamValues[name] ?? adminParameterDefaults[name] : undefined;
        return {
          ...param,
          ...(value !== undefined && value !== null && `${value}`.trim() !== ''
            ? { testValue: value }
            : param?.testValue
              ? { testValue: param.testValue }
              : {}),
        };
      })
      : [];

    const endpointForTest = { ...activeAdminEndpoint, parameters };
    if (parsedBody !== null) {
      endpointForTest.requestExample = parsedBody;
      if (!endpointForTest.requestBody) {
        endpointForTest.requestBody = { schema: parsedBody };
      }
    }
    return endpointForTest;
  }

  async function handleRunAdminEndpoint() {
    if (!activeAdminEndpoint) {
      setAdminError('Add at least one lookup/admin utility endpoint in the registry first.');
      return;
    }
    let endpointForTest;
    try {
      endpointForTest = buildAdminTestEndpoint();
    } catch (err) {
      setAdminError(err.message || 'Unable to prepare endpoint for testing');
      return;
    }

    setAdminError('');
    setAdminRunning(true);
    setAdminResult(null);
    const authId = adminAuthEndpointId || endpointForTest.authEndpointId || '';
    const historyEntryBase = {
      timestamp: Date.now(),
      endpointId: endpointForTest.id,
      method: endpointForTest.method,
      path: endpointForTest.path,
      environment: testEnvironment,
      parameters: Object.fromEntries(
        Object.entries(adminParamValues || {}).filter(([key]) => key !== '_endpointId'),
      ),
    };

    try {
      const res = await fetch(`${API_BASE}/posapi/endpoints/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          endpoint: endpointForTest,
          environment: testEnvironment,
          authEndpointId: authId,
          useCachedToken: adminUseCachedToken,
          parameterValues: historyEntryBase.parameters,
        }),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Failed to call endpoint');
      }
      const data = await res.json();
      updateTokenMetaFromResult(data);
      const statusCode = data?.response?.status ?? res.status;
      const ok = data?.response?.ok ?? res.ok;
      setAdminResult({ ...data, endpointId: endpointForTest.id });
      showToast(
        `${endpointForTest.name || endpointForTest.id} returned ${statusCode} (${testEnvironment}).`,
        ok ? 'success' : 'error',
      );
      setAdminHistory((prev) => [
        {
          ...historyEntryBase,
          status: statusCode,
          ok,
          url: data?.request?.url || '',
        },
        ...prev,
      ].slice(0, 25));
    } catch (err) {
      setAdminError(err.message || 'Failed to call endpoint');
      setAdminHistory((prev) => [
        {
          ...historyEntryBase,
          status: 'error',
          ok: false,
          url: '',
          error: err.message || 'Failed to call endpoint',
        },
        ...prev,
      ].slice(0, 25));
    } finally {
      setAdminRunning(false);
    }
  }

  function handleUrlFieldChange(fieldKey, updates) {
    if (!fieldKey) return;
    const envVarKey = `${fieldKey}EnvVar`;
    const modeKey = `${fieldKey}Mode`;
    const hasEnvVarUpdate = Object.prototype.hasOwnProperty.call(updates, 'envVar');
    const trimmedEnvVar = hasEnvVarUpdate ? normalizeEnvVarName(updates.envVar) : undefined;
    setFormState((prev) => ({
      ...prev,
      ...(updates.literal !== undefined ? { [fieldKey]: updates.literal } : {}),
      ...(hasEnvVarUpdate ? { [envVarKey]: trimmedEnvVar } : {}),
      ...(updates.mode ? { [modeKey]: updates.mode } : {}),
    }));
    resetTestState();
  }

  function updateTokenMetaFromResult(result) {
    const now = Date.now();
    const expiresInSeconds = result?.response?.bodyJson?.expires_in;
    const expiresAt = expiresInSeconds ? now + Number(expiresInSeconds) * 1000 : now + DEFAULT_TOKEN_TTL_MS;
    setTokenMeta({ lastFetchedAt: now, expiresAt });
  }

  function handleClearSavedToken() {
    setTokenMeta({ lastFetchedAt: null, expiresAt: null });
  }

  function resetEditorState(nextFormState = { ...EMPTY_ENDPOINT }) {
    setSelectedId('');
    setStatus('');
    setError('');
    resetTestState();
    setRequestBuilder(null);
    setRequestBuilderError('');
    setDocExamples([]);
    setSelectedDocBlock('');
    setDocMetadata({});
    setDocFieldDescriptions({});
    setImportSpecText('');
    setImportDrafts([]);
    setImportError('');
    setImportStatus('');
    setSelectedImportId('');
    setImportTestValues({});
    setImportRequestBody('');
    setImportTestResult(null);
    setImportTestRunning(false);
    setImportTestError('');
    setImportSelectedExampleKey('');
    setImportExampleResponse(null);
    setImportBaseUrl('');
    setImportBaseUrlEnvVar('');
    setImportBaseUrlMode('literal');
    setBaseRequestJson('');
    setRequestSampleText('');
    setCombinationBaseKey(BASE_COMBINATION_KEY);
    setCombinationModifierKeys([]);
    setCombinationPayloadText('');
    setCombinationError('Select a base variation to build a combination.');
    setTestEnvironment('staging');
    setImportAuthEndpointId('');
    setUseCachedToken(true);
    setImportUseCachedToken(true);
    setRequestFieldValues({});
    setRequestFieldMeta({});
    setTokenMeta({ lastFetchedAt: null, expiresAt: null });
    setSelectedVariationKey('');
    setPaymentDataDrafts({});
    setPaymentDataErrors({});
    setTaxTypeListText(DEFAULT_TAX_TYPES.join(', '));
    setTaxTypeListError('');
    setAdminSelectionId('');
    setAdminParamValues({});
    setAdminRequestBody('');
    setAdminResult(null);
    setAdminError('');
    setAdminRunning(false);
    setAdminHistory([]);
    setAdminUseCachedToken(true);
    setAdminAuthEndpointId('');
    setFormState(nextFormState);
  }

  function handleNew() {
    resetEditorState({ ...EMPTY_ENDPOINT });
  }

  async function handleTestCombination() {
    if (!combinationPayloadText.trim()) {
      setCombinationError('Build a combination payload before testing.');
      return;
    }
    await handleTest({
      payloadOverride: combinationPayloadText,
      payloadLabel: 'Combination payload',
    });
  }

  function parseRequestSamplePayload() {
    return parseJsonPayloadFromText('Request sample', requestSampleText, {
      setErrorState: (message) => setTestState({ running: false, error: message, result: null }),
    });
  }

  function parseJsonPayloadFromText(label, text, options = {}) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      const message = `${label} cannot be empty.`;
      const setErrorState = options.setErrorState;
      if (typeof setErrorState === 'function') {
        setErrorState(message);
      }
      showToast(message, 'error');
      throw new Error(message);
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      const message = err?.message || `${label} must be valid JSON.`;
      const setErrorState = options.setErrorState;
      if (typeof setErrorState === 'function') {
        setErrorState(message);
      }
      showToast(message, 'error');
      throw err;
    }
  }

  async function handleTest(options = {}) {
    const { payloadOverride, payloadLabel } = options || {};
    let definition;
    try {
      setError('');
      setStatus('');
      definition = buildDefinition();
      showToast(`Preparing to test ${definition.name || definition.id || 'endpoint'}.`, 'info');
    } catch (err) {
      setError(err.message || 'Failed to prepare endpoint');
      return;
    }

    if (!definition.testable) {
      setTestState({ running: false, error: 'Enable the testable checkbox to run tests.', result: null });
      showToast('Enable the testable checkbox to run tests.', 'error');
      return;
    }

    const activeTestSelection = resolvedTestSelection
      || (testEnvironment === 'production'
        ? resolvedUrlSelections.productionServerUrl
        : resolvedUrlSelections.testServerUrl)
      || {};

    if (!activeTestSelection?.hasValue) {
      setTestState({ running: false, error: 'Test server URL is required for testing.', result: null });
      showToast('Test server URL is required for testing.', 'error');
      return;
    }

    const now = Date.now();
    const cachedTokenExpired = tokenMeta.expiresAt ? now > tokenMeta.expiresAt : false;
    const effectiveUseCachedToken = useCachedToken && !cachedTokenExpired;
    if (cachedTokenExpired) {
      setStatus('Cached token expired; refreshing before running the test.');
      showToast('Cached token expired; refreshing token before running the test.', 'info');
    }

    if (formState.authEndpointId && !authEndpointOptions.some((ep) => ep.id === formState.authEndpointId)) {
      setTestState({
        running: false,
        error: 'The selected token endpoint is not implemented. Add an AUTH endpoint or clear the selection.',
        result: null,
      });
      showToast('The selected token endpoint is not implemented. Add an AUTH endpoint or clear the selection.', 'error');
      return;
    }

    const payloadTextForTest = payloadOverride !== undefined && payloadOverride !== null
      ? (typeof payloadOverride === 'string'
        ? payloadOverride
        : JSON.stringify(payloadOverride, null, 2))
      : requestSampleText;
    let payloadForTest = null;
    const parseOverrideText = (text, label) =>
      parseJsonPayloadFromText(label, text, {
        setErrorState: (message) => setTestState({ running: false, error: message, result: null }),
      });

    if (payloadOverride !== undefined && payloadOverride !== null) {
      if (typeof payloadOverride === 'string') {
        try {
          payloadForTest = parseOverrideText(payloadOverride, payloadLabel || 'Payload override');
        } catch (err) {
          if (payloadLabel === 'Combination payload') {
            setCombinationError(err?.message || 'Invalid combination payload.');
          }
          return;
        }
      } else {
        payloadForTest = payloadOverride;
      }
    } else {
      try {
        payloadForTest = parseRequestSamplePayload();
      } catch {
        return;
      }
    }
    const hasPayloadOverride = payloadOverride !== undefined && payloadOverride !== null;

    const confirmPayloadLabel = hasPayloadOverride
      ? 'the built combination JSON box'
      : 'the request sample JSON box';
    const confirmed = window.confirm(
      `Run a test request against ${selectedTestUrl || activeTestSelection.display || 'the configured server'}? This will use ${confirmPayloadLabel}.`,
    );
    if (!confirmed) return;

    try {
      setTestState({ running: true, error: '', result: null });
      const targetUrlDisplay = selectedTestUrl || activeTestSelection.display || 'the configured server';
      showToast(
        `Running ${definition.method} ${definition.path} against ${targetUrlDisplay} in ${testEnvironment} mode.`,
        'info',
      );
      if (formState.authEndpointId) {
        showToast(
          `${effectiveUseCachedToken ? 'Reusing cached token from' : 'Requesting token from'} ${formState.authEndpointId} before calling the endpoint.`,
          'info',
        );
      } else {
        showToast('No auth endpoint configured; calling endpoint without requesting a token.', 'info');
      }
      const endpointForTest = { ...definition };

      const res = await fetch(`${API_BASE}/posapi/endpoints/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          endpoint: endpointForTest,
          environment: testEnvironment,
          authEndpointId: formState.authEndpointId || '',
          useCachedToken: effectiveUseCachedToken,
          ...(payloadForTest !== undefined ? { body: payloadForTest } : {}),
          ...(hasPayloadOverride
            ? { payloadOverride: payloadForTest, payloadOverrideText: payloadTextForTest?.trim() || '' }
            : {}),
        }),
      });
      const responseText = await res.text();
      let data = null;
      try {
        data = JSON.parse(responseText);
      } catch {
        // Response body isn't JSON; fall back to textual body below.
      }

      const buildResultPayload = (rawData = {}) => {
        const responseSummary = {
          ok: rawData?.response?.ok ?? res.ok,
          status: rawData?.response?.status ?? res.status,
          statusText: rawData?.response?.statusText ?? res.statusText,
          bodyJson: rawData?.response?.bodyJson,
          bodyText: rawData?.response?.bodyText ?? (!rawData.response ? responseText : ''),
          headers: rawData?.response?.headers,
        };

        const inferredRequestUrl = rawData?.request?.url
          || selectedTestUrl
          || activeTestSelection.display
          || endpointForTest.path;

        const requestSummary = {
          method: rawData?.request?.method || definition.method,
          url: inferredRequestUrl,
          ...(payloadForTest !== undefined ? { body: payloadForTest } : {}),
          ...(rawData?.request || {}),
        };

        return { ...rawData, request: requestSummary, response: { ...rawData.response, ...responseSummary } };
      };

      if (!res.ok) {
        const message = data?.message || responseText || 'Test request failed';
        const detailedMessage = data?.request?.url && !(message || '').includes(data.request.url)
          ? `${message} (Request URL: ${data.request.url})`
          : message;
        const resultPayload = buildResultPayload(data || {});
        setTestState({ running: false, error: detailedMessage, result: resultPayload });
        showToast(detailedMessage, 'error');
        return;
      }

      const resultPayload = buildResultPayload(data || {});
      if (Array.isArray(data?.envWarnings) && data.envWarnings.length) {
        setStatus(data.envWarnings.join(' '));
        showToast(data.envWarnings.join(' '), 'info');
      }
      if (data) {
        updateTokenMetaFromResult(data);
      }
      setTestState({ running: false, error: '', result: resultPayload });
      const statusCode = resultPayload.response?.status ?? res.status;
      const statusText = resultPayload.response?.statusText || res.statusText || '';
      const success = resultPayload.response?.ok !== undefined ? resultPayload.response.ok : res.ok;
      showToast(`Test request URL: ${resultPayload?.request?.url || endpointForTest.path}`, 'info');
      showToast(`Test response status: ${statusCode} ${statusText}`.trim(), success ? 'success' : 'error');
    } catch (err) {
      console.error(err);
      const fallbackResult = {
        request: {
          method: definition?.method,
          url: selectedTestUrl || activeTestSelection.display || definition?.path,
          ...(payloadForTest !== undefined ? { body: payloadForTest } : {}),
        },
        response: {
          ok: false,
          status: null,
          statusText: err.message || 'Failed to run test',
          bodyText: '',
        },
      };
      setTestState({ running: false, error: err.message || 'Failed to run test', result: fallbackResult });
      showToast(err.message || 'Failed to run test', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={styles.tabRow}>
        <button
          type="button"
          style={{
            ...styles.tabButton,
            ...(activeTab === 'endpoints' ? styles.tabButtonActive : {}),
          }}
          onClick={() => setActiveTab('endpoints')}
        >
          Endpoints
        </button>
        <button
          type="button"
          style={{
            ...styles.tabButton,
            ...(activeTab === 'info' ? styles.tabButtonActive : {}),
          }}
          onClick={() => setActiveTab('info')}
        >
          POSAPI Information
        </button>
        <button
          type="button"
          style={{
            ...styles.tabButton,
            ...(activeTab === 'admin' ? styles.tabButtonActive : {}),
          }}
          onClick={() => setActiveTab('admin')}
        >
          Admin utilities
        </button>
      </div>

      {activeTab === 'endpoints' && (
        <div style={styles.container}>
          <div style={styles.sidebar}>
            <div style={styles.sidebarHeader}>
              <h2 style={{ margin: 0 }}>POSAPI Endpoints</h2>
              <button onClick={handleNew} style={styles.newButton}>
            + New
          </button>
        </div>
        <div style={styles.filterBar}>
          <label style={styles.filterLabel}>
            Usage filter
            <select
              value={usageFilter}
              onChange={(e) => setUsageFilter(e.target.value)}
              style={styles.filterSelect}
              disabled={loading}
            >
              <option value="all">Show all usages</option>
              {USAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {formatUsageLabel(option.value)}
                </option>
              ))}
            </select>
          </label>
          <div style={styles.filterHint}>
            {usageFilter === 'all'
              ? `${endpoints.length} total`
              : `${groupedEndpoints.reduce((total, group) => total + group.endpoints.length, 0)} shown`}
          </div>
        </div>
        {loadError && (
          <div style={styles.hintError}>{loadError}</div>
        )}
        <div style={styles.list}>
          {groupedEndpoints.map((group) => (
            <div key={group.usage} style={styles.listGroup}>
              <div style={styles.listGroupHeader}>
                <span>{group.label}</span>
                <span style={styles.listGroupCount}>{group.endpoints.length}</span>
              </div>
              <ul style={styles.listGroupList}>
                {group.endpoints.map((ep) => {
                  const methodColor = METHOD_BADGES[ep.method] || '#94a3b8';
                  const typeColor = TYPE_BADGES[ep._type] || '#1f2937';
                  const typeLabel = formatTypeLabel(ep._type);
                  const usageColor = USAGE_BADGES[ep._usage] || '#0ea5e9';
                  return (
                    <li key={ep.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(ep.id, ep)}
                        style={{
                          ...styles.listButton,
                          ...(selectedId === ep.id ? styles.listButtonActive : {}),
                        }}
                        title={ep._preview || 'No preview available'}
                      >
                        <div style={styles.listButtonHeader}>
                          <span style={styles.listButtonTitle}>{ep.name || ep.id}</span>
                          <div style={styles.badgeStack}>
                            {ep.method && (
                              <span style={badgeStyle(methodColor)}>{ep.method}</span>
                            )}
                            {ep._usage && (
                              <span style={{ ...badgeStyle(usageColor), textTransform: 'none' }}>
                                {formatUsageLabel(ep._usage)}
                              </span>
                            )}
                            {ep._type && (
                              <span style={{ ...badgeStyle(typeColor), textTransform: 'none' }}>
                                {typeLabel || ep._type}
                              </span>
                            )}
                            {ep._usage === 'transaction' && ep.supportsItems === false && (
                              <span style={{ ...badgeStyle('#475569'), textTransform: 'none' }}>
                                Service only
                              </span>
                            )}
                            {ep.defaultForForm && (
                              <span style={{ ...badgeStyle('#059669'), textTransform: 'none' }}>
                                Default form
                              </span>
                            )}
                            {ep.supportsMultipleReceipts && (
                              <span style={{ ...badgeStyle('#f97316'), textTransform: 'none' }}>
                                Multi receipt
                              </span>
                            )}
                            {ep.supportsMultiplePayments && (
                              <span style={{ ...badgeStyle('#10b981'), textTransform: 'none' }}>
                                Multi payment
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={styles.listButtonSubtle}>{ep.id}</div>
                        {ep.category && (
                          <div style={styles.listButtonCategory}>{ep.category}</div>
                        )}
                        {ep._usage === 'transaction' && (
                          <div style={styles.listMeta}>
                            <div style={styles.listMetaRow}>
                              <span style={styles.listMetaLabel}>Receipt types</span>
                              {(Array.isArray(ep.receiptTypes) && ep.receiptTypes.length > 0
                                ? ep.receiptTypes
                                : ['ALL_SUPPORTED']
                              ).map((type) => {
                                const badgeColor =
                                  type === 'ALL_SUPPORTED'
                                    ? '#475569'
                                    : TYPE_BADGES[type] || '#1f2937';
                                const label =
                                  type === 'ALL_SUPPORTED'
                                    ? 'All supported'
                                    : formatTypeLabel(type) || type;
                                return (
                                  <span
                                    key={`${ep.id}-receipt-${type}`}
                                    style={{
                                      ...badgeStyle(badgeColor),
                                      textTransform: 'none',
                                    }}
                                  >
                                    {label}
                                  </span>
                                );
                              })}
                            </div>
                            <div style={styles.listMetaRow}>
                              <span style={styles.listMetaLabel}>Payments</span>
                              {(Array.isArray(ep.paymentMethods) && ep.paymentMethods.length > 0
                                ? ep.paymentMethods
                                : ['ALL_SUPPORTED']
                              ).map((method) => {
                                const badgeColor =
                                  method === 'ALL_SUPPORTED'
                                    ? '#475569'
                                    : PAYMENT_BADGES[method] || '#475569';
                                const label =
                                  method === 'ALL_SUPPORTED'
                                    ? 'All supported'
                                    : method.replace(/_/g, ' ');
                                return (
                                  <span
                                    key={`${ep.id}-payment-${method}`}
                                    style={{
                                      ...badgeStyle(badgeColor),
                                      textTransform: 'none',
                                    }}
                                  >
                                    {label}
                                  </span>
                                );
                              })}
                            </div>
                            <div style={styles.listMetaRow}>
                              <span style={styles.listMetaLabel}>Items</span>
                              <span
                                style={{
                                  ...badgeStyle(ep.supportsItems !== false ? '#15803d' : '#475569'),
                                  textTransform: 'none',
                                }}
                              >
                                {ep.supportsItems !== false ? 'Includes items' : 'Service only'}
                              </span>
                            </div>
                          </div>
                        )}
                        {ep.notes && <div style={styles.notesText}>{ep.notes}</div>}
                        {ep._preview && (
                          <div style={styles.previewText}>
                            {ep._preview.split('\n').map((line) => (
                              <div key={line}>{line}</div>
                            ))}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {groupedEndpoints.length === 0 && (
            <div style={{ color: '#666', padding: '0.5rem 0' }}>No endpoints configured yet</div>
          )}
        </div>
      </div>
          <div style={styles.formContainer}>
            {loading && (
              <div style={styles.loadingOverlay}>
                <div style={styles.loadingMessage}>Loading…</div>
              </div>
            )}
            <h1>POSAPI Endpoint Registry</h1>
            <p style={{ maxWidth: '720px' }}>
              Manage the list of available POSAPI endpoints. Paste JSON samples
              directly into the fields below or fetch them from a documentation URL.
            </p>
            {error && <div style={styles.error}>{error}</div>}
            {status && <div style={styles.status}>{status}</div>}
            <details open style={styles.detailSection}>
              <summary style={styles.detailSummary}>Import &amp; test from OpenAPI/collection</summary>
              <div style={styles.detailBody}>
                <p style={styles.sectionHelp}>
                  Upload a government-supplied OpenAPI/Swagger YAML, JSON file or a Postman
                  collection. We will extract the available operations so you can test them
                  against your staging POSAPI URL before adding them to the registry.
                </p>
                <div style={styles.importUploadRow}>
                  <label style={styles.sampleFileLabel}>
                    <span>Upload specification file</span>
                    <input
                      type="file"
                      accept=".yaml,.yml,.json,application/json,text/yaml,text/x-yaml"
                      multiple
                      onChange={handleImportFileChange}
                      style={styles.sampleFileInput}
                    />
                  </label>
                  <div style={styles.importTextColumn}>
                    <textarea
                      style={styles.importTextArea}
                      placeholder="Paste OpenAPI YAML/JSON or Postman collection JSON"
                      value={importSpecText}
                      onChange={(e) => setImportSpecText(e.target.value)}
                      rows={4}
                    />
                    <button type="button" onClick={handleParseImportText} style={styles.smallButton}>
                      Parse pasted text
                    </button>
                  </div>
                </div>
                {importError && <div style={styles.error}>{importError}</div>}
                {importStatus && <div style={styles.status}>{importStatus}</div>}
                {importDrafts.length > 0 && (
                  <div style={styles.importGrid}>
                    <div style={styles.importDraftList}>
                      {importDrafts.map((draft) => {
                        const methodColor = METHOD_BADGES[draft.method] || '#94a3b8';
                        const typeLabel = draft.posApiType ? formatTypeLabel(draft.posApiType) : '';
                        return (
                          <button
                            key={draft.id}
                            type="button"
                            onClick={() => handleSelectImportDraft(draft.id)}
                            style={{
                              ...styles.importDraftButton,
                              ...(activeImportDraft?.id === draft.id ? styles.importDraftButtonActive : {}),
                            }}
                          >
                            <div style={styles.importDraftTitle}>{draft.name || draft.id}</div>
                            <div style={styles.badgeStack}>
                              <span style={badgeStyle(methodColor)}>{draft.method}</span>
                              {typeLabel && (
                                <span
                                  style={{ ...badgeStyle(TYPE_BADGES[draft.posApiType] || '#1f2937'), textTransform: 'none' }}
                                >
                                  {typeLabel}
                                </span>
                              )}
                            </div>
                            <div style={styles.importDraftPath}>{draft.path}</div>
                            {draft.summary && (
                              <div style={styles.importDraftSummary}>{draft.summary}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {activeImportDraft && (
                      <div style={styles.importDraftPanel}>
                          <div style={styles.importDraftHeader}>
                            <div>
                              <div style={styles.importDraftHeading}>
                                {activeImportDraft.name || activeImportDraft.id}
                              </div>
                              <div style={styles.importDraftPath}>{activeImportDraft.path}</div>
                              {activeImportDraft.summary && (
                                <div style={styles.importDraftSummary}>{activeImportDraft.summary}</div>
                              )}
                              {Array.isArray(activeImportDraft.warnings)
                                && activeImportDraft.warnings.length > 0 && (
                                  <div style={styles.warningBox}>
                                    {activeImportDraft.warnings.join(' ')}
                                  </div>
                              )}
                              {activeImportDraft.validation?.state === 'incomplete' && (
                                <div style={styles.previewErrorBox}>
                                  This draft is incomplete. {activeImportDraft.validation.issues?.join(' ') || ''}
                                </div>
                              )}
                            </div>
                            <button type="button" onClick={handleLoadDraftIntoForm} style={styles.smallButton}>
                              Load into editor
                            </button>
                          </div>
                        <div style={styles.importFieldRow}>
                          <label style={styles.label}>
                            Staging base URL
                            <div style={styles.urlFieldControls}>
                              <div style={styles.requestFieldModes}>
                                <label style={styles.radioLabel}>
                                  <input
                                    type="radio"
                                    name="import-base-mode"
                                    checked={importBaseUrlSelection.mode !== 'env'}
                                    onChange={() => setImportBaseUrlMode('literal')}
                                  />
                                  Literal URL
                                </label>
                                <label style={styles.radioLabel}>
                                  <input
                                    type="radio"
                                    name="import-base-mode"
                                    checked={importBaseUrlSelection.mode === 'env'}
                                    onChange={() => setImportBaseUrlMode('env')}
                                  />
                                  Environment variable
                                </label>
                              </div>
                              {importBaseUrlSelection.mode === 'env' ? (
                                <div style={styles.urlEnvFields}>
                                  <input
                                    type="text"
                                    list="env-options-import-base"
                                    value={importBaseUrlEnvVar}
                                    onChange={(e) => setImportBaseUrlEnvVar(e.target.value)}
                                    placeholder="Enter environment variable name"
                                    style={styles.input}
                                  />
                                  <datalist id="env-options-import-base">
                                    {envVariableOptions.map((opt) => (
                                      <option key={`import-base-${opt}`} value={opt} />
                                    ))}
                                  </datalist>
                                  <input
                                    type="text"
                                    value={importBaseUrl}
                                    onChange={(e) => setImportBaseUrl(e.target.value)}
                                    placeholder="https://posapi-test.tax.gov.mn"
                                    style={styles.input}
                                  />
                                  <div style={styles.fieldHelp}>
                                    Resolved URL: {resolvedImportBaseSelection.display || 'Not set'}
                                  </div>
                                </div>
                              ) : (
                                <div style={styles.urlEnvFields}>
                                  <input
                                    type="text"
                                    value={importBaseUrl}
                                    onChange={(e) => setImportBaseUrl(e.target.value)}
                                    placeholder="https://posapi-test.tax.gov.mn"
                                    style={styles.input}
                                  />
                                  <div style={styles.fieldHelp}>
                                    Resolved URL: {resolvedImportBaseSelection.display || 'Not set'}
                                  </div>
                                </div>
                              )}
                            </div>
                          </label>
                          <label style={styles.label}>
                            Token endpoint
                            <select
                              value={importAuthEndpointId}
                              onChange={(e) => {
                                importAuthSelectionDirtyRef.current = true;
                                setImportAuthEndpointId(e.target.value);
                              }}
                              style={styles.input}
                            >
                              <option value="">Use editor selection</option>
                              {authEndpointOptions.map((endpoint) => (
                                <option key={`import-auth-${endpoint.id}`} value={endpoint.id}>
                                  {endpoint.name || endpoint.id}
                                </option>
                              ))}
                            </select>
                            <span style={styles.fieldHelp}>
                              Choose which AUTH endpoint to call before testing this imported request.
                            </span>
                            <label style={{ ...styles.checkboxLabel, marginTop: '0.35rem' }}>
                              <input
                                type="checkbox"
                                checked={importUseCachedToken}
                                onChange={(e) => setImportUseCachedToken(e.target.checked)}
                              />
                              <span>Use last successful token</span>
                            </label>
                          </label>
                        </div>
                        <div style={styles.importFieldRow}>
                          <div style={styles.importParamsHeader}>Parameters</div>
                          {(!activeImportDraft.parameters || activeImportDraft.parameters.length === 0) && (
                            <div style={styles.sectionHelp}>No query, path, or header parameters defined.</div>
                          )}
                          {['path', 'query', 'header'].map((loc) => {
                            const items = activeImportParameterGroups[loc] || [];
                            if (!items.length) return null;
                            const title =
                              loc === 'path'
                                ? 'Path parameters'
                                : loc === 'header'
                                  ? 'Header parameters'
                                  : 'Query parameters';
                            return (
                              <div key={`${activeImportDraft.id}-${loc}`} style={{ marginBottom: '0.5rem' }}>
                                <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>{title}</div>
                                <div style={styles.importParamGrid}>
                                  {items.map((param) => (
                                    <label key={`${activeImportDraft.id}-${param.name}-${loc}`} style={styles.label}>
                                      {param.name}
                                    <input
                                      type="text"
                                      value={importTestValues[param.name] ?? ''}
                                      onChange={(e) =>
                                        setImportTestValues((prev) => ({
                                          ...prev,
                                          [param.name]: e.target.value,
                                        }))
                                      }
                                      placeholder={param.description || param.example || ''}
                                      style={styles.input}
                                    />
                                    {loc !== 'header' && (
                                      <select
                                        style={styles.input}
                                        value=""
                                        onChange={(e) => {
                                          const selected = e.target.value;
                                          if (!selected) return;
                                          setImportTestValues((prev) => ({
                                            ...prev,
                                            [param.name]: `{{${selected}}}`,
                                          }));
                                        }}
                                      >
                                        <option value="">Use environment variable…</option>
                                        {envVariableOptions.length === 0 && (
                                          <option value="" disabled>
                                            No POSAPI_* variables detected
                                          </option>
                                        )}
                                        {envVariableOptions.map((opt) => (
                                          <option key={`${param.name}-${opt}`} value={opt}>
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                    <div style={styles.paramMeta}>
                                      {loc} {param.required ? '• required' : ''}
                                    </div>
                                  </label>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {Array.isArray(activeImportDraft.examples) && activeImportDraft.examples.length > 0 && (
                          <div style={styles.importFieldRow}>
                            <div style={styles.importParamsHeader}>Examples</div>
                            <div style={styles.importParamGrid}>
                              <label style={styles.label}>
                                Select example
                                <select
                                  style={styles.input}
                                  value={importSelectedExampleKey}
                                  onChange={(e) => {
                                    const selected = activeImportDraft.examples.find(
                                      (ex) => ex.key === e.target.value || ex.name === e.target.value,
                                    );
                                    if (selected) {
                                      applyImportExample(selected);
                                    } else {
                                      setImportSelectedExampleKey(e.target.value);
                                    }
                                  }}
                                >
                                  <option value="">Choose…</option>
                                  {activeImportDraft.examples.map((example) => (
                                    <option key={example.key || example.name} value={example.key || example.name}>
                                      {example.name || example.key}
                                    </option>
                                  ))}
                                </select>
                                <span style={styles.fieldHelp}>
                                  Applying an example fills parameters, headers, and body with sample values.
                                </span>
                              </label>
                              {importExampleResponse && (
                                <div style={styles.previewCard}>
                                  <div style={styles.previewHeader}>
                                    <strong>Expected response</strong>
                                    <span style={{ ...styles.statusPill, ...styles.statusPillSuccess }}>
                                      {importExampleResponse.status || 'Unknown'}
                                    </span>
                                  </div>
                                  <pre style={styles.samplePre}>
                                    {JSON.stringify(importExampleResponse.body, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div style={styles.importFieldRow}>
                          <div style={styles.importParamsHeader}>Request body</div>
                          <textarea
                            style={styles.sampleTextarea}
                            placeholder="Optional JSON body for testing"
                            value={importRequestBody}
                            onChange={(e) => setImportRequestBody(e.target.value)}
                            rows={6}
                          />
                        </div>
                        <div style={styles.importActionsRow}>
                          <button
                            type="button"
                            onClick={handleTestImportDraft}
                            style={styles.smallButton}
                            disabled={importTestRunning}
                          >
                            {importTestRunning ? 'Testing…' : 'Call staging endpoint'}
                          </button>
                          {importTestError && <div style={styles.previewErrorBox}>{importTestError}</div>}
                        </div>
                        {importTestResult && (
                          <div style={styles.importResultBox}>
                            <div style={styles.importResultTitle}>Request</div>
                            <pre style={styles.samplePre}>{
                              JSON.stringify(importTestResult.request || {}, null, 2)
                            }</pre>
                            <div style={styles.importResultTitle}>Response</div>
                            <pre style={styles.samplePre}>{
                              JSON.stringify(importTestResult.response || {}, null, 2)
                            }</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </details>
            {formState.usage === 'transaction' && (
              <div style={styles.capabilitiesBox}>
                <div style={styles.capabilitiesRow}>
                  <span style={styles.capabilitiesLabel}>Supports items</span>
                  <span
                    style={{
                      ...badgeStyle(formSupportsItems ? '#15803d' : '#475569'),
                      textTransform: 'none',
                    }}
                  >
                    {formSupportsItems ? 'Includes items' : 'Service only'}
                  </span>
                </div>
                <div style={styles.capabilitiesRow}>
                  <span style={styles.capabilitiesLabel}>Receipt types</span>
                  {formReceiptTypes.map((type) => (
                    <span
                      key={`form-receipt-${type}`}
                      style={{
                        ...badgeStyle(TYPE_BADGES[type] || '#1f2937'),
                        textTransform: 'none',
                      }}
                    >
                      {formatTypeLabel(type) || type}
                    </span>
                  ))}
                </div>
                <div style={styles.capabilitiesRow}>
                  <span style={styles.capabilitiesLabel}>Payment methods</span>
                  {formPaymentMethods.map((method) => (
                    <span
                      key={`form-payment-${method}`}
                      style={{
                        ...badgeStyle(PAYMENT_BADGES[method] || '#475569'),
                        textTransform: 'none',
                      }}
                    >
                      {method.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
                {formState.notes && (
                  <div style={{ fontSize: '0.85rem', color: '#475569' }}>{formState.notes}</div>
                )}
              </div>
            )}
            <div style={styles.formGrid}>
          <label style={styles.label}>
            Endpoint ID
            <input
              type="text"
              value={formState.id}
              onChange={(e) => handleChange('id', e.target.value)}
              style={styles.input}
              placeholder="saveReceipt"
            />
          </label>
          <label style={styles.label}>
            Name
            <input
              type="text"
              value={formState.name}
              onChange={(e) => handleChange('name', e.target.value)}
              style={styles.input}
              placeholder="Save B2C/B2B Receipt"
            />
          </label>
          <label style={styles.label}>
            Category
            <input
              type="text"
              value={formState.category}
              onChange={(e) => handleChange('category', e.target.value)}
              style={styles.input}
              placeholder="Receipts & Invoices"
            />
          </label>
          <label style={styles.label}>
            Method
            <select
              value={formState.method}
              onChange={(e) => handleChange('method', e.target.value)}
              style={styles.input}
            >
              {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            Usage
            <select
              value={formState.usage}
              onChange={(e) => handleUsageChange(e.target.value)}
              style={styles.input}
            >
              {USAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ ...styles.checkboxLabel, marginTop: '1.9rem' }}>
            <input
              type="checkbox"
              checked={Boolean(formState.defaultForForm)}
              onChange={(e) => handleChange('defaultForForm', e.target.checked)}
              disabled={formState.usage !== 'transaction'}
            />
            <span>
              Default for new forms
              {formState.usage !== 'transaction' && (
                <span style={styles.checkboxHint}> (transaction endpoints only)</span>
              )}
            </span>
          </label>
          <label style={styles.label}>
            Path
            <input
              type="text"
              value={formState.path}
              onChange={(e) => handleChange('path', e.target.value)}
              style={styles.input}
              placeholder="/rest/receipt"
            />
          </label>
          <label style={styles.labelFull}>
            Parameters (JSON array)
            <textarea
              value={formState.parametersText}
              onChange={(e) => handleChange('parametersText', e.target.value)}
              style={styles.textarea}
              rows={6}
            />
          </label>
          <label style={styles.labelFull}>
            Notes / guidance
            <textarea
              value={formState.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              style={styles.textarea}
              rows={3}
              placeholder="Explain when to use this endpoint"
            />
          </label>
        </div>


        {formState.usage === 'transaction' && (supportsMultipleReceipts || supportsMultiplePayments) && (
          <div style={styles.multiNotice}>
            <strong>Mapping reminder:</strong>{' '}
            {supportsMultipleReceipts && supportsMultiplePayments && (
              <>
                Provide column mappings for each <code>receipts[]</code> group and each{' '}
                <code>payments[]</code> entry.
              </>
            )}
            {supportsMultipleReceipts && !supportsMultiplePayments && (
              <>
                Provide column mappings for every <code>receipts[]</code> group rather than a single receipt.
              </>
            )}
            {!supportsMultipleReceipts && supportsMultiplePayments && (
              <>
                Provide column mappings for every <code>payments[]</code> entry rather than a single payment method.
              </>
            )}
          </div>
        )}

        <label style={styles.labelFull}>
          Request description
          <input
            type="text"
            value={formState.requestDescription}
            onChange={(e) => handleChange('requestDescription', e.target.value)}
            style={styles.input}
            placeholder="Batch of receipts with payments and items"
          />
        </label>
        <label style={styles.labelFull}>
          Base request sample (JSON only)
          <span style={styles.fieldHelp}>
            This is the canonical request payload used as the base for modifiers and tests. Keep it valid JSON only.
          </span>
          <textarea
            value={baseRequestJson}
            onChange={(e) => setBaseRequestJson(e.target.value)}
            style={styles.textarea}
            rows={10}
          />
        </label>
        <label style={styles.labelFull}>
          Request sample notes (optional)
          <textarea
            value={formState.requestSampleNotes}
            onChange={(e) => handleChange('requestSampleNotes', e.target.value)}
            style={styles.textarea}
            rows={3}
            placeholder="Explain how the base sample should be used or modified."
          />
        </label>
        
        <div style={styles.hintCard}>
          <div style={styles.hintHeader}>
            <h3 style={styles.hintTitle}>Variations</h3>
            <span style={styles.hintCount}>{variations.length}</span>
          </div>
          <p style={styles.hintDescription}>
            Configure request variations imported from tabbed examples or add your own. All fields start as required, but you can
            toggle requirements below.
          </p>
          <button type="button" style={styles.smallButton} onClick={handleAddVariation}>
            Add variation
          </button>
          {variations.length === 0 && (
            <div style={styles.sectionHelp}>No variations defined yet.</div>
          )}
          {variations.map((variation, index) => (
            <div key={variation.key || `variation-${index}`} style={styles.variationCard}>
              <div style={styles.inlineActionRow}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={variation.enabled !== false}
                    onChange={(e) => handleVariationToggle(index, e.target.checked)}
                  />
                  <span>Enabled</span>
                </label>
                <input
                  type="text"
                  value={variation.name || ''}
                  onChange={(e) => handleVariationChange(index, 'name', e.target.value)}
                  style={styles.input}
                  placeholder="Variation name"
                />
              </div>
              <textarea
                value={variation.description || ''}
                onChange={(e) => handleVariationChange(index, 'description', e.target.value)}
                style={styles.textarea}
                rows={2}
                placeholder="Variation description"
              />
              <label style={styles.labelFull}>
                Request example (JSON)
                <textarea
                  value={variation.requestExampleText || ''}
                  onChange={(e) => handleVariationExampleChange(index, e.target.value)}
                  style={styles.textarea}
                  rows={6}
                />
              </label>
              <div>
                <div style={styles.inlineActionRow}>
                  <strong>Fields</strong>
                  <button type="button" style={styles.smallButton} onClick={() => handleAddVariationField(index)}>
                    Add field
                  </button>
                </div>
                {(!variation.requestFields || variation.requestFields.length === 0) && (
                  <div style={styles.sectionHelp}>No fields detected; add mappings to control requirements.</div>
                )}
                {Array.isArray(variation.requestFields)
                  ? variation.requestFields.map((field, fieldIndex) => (
                    <div key={`variation-${index}-field-${fieldIndex}`} style={styles.variationFieldRow}>
                      <input
                        type="text"
                        value={field.field || ''}
                        onChange={(e) => handleVariationRequestFieldChange(index, fieldIndex, { field: e.target.value })}
                        style={styles.input}
                        placeholder="field.path"
                      />
                      <label style={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={field.required !== false}
                          onChange={(e) =>
                            handleVariationRequestFieldChange(index, fieldIndex, { required: e.target.checked })
                          }
                        />
                        <span>Required</span>
                      </label>
                      <input
                        type="text"
                        value={field.description || ''}
                        onChange={(e) =>
                          handleVariationRequestFieldChange(index, fieldIndex, { description: e.target.value })
                        }
                        style={styles.input}
                        placeholder="Description (optional)"
                      />
                      <button
                        type="button"
                        style={styles.smallDangerButton}
                        onClick={() => handleRemoveVariationField(index, fieldIndex)}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                  : null}
              </div>
            </div>
          ))}
        </div>
        <label style={styles.labelFull}>
          Pre-request script
          <textarea
            value={formState.preRequestScript}
            onChange={(e) => handleChange('preRequestScript', e.target.value)}
            style={styles.textarea}
            rows={4}
            placeholder="Captured from Postman collection events"
          />
        </label>
        <label style={styles.labelFull}>
          Test script
          <textarea
            value={formState.testScript}
            onChange={(e) => handleChange('testScript', e.target.value)}
            style={styles.textarea}
            rows={4}
            placeholder="Postman test scripts preserved for reference"
          />
        </label>
        <label style={styles.labelFull}>
          Field descriptions (JSON object)
          <textarea
            value={formState.fieldDescriptionsText}
            onChange={(e) => handleChange('fieldDescriptionsText', e.target.value)}
            style={styles.textarea}
            rows={8}
          />
        </label>
        <label style={styles.labelFull}>
          Request field hints (JSON array)
          <textarea
            value={formState.requestFieldsText}
            onChange={(e) => handleChange('requestFieldsText', e.target.value)}
            style={styles.textarea}
            rows={6}
            placeholder={"[\n  { \"field\": \"totalAmount\", \"required\": true, \"description\": \"Total amount including tax.\" }\n]"}
          />
        </label>
        <label style={styles.labelFull}>
          Response field hints (JSON array)
          <textarea
            value={formState.responseFieldsText}
            onChange={(e) => handleChange('responseFieldsText', e.target.value)}
            style={styles.textarea}
            rows={6}
            placeholder={"[\n  { \"field\": \"receipts[].lottery\", \"description\": \"Lottery number generated by POSAPI.\" }\n]"}
          />
        </label>
        <div style={styles.hintGrid}>
          <div style={styles.hintCard}>
            <div style={styles.hintHeader}>
              <h3 style={styles.hintTitle}>Request fields</h3>
              {requestFieldDisplay.state === 'ok' && (
                <span style={styles.hintCount}>{requestFieldDisplay.items.length} fields</span>
              )}
            </div>
            {requestFieldDisplay.state === 'empty' && (
              <p style={styles.hintEmpty}>
                Add request field hints in the JSON textarea above. Query and path parameters are listed automatically.
              </p>
            )}
            {requestFieldDisplay.state === 'error' && (
              <div style={styles.hintError}>{requestFieldDisplay.error}</div>
            )}
            {requestFieldDisplay.state === 'ok' && (
              <div style={styles.requestFieldTableWrapper}>
                <div style={styles.requestFieldTable}>
                  <div
                    style={{
                      ...styles.requestFieldHeaderRow,
                      display: 'grid',
                      gridTemplateColumns: requestFieldColumnTemplate,
                    }}
                  >
                    <span style={styles.requestFieldHeaderCell}>Field</span>
                    <span style={styles.requestFieldHeaderCell}>Description</span>
                    <span style={styles.requestFieldHeaderCell}>Common required</span>
                    {variationColumns.map((variation) => (
                      <span
                        key={`variation-head-${variation.key}`}
                        style={{ ...styles.requestFieldHeaderCell, display: 'flex', gap: '0.35rem', alignItems: 'center' }}
                      >
                        <span>{variation.label}</span>
                        {variation.type === 'combination' && (
                          <span style={{ ...styles.hintBadge, background: '#eef2ff', color: '#3730a3' }}>
                            Combination
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                  {requestFieldDisplay.items.map((hint, index) => {
                    const normalized = normalizeHintEntry(hint);
                    const fieldLabel = normalized.field || '(unnamed field)';
                    const meta = requestFieldMeta[fieldLabel] || {};
                    const commonRequired =
                      typeof meta.requiredCommon === 'boolean'
                        ? meta.requiredCommon
                        : typeof normalized.requiredCommon === 'boolean'
                          ? normalized.requiredCommon
                          : Boolean(normalized.required);
                    const descriptionValue = meta.description || normalized.description || '';
                    return (
                      <div
                        key={`request-hint-${fieldLabel}-${index}`}
                        style={{
                          ...styles.requestFieldRow,
                          display: 'grid',
                          gridTemplateColumns: requestFieldColumnTemplate,
                        }}
                      >
                        <div style={styles.requestFieldMainCell}>
                          <div style={styles.hintFieldRow}>
                            <span style={styles.hintField}>{fieldLabel}</span>
                            {hint.source === 'parameter' && (
                              <span style={{ ...styles.hintBadge, background: '#eef2ff', color: '#3730a3' }}>
                                {hint.location === 'path' ? 'Path parameter' : 'Query parameter'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={styles.requestFieldDescriptionCell}>
                          <textarea
                            value={descriptionValue}
                            onChange={(e) => handleRequestFieldDescriptionChange(fieldLabel, e.target.value)}
                            style={{ ...styles.textarea, minHeight: '60px' }}
                            placeholder="Describe the field"
                          />
                        </div>
                        <div style={styles.requestFieldRequiredCell}>
                          <label style={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={commonRequired}
                              onChange={(e) => handleCommonRequiredToggle(fieldLabel, e.target.checked)}
                            />
                            <span>Required</span>
                          </label>
                        </div>
                        {variationColumns.map((variation) => {
                          const variationKey = variation.key;
                          const required = commonRequired
                            ? true
                            : meta.requiredByVariation?.[variationKey]
                              ?? normalized.requiredByVariation?.[variationKey]
                              ?? false;
                          const defaultValue =
                            meta.defaultByVariation?.[variationKey]
                            ?? normalized.defaultByVariation?.[variationKey]
                            ?? '';
                          return (
                            <div
                              key={`variation-toggle-${variationKey}-${fieldLabel}`}
                              style={styles.requestVariationCell}
                            >
                              <label style={styles.checkboxLabel}>
                                <input
                                  type="checkbox"
                                  checked={required}
                                  disabled={commonRequired}
                                  onChange={(e) =>
                                    handleVariationRequirementChange(
                                      fieldLabel,
                                      variationKey,
                                      e.target.checked,
                                    )
                                  }
                                />
                                <span>Required</span>
                              </label>
                              <input
                                type="text"
                                value={defaultValue}
                                onChange={(e) =>
                                  handleVariationDefaultUpdate(fieldLabel, variationKey, e.target.value)
                                }
                                placeholder="Default value"
                                style={styles.input}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div style={styles.hintCard}>
            <div style={styles.hintHeader}>
              <h3 style={styles.hintTitle}>Request values & environment variables</h3>
            </div>
            {requestFieldDisplay.state !== 'ok' && (
              <p style={styles.hintEmpty}>
                Add request fields above to configure literal values or environment variable mappings.
              </p>
            )}
            {requestFieldDisplay.state === 'ok' && visibleRequestFieldItems.length === 0 && (
              <p style={styles.hintEmpty}>No request fields available for the active variations.</p>
            )}
            {requestFieldDisplay.state === 'ok' && visibleRequestFieldItems.length > 0 && (
              <div style={styles.requestValueList}>
                {visibleRequestFieldItems.map((entry, index) => {
                  const normalized = normalizeHintEntry(entry);
                  const fieldPath = normalized.field;
                  const selection = requestFieldValues[fieldPath] || {
                    mode: 'literal',
                    literal: '',
                    envVar: '',
                    applyToBody: entry.source !== 'parameter',
                  };
                  const mode = selection.mode === 'env' ? 'env' : 'literal';
                  const envMode = mode === 'env';
                  const envVarValue = selection.envVar || '';
                  const literalValue = selection.literal || '';
                  const applyToBody = selection.applyToBody !== false;
                  return (
                    <div key={`${fieldPath || 'field'}-${index}`} style={styles.requestValueRow}>
                      <div style={styles.requestValueFieldMeta}>
                        <div style={styles.hintFieldRow}>
                          <span style={styles.hintField}>{fieldPath || '(unnamed field)'}</span>
                          {entry.source === 'parameter' && (
                            <span style={{ ...styles.hintBadge, background: '#eef2ff', color: '#3730a3' }}>
                              {entry.location === 'path' ? 'Path parameter' : 'Query parameter'}
                            </span>
                          )}
                        </div>
                        {normalized.description && (
                          <div style={styles.hintDescription}>{normalized.description}</div>
                        )}
                      </div>
                      <div style={styles.requestFieldModes}>
                        <label style={styles.radioLabel}>
                          <input
                            type="radio"
                            name={`request-value-mode-${index}`}
                            checked={!envMode}
                            onChange={() => handleRequestFieldValueChange(fieldPath, { mode: 'literal' })}
                          />
                          Literal value
                        </label>
                        <label style={styles.radioLabel}>
                          <input
                            type="radio"
                            name={`request-value-mode-${index}`}
                            checked={envMode}
                            onChange={() => handleRequestFieldValueChange(fieldPath, { mode: 'env' })}
                          />
                          Environment variable
                        </label>
                      </div>
                      <div style={styles.requestValueInputs}>
                        <label style={styles.label}>
                          <span>Literal / test value</span>
                          <input
                            type="text"
                            value={literalValue}
                            onChange={(e) =>
                              handleRequestFieldValueChange(fieldPath, { literal: e.target.value })
                            }
                            style={styles.input}
                            placeholder="Sample request value"
                          />
                        </label>
                        <label style={styles.label}>
                          <span>Environment variable</span>
                          <input
                            type="text"
                            list={`env-options-${index}`}
                            value={envVarValue}
                            onChange={(e) =>
                              handleRequestFieldValueChange(fieldPath, { envVar: e.target.value, mode: 'env' })
                            }
                            style={styles.input}
                            placeholder="ENV_VAR_NAME"
                          />
                          <datalist id={`env-options-${index}`}>
                            {envVariableOptions.map((opt) => (
                              <option key={`env-opt-${opt}`} value={opt} />
                            ))}
                          </datalist>
                        </label>
                        <label style={{ ...styles.checkboxLabel, marginTop: '0.35rem' }}>
                          <input
                            type="checkbox"
                            checked={applyToBody}
                            onChange={(e) =>
                              handleRequestFieldValueChange(fieldPath, { applyToBody: e.target.checked })
                            }
                          />
                          <span>Apply to request body</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={styles.hintCard}>
            <div style={styles.hintHeader}>
              <h3 style={styles.hintTitle}>Response fields</h3>
              {responseFieldHints.state === 'ok' && (
                <span style={styles.hintCount}>{responseFieldHints.items.length} fields</span>
              )}
            </div>
            <label style={{ ...styles.labelFull, marginTop: '0.35rem' }}>
              Tables for response mappings
              <select
                multiple
                value={formState.responseTables}
                onChange={handleResponseTableSelection}
                style={{ ...styles.input, minHeight: '120px' }}
                disabled={responseTableOptions.length === 0}
              >
                {responseTableOptions.map((table) => (
                  <option key={`response-table-${table.value}`} value={table.value}>
                    {table.label}
                  </option>
                ))}
              </select>
              <span style={styles.checkboxHint}>
                Select one or more tables to load columns for response field mappings.
              </span>
              {responseTablesUnavailableReason && (
                <div style={styles.hintError}>{responseTablesUnavailableReason}</div>
              )}
              {responseTableSelectionBlockers.length > 0 && (
                <ul style={{ ...styles.hintError, marginTop: '0.2rem' }}>
                  {responseTableSelectionBlockers.map((blocker, index) => (
                    <li key={`response-blocker-${index}`}>{blocker}</li>
                  ))}
                </ul>
              )}
            </label>
            {responseFieldHints.state === 'empty' && (
              <p style={styles.hintEmpty}>Add response field hints in the JSON textarea above.</p>
            )}
            {responseFieldHints.state === 'error' && (
              <div style={styles.hintError}>{responseFieldHints.error}</div>
            )}
            {responseFieldHints.state === 'ok' && responseFieldOptions.length === 0 && (
              <p style={styles.hintEmpty}>Add at least one table to enable field mappings.</p>
            )}
            {responseFieldHints.state === 'ok' && (
              <ul style={styles.hintList}>
                {responseFieldHints.items.map((hint, index) => {
                  const normalized = normalizeHintEntry(hint);
                  const fieldLabel = normalized.field || '(unnamed field)';
                  const mapping = formState.responseFieldMappings?.[fieldLabel];
                  const mappingValue = mapping ? `${mapping.table}.${mapping.column}` : '';
                  const hasCustomMapping = mappingValue
                    && !responseFieldOptions.some((option) => option.value === mappingValue);
                  return (
                    <li key={`response-hint-${fieldLabel}-${index}`} style={styles.hintItem}>
                      <div style={styles.hintFieldRow}>
                        <span style={styles.hintField}>{fieldLabel}</span>
                        {typeof normalized.required === 'boolean' && (
                          <span
                            style={{
                              ...styles.hintBadge,
                              ...(normalized.required
                                ? styles.hintBadgeRequired
                                : styles.hintBadgeOptional),
                            }}
                          >
                          {normalized.required ? 'Required' : 'Optional'}
                          </span>
                        )}
                      </div>
                      {normalized.description && (
                        <p style={styles.hintDescription}>{normalized.description}</p>
                      )}
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <span style={{ color: '#475569', fontSize: '0.9rem' }}>
                          Map to table column
                        </span>
                        <select
                          value={mappingValue}
                          onChange={(e) => handleResponseFieldMappingChange(fieldLabel, e.target.value)}
                          style={styles.input}
                          disabled={formState.responseTables.length === 0}
                        >
                          <option value="">Do not map</option>
                          {responseFieldOptions.map((option) => (
                            <option key={`map-${fieldLabel}-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                          {hasCustomMapping && (
                            <option value={mappingValue}>Current selection: {mappingValue}</option>
                          )}
                        </select>
                        <span style={styles.requestFieldHint}>
                          Uses the tables selected above.
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <label style={styles.labelFull}>
          Top-level mapping hints (JSON array)
          <textarea
            value={formState.topLevelFieldsText}
            onChange={(e) => handleChange('topLevelFieldsText', e.target.value)}
            style={styles.textarea}
            rows={6}
            placeholder='[
  { "field": "totalAmount", "required": true, "description": "Total receipt amount" }
]'
          />
        </label>
        <label style={styles.labelFull}>
          Nested mapping paths (JSON object)
          <textarea
            value={formState.nestedPathsText}
            onChange={(e) => handleChange('nestedPathsText', e.target.value)}
            style={styles.textarea}
            rows={4}
            placeholder='{
  "items": "receipts[].items",
  "payments": "payments"
}'
          />
        </label>
        <div style={styles.inlineFields}>
          {renderUrlField('Default server URL', 'serverUrl', 'https://posapi.tax.gov.mn')}
          {renderUrlField('Staging test server URL', 'testServerUrl', 'https://posapi-test.tax.gov.mn')}
        </div>
        <div style={styles.inlineFields}>
          {renderUrlField('Production server URL', 'productionServerUrl', 'https://posapi.tax.gov.mn')}
          <label style={{ ...styles.label, flex: 1 }}>
            Token endpoint
            <select
              value={formState.authEndpointId}
              onChange={(e) => handleChange('authEndpointId', e.target.value)}
              style={styles.input}
            >
              <option value="">Select an AUTH endpoint…</option>
              {authEndpointOptions.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.name || endpoint.id}
                </option>
              ))}
            </select>
            <span style={styles.fieldHelp}>
              Used by the test harness to fetch a bearer token before calling the endpoint.
            </span>
            <label style={{ ...styles.checkboxLabel, marginTop: '0.35rem' }}>
              <input
                type="checkbox"
                checked={useCachedToken}
                onChange={(e) => setUseCachedToken(e.target.checked)}
              />
              <span title="Reuses the most recent successful token from this session and skips the auth call until it expires.">
                Use last successful token when testing
              </span>
            </label>
            {tokenMeta.lastFetchedAt && (
              <div style={styles.tokenMetaRow}>
                <span style={styles.tokenMetaText}>
                  Last fetched: {new Date(tokenMeta.lastFetchedAt).toLocaleString()}
                  {tokenMeta.expiresAt
                    ? ` • Expires ${new Date(tokenMeta.expiresAt).toLocaleTimeString()}`
                    : ''}
                </span>
                <button type="button" onClick={handleClearSavedToken} style={styles.smallSecondaryButton}>
                  Clear saved token
                </button>
              </div>
            )}
          </label>
          <div style={{ ...styles.label, flex: 1 }}>
            <div style={styles.radioRow}>
              <span>Test environment</span>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="testEnvironment"
                  value="staging"
                  checked={testEnvironment === 'staging'}
                  onChange={(e) => setTestEnvironment(e.target.value)}
                />
                Staging
              </label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="testEnvironment"
                  value="production"
                  checked={testEnvironment === 'production'}
                  onChange={(e) => setTestEnvironment(e.target.value)}
                />
                Production
              </label>
              <label style={{ ...styles.checkboxLabel, marginLeft: 'auto' }}>
                <input
                  type="checkbox"
                  checked={formState.testable}
                  onChange={(e) => handleChange('testable', e.target.checked)}
                />
                Testable endpoint
              </label>
            </div>
              <div style={styles.fieldHelp}>
              Selected URL: {selectedTestUrl || resolvedTestServerUrl || 'Not set'}
              </div>
            </div>
          </div>

        <div style={styles.docFetcher}>
          <label style={{ ...styles.label, flex: 1 }}>
            Documentation URL
            <input
              type="url"
              value={formState.docUrl}
              onChange={(e) => handleChange('docUrl', e.target.value)}
              style={styles.input}
              placeholder="https://developer.itc.gov.mn/docs/..."
            />
          </label>
          <button
            type="button"
            onClick={handleFetchDoc}
            disabled={loading || saving || fetchingDoc}
            style={styles.fetchButton}
          >
            {fetchingDoc ? 'Fetching…' : 'Fetch documentation'}
          </button>
        </div>

        {docExamples.length > 0 && (
          <div style={styles.docSelection}>
            <label style={{ ...styles.label, flex: 1 }}>
              Select JSON block
              <select
                value={selectedDocBlock}
                onChange={(e) => setSelectedDocBlock(e.target.value)}
                style={styles.input}
              >
                {docExamples.map((block) => (
                  <option key={block.label} value={block.label}>
                    {block.label}
                  </option>
                ))}
              </select>
            </label>
            <div style={styles.docButtons}>
              <button type="button" onClick={() => handleApplyDocBlock('request')}>
                Insert into request
              </button>
              <button type="button" onClick={() => handleApplyDocBlock('response')}>
                Insert into response
              </button>
              <button type="button" onClick={() => handleApplyDocBlock('fields')}>
                Replace field descriptions
              </button>
            </div>
            {(docMetadata.method || docMetadata.path || docMetadata.testServerUrl) && (
              <div style={styles.docMetadata}>
                {docMetadata.method && (
                  <span>
                    Method detected: <strong>{docMetadata.method}</strong>
                  </span>
                )}
                {docMetadata.path && (
                  <span>
                    Path detected: <strong>{docMetadata.path}</strong>
                  </span>
                )}
                {docMetadata.testServerUrl && (
                  <span>
                    Test server defaulted to <strong>{docMetadata.testServerUrl}</strong>
                  </span>
                )}
              </div>
            )}
            {docFieldDescriptions && Object.keys(docFieldDescriptions).length > 0 && (
              <div style={styles.docMetadata}>
                Loaded {Object.keys(docFieldDescriptions).length} field descriptions from documentation.
              </div>
            )}
          </div>
        )}

        <div style={styles.hintCard}>
          <div style={styles.hintHeader}>
            <h3 style={styles.hintTitle}>Build combination</h3>
            <span style={styles.hintCount}>{combinationModifierOptions.length}</span>
          </div>
          <p style={styles.hintDescription}>
            Choose a base variation and layer on modifiers. The payload below updates immediately and can be edited before
            testing.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <span style={styles.multiSelectTitle}>Base variation</span>
              <div style={styles.multiSelectOptions}>
                {combinationBaseOptions.length === 0 && <div style={styles.sectionHelp}>No variations available yet.</div>}
                {combinationBaseOptions.map((variation) => (
                  <label key={`combo-base-${variation.key}`} style={styles.multiSelectOption}>
                    <input
                      type="radio"
                      name="combination-base"
                      checked={combinationBaseKey === variation.key}
                      onChange={() => setCombinationBaseKey(variation.key)}
                    />
                    <span>{variation.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '320px' }}>
              <span style={styles.multiSelectTitle}>Modifiers</span>
              <span style={styles.multiSelectHint}>Stack multiple modifiers to build a composite example.</span>
              <div style={styles.multiSelectOptions}>
                {combinationModifierOptions
                  .filter((option) => option.key !== combinationBaseKey)
                  .map((option) => (
                    <label key={`combo-mod-${option.key}`} style={styles.multiSelectOption}>
                      <input
                        type="checkbox"
                        checked={combinationModifierKeys.includes(option.key)}
                        onChange={() => toggleCombinationModifier(option.key)}
                      />
                      <span>
                        {option.label}
                        {option.type === 'combination' ? ' (example)' : ''}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          </div>
          <textarea
            value={combinationPayloadText}
            onChange={(e) => {
              setCombinationPayloadText(e.target.value);
              setCombinationError('');
            }}
            style={{ ...styles.textarea, marginTop: '0.75rem' }}
            rows={8}
            placeholder="Built combination payload will appear here"
          />
          {combinationError && <div style={styles.inputError}>{combinationError}</div>}
          <div style={styles.inlineActionRow}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={styles.checkboxHint}>Use the payload above directly without saving a new variation.</span>
            </div>
            <button
              type="button"
              onClick={handleTestCombination}
              disabled={loading || saving || fetchingDoc || testState.running || !combinationPayloadText.trim()}
              style={styles.testButton}
            >
              Test built combination
            </button>
          </div>
        </div>

        {variationColumns.length > 0 && (
          <div style={styles.docSelection}>
            <label style={{ ...styles.label, flex: 1 }}>
              Select variation for testing
              <select
                value={selectedVariationKey}
                onChange={(e) => setSelectedVariationKey(e.target.value)}
                style={styles.input}
              >
                <option value="">Manual request data</option>
                {variationColumns.map((variation) => (
                  <option key={`test-variation-${variation.key}`} value={variation.key}>
                    {variation.label} {variation.type === 'combination' ? '(combination)' : ''}
                  </option>
                ))}
              </select>
              <span style={styles.checkboxHint}>
                Applying a variation builds the request JSON using its saved defaults.
              </span>
            </label>
          </div>
        )}

        <label style={styles.labelFull}>
          Request sample for testing (JSON)
          <span style={styles.fieldHelp}>
            The Test endpoint button uses this payload. Selecting a variation loads its example here without changing the base
            request.
          </span>
          <textarea
            value={requestSampleText}
            onChange={(e) => setRequestSampleText(e.target.value)}
            style={styles.textarea}
            rows={8}
            placeholder="Request payload sent when testing the endpoint"
          />
        </label>

        <div style={styles.actions}>
            <button
              type="button"
              onClick={() => handleTest()}
              disabled={
                loading ||
                saving ||
                fetchingDoc ||
                testState.running ||
              !formState.testable ||
              !hasTestServerUrl
            }
            style={styles.testButton}
          >
            {testState.running ? 'Testing…' : 'Test endpoint'}
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={handleSave} disabled={loading || saving || fetchingDoc}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || saving || fetchingDoc || (!selectedId && !formState.id)}
            style={styles.deleteButton}
          >
            Delete
          </button>
        </div>

        {testState.error && <div style={styles.testError}>{testState.error}</div>}

        {testState.result && (
          <div style={styles.testResult}>
            <div style={styles.testResultHeader}>
              <h3 style={{ margin: 0 }}>Test result</h3>
              <span
                style={{
                  ...styles.statusPill,
                  ...(testState.result.response.ok
                    ? styles.statusPillSuccess
                    : styles.statusPillError),
                }}
              >
                {testState.result.response.ok ? 'Success' : 'Failed'} —{' '}
                {testState.result.response.status} {testState.result.response.statusText}
              </span>
            </div>
            <div style={styles.testResultBody}>
              <div style={styles.testColumn}>
                <h4 style={styles.testColumnTitle}>Request</h4>
                <div style={styles.metaList}>
                  <div style={styles.metaRow}>
                    <span style={styles.metaKey}>Method</span>
                    <span>{testState.result.request.method}</span>
                  </div>
                  <div style={styles.metaRow}>
                    <span style={styles.metaKey}>URL</span>
                    <span style={styles.wrapText}>{testState.result.request.url}</span>
                  </div>
                </div>
                {testState.result.request.body && (
                  <>
                    <h5 style={styles.subheading}>Body</h5>
                    <pre style={styles.codeBlock}>
                      {JSON.stringify(testState.result.request.body, null, 2)}
                    </pre>
                  </>
                )}
              </div>
              <div style={styles.testColumn}>
                <h4 style={styles.testColumnTitle}>Response</h4>
                {testState.result.response.bodyJson ? (
                  <pre style={styles.codeBlock}>
                    {JSON.stringify(testState.result.response.bodyJson, null, 2)}
                  </pre>
                ) : (
                  <pre style={styles.codeBlock}>{testState.result.response.bodyText}</pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
        </div>
      )}

      {activeTab === 'admin' && (
        <div style={styles.infoContainer}>
          <h1>Admin &amp; lookup utilities</h1>
          <p style={{ maxWidth: '760px' }}>
            Manage non-transactional POSAPI endpoints, supply parameters, and test responses directly
            from the admin console. Use this workspace to implement lookup-like functions and admin
            utilities without modifying transaction flows.
          </p>
          {adminEndpoints.length === 0 && (
            <div style={styles.warningBox}>
              No admin or lookup endpoints are configured yet. Switch to the <strong>Endpoints</strong>
              {' '}tab to add endpoints with usage set to Admin utility or Information lookup.
            </div>
          )}
          {adminEndpoints.length > 0 && (
            <div style={styles.adminGrid}>
              <div style={styles.adminSidebarCard}>
                <div style={styles.adminSidebarHeader}>
                  <h3 style={{ margin: 0 }}>Dynamic menu</h3>
                  <span style={styles.listGroupCount}>{adminEndpoints.length}</span>
                </div>
                <p style={styles.helpText}>
                  Choose a configured endpoint to preview its details and run a live call with
                  custom parameters.
                </p>
                <div style={styles.adminList}>
                  {adminEndpoints.map((endpoint) => (
                    <button
                      key={`admin-${endpoint.id}`}
                      type="button"
                      onClick={() => setAdminSelectionId(endpoint.id)}
                      style={{
                        ...styles.adminListButton,
                        ...(activeAdminEndpoint?.id === endpoint.id ? styles.listButtonActive : {}),
                      }}
                    >
                      <div style={styles.adminListTitle}>{endpoint.name || endpoint.id}</div>
                      <div style={styles.adminListMeta}>
                        <span style={{ ...badgeStyle(METHOD_BADGES[endpoint.method] || '#94a3b8') }}>
                          {endpoint.method}
                        </span>
                        <span style={{ ...badgeStyle(USAGE_BADGES[endpoint.usage] || '#0ea5e9'), textTransform: 'none' }}>
                          {formatUsageLabel(endpoint.usage)}
                        </span>
                        {endpoint.posApiType && (
                          <span style={{ ...badgeStyle(TYPE_BADGES[endpoint.posApiType] || '#475569'), textTransform: 'none' }}>
                            {formatTypeLabel(endpoint.posApiType) || endpoint.posApiType}
                          </span>
                        )}
                      </div>
                      <div style={styles.adminListPath}>{endpoint.path}</div>
                      {endpoint.summary && (
                        <div style={styles.previewText}>{endpoint.summary}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div style={styles.adminContentCard}>
                <div style={styles.adminContentHeader}>
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem 0' }}>{activeAdminEndpoint?.name || activeAdminEndpoint?.id}</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ ...badgeStyle(METHOD_BADGES[activeAdminEndpoint?.method] || '#94a3b8') }}>
                        {activeAdminEndpoint?.method}
                      </span>
                      <span style={styles.wrapText}>{activeAdminEndpoint?.path}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!activeAdminEndpoint) return;
                        setSelectedId(activeAdminEndpoint.id);
                        setFormState(createFormState(activeAdminEndpoint));
                        setActiveTab('endpoints');
                      }}
                      style={styles.smallButton}
                    >
                      Edit in registry
                    </button>
                  </div>
                </div>
                {adminError && <div style={styles.error}>{adminError}</div>}
                <div style={styles.inlineFields}>
                  <label style={{ ...styles.label, flex: 1 }}>
                    Auth/token endpoint (optional)
                    <select
                      value={adminAuthEndpointId}
                      onChange={(e) => setAdminAuthEndpointId(e.target.value)}
                      style={styles.input}
                    >
                      <option value="">Call without requesting token</option>
                      {authEndpointOptions.map((endpoint) => (
                        <option key={`admin-auth-${endpoint.id}`} value={endpoint.id}>
                          {endpoint.name} ({endpoint.path})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ ...styles.checkboxLabel, alignSelf: 'flex-end' }}>
                    <input
                      type="checkbox"
                      checked={adminUseCachedToken}
                      onChange={(e) => setAdminUseCachedToken(e.target.checked)}
                    />
                    Re-use cached token when possible
                  </label>
                </div>
                <div style={styles.inlineFields}>
                  <label style={{ ...styles.label, flex: 1 }}>
                    Environment
                    <div style={styles.radioGroup}>
                      <label style={styles.radioLabel}>
                        <input
                          type="radio"
                          name="adminTestEnv"
                          checked={testEnvironment === 'staging'}
                          onChange={() => setTestEnvironment('staging')}
                        />
                        Staging / test server
                      </label>
                      <label style={styles.radioLabel}>
                        <input
                          type="radio"
                          name="adminTestEnv"
                          checked={testEnvironment === 'production'}
                          onChange={() => setTestEnvironment('production')}
                        />
                        Production
                      </label>
                    </div>
                  </label>
                </div>
                <div style={styles.adminParameterGrid}>
                  {Object.entries(groupParametersByLocation(activeAdminEndpoint?.parameters || []))
                    .map(([location, params]) => (
                      <div key={`param-${location}`} style={styles.adminParameterColumn}>
                        <h4 style={{ margin: '0 0 0.25rem 0' }}>
                          {location.charAt(0).toUpperCase() + location.slice(1)} parameters
                        </h4>
                        {params.length === 0 && (
                          <p style={styles.helpText}>No {location} parameters declared.</p>
                        )}
                        {params.map((param) => (
                          <label key={`param-${location}-${param.name}`} style={styles.label}>
                            {param.name}
                            <input
                              type="text"
                              value={adminParamValues?.[param.name] ?? adminParameterDefaults[param.name] ?? ''}
                              onChange={(e) => handleAdminParamChange(param.name, e.target.value)}
                              placeholder={param.example || param.description || 'Value'}
                              style={styles.input}
                            />
                            {param.description && <span style={styles.fieldHelp}>{param.description}</span>}
                          </label>
                        ))}
                      </div>
                    ))}
                </div>
                <label style={styles.label}>
                  Request body (optional)
                  <textarea
                    style={{ ...styles.textarea, minHeight: '140px' }}
                    placeholder="Provide JSON payload when the endpoint expects a request body"
                    value={adminRequestBody}
                    onChange={(e) => setAdminRequestBody(e.target.value)}
                  />
                </label>
                <div style={styles.inlineFields}>
                  <button
                    type="button"
                    onClick={handleRunAdminEndpoint}
                    style={styles.primaryButton}
                    disabled={adminRunning}
                  >
                    {adminRunning ? 'Running…' : 'Run endpoint'}
                  </button>
                  <div style={styles.helpText}>
                    Calls use the latest server URL and parameters for the selected endpoint. Responses
                    and errors are logged below for auditing.
                  </div>
                </div>
                {adminResult && (
                  <div style={styles.testResult}>
                    <div style={styles.testResultHeader}>
                      <h3 style={{ margin: 0 }}>Result</h3>
                      <span
                        style={{
                          ...styles.statusPill,
                          ...(adminResult.response?.ok ? styles.statusPillSuccess : styles.statusPillError),
                        }}
                      >
                        {adminResult.response?.status} {adminResult.response?.statusText || ''}
                      </span>
                    </div>
                    <div style={styles.testResultBody}>
                      <div style={styles.testColumn}>
                        <h4 style={styles.testColumnTitle}>Request</h4>
                        <pre style={styles.codeBlock}>
                          {JSON.stringify(adminResult.request || {}, null, 2)}
                        </pre>
                      </div>
                      <div style={styles.testColumn}>
                        <h4 style={styles.testColumnTitle}>Response</h4>
                        {adminResult.response?.bodyJson ? (
                          <pre style={styles.codeBlock}>
                            {JSON.stringify(adminResult.response.bodyJson, null, 2)}
                          </pre>
                        ) : (
                          <pre style={styles.codeBlock}>{adminResult.response?.bodyText || ''}</pre>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div style={styles.adminHistoryCard}>
                <div style={styles.adminSidebarHeader}>
                  <h3 style={{ margin: 0 }}>Activity log</h3>
                  <span style={styles.listGroupCount}>{adminHistory.length}</span>
                </div>
                <p style={styles.helpText}>
                  Tracks recent admin endpoint executions, including parameters and status codes.
                </p>
                {adminHistory.length === 0 && <p style={{ margin: 0 }}>No activity yet.</p>}
                {adminHistory.length > 0 && (
                  <div style={styles.historyList}>
                    {adminHistory.map((entry) => (
                      <div key={`${entry.endpointId}-${entry.timestamp}`} style={styles.historyRow}>
                        <div style={styles.historyMain}>
                          <div style={{ fontWeight: 700 }}>
                            {entry.method} {entry.path}
                          </div>
                          <div style={styles.historyMeta}>
                            <span>{new Date(entry.timestamp).toLocaleString()}</span>
                            <span>{entry.environment}</span>
                            {entry.url && <span style={styles.wrapText}>{entry.url}</span>}
                          </div>
                          {entry.parameters && Object.keys(entry.parameters).length > 0 && (
                            <pre style={styles.historyParams}>
                              {JSON.stringify(entry.parameters, null, 2)}
                            </pre>
                          )}
                          {entry.error && <div style={styles.previewErrorBox}>{entry.error}</div>}
                        </div>
                        <div style={styles.historyStatus}>
                          <span
                            style={{
                              ...styles.statusPill,
                              ...(entry.ok ? styles.statusPillSuccess : styles.statusPillError),
                            }}
                          >
                            {entry.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'info' && (
        <div style={styles.infoContainer}>
          <h1>POSAPI Information</h1>
          <p style={{ maxWidth: '760px' }}>
            Configure automated synchronization of POSAPI reference data and manually refresh or
            upload static CSV lists such as classification and VAT exemption reasons.
          </p>
          {loadError && <div style={styles.error}>{loadError}</div>}
          {infoSyncError && <div style={styles.error}>{infoSyncError}</div>}
          {infoSyncStatus && <div style={styles.status}>{infoSyncStatus}</div>}
          <div style={styles.infoGrid}>
            <div style={styles.infoCard}>
              <h3 style={{ marginTop: 0 }}>Automation</h3>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={infoSyncSettings.autoSyncEnabled}
                  onChange={(e) => updateInfoSetting('autoSyncEnabled', e.target.checked)}
                />
                Synchronize reference codes automatically
              </label>
              <p style={styles.helpText}>
                Automatic syncs run on the server according to the saved schedule even when no admin
                users are online. The log table below updates whenever the tab is open or after a
                manual refresh completes.
              </p>
              <label style={{ ...styles.label, maxWidth: '260px' }}>
                Repeat every (minutes)
                <input
                  type="number"
                  min={5}
                  value={infoSyncSettings.intervalMinutes}
                  onChange={(e) => updateInfoSetting('intervalMinutes', Number(e.target.value))}
                  style={styles.input}
                />
              </label>
            </div>
            <div style={styles.infoCard}>
              <h3 style={{ marginTop: 0 }}>Manual refresh</h3>
              <p>Trigger the POSAPI lookup job and update reference codes immediately.</p>
              <p style={styles.helpText}>
                Reference data writes use the tables configured in each endpoint's response field mappings.
              </p>
              <div style={styles.inlineFields}>
                <label style={{ ...styles.label, flex: 1 }}>
                  Usage
                  <select
                    value={infoSyncUsage}
                    onChange={(e) => {
                      setInfoSyncUsage(e.target.value);
                      updateInfoSetting('usage', e.target.value);
                    }}
                    style={styles.input}
                    disabled={loading}
                  >
                    <option value="all">All usages</option>
                    {USAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ ...styles.label, flex: 1 }}>
                  Endpoints to sync
                  <select
                    multiple
                    value={infoSyncEndpointIds}
                    onChange={handleInfoEndpointSelection}
                    style={{ ...styles.input, minHeight: '140px' }}
                    disabled={infoSyncLoading || loading}
                  >
                    {infoSyncEndpointOptions.map((endpoint) => (
                      <option key={endpoint.id} value={endpoint.id}>
                        {endpoint.name} – {endpoint.method} {endpoint.path} ({formatUsageLabel(endpoint.usage)})
                      </option>
                    ))}
                  </select>
                  <span style={styles.checkboxHint}>
                    Leave empty to include all endpoints in the selected usage.
                  </span>
                  {infoSyncEndpointUnavailableReason && (
                    <div style={styles.hintError}>{infoSyncEndpointUnavailableReason}</div>
                  )}
                  {infoSyncSelectionBlockers.length > 0 && (
                    <ul style={{ ...styles.hintError, marginTop: '0.2rem' }}>
                      {infoSyncSelectionBlockers.map((blocker, index) => (
                        <li key={`info-blocker-${index}`}>{blocker}</li>
                      ))}
                    </ul>
                  )}
                  </label>
              </div>
              <button
                type="button"
                onClick={handleManualSync}
                style={styles.refreshButton}
                disabled={infoSyncLoading}
              >
                {infoSyncLoading ? 'Refreshing…' : 'Refresh reference codes'}
              </button>
              {infoSyncLogs[0] && (
                <div style={styles.infoMeta}>
                  <div>Last sync: {new Date(infoSyncLogs[0].timestamp).toLocaleString()}</div>
                  <div>
                    Added {infoSyncLogs[0].added || 0}, updated {infoSyncLogs[0].updated || 0},
                    deactivated {infoSyncLogs[0].deactivated || 0}
                  </div>
                </div>
              )}
            </div>
            <div style={styles.infoCard}>
              <h3 style={{ marginTop: 0 }}>Upload static lists (CSV or Excel)</h3>
              <p>
                Select the code type and upload a CSV or Excel (.xlsx) file with columns
                <code>code,name</code>.
              </p>
              <div style={styles.inlineFields}>
                <label style={{ ...styles.label, flex: 1 }}>
                  Code type
                  <select
                    value={infoUploadCodeType}
                    onChange={(e) => setInfoUploadCodeType(e.target.value)}
                    style={styles.input}
                  >
                    <option value="classification">Product classification</option>
                    <option value="tax_reason">VAT exemption reason</option>
                    <option value="district">District</option>
                    <option value="barcode_type">Barcode type</option>
                    <option value="payment_code">Payment code</option>
                  </select>
                </label>
                <label style={{ ...styles.label, flex: 1 }}>
                  CSV or Excel file
                  <input
                    type="file"
                    accept=".csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
                    onChange={handleStaticUpload}
                    style={styles.input}
                  />
                </label>
              </div>
            </div>
          </div>
          <div style={styles.infoActions}>
            <button type="button" style={styles.saveButton} onClick={saveInfoSettings} disabled={infoSyncLoading}>
              {infoSyncLoading ? 'Saving…' : 'Save synchronization settings'}
            </button>
          </div>
          <div style={styles.logsCard}>
            <h3 style={{ marginTop: 0 }}>Synchronization log</h3>
            {infoSyncLogs.length === 0 && <p style={{ margin: 0 }}>No sync history yet.</p>}
            {infoSyncLogs.length > 0 && (
              <table style={styles.logTable}>
                <thead>
                  <tr>
                    <th style={styles.logHeaderCell}>Date</th>
                    <th style={styles.logHeaderCell}>Duration (ms)</th>
                    <th style={styles.logHeaderCell}>Added</th>
                    <th style={styles.logHeaderCell}>Updated</th>
                    <th style={styles.logHeaderCell}>Inactive</th>
                    <th style={styles.logHeaderCell}>Trigger</th>
                    <th style={{ ...styles.logHeaderCell, width: '32%' }}>Result</th>
                    <th style={{ ...styles.logHeaderCell, width: '28%' }}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {infoSyncLogs.map((log, index) => (
                    <tr key={`${log.timestamp}-${index}`}>
                      <td style={styles.logCell}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={styles.logCell}>{log.durationMs || 0}</td>
                      <td style={styles.logCell}>{log.added || 0}</td>
                      <td style={styles.logCell}>{log.updated || 0}</td>
                      <td style={styles.logCell}>{log.deactivated || 0}</td>
                      <td style={styles.logCell}>{log.trigger || 'manual'}</td>
                      <td style={{ ...styles.logCell, ...styles.logResultCell }}>{formatSyncResult(log)}</td>
                      <td style={{ ...styles.logCell, ...styles.logErrorCell }}>{formatSyncErrors(log)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  tabRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  tabButton: {
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    border: '1px solid #cbd5f5',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  tabButtonActive: {
    background: '#1d4ed8',
    color: '#fff',
    borderColor: '#1d4ed8',
  },
  container: {
    display: 'flex',
    gap: '1.5rem',
    width: '100%',
    alignItems: 'flex-start',
  },
  infoContainer: {
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '1.5rem',
    background: '#fff',
  },
  infoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginTop: '1rem',
    marginBottom: '1rem',
  },
  infoCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '1rem',
    background: '#f8fafc',
  },
  refreshButton: {
    background: '#0ea5e9',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '0.6rem 1rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
  saveButton: {
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '0.6rem 1rem',
    cursor: 'pointer',
    fontWeight: 600,
    marginTop: '0.75rem',
  },
  infoActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '1rem',
  },
  infoMeta: {
    marginTop: '0.5rem',
    fontSize: '0.9rem',
    color: '#334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  helpText: {
    margin: '0.5rem 0 0.75rem',
    fontSize: '0.9rem',
    color: '#475569',
  },
  logsCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '1rem',
    background: '#fff',
  },
  logTable: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
  },
  logHeaderCell: {
    textAlign: 'left',
    padding: '0.5rem',
    borderBottom: '1px solid #e2e8f0',
    color: '#0f172a',
    fontWeight: 700,
  },
  logCell: {
    padding: '0.5rem',
    borderBottom: '1px solid #e2e8f0',
    verticalAlign: 'top',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  logResultCell: {
    color: '#0f172a',
    fontWeight: 500,
  },
  logErrorCell: {
    color: '#b91c1c',
  },
  sidebar: {
    width: '280px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '1rem',
    maxHeight: 'calc(100vh - 140px)',
    overflowY: 'auto',
  },
  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  filterBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  filterLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    fontWeight: 600,
    fontSize: '0.85rem',
    color: '#334155',
  },
  filterSelect: {
    padding: '0.4rem',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontSize: '0.9rem',
  },
  filterHint: {
    fontSize: '0.8rem',
    color: '#64748b',
    marginBottom: '0.3rem',
  },
  newButton: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.25rem 0.75rem',
    cursor: 'pointer',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  listGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #e2e8f0',
  },
  listGroupHeader: {
    fontWeight: 700,
    fontSize: '0.95rem',
    color: '#1e293b',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  listGroupCount: {
    fontSize: '0.75rem',
    color: '#64748b',
    background: '#e2e8f0',
    borderRadius: '999px',
    padding: '0.1rem 0.5rem',
  },
  listGroupList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  listButton: {
    width: '100%',
    textAlign: 'left',
    border: '1px solid transparent',
    background: '#fff',
    borderRadius: '6px',
    padding: '0.5rem',
    cursor: 'pointer',
    userSelect: 'none',
  },
  listButtonActive: {
    borderColor: '#2563eb',
    background: '#dbeafe',
    color: '#2563eb',
  },
  listButtonHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.5rem',
    alignItems: 'flex-start',
  },
  listButtonTitle: {
    fontWeight: 600,
    fontSize: '0.95rem',
    color: '#0f172a',
  },
  badgeStack: {
    display: 'flex',
    gap: '0.25rem',
    flexWrap: 'wrap',
  },
  listButtonSubtle: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginTop: '0.25rem',
  },
  listButtonCategory: {
    fontSize: '0.75rem',
    color: '#0f172a',
    marginTop: '0.15rem',
  },
  listMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    marginTop: '0.35rem',
  },
  listMetaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '0.7rem',
    color: '#475569',
  },
  listMetaLabel: {
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  previewText: {
    marginTop: '0.25rem',
    color: '#475569',
    fontSize: '0.75rem',
    lineHeight: 1.3,
  },
  notesText: {
    marginTop: '0.35rem',
    fontSize: '0.75rem',
    color: '#0f172a',
    fontStyle: 'italic',
  },
  formContainer: {
    flex: 1,
    width: '100%',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '1.5rem',
    maxWidth: '100%',
    position: 'relative',
    overflow: 'visible',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '1rem 1.5rem',
    marginTop: '1rem',
  },
  builderSection: {
    marginTop: '1.5rem',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    background: '#f8fafc',
    padding: '1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1.15rem',
  },
  sectionBadge: {
    background: '#2563eb',
    color: '#fff',
    borderRadius: '999px',
    padding: '0.25rem 0.75rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  sectionHelp: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#475569',
  },
  inlineList: {
    listStyle: 'none',
    margin: '0.75rem 0',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  inlineListItem: {
    fontSize: '0.85rem',
    color: '#1f2937',
  },
  importUploadRow: {
    display: 'grid',
    gridTemplateColumns: '220px 1fr',
    gap: '1rem',
    alignItems: 'start',
    marginTop: '0.5rem',
  },
  importTextColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  importTextArea: {
    width: '100%',
    borderRadius: '6px',
    border: '1px solid #cbd5f5',
    padding: '0.75rem',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  importGrid: {
    display: 'grid',
    gridTemplateColumns: '260px 1fr',
    gap: '1rem',
    marginTop: '1rem',
  },
  importDraftList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  importDraftButton: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.75rem',
    background: '#fff',
    textAlign: 'left',
    cursor: 'pointer',
  },
  importDraftButtonActive: {
    borderColor: '#2563eb',
    boxShadow: '0 0 0 2px rgba(37,99,235,0.15)',
  },
  importDraftTitle: {
    fontWeight: 700,
    marginBottom: '0.25rem',
  },
  importDraftPath: {
    fontSize: '0.85rem',
    color: '#334155',
    wordBreak: 'break-all',
  },
  importDraftSummary: {
    fontSize: '0.85rem',
    color: '#475569',
    marginTop: '0.25rem',
  },
  importDraftPanel: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '1rem',
    background: '#f8fafc',
  },
  importDraftHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  importDraftHeading: {
    fontSize: '1.1rem',
    margin: 0,
  },
  importFieldRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  importParamsHeader: {
    fontWeight: 700,
    color: '#0f172a',
  },
  importParamGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '0.75rem',
  },
  paramMeta: {
    fontSize: '0.8rem',
    color: '#475569',
  },
  importActionsRow: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
    marginTop: '0.5rem',
  },
  importResultBox: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.75rem',
    marginTop: '0.5rem',
  },
  importResultTitle: {
    fontWeight: 700,
    marginBottom: '0.25rem',
  },
  sampleFileLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#e0f2fe',
    color: '#0f172a',
    borderRadius: '4px',
    padding: '0.3rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  sampleFileInput: {
    display: 'none',
  },
  capabilitiesBox: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    background: '#f8fafc',
    marginTop: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  capabilitiesRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.85rem',
    color: '#1e293b',
  },
  capabilitiesLabel: {
    fontWeight: 600,
  },
  detailSection: {
    border: '1px solid #cbd5f5',
    borderRadius: '6px',
    background: '#fff',
    overflow: 'hidden',
  },
  detailSummary: {
    margin: 0,
    padding: '0.75rem 1rem',
    cursor: 'pointer',
    background: '#e0f2fe',
    fontWeight: 600,
    listStyle: 'none',
  },
  detailBody: {
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    fontWeight: 600,
    gap: '0.5rem',
  },
  builderGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '0.75rem 1rem',
  },
  builderLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
    fontWeight: 600,
    fontSize: '0.85rem',
  },
  labelFull: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    fontWeight: 600,
    gap: '0.5rem',
  },
  multiSelectTitle: {
    fontWeight: 700,
    fontSize: '0.95rem',
    color: '#0f172a',
  },
  multiSelectHint: {
    fontWeight: 400,
    fontSize: '0.8rem',
    color: '#475569',
  },
  multiSelectOptions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  multiSelectOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontWeight: 500,
    fontSize: '0.85rem',
  },
  featureToggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  toggleStateBadge: {
    fontSize: '0.75rem',
    color: '#0f172a',
    background: '#e2e8f0',
    borderRadius: '999px',
    padding: '0.15rem 0.75rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  toggleStateHelper: {
    fontSize: '0.85rem',
    color: '#475569',
    background: '#f8fafc',
    border: '1px dashed #e2e8f0',
    padding: '0.6rem 0.75rem',
    borderRadius: '6px',
  },
  templateList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginTop: '0.5rem',
  },
  templateBox: {
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '0.75rem',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  templateHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.9rem',
  },
  templateTextarea: {
    width: '100%',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    padding: '0.5rem',
    minHeight: '120px',
  },
  templatePill: {
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    background: '#e0e7ff',
    color: '#312e81',
    borderRadius: '999px',
    padding: '0.1rem 0.5rem',
  },
  templateRemoveButton: {
    border: 'none',
    background: '#fee2e2',
    color: '#b91c1c',
    borderRadius: '4px',
    padding: '0.2rem 0.5rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  multiSelectImport: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    marginTop: '0.75rem',
  },
  input: {
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontSize: '0.95rem',
  },
  inlineTextarea: {
    minHeight: '90px',
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    lineHeight: 1.4,
  },
  textarea: {
    minHeight: '140px',
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    lineHeight: 1.4,
  },
  inlineActionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  applyButton: {
    background: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.4rem 0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  inlineActionHint: {
    fontSize: '0.8rem',
    color: '#475569',
  },
  inputError: {
    fontSize: '0.8rem',
    color: '#b91c1c',
  },
  multiNotice: {
    marginTop: '1rem',
    background: '#fef3c7',
    border: '1px solid #fcd34d',
    color: '#92400e',
    borderRadius: '6px',
    padding: '0.75rem 1rem',
    fontSize: '0.9rem',
    lineHeight: 1.5,
  },
  serviceOnlyHint: {
    background: '#f1f5f9',
    border: '1px dashed #cbd5f5',
    borderRadius: '6px',
    padding: '0.75rem 1rem',
    color: '#334155',
    fontSize: '0.9rem',
  },
  hintGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginTop: '0.75rem',
  },
  hintCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '1rem',
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  hintHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  hintTitle: {
    margin: 0,
    fontSize: '1rem',
  },
  hintCount: {
    fontSize: '0.75rem',
    color: '#0f172a',
    background: '#dbeafe',
    borderRadius: '999px',
    padding: '0.2rem 0.6rem',
    fontWeight: 600,
  },
  requestFieldControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  requestFieldTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  requestFieldTableWrapper: {
    overflowX: 'auto',
    paddingBottom: '0.5rem',
  },
  requestFieldHeaderRow: {
    display: 'grid',
    alignItems: 'center',
    gap: '0.75rem',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '0.35rem',
  },
  requestFieldHeaderCell: {
    fontWeight: 700,
    color: '#0f172a',
    fontSize: '0.9rem',
  },
  requestFieldRow: {
    display: 'grid',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.75rem 0',
    borderBottom: '1px solid #e2e8f0',
  },
  requestFieldMainCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  requestFieldDescriptionCell: {
    color: '#475569',
    fontSize: '0.9rem',
  },
  requestFieldRequiredCell: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  requestVariationCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  urlFieldControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  urlEnvFields: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  requestFieldModes: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  requestValueList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  requestValueRow: {
    border: '1px solid #e2e8eb',
    borderRadius: '10px',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  requestValueFieldMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  requestValueInputs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '0.5rem',
  },
  requestFieldHint: {
    color: '#475569',
    fontSize: '0.85rem',
  },
  variationList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '0.75rem',
  },
  variationCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    background: '#fff',
  },
  variationFieldRow: {
    display: 'grid',
    gridTemplateColumns: '2fr auto 2fr auto',
    gap: '0.5rem',
    alignItems: 'center',
    padding: '0.25rem 0',
  },
  variationRequirementRow: {
    borderTop: '1px dashed #e2e8f0',
    paddingTop: '0.35rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  variationRequirementLabel: {
    color: '#475569',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  variationRequirementGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  variationRequirementToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.25rem 0.5rem',
    borderRadius: '6px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
  },
  hintEmpty: {
    margin: 0,
    color: '#475569',
    fontSize: '0.85rem',
  },
  hintError: {
    margin: 0,
    color: '#b91c1c',
    fontSize: '0.85rem',
    background: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '0.5rem 0.75rem',
  },
  hintList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  hintItem: {
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    background: '#fff',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  hintFieldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  hintField: {
    fontWeight: 600,
    fontSize: '0.9rem',
    color: '#0f172a',
  },
  hintDescription: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#475569',
  },
  combinationExampleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  combinationExampleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  combinationLabel: {
    whiteSpace: 'normal',
    wordBreak: 'break-word',
  },
  hintBadge: {
    borderRadius: '999px',
    padding: '0.15rem 0.5rem',
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  hintBadgeRequired: {
    background: '#dcfce7',
    color: '#166534',
  },
  hintBadgeOptional: {
    background: '#e2e8f0',
    color: '#1e293b',
  },
  inlineFields: {
    gridColumn: '1 / -1',
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontWeight: 600,
  },
  checkboxHint: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  fieldHelp: {
    display: 'block',
    fontSize: '0.82rem',
    color: '#475569',
    marginTop: '0.25rem',
  },
  radioRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontWeight: 600,
  },
  docFetcher: {
    marginTop: '1.5rem',
    display: 'flex',
    gap: '1rem',
    alignItems: 'flex-end',
  },
  fetchButton: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.55rem 1.25rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
  docButtons: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  docSelection: {
    marginTop: '1rem',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '0.75rem 1rem',
    background: '#f1f5f9',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  docMetadata: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    fontSize: '0.8rem',
    color: '#1e293b',
  },
  receiptCard: {
    border: '1px solid #cbd5f5',
    borderRadius: '6px',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    background: '#fff',
  },
  receiptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  receiptSub: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#475569',
    marginTop: '0.15rem',
  },
  itemsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  itemCard: {
    border: '1px dashed #cbd5f5',
    borderRadius: '6px',
    padding: '0.75rem',
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  smallButton: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.25rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  smallSecondaryButton: {
    background: '#e2e8f0',
    color: '#0f172a',
    border: 'none',
    borderRadius: '4px',
    padding: '0.25rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  smallDangerButton: {
    background: '#f87171',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.25rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  paymentsTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  paymentGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '0.75rem',
    background: '#fff',
  },
  paymentRow: {
    display: 'grid',
    gridTemplateColumns: '200px 1fr auto',
    gap: '0.5rem',
    alignItems: 'center',
  },
  paymentSelect: {
    padding: '0.4rem',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontSize: '0.9rem',
  },
  paymentAmount: {
    padding: '0.4rem',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontSize: '0.9rem',
  },
  paymentDataContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  paymentDataLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
    fontSize: '0.8rem',
    color: '#1f2937',
    fontWeight: 600,
  },
  paymentDataTextarea: {
    width: '100%',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    padding: '0.5rem',
    minHeight: '120px',
  },
  inlineError: {
    color: '#b91c1c',
    fontSize: '0.78rem',
  },
  easyBankGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '0.75rem',
  },
  paymentSummary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
    fontSize: '0.85rem',
    color: '#1e293b',
  },
  warningText: {
    color: '#b45309',
    fontWeight: 600,
  },
  actions: {
    marginTop: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  error: {
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    color: '#991b1b',
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    marginBottom: '1rem',
  },
  status: {
    background: '#dcfce7',
    border: '1px solid #86efac',
    color: '#166534',
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    marginBottom: '1rem',
  },
  deleteButton: {
    background: '#f87171',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
  },
  previewSection: {
    marginTop: '2rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1rem',
  },
  previewCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '1rem',
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  previewTitle: {
    margin: 0,
  },
  previewTag: {
    background: '#dbeafe',
    color: '#1e3a8a',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '0.15rem 0.5rem',
  },
  previewEmpty: {
    margin: 0,
    color: '#475569',
    fontSize: '0.9rem',
  },
  previewErrorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
    borderRadius: '6px',
    padding: '0.5rem 0.75rem',
    fontSize: '0.9rem',
  },
  codeBlock: {
    background: '#0f172a',
    color: '#e2e8f0',
    padding: '0.75rem',
    borderRadius: '6px',
    fontSize: '0.85rem',
    lineHeight: 1.5,
    overflowX: 'auto',
    whiteSpace: 'pre',
  },
  testButton: {
    background: '#0ea5e9',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
  },
  testError: {
    marginTop: '1rem',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
    borderRadius: '6px',
    padding: '0.75rem 1rem',
  },
  testResult: {
    marginTop: '1rem',
    border: '1px solid #cbd5f5',
    borderRadius: '8px',
    background: '#f8fafc',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  testResultHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  tokenMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.35rem',
  },
  tokenMetaText: {
    color: '#475569',
    fontSize: '0.9rem',
  },
  testResultBody: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '1rem',
  },
  testColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  testColumnTitle: {
    margin: 0,
  },
  subheading: {
    margin: 0,
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#1e293b',
  },
  metaList: {
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  metaRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  metaKey: {
    fontWeight: 600,
    minWidth: '60px',
  },
  wrapText: {
    wordBreak: 'break-all',
  },
  warningBox: {
    background: '#fff4e6',
    border: '1px solid #fdba74',
    color: '#7c2d12',
    padding: '0.75rem 1rem',
    borderRadius: '10px',
    fontWeight: 600,
  },
  adminGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(260px, 1fr) 2fr minmax(260px, 1fr)',
    gap: '1rem',
    alignItems: 'flex-start',
  },
  adminSidebarCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '1rem',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  adminSidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  adminList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  adminListButton: {
    width: '100%',
    textAlign: 'left',
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    background: '#fff',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  adminListTitle: {
    fontWeight: 700,
    fontSize: '0.95rem',
  },
  adminListMeta: {
    display: 'flex',
    gap: '0.35rem',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  adminListPath: {
    color: '#475569',
    fontSize: '0.85rem',
  },
  adminContentCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '1rem',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  adminContentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  adminParameterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '0.75rem',
  },
  adminParameterColumn: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.75rem',
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  adminHistoryCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '1rem',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    maxHeight: '520px',
    overflow: 'auto',
  },
  historyRow: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.75rem',
    background: '#f8fafc',
  },
  historyMain: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  historyMeta: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
    color: '#475569',
    fontSize: '0.85rem',
  },
  historyParams: {
    margin: 0,
    background: '#fff',
    border: '1px solid #e2e8f0',
    padding: '0.5rem',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
  },
  historyStatus: {
    display: 'flex',
    alignItems: 'center',
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
    padding: '0.25rem 0',
  },
  primaryButton: {
    background: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '0.6rem 1rem',
    cursor: 'pointer',
    fontWeight: 700,
  },
  statusPill: {
    borderRadius: '9999px',
    padding: '0.25rem 0.75rem',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  statusPillSuccess: {
    background: '#dcfce7',
    color: '#166534',
  },
  statusPillError: {
    background: '#fee2e2',
    color: '#991b1b',
  },
};
