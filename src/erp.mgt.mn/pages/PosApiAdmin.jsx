import React, { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../utils/apiBase.js';

const POSAPI_TYPES = [
  { value: 'B2C_RECEIPT', label: 'B2C receipt' },
  { value: 'B2B_RECEIPT', label: 'B2B receipt' },
  { value: 'B2C_INVOICE', label: 'B2C invoice' },
  { value: 'B2B_INVOICE', label: 'B2B invoice' },
  { value: 'STOCK_QR', label: 'Stock QR' },
];

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
  B2C_RECEIPT: '#1d4ed8',
  B2B_RECEIPT: '#0f172a',
  B2C_INVOICE: '#4f46e5',
  B2B_INVOICE: '#7c3aed',
  STOCK_QR: '#0ea5e9',
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
];

const USAGE_BADGES = {
  transaction: '#047857',
  info: '#1d4ed8',
  admin: '#78350f',
};

const DEFAULT_RECEIPT_TYPES = POSAPI_TYPES.map((type) => type.value);
const DEFAULT_TAX_TYPES = TAX_TYPES.map((tax) => tax.value);
const DEFAULT_PAYMENT_METHODS = PAYMENT_TYPES.map((payment) => payment.value);
const VALID_RECEIPT_TYPES = new Set(DEFAULT_RECEIPT_TYPES);
const VALID_TAX_TYPES = new Set(DEFAULT_TAX_TYPES);
const VALID_PAYMENT_METHODS = new Set(DEFAULT_PAYMENT_METHODS);
const VALID_USAGE_VALUES = new Set(USAGE_OPTIONS.map((opt) => opt.value));
const DEFAULT_INFO_TABLE_OPTIONS = [
  { value: 'classification', label: 'Product classification' },
  { value: 'tax_reason', label: 'VAT exemption reason' },
  { value: 'district', label: 'District' },
  { value: 'barcode_type', label: 'Barcode type' },
  { value: 'payment_code', label: 'Payment code' },
];

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

function formatTableLabel(table) {
  if (!table || typeof table !== 'string') return '';
  const pretty = table
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return pretty || table;
}

function buildTableOptions(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .map((value) => ({
      value,
      label: formatTableLabel(value),
    }));
}

function sanitizeTableSelection(list, options) {
  const optionSet = Array.isArray(options) ? new Set(options.map((opt) => opt.value)) : null;
  if (!Array.isArray(list)) return [];
  return list
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value && (!optionSet || optionSet.has(value)));
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

function withEndpointMetadata(endpoint) {
  if (!endpoint || typeof endpoint !== 'object') return endpoint;
  const usage = normalizeUsage(endpoint.usage);
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
  };
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
  responseDescription: '',
  responseSchemaText: '{}',
  fieldDescriptionsText: '{}',
  requestFieldsText: '[]',
  responseFieldsText: '[]',
  testable: false,
  testServerUrl: '',
  docUrl: '',
  posApiType: '',
  usage: 'transaction',
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
};

const PAYMENT_FIELD_DESCRIPTIONS = {
  payments: 'Breakdown of how the receipt or invoice was paid.',
  'payments[].type':
    'Payment method code. Supported values: CASH, PAYMENT_CARD, BANK_TRANSFER, MOBILE_WALLET, EASY_BANK_CARD.',
  'payments[].amount': 'Amount paid with the selected payment method.',
};

const TAX_TYPE_DESCRIPTIONS = {
  VAT_ABLE: 'Standard VAT rate applies. Include VAT and city tax totals.',
  VAT_FREE: 'VAT exempt sale. Provide a taxProductCode reference for the exemption reason.',
  VAT_ZERO: 'Zero-rated VAT sale (for example, exports). Provide a taxProductCode reference.',
  NO_VAT: 'Sale that falls completely outside the VAT system.',
};

const RECEIPT_SAMPLE_PAYLOADS = {
  B2C_RECEIPT: createReceiptTemplate('B2C_RECEIPT', {
    branchNo: '001',
    posNo: 'A01',
    merchantTin: '12345678901',
    consumerNo: '99001122',
    totalAmount: 55000,
    totalVAT: 5000,
    totalCityTax: 500,
    receipts: [
      {
        taxType: 'VAT_ABLE',
        totalAmount: 55000,
        totalVAT: 5000,
        totalCityTax: 500,
        items: [
          {
            name: 'Latte (16oz)',
            barCode: '9770001112233',
            barCodeType: 'EAN_13',
            classificationCode: '5610201',
            measureUnit: 'PCS',
            qty: 1,
            price: 50000,
            vatTaxType: 'VAT_ABLE',
            cityTax: 500,
            lotNo: '',
          },
          {
            name: 'Butter croissant',
            barCode: '9770001112240',
            barCodeType: 'EAN_13',
            classificationCode: '1071100',
            measureUnit: 'PCS',
            qty: 1,
            price: 5000,
            vatTaxType: 'VAT_ABLE',
            cityTax: 0,
            lotNo: '',
          },
        ],
      },
    ],
    payments: [
      {
        type: 'PAYMENT_CARD',
        amount: 55000,
        data: {
          cardIssuer: 'VISA',
          last4: '1234',
          transactionId: 'A1B2C3',
        },
      },
    ],
  }),
  B2B_RECEIPT: createReceiptTemplate('B2B_RECEIPT', {
    branchNo: '002',
    posNo: 'B15',
    merchantTin: '12345678901',
    customerTin: '8889990001',
    totalAmount: 1280000,
    totalVAT: 116363,
    totalCityTax: 0,
    receipts: [
      {
        taxType: 'VAT_ABLE',
        totalAmount: 1280000,
        totalVAT: 116363,
        totalCityTax: 0,
        items: [
          {
            name: 'Office chair',
            barCode: '5901234123457',
            barCodeType: 'EAN_13',
            classificationCode: '9401300',
            measureUnit: 'PCS',
            qty: 4,
            price: 320000,
            vatTaxType: 'VAT_ABLE',
            cityTax: 0,
            lotNo: 'CHAIR-2024-04',
          },
        ],
      },
    ],
    payments: [
      { type: 'BANK_TRANSFER', amount: 1280000 },
    ],
  }),
  B2C_INVOICE: createReceiptTemplate('B2C_INVOICE', {
    branchNo: '001',
    posNo: 'A01',
    merchantTin: '12345678901',
    consumerNo: '88119922',
    invoiceNo: 'INV-2024-0152',
    invoiceDate: '2024-07-01',
    dueDate: '2024-07-10',
    totalAmount: 275000,
    totalVAT: 25000,
    totalCityTax: 2500,
    receipts: [
      {
        taxType: 'VAT_ABLE',
        totalAmount: 275000,
        totalVAT: 25000,
        totalCityTax: 2500,
        items: [
          {
            name: 'Annual maintenance subscription',
            barCode: 'SUBSCRIPTION-001',
            barCodeType: 'EAN_13',
            classificationCode: '6202000',
            measureUnit: 'PKG',
            qty: 1,
            price: 250000,
            vatTaxType: 'VAT_ABLE',
            cityTax: 2500,
            lotNo: '',
          },
          {
            name: 'On-site installation',
            barCode: '',
            barCodeType: 'EAN_13',
            classificationCode: '6209000',
            measureUnit: 'HRS',
            qty: 5,
            price: 5000,
            vatTaxType: 'VAT_ABLE',
            cityTax: 0,
            lotNo: '',
          },
        ],
      },
    ],
    payments: [
      { type: 'CASH', amount: 50000 },
      { type: 'PAYMENT_CARD', amount: 225000, data: { cardIssuer: 'Mastercard', last4: '4455' } },
    ],
  }),
  B2B_INVOICE: createReceiptTemplate('B2B_INVOICE', {
    branchNo: '005',
    posNo: 'INV-01',
    merchantTin: '12345678901',
    customerTin: '3021456987',
    invoiceNo: 'INV-2024-0420',
    invoiceDate: '2024-07-05',
    dueDate: '2024-08-05',
    totalAmount: 1940000,
    totalVAT: 176000,
    totalCityTax: 0,
    receipts: [
      {
        taxType: 'VAT_ABLE',
        totalAmount: 1540000,
        totalVAT: 176000,
        totalCityTax: 0,
        items: [
          {
            name: 'Industrial cleaner (20L)',
            barCode: 'ICLEAN-20L',
            barCodeType: 'EAN_13',
            classificationCode: '2815200',
            measureUnit: 'PCS',
            qty: 10,
            price: 154000,
            vatTaxType: 'VAT_ABLE',
            cityTax: 0,
            lotNo: 'CLEAN-LOT-07',
          },
        ],
      },
      {
        taxType: 'VAT_ZERO',
        totalAmount: 400000,
        taxProductCode: 'EXPORT-001',
        items: [
          {
            name: 'Export logistics service',
            classificationCode: '5229200',
            measureUnit: 'SRV',
            qty: 1,
            price: 400000,
            vatTaxType: 'VAT_ZERO',
            taxProductCode: 'EXPORT-001',
            lotNo: '',
          },
        ],
      },
    ],
    payments: [
      { type: 'BANK_TRANSFER', amount: 1500000 },
      {
        type: 'EASY_BANK_CARD',
        amount: 440000,
        data: {
          rrn: '112233445566',
          approvalCode: 'AP1234',
          terminalId: 'TERM-0091',
        },
      },
    ],
  }),
  STOCK_QR: {
    ...createStockQrTemplate(),
    branchNo: '001',
    posNo: 'STOCK-QR',
    merchantTin: '12345678901',
    stockCodes: [
      {
        code: 'STOCK-001',
        name: 'Finished goods pallet',
        classificationCode: '2011000',
        qty: 12,
        measureUnit: 'PCS',
        lotNo: 'FG-2024-07',
      },
      {
        code: 'STOCK-RAW-01',
        name: 'Raw material pack',
        classificationCode: '0899000',
        qty: 48,
        measureUnit: 'PCS',
        lotNo: 'RM-2024-05',
      },
    ],
  },
};

function createReceiptTemplate(type, overrides = {}) {
  const isB2B = type.startsWith('B2B');
  const base = {
    type,
    taxType: 'VAT_ABLE',
    branchNo: '<branch-number>',
    posNo: '<pos-number>',
    merchantTin: '<merchant-tin>',
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
            classificationCode: '<product-code>',
            taxProductCode: 'A12345',
            measureUnit: 'PCS',
            qty: 1,
            price: 100000,
            vatTaxType: 'VAT_ABLE',
            cityTax: 1000,
            lotNo: '',
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
    base.customerTin = '<buyer-tin>';
  } else {
    base.consumerNo = '<consumer-id-or-phone>';
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
    case 'B2C_RECEIPT':
    case 'B2B_RECEIPT':
    case 'B2C_INVOICE':
    case 'B2B_INVOICE':
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

function normaliseBuilderForType(builder, type, withItems = true) {
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
    const payments = Array.isArray(base?.payments) && base.payments.length > 0
      ? base.payments
      : template.payments;
    next.payments = deepClone(payments) || template.payments || [
      {
        type: 'CASH',
        amount: next.totalAmount || 0,
      },
    ];
    next.totalAmount = base?.totalAmount ?? template.totalAmount;
    next.totalVAT = base?.totalVAT ?? template.totalVAT;
    next.totalCityTax = base?.totalCityTax ?? template.totalCityTax;
    next.taxType = base?.taxType ?? template.taxType;
  }

  return next;
}

function formatTypeLabel(type) {
  if (!type) return '';
  const hit = POSAPI_TYPES.find((opt) => opt.value === type);
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
    };
  }
  return {
    field: String(entry),
    required: undefined,
    description: '',
  };
}

function createFormState(definition) {
  if (!definition) return { ...EMPTY_ENDPOINT };
  const rawUsage = definition.usage && VALID_USAGE_VALUES.has(definition.usage)
    ? definition.usage
    : 'transaction';
  const isTransaction = rawUsage === 'transaction';
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
  const sanitizeRequestHints = (value) => {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => {
      const normalized = normalizeHintEntry(entry);
      if (!normalized.field) {
        return normalized;
      }
      return {
        field: normalized.field,
        required: typeof normalized.required === 'boolean' ? normalized.required : false,
        ...(normalized.description ? { description: normalized.description } : {}),
      };
    });
  };
  const receiptTypesEnabled = isTransaction ? definition.enableReceiptTypes !== false : false;
  const receiptTaxTypesEnabled = isTransaction ? definition.enableReceiptTaxTypes !== false : false;
  const paymentMethodsEnabled = isTransaction ? definition.enablePaymentMethods !== false : false;
  const receiptItemsEnabled = isTransaction ? definition.enableReceiptItems !== false : false;
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
  return {
    id: definition.id || '',
    name: definition.name || '',
    category: definition.category || '',
    method: definition.method || 'GET',
    path: definition.path || '',
    parametersText: toPrettyJson(definition.parameters, '[]'),
    requestDescription: definition.requestBody?.description || '',
    requestSchemaText: toPrettyJson(definition.requestBody?.schema, '{}'),
    responseDescription: definition.responseBody?.description || '',
    responseSchemaText: toPrettyJson(definition.responseBody?.schema, '{}'),
    fieldDescriptionsText: toPrettyJson(definition.fieldDescriptions, '{}'),
    requestFieldsText: toPrettyJson(sanitizeRequestHints(definition.requestFields), '[]'),
    responseFieldsText: toPrettyJson(definition.responseFields, '[]'),
    testable: Boolean(definition.testable),
    testServerUrl: definition.testServerUrl || '',
    docUrl: '',
    posApiType: definition.posApiType || definition.requestBody?.schema?.type || '',
    usage: rawUsage,
    defaultForForm: isTransaction ? Boolean(definition.defaultForForm) : false,
    supportsMultipleReceipts: isTransaction ? Boolean(definition.supportsMultipleReceipts) : false,
    supportsMultiplePayments: isTransaction ? Boolean(definition.supportsMultiplePayments) : false,
    supportsItems: isTransaction
      ? definition.supportsItems !== undefined
        ? Boolean(definition.supportsItems)
        : definition.posApiType === 'STOCK_QR'
          ? false
          : true
      : false,
    enableReceiptTypes: receiptTypesEnabled,
    allowMultipleReceiptTypes,
    receiptTypeTemplates,
    receiptTypes: receiptTypesEnabled
      ? resolvedReceiptTypes.length > 0
        ? resolvedReceiptTypes
        : DEFAULT_RECEIPT_TYPES.slice()
      : [],
    enableReceiptTaxTypes: receiptTaxTypesEnabled,
    allowMultipleReceiptTaxTypes,
    taxTypeTemplates,
    taxTypes: receiptTaxTypesEnabled
      ? resolvedTaxTypes.length > 0
        ? resolvedTaxTypes
        : DEFAULT_TAX_TYPES.slice()
      : [],
    enablePaymentMethods: paymentMethodsEnabled,
    allowMultiplePaymentMethods,
    paymentMethodTemplates,
    paymentMethods: paymentMethodsEnabled
      ? resolvedPaymentMethods.length > 0
        ? resolvedPaymentMethods
        : DEFAULT_PAYMENT_METHODS.slice()
      : [],
    enableReceiptItems: receiptItemsEnabled,
    allowMultipleReceiptItems,
    receiptItemTemplates,
    topLevelFieldsText: toPrettyJson(definition.mappingHints?.topLevelFields, '[]'),
    nestedPathsText: toPrettyJson(definition.mappingHints?.nestedPaths, '{}'),
    notes: definition.notes || '',
  };
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
}

export default function PosApiAdmin() {
  const [endpoints, setEndpoints] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [formState, setFormState] = useState({ ...EMPTY_ENDPOINT });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [usageFilter, setUsageFilter] = useState('all');
  const [testState, setTestState] = useState({ running: false, error: '', result: null });
  const [docExamples, setDocExamples] = useState([]);
  const [selectedDocBlock, setSelectedDocBlock] = useState('');
  const [docFieldDescriptions, setDocFieldDescriptions] = useState({});
  const [docMetadata, setDocMetadata] = useState({});
  const [requestBuilder, setRequestBuilder] = useState(null);
  const [requestBuilderError, setRequestBuilderError] = useState('');
  const [sampleImportText, setSampleImportText] = useState('');
  const [sampleImportError, setSampleImportError] = useState('');
  const [paymentDataDrafts, setPaymentDataDrafts] = useState({});
  const [paymentDataErrors, setPaymentDataErrors] = useState({});
  const [taxTypeListText, setTaxTypeListText] = useState(DEFAULT_TAX_TYPES.join(', '));
  const [taxTypeListError, setTaxTypeListError] = useState('');
  const taxTypeInputDirtyRef = useRef(false);
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
  const [infoSyncTableOptions, setInfoSyncTableOptions] = useState(DEFAULT_INFO_TABLE_OPTIONS);
  const [infoSyncTables, setInfoSyncTables] = useState([]);
  const [infoUploadCodeType, setInfoUploadCodeType] = useState('classification');
  const builderSyncRef = useRef(false);

  const groupedEndpoints = useMemo(() => {
    const normalized = endpoints.map(withEndpointMetadata);
    const filtered = normalized.filter(
      (endpoint) => usageFilter === 'all' || endpoint.usage === usageFilter,
    );
    const usageOrder = ['transaction', 'info', 'admin'];
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

  const infoSyncEndpointOptions = useMemo(() => {
    const normalized = endpoints.map(withEndpointMetadata);
    return normalized
      .filter((endpoint) => String(endpoint.method || '').toUpperCase() === 'GET')
      .filter((endpoint) => infoSyncUsage === 'all' || !infoSyncUsage || endpoint.usage === infoSyncUsage)
      .map((endpoint) => ({
        id: endpoint.id,
        name: endpoint.name || endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
        usage: endpoint.usage,
      }));
  }, [endpoints, infoSyncUsage]);

  useEffect(() => {
    setInfoSyncEndpointIds((prev) => {
      const filtered = prev.filter((id) => infoSyncEndpointOptions.some((ep) => ep.id === id));
      if (filtered.length !== prev.length) {
        setInfoSyncSettings((settings) => ({ ...settings, endpointIds: filtered }));
      }
      return filtered;
    });
  }, [infoSyncEndpointOptions]);

  useEffect(() => {
    setInfoSyncTables((prev) => {
      const filtered = prev.filter((table) => infoSyncTableOptions.some((opt) => opt.value === table));
      if (filtered.length !== prev.length) {
        setInfoSyncSettings((settings) => ({ ...settings, tables: filtered }));
      }
      return filtered;
    });
  }, [infoSyncTableOptions]);

  const requestPreview = useMemo(() => {
    const text = (formState.requestSchemaText || '').trim();
    if (!text) return { state: 'empty', formatted: '', error: '' };
    try {
      const parsed = JSON.parse(text);
      return { state: 'ok', formatted: JSON.stringify(parsed, null, 2), error: '' };
    } catch (err) {
      return { state: 'error', formatted: '', error: err.message || 'Invalid JSON' };
    }
  }, [formState.requestSchemaText]);

  const responsePreview = useMemo(() => {
    const text = (formState.responseSchemaText || '').trim();
    if (!text) return { state: 'empty', formatted: '', error: '' };
    try {
      const parsed = JSON.parse(text);
      return { state: 'ok', formatted: JSON.stringify(parsed, null, 2), error: '' };
    } catch (err) {
      return { state: 'error', formatted: '', error: err.message || 'Invalid JSON' };
    }
  }, [formState.responseSchemaText]);

  const isTransactionUsage = formState.usage === 'transaction';
  const receiptTypesEnabled = isTransactionUsage && formState.enableReceiptTypes !== false;
  const receiptTaxTypesEnabled = isTransactionUsage && formState.enableReceiptTaxTypes !== false;
  const paymentMethodsEnabled = isTransactionUsage && formState.enablePaymentMethods !== false;
  const receiptItemsEnabled = isTransactionUsage && formState.enableReceiptItems !== false;

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

  const formSupportsItems = isTransactionUsage ? formState.supportsItems !== false : false;

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

  const supportsItems = isTransactionUsage ? formState.supportsItems !== false : false;
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

  const supportsMultipleReceipts = isTransactionUsage && Boolean(formState.supportsMultipleReceipts);
  const supportsMultiplePayments = isTransactionUsage && Boolean(formState.supportsMultiplePayments);
  const receiptTypeOptions = receiptTypesEnabled && formReceiptTypes.length > 0
    ? POSAPI_TYPES.filter((type) => formReceiptTypes.includes(type.value))
    : POSAPI_TYPES;
  const taxTypeOptions = allowedTaxTypes.length > 0 ? allowedTaxTypes : TAX_TYPES;
  const paymentTypeOptions = allowedPaymentTypes.length > 0 ? allowedPaymentTypes : PAYMENT_TYPES;

  useEffect(() => {
    if (builderSyncRef.current) {
      builderSyncRef.current = false;
      return;
    }
    const text = (formState.requestSchemaText || '').trim();
    if (!text) {
      setRequestBuilder(null);
      setRequestBuilderError('');
      return;
    }
    try {
      const parsed = JSON.parse(text);
      setRequestBuilder(parsed);
      setRequestBuilderError('');
      if (parsed?.type && parsed.type !== formState.posApiType) {
        setFormState((prev) => ({ ...prev, posApiType: parsed.type }));
      }
    } catch (err) {
      setRequestBuilder(null);
      setRequestBuilderError(err.message || 'Invalid JSON');
    }
  }, [formState.requestSchemaText]);

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
      setFormState((prevState) => ({
        ...prevState,
        requestSchemaText: JSON.stringify(next, null, 2),
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

  const handleTypeChange = (type) => {
    setFormState((prev) => ({ ...prev, posApiType: type }));
    if (!type) return;
    updateRequestBuilder((prev) => normaliseBuilderForType(prev, type, supportsItems));
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
    const totalAmount = Number(requestBuilder?.totalAmount || 0);
    return Math.abs(paymentsTotal - totalAmount) < 0.01;
  }, [paymentsTotal, requestBuilder]);

  const isReceiptType = formState.posApiType && formState.posApiType !== 'STOCK_QR';
  const isStockType = formState.posApiType === 'STOCK_QR';

  useEffect(() => {
    if (!formState.posApiType) return;
    setRequestBuilder((prev) => {
      if (!prev || prev.type === formState.posApiType) {
        return prev;
      }
      const next = normaliseBuilderForType(prev, formState.posApiType, supportsItems);
      builderSyncRef.current = true;
      setFormState((prevState) => ({
        ...prevState,
        requestSchemaText: JSON.stringify(next, null, 2),
      }));
      return next;
    });
  }, [formState.posApiType, supportsItems]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function fetchEndpoints() {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`${API_BASE}/posapi/endpoints`, {
          credentials: 'include',
          signal: controller.signal,
          skipLoader: true,
        });
        if (!res.ok) {
          throw new Error('Failed to load POSAPI endpoints');
        }
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const normalized = list.map(withEndpointMetadata);
        setEndpoints(normalized);
        if (normalized.length > 0) {
          setSelectedId(normalized[0].id);
          setFormState(createFormState(normalized[0]));
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
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
    if (activeTab !== 'info') return undefined;
    let cancelled = false;
    async function loadInfoSync() {
      try {
        setInfoSyncLoading(true);
        setInfoSyncError('');
        const res = await fetch(`${API_BASE}/posapi/reference-codes`, {
          credentials: 'include',
          skipLoader: true,
        });
        if (!res.ok) {
          throw new Error('Failed to load sync settings');
        }
        const data = await res.json();
        if (cancelled) return;
        const usage = data.settings?.usage && VALID_USAGE_VALUES.has(data.settings.usage)
          ? data.settings.usage
          : 'all';
        const endpointIds = Array.isArray(data.settings?.endpointIds)
          ? data.settings.endpointIds.filter((value) => typeof value === 'string' && value)
          : [];
        const availableTables = buildTableOptions(data.tables || data.availableTables || []);
        const tableOptions = availableTables.length > 0 ? availableTables : DEFAULT_INFO_TABLE_OPTIONS;
        const tables = sanitizeTableSelection(
          Array.isArray(data.settings?.tables) ? data.settings.tables : data.settings?.tableNames,
          tableOptions,
        );
        setInfoSyncTableOptions(tableOptions);
        setInfoSyncSettings({
          autoSyncEnabled: Boolean(data.settings?.autoSyncEnabled),
          intervalMinutes: Number(data.settings?.intervalMinutes) || 720,
          usage,
          endpointIds,
          tables,
        });
        setInfoSyncUsage(usage);
        setInfoSyncEndpointIds(endpointIds);
        setInfoSyncTables(tables);
        setInfoSyncLogs(Array.isArray(data.logs) ? data.logs : []);
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
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  function handleSelect(id) {
    setStatus('');
    setError('');
    resetTestState();
    setDocExamples([]);
    setSelectedDocBlock('');
    setDocMetadata({});
    setDocFieldDescriptions({});
    setSampleImportText('');
    setSampleImportError('');
    setSelectedId(id);
    const definition = endpoints.find((ep) => ep.id === id);
    setFormState(createFormState(definition));
  }

  function handleChange(field, value) {
    setFormState((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'usage') {
        if (value !== 'transaction') {
          next.defaultForForm = false;
          next.supportsMultipleReceipts = false;
          next.supportsMultiplePayments = false;
          next.supportsItems = false;
          next.receiptTypes = [];
          next.taxTypes = [];
          next.paymentMethods = [];
          next.enableReceiptTypes = false;
          next.enableReceiptTaxTypes = false;
          next.enablePaymentMethods = false;
          next.enableReceiptItems = false;
          next.receiptItemTemplates = [];
        } else {
          next.supportsItems = true;
          next.receiptTypes = DEFAULT_RECEIPT_TYPES.slice();
          next.taxTypes = DEFAULT_TAX_TYPES.slice();
          next.paymentMethods = DEFAULT_PAYMENT_METHODS.slice();
          next.enableReceiptTypes = true;
          next.enableReceiptTaxTypes = true;
          next.enablePaymentMethods = true;
          next.enableReceiptItems = true;
          if (!Array.isArray(next.receiptItemTemplates) || next.receiptItemTemplates.length === 0) {
            next.receiptItemTemplates = [''];
          }
        }
      }
      if (field === 'supportsItems' && value === false) {
        next.supportsMultipleReceipts = false;
        next.enableReceiptItems = false;
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
      return next;
    });
    if (field !== 'docUrl') {
      resetTestState();
    }
  }

  function handleApplySamplePayload(type) {
    const sample = RECEIPT_SAMPLE_PAYLOADS[type];
    if (!sample) return;
    resetTestState();
    const cloned = deepClone(sample) || {};
    const nextReceiptTypes = Array.isArray(formState.receiptTypes)
      ? Array.from(new Set([...formState.receiptTypes, type]))
      : [type];
    setFormState((prev) => ({
      ...prev,
      usage: 'transaction',
      posApiType: type,
      receiptTypes: nextReceiptTypes,
    }));
    updateRequestBuilder(() => normaliseBuilderForType(cloned, type, supportsItems));
    setStatus(`Loaded ${formatTypeLabel(type)} sample payload into the builder.`);
    setSampleImportError('');
  }

  async function handleCopySamplePayload(type) {
    const sample = RECEIPT_SAMPLE_PAYLOADS[type];
    if (!sample) return;
    try {
      if (!navigator?.clipboard) {
        throw new Error('Clipboard API is not available in this browser.');
      }
      await navigator.clipboard.writeText(JSON.stringify(sample, null, 2));
      setStatus(`Copied ${formatTypeLabel(type)} sample payload to the clipboard.`);
      setSampleImportError('');
    } catch (err) {
      setSampleImportError(err.message || 'Unable to copy the sample payload.');
    }
  }

  function handleSampleImport() {
    const trimmed = sampleImportText.trim();
    if (!trimmed) {
      setSampleImportError('Provide JSON to import.');
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      const targetType = parsed?.type || formState.posApiType || 'B2C_RECEIPT';
      resetTestState();
      updateRequestBuilder(() => normaliseBuilderForType(parsed, targetType, supportsItems));
      const nextReceiptTypes = Array.isArray(formState.receiptTypes)
        ? Array.from(new Set([...formState.receiptTypes, targetType]))
        : [targetType];
      setFormState((prev) => ({
        ...prev,
        usage: 'transaction',
        posApiType: targetType,
        receiptTypes: nextReceiptTypes,
      }));
      setSampleImportError('');
      setStatus('Imported sample JSON into the request builder.');
    } catch (err) {
      setSampleImportError(err.message || 'Invalid JSON.');
    }
  }

  function handleSampleFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setSampleImportText(text);
      setSampleImportError('');
    };
    reader.onerror = () => {
      setSampleImportError('Failed to read the selected file.');
    };
    reader.readAsText(file);
  }

  function resetTestState() {
    setTestState({ running: false, error: '', result: null });
  }

  function updateInfoSetting(field, value) {
    setInfoSyncSettings((prev) => ({ ...prev, [field]: value }));
  }

  function handleInfoUsageChange(value) {
    setInfoSyncUsage(value);
    setInfoSyncSettings((prev) => ({ ...prev, usage: value }));
  }

  function handleInfoEndpointSelection(event) {
    const selected = Array.from(event.target.selectedOptions || []).map((option) => option.value);
    setInfoSyncEndpointIds(selected);
    setInfoSyncSettings((prev) => ({ ...prev, endpointIds: selected }));
  }

  function handleInfoTableSelection(event) {
    const selected = Array.from(event.target.selectedOptions || []).map((option) => option.value);
    setInfoSyncTables(selected);
    setInfoSyncSettings((prev) => ({ ...prev, tables: selected }));
  }

  async function saveInfoSettings() {
    try {
      setInfoSyncLoading(true);
      setInfoSyncError('');
      const payload = {
        ...infoSyncSettings,
        usage: infoSyncUsage,
        endpointIds: infoSyncEndpointIds,
        tables: infoSyncTables,
      };
      const res = await fetch(`${API_BASE}/posapi/reference-codes/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error('Failed to save sync settings');
      }
      const saved = await res.json();
      const savedUsage = saved.usage && VALID_USAGE_VALUES.has(saved.usage)
        ? saved.usage
        : payload.usage;
      const savedEndpointIds = Array.isArray(saved.endpointIds)
        ? saved.endpointIds.filter((value) => typeof value === 'string' && value)
        : payload.endpointIds;
      const savedTablesRaw = Array.isArray(saved.tables)
        ? saved.tables
        : Array.isArray(saved.tableNames)
          ? saved.tableNames
          : payload.tables;
      const savedTables = sanitizeTableSelection(savedTablesRaw, infoSyncTableOptions);
      setInfoSyncSettings((prev) => ({
        ...prev,
        ...saved,
        usage: savedUsage,
        endpointIds: savedEndpointIds,
        tables: savedTables,
      }));
      setInfoSyncUsage(savedUsage);
      setInfoSyncEndpointIds(savedEndpointIds);
      setInfoSyncTables(savedTables);
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
      if (infoSyncTables.length > 0) {
        payload.tables = infoSyncTables;
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
        throw new Error('Failed to refresh reference codes');
      }
      const data = await res.json();
      const usageLabel = infoSyncUsage === 'all' ? 'all usages' : formatUsageLabel(infoSyncUsage);
      const endpointLabel =
        infoSyncEndpointIds.length > 0
          ? `${infoSyncEndpointIds.length} endpoint(s)`
          : 'all endpoints';
      const tableLabel = infoSyncTables.length > 0 ? `${infoSyncTables.length} table(s)` : 'all tables';
      setInfoSyncStatus(
        `Synced reference codes (${usageLabel}, ${endpointLabel}, ${tableLabel}) – added ${data.added || 0}, updated ${
          data.updated || 0
        }, deactivated ${data.deactivated || 0}.`,
      );
      setInfoSyncLogs((prev) => [{ timestamp: data.timestamp, ...data }, ...prev]);
    } catch (err) {
      setInfoSyncError(err.message || 'Unable to refresh reference codes');
    } finally {
      setInfoSyncLoading(false);
    }
  }

  async function handleStaticUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      setInfoSyncLoading(true);
      setInfoSyncError('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('codeType', infoUploadCodeType);
      const res = await fetch(`${API_BASE}/posapi/reference-codes/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        throw new Error('Failed to import CSV');
      }
      const data = await res.json();
      setInfoSyncStatus(
        `${data.message || 'Imported'} – added ${data.result?.added || 0}, updated ${
          data.result?.updated || 0
        }, deactivated ${data.result?.deactivated || 0}.`,
      );
    } catch (err) {
      setInfoSyncError(err.message || 'Unable to import CSV');
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
    const requestSchema = parseJsonInput(
      'Request body schema',
      formState.requestSchemaText,
      {},
    );
    const responseSchema = parseJsonInput(
      'Response body schema',
      formState.responseSchemaText,
      {},
    );
    const fieldDescriptions = parseJsonInput(
      'Field descriptions',
      formState.fieldDescriptionsText,
      {},
    );
    if (fieldDescriptions && typeof fieldDescriptions !== 'object') {
      throw new Error('Field descriptions must be a JSON object');
    }

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

    const topLevelFields = parseJsonInput(
      'Top-level mapping hints',
      formState.topLevelFieldsText,
      [],
    );
    if (!Array.isArray(topLevelFields)) {
      throw new Error('Top-level mapping hints must be a JSON array');
    }

    const nestedPaths = parseJsonInput(
      'Nested mapping paths',
      formState.nestedPathsText,
      {},
    );
    if (nestedPaths && typeof nestedPaths !== 'object') {
      throw new Error('Nested mapping paths must be a JSON object');
    }

    if (
      formState.posApiType &&
      ['B2C_RECEIPT', 'B2B_RECEIPT', 'B2C_INVOICE', 'B2B_INVOICE', 'STOCK_QR'].includes(formState.posApiType)
    ) {
      Object.entries(PAYMENT_FIELD_DESCRIPTIONS).forEach(([key, value]) => {
        if (!fieldDescriptions[key]) {
          fieldDescriptions[key] = value;
        }
      });
    }

    if (requestSchema && typeof requestSchema === 'object' && formState.posApiType) {
      requestSchema.type = formState.posApiType;
    }

    const sanitizedRequestFields = requestFieldsRaw.map((entry) => {
      const normalized = normalizeHintEntry(entry);
      if (!normalized.field) {
        return normalized;
      }
      return {
        field: normalized.field,
        required: typeof normalized.required === 'boolean' ? normalized.required : false,
        ...(normalized.description ? { description: normalized.description } : {}),
      };
    });

    const usage = VALID_USAGE_VALUES.has(formState.usage)
      ? formState.usage
      : 'transaction';
    const isTransaction = usage === 'transaction';
    const receiptTypesEnabled = isTransaction && formState.enableReceiptTypes !== false;
    const receiptTaxTypesEnabled = isTransaction && formState.enableReceiptTaxTypes !== false;
    const paymentMethodsEnabled = isTransaction && formState.enablePaymentMethods !== false;
    const receiptItemsEnabled = isTransaction && formState.enableReceiptItems !== false;
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
    const endpoint = {
      id: formState.id.trim(),
      name: formState.name.trim(),
      category: formState.category.trim(),
      method: formState.method.trim().toUpperCase(),
      path: formState.path.trim(),
      posApiType: formState.posApiType || '',
      usage,
      defaultForForm: isTransaction ? Boolean(formState.defaultForForm) : false,
      supportsMultipleReceipts: isTransaction ? Boolean(formState.supportsMultipleReceipts) : false,
      supportsMultiplePayments: isTransaction ? Boolean(formState.supportsMultiplePayments) : false,
      supportsItems: isTransaction ? Boolean(formState.supportsItems) : false,
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
      parameters,
      requestBody: {
        schema: requestSchema,
        description: formState.requestDescription || '',
      },
      responseBody: {
        schema: responseSchema,
        description: formState.responseDescription || '',
      },
      fieldDescriptions: fieldDescriptions || {},
      requestFields: sanitizedRequestFields,
      responseFields,
      mappingHints: {},
      testable: Boolean(formState.testable),
      testServerUrl: formState.testServerUrl.trim(),
    };

    if (topLevelFields.length > 0) {
      endpoint.mappingHints.topLevelFields = topLevelFields;
    }
    if (nestedPaths && Object.keys(nestedPaths).length > 0) {
      endpoint.mappingHints.nestedPaths = nestedPaths;
    }
    if (Object.keys(endpoint.mappingHints).length === 0) {
      delete endpoint.mappingHints;
    }

    const existingIds = new Set(endpoints.map((ep) => ep.id));
    validateEndpoint(endpoint, existingIds, selectedId);

    return endpoint;
  }

  async function handleSave() {
    try {
      setLoading(true);
      setError('');
      setStatus('');
      resetTestState();
      const definition = buildDefinition();
      const preparedDefinition = withEndpointMetadata(definition);
      const updated = endpoints.some((ep) => ep.id === selectedId)
        ? endpoints.map((ep) => (ep.id === selectedId ? preparedDefinition : ep))
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

      const res = await fetch(`${API_BASE}/posapi/endpoints`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoints: normalized }),
        skipLoader: true,
      });
      if (!res.ok) {
        throw new Error('Failed to save endpoints');
      }
      const saved = await res.json();
      const nextRaw = Array.isArray(saved) ? saved : normalized;
      const next = nextRaw.map(withEndpointMetadata);
      setEndpoints(next);
      const selected = next.find((ep) => ep.id === preparedDefinition.id) || preparedDefinition;
      setSelectedId(selected.id);
      setFormState(createFormState(selected));
      setStatus('Changes saved');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save endpoints');
    } finally {
      setLoading(false);
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
      const nextEndpoints = nextRaw.map(withEndpointMetadata);
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
      setLoading(true);
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
      setLoading(false);
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

  function handleNew() {
    setSelectedId('');
    setFormState({ ...EMPTY_ENDPOINT });
    setStatus('');
    setError('');
    resetTestState();
    setDocExamples([]);
    setSelectedDocBlock('');
    setDocMetadata({});
    setDocFieldDescriptions({});
    setSampleImportText('');
    setSampleImportError('');
  }

  async function handleTest() {
    let definition;
    try {
      setError('');
      setStatus('');
      definition = buildDefinition();
    } catch (err) {
      setError(err.message || 'Failed to prepare endpoint');
      return;
    }

    if (!definition.testable) {
      setTestState({ running: false, error: 'Enable the testable checkbox to run tests.', result: null });
      return;
    }
    if (!definition.testServerUrl) {
      setTestState({ running: false, error: 'Test server URL is required for testing.', result: null });
      return;
    }

    const confirmed = window.confirm(
      `Run a test request against ${definition.testServerUrl}? This will use the sample data shown above.`,
    );
    if (!confirmed) return;

    try {
      setTestState({ running: true, error: '', result: null });
      const res = await fetch(`${API_BASE}/posapi/endpoints/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoint: definition }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && parsed.message) {
            message = parsed.message;
          }
        } catch {
          // ignore parse failure
        }
        throw new Error(message || 'Test request failed');
      }
      const data = await res.json();
      setTestState({ running: false, error: '', result: data });
    } catch (err) {
      console.error(err);
      setTestState({ running: false, error: err.message || 'Failed to run test', result: null });
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
                        onClick={() => handleSelect(ep.id)}
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
              onChange={(e) => handleChange('usage', e.target.value)}
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
          <label style={{ ...styles.checkboxLabel, marginTop: '1.9rem' }}>
            <input
              type="checkbox"
              checked={Boolean(formState.supportsMultipleReceipts)}
              onChange={(e) => handleChange('supportsMultipleReceipts', e.target.checked)}
              disabled={formState.usage !== 'transaction'}
            />
            <span>
              Supports multiple receipt groups
              {formState.usage !== 'transaction' && (
                <span style={styles.checkboxHint}> (transaction endpoints only)</span>
              )}
            </span>
          </label>
          <label style={{ ...styles.checkboxLabel, marginTop: '1.9rem' }}>
            <input
              type="checkbox"
              checked={Boolean(formState.supportsMultiplePayments)}
              onChange={(e) => handleChange('supportsMultiplePayments', e.target.checked)}
              disabled={formState.usage !== 'transaction'}
            />
            <span>
              Supports multiple payment methods
              {formState.usage !== 'transaction' && (
                <span style={styles.checkboxHint}> (transaction endpoints only)</span>
              )}
            </span>
          </label>
          <label style={{ ...styles.checkboxLabel, marginTop: '1.9rem' }}>
            <input
              type="checkbox"
              checked={Boolean(formState.supportsItems)}
              onChange={(e) => handleChange('supportsItems', e.target.checked)}
              disabled={formState.usage !== 'transaction'}
            />
            <span>
              Includes receipt items
              {formState.usage !== 'transaction' && (
                <span style={styles.checkboxHint}> (transaction endpoints only)</span>
              )}
            </span>
          </label>
          <label style={styles.label}>
            POSAPI type
            <select
              value={formState.posApiType}
              onChange={(e) => handleTypeChange(e.target.value)}
              style={styles.input}
            >
              <option value="">Select a type…</option>
              {POSAPI_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          {isTransactionUsage && (
            <div style={styles.labelFull}>
              <div style={styles.featureToggleRow}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={receiptTypesEnabled}
                    onChange={(e) => handleChange('enableReceiptTypes', e.target.checked)}
                  />
                  <span>Enable receipt types</span>
                </label>
                <span style={styles.toggleStateBadge}>
                  {formState.allowMultipleReceiptTypes !== false ? 'Multiple allowed' : 'Single value'}
                </span>
              </div>
              {receiptTypesEnabled ? (
                <>
                  <label style={{ ...styles.checkboxLabel, marginBottom: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(formState.allowMultipleReceiptTypes)}
                      onChange={(e) => handleChange('allowMultipleReceiptTypes', e.target.checked)}
                    />
                    <span>Allow selecting more than one receipt type</span>
                  </label>
                  <span style={styles.multiSelectTitle}>Receipt types</span>
                  <span style={styles.multiSelectHint}>
                    Choose the transaction types this endpoint accepts at runtime.
                  </span>
                  <div style={styles.multiSelectOptions}>
                    {POSAPI_TYPES.map((type) => {
                      const checked = Array.isArray(formState.receiptTypes)
                        ? formState.receiptTypes.includes(type.value)
                        : false;
                      return (
                        <label key={type.value} style={styles.multiSelectOption}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleReceiptType(type.value)}
                          />
                          <span>{type.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  {selectedReceiptTypes.length > 0 ? (
                    <div style={styles.templateList}>
                      <span style={styles.multiSelectTitle}>Receipt-type JSON templates</span>
                      <span style={styles.multiSelectHint}>
                        Paste formatted JSON that will be stored with this definition for each type.
                      </span>
                      {selectedReceiptTypes.map((code) => (
                        <div key={`receipt-template-${code}`} style={styles.templateBox}>
                          <div style={styles.templateHeader}>
                            <strong>{formatTypeLabel(code) || code}</strong>
                            <span style={styles.templatePill}>
                              {formState.allowMultipleReceiptTypes !== false ? 'Multi' : 'Single'}
                            </span>
                          </div>
                          <textarea
                            style={styles.templateTextarea}
                            rows={4}
                            value={receiptTypeTemplates[code] || ''}
                            onChange={(e) =>
                              handleTemplateTextChange('receiptTypeTemplates', code, e.target.value)
                            }
                            placeholder="{\n  &quot;type&quot;: &quot;B2C_RECEIPT&quot;,\n  &quot;totalAmount&quot;: 0\n}"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={styles.toggleStateHelper}>Select at least one receipt type to attach JSON.</div>
                  )}
                </>
              ) : (
                <div style={styles.toggleStateHelper}>
                  Receipt type metadata is disabled for this endpoint.
                </div>
              )}
            </div>
          )}
          {isTransactionUsage && (
            <div style={styles.labelFull}>
              <div style={styles.featureToggleRow}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={receiptItemsEnabled}
                    onChange={(e) => handleChange('enableReceiptItems', e.target.checked)}
                  />
                  <span>Enable receipt items</span>
                </label>
                <span style={styles.toggleStateBadge}>
                  {formState.allowMultipleReceiptItems !== false ? 'Multiple allowed' : 'Single value'}
                </span>
              </div>
              {receiptItemsEnabled ? (
                <>
                  <label style={{ ...styles.checkboxLabel, marginBottom: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(formState.allowMultipleReceiptItems)}
                      onChange={(e) => handleChange('allowMultipleReceiptItems', e.target.checked)}
                    />
                    <span>Allow more than one receipt item template</span>
                  </label>
                  <span style={styles.multiSelectTitle}>Receipt item templates</span>
                  <span style={styles.multiSelectHint}>
                    Store JSON snippets that describe individual item rows (used when previewing the payload).
                  </span>
                  <div style={styles.templateList}>
                    {receiptItemTemplates.map((template, index) => (
                      <div key={`receipt-item-template-${index}`} style={styles.templateBox}>
                        <div style={styles.templateHeader}>
                          <strong>Item template {index + 1}</strong>
                          {receiptItemTemplates.length > 1 && (
                            <button
                              type="button"
                              style={styles.templateRemoveButton}
                              onClick={() => removeReceiptItemTemplate(index)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <textarea
                          style={styles.templateTextarea}
                          rows={4}
                          value={template || ''}
                          onChange={(e) => handleReceiptItemTemplateChange(index, e.target.value)}
                          placeholder="{\n  &quot;name&quot;: &quot;Sample item&quot;,\n  &quot;qty&quot;: 1\n}"
                        />
                      </div>
                    ))}
                  </div>
                  {formState.allowMultipleReceiptItems !== false && (
                    <button type="button" style={styles.smallButton} onClick={addReceiptItemTemplate}>
                      Add another item template
                    </button>
                  )}
                </>
              ) : (
                <div style={styles.toggleStateHelper}>Receipt item templates are disabled for this endpoint.</div>
              )}
            </div>
          )}
          {isTransactionUsage && (
            <div style={styles.labelFull}>
              <div style={styles.featureToggleRow}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={receiptTaxTypesEnabled}
                    onChange={(e) => handleChange('enableReceiptTaxTypes', e.target.checked)}
                  />
                  <span>Enable receipt tax types</span>
                </label>
                <span style={styles.toggleStateBadge}>
                  {formState.allowMultipleReceiptTaxTypes !== false ? 'Multiple allowed' : 'Single value'}
                </span>
              </div>
              {receiptTaxTypesEnabled ? (
                <>
                  <label style={{ ...styles.checkboxLabel, marginBottom: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(formState.allowMultipleReceiptTaxTypes)}
                      onChange={(e) => handleChange('allowMultipleReceiptTaxTypes', e.target.checked)}
                    />
                    <span>Allow selecting more than one receipt tax type</span>
                  </label>
                  <span style={styles.multiSelectTitle}>Receipt tax types</span>
                  <span style={styles.multiSelectHint}>
                    Limit the tax type choices when building receipts and mapping fields.
                  </span>
                  <div style={styles.multiSelectOptions}>
                    {TAX_TYPES.map((tax) => {
                      const checked = Array.isArray(formState.taxTypes)
                        ? formState.taxTypes.includes(tax.value)
                        : false;
                      return (
                        <label key={tax.value} style={styles.multiSelectOption}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTaxType(tax.value)}
                          />
                          <span>{tax.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={styles.multiSelectImport}>
                    <span style={styles.multiSelectTitle}>Paste tax-type codes</span>
                    <span style={styles.multiSelectHint}>
                      Paste comma- or newline-separated values (VAT_ABLE, VAT_FREE, VAT_ZERO, NO_VAT).
                    </span>
                    <textarea
                      value={taxTypeListText}
                      onChange={(e) => handleTaxTypeListChange(e.target.value)}
                      onFocus={handleTaxTypeListFocus}
                      onBlur={handleTaxTypeListBlur}
                      style={styles.inlineTextarea}
                      rows={3}
                      placeholder="VAT_ABLE, VAT_FREE"
                    />
                    <div style={styles.inlineActionRow}>
                      <button type="button" style={styles.applyButton} onClick={handleTaxTypeListApplyClick}>
                        Apply pasted values
                      </button>
                      <span style={styles.inlineActionHint}>Values outside the supported list are ignored.</span>
                    </div>
                    {taxTypeListError && <div style={styles.inputError}>{taxTypeListError}</div>}
                  </div>
                  {selectedTaxTypes.length > 0 ? (
                    <div style={styles.templateList}>
                      <span style={styles.multiSelectTitle}>Tax-type JSON templates</span>
                      <span style={styles.multiSelectHint}>
                        Store additional JSON payloads per tax type (e.g., special totals or product codes).
                      </span>
                      {selectedTaxTypes.map((code) => (
                        <div key={`tax-template-${code}`} style={styles.templateBox}>
                          <div style={styles.templateHeader}>
                            <strong>{code}</strong>
                            <span style={styles.templatePill}>
                              {formState.allowMultipleReceiptTaxTypes !== false ? 'Multi' : 'Single'}
                            </span>
                          </div>
                          <textarea
                            style={styles.templateTextarea}
                            rows={4}
                            value={taxTypeTemplates[code] || ''}
                            onChange={(e) =>
                              handleTemplateTextChange('taxTypeTemplates', code, e.target.value)
                            }
                            placeholder="{\n  &quot;taxType&quot;: &quot;VAT_ABLE&quot;\n}"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={styles.toggleStateHelper}>Select a tax type to attach JSON details.</div>
                  )}
                </>
              ) : (
                <div style={styles.toggleStateHelper}>Tax type metadata is disabled for this endpoint.</div>
              )}
            </div>
          )}
          {isTransactionUsage && (
            <div style={styles.labelFull}>
              <div style={styles.featureToggleRow}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={paymentMethodsEnabled}
                    onChange={(e) => handleChange('enablePaymentMethods', e.target.checked)}
                  />
                  <span>Enable payment methods</span>
                </label>
                <span style={styles.toggleStateBadge}>
                  {formState.allowMultiplePaymentMethods !== false ? 'Multiple allowed' : 'Single value'}
                </span>
              </div>
              {paymentMethodsEnabled ? (
                <>
                  <label style={{ ...styles.checkboxLabel, marginBottom: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(formState.allowMultiplePaymentMethods)}
                      onChange={(e) => handleChange('allowMultiplePaymentMethods', e.target.checked)}
                    />
                    <span>Allow selecting more than one payment method</span>
                  </label>
                  <span style={styles.multiSelectTitle}>Payment methods</span>
                  <span style={styles.multiSelectHint}>
                    Choose the payment methods offered in the request builder UI.
                  </span>
                  <div style={styles.multiSelectOptions}>
                    {PAYMENT_TYPES.map((payment) => {
                      const checked = Array.isArray(formState.paymentMethods)
                        ? formState.paymentMethods.includes(payment.value)
                        : false;
                      return (
                        <label key={payment.value} style={styles.multiSelectOption}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePaymentMethod(payment.value)}
                          />
                          <span>{payment.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  {selectedPaymentMethods.length > 0 ? (
                    <div style={styles.templateList}>
                      <span style={styles.multiSelectTitle}>Payment-method JSON templates</span>
                      <span style={styles.multiSelectHint}>
                        Provide per-method JSON (e.g., gateway metadata or default payload fragments).
                      </span>
                      {selectedPaymentMethods.map((code) => (
                        <div key={`payment-template-${code}`} style={styles.templateBox}>
                          <div style={styles.templateHeader}>
                            <strong>{code.replace(/_/g, ' ')}</strong>
                            <span style={styles.templatePill}>
                              {formState.allowMultiplePaymentMethods !== false ? 'Multi' : 'Single'}
                            </span>
                          </div>
                          <textarea
                            style={styles.templateTextarea}
                            rows={4}
                            value={paymentMethodTemplates[code] || ''}
                            onChange={(e) =>
                              handleTemplateTextChange('paymentMethodTemplates', code, e.target.value)
                            }
                            placeholder="{\n  &quot;type&quot;: &quot;CASH&quot;,\n  &quot;amount&quot;: 0\n}"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={styles.toggleStateHelper}>Select a payment method to attach JSON.</div>
                  )}
                </>
              ) : (
                <div style={styles.toggleStateHelper}>Payment method metadata is disabled for this endpoint.</div>
              )}
            </div>
          )}
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

        <section style={styles.builderSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Structured request builder</h2>
            {formState.posApiType && (
              <span style={styles.sectionBadge}>{formatTypeLabel(formState.posApiType)}</span>
            )}
          </div>
          {!formState.posApiType && (
            <p style={styles.sectionHelp}>
              Select a POSAPI type to load guided templates for receipts, invoices, and stock QR payloads.
            </p>
          )}
          {requestBuilderError && (
            <div style={styles.previewErrorBox}>
              <strong>Invalid request JSON:</strong> {requestBuilderError}
            </div>
          )}
          {formState.posApiType && requestBuilder && (
            <>
              <details open style={styles.detailSection}>
                <summary style={styles.detailSummary}>Header &amp; totals</summary>
                <div style={styles.detailBody}>
                  <div style={styles.builderGrid}>
                    <label style={styles.builderLabel}>
                      Branch number
                      <input
                        type="text"
                        value={requestBuilder.branchNo || ''}
                        onChange={(e) => handleBuilderFieldChange('branchNo', e.target.value)}
                        style={styles.input}
                      />
                    </label>
                    <label style={styles.builderLabel}>
                      POS number
                      <input
                        type="text"
                        value={requestBuilder.posNo || ''}
                        onChange={(e) => handleBuilderFieldChange('posNo', e.target.value)}
                        style={styles.input}
                      />
                    </label>
                    <label style={styles.builderLabel}>
                      Merchant TIN
                      <input
                        type="text"
                        value={requestBuilder.merchantTin || ''}
                        onChange={(e) => handleBuilderFieldChange('merchantTin', e.target.value)}
                        style={styles.input}
                      />
                    </label>
                    {!isStockType && (
                      <label style={styles.builderLabel}>
                        Tax type
                        <select
                          value={requestBuilder.taxType || 'VAT_ABLE'}
                          onChange={(e) => handleBuilderFieldChange('taxType', e.target.value)}
                          style={styles.input}
                        >
                          {taxTypeOptions.map((tax) => (
                            <option key={tax.value} value={tax.value}>
                              {tax.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {formState.posApiType?.startsWith('B2B') && (
                      <label style={styles.builderLabel}>
                        Customer TIN
                        <input
                          type="text"
                          value={requestBuilder.customerTin || ''}
                          onChange={(e) => handleBuilderFieldChange('customerTin', e.target.value)}
                          style={styles.input}
                        />
                      </label>
                    )}
                    {!formState.posApiType?.startsWith('B2B') && isReceiptType && (
                      <label style={styles.builderLabel}>
                        Consumer number / phone
                        <input
                          type="text"
                          value={requestBuilder.consumerNo || ''}
                          onChange={(e) => handleBuilderFieldChange('consumerNo', e.target.value)}
                          style={styles.input}
                        />
                      </label>
                    )}
                    {isReceiptType && (
                      <>
                        <label style={styles.builderLabel}>
                          Total amount
                          <input
                            type="number"
                            value={requestBuilder.totalAmount ?? 0}
                            onChange={(e) =>
                              handleBuilderFieldChange('totalAmount', Number(e.target.value) || 0)
                            }
                            style={styles.input}
                          />
                        </label>
                        <label style={styles.builderLabel}>
                          Total VAT
                          <input
                            type="number"
                            value={requestBuilder.totalVAT ?? 0}
                            onChange={(e) =>
                              handleBuilderFieldChange('totalVAT', Number(e.target.value) || 0)
                            }
                            style={styles.input}
                            disabled={requestBuilder.taxType !== 'VAT_ABLE'}
                          />
                        </label>
                        <label style={styles.builderLabel}>
                          Total city tax
                          <input
                            type="number"
                            value={requestBuilder.totalCityTax ?? 0}
                            onChange={(e) =>
                              handleBuilderFieldChange('totalCityTax', Number(e.target.value) || 0)
                            }
                            style={styles.input}
                            disabled={requestBuilder.taxType !== 'VAT_ABLE'}
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>
              </details>

              {formState.usage === 'transaction' && (
                <details open style={styles.detailSection}>
                  <summary style={styles.detailSummary}>Receipt &amp; invoice samples</summary>
                  <div style={styles.detailBody}>
                    <p style={styles.sectionHelp}>
                      Each <code>receipts[]</code> entry must declare one of the following tax types.
                      Create a separate receipt group when a sale mixes different tax treatments.
                    </p>
                    <ul style={styles.inlineList}>
                      {TAX_TYPES.map((tax) => (
                        <li key={`tax-${tax.value}`} style={styles.inlineListItem}>
                          <strong>{tax.value}</strong>
                          {TAX_TYPE_DESCRIPTIONS[tax.value]
                            ? ` – ${TAX_TYPE_DESCRIPTIONS[tax.value]}`
                            : ''}
                        </li>
                      ))}
                    </ul>
                    <div style={styles.sampleGrid}>
                      {POSAPI_TYPES.map((type) => {
                        const sample = RECEIPT_SAMPLE_PAYLOADS[type.value];
                        if (!sample) return null;
                        const pretty = JSON.stringify(sample, null, 2);
                        return (
                          <div key={`sample-${type.value}`} style={styles.sampleCard}>
                            <div style={styles.sampleHeader}>
                              <strong>{type.label}</strong>
                              <div style={styles.sampleActions}>
                                <button
                                  type="button"
                                  onClick={() => handleApplySamplePayload(type.value)}
                                  style={styles.smallButton}
                                >
                                  Use in builder
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopySamplePayload(type.value)}
                                  style={styles.smallSecondaryButton}
                                >
                                  Copy JSON
                                </button>
                              </div>
                            </div>
                            <pre style={styles.samplePre}>{pretty}</pre>
                          </div>
                        );
                      })}
                    </div>
                    <div style={styles.sampleImportContainer}>
                      <label style={styles.sampleImportLabel}>
                        Paste a sample JSON payload
                        <textarea
                          value={sampleImportText}
                          onChange={(e) => setSampleImportText(e.target.value)}
                          style={styles.sampleTextarea}
                          placeholder={`{\n  "type": "B2C_RECEIPT",\n  "receipts": []\n}`}
                          rows={6}
                        />
                      </label>
                      <div style={styles.sampleImportControls}>
                        <button type="button" onClick={handleSampleImport} style={styles.smallButton}>
                          Import to builder
                        </button>
                        <label style={styles.sampleFileLabel}>
                          <span>Upload JSON file</span>
                          <input
                            type="file"
                            accept="application/json,.json"
                            onChange={handleSampleFile}
                            style={styles.sampleFileInput}
                          />
                        </label>
                      </div>
                      {sampleImportError && <div style={styles.previewErrorBox}>{sampleImportError}</div>}
                    </div>
                  </div>
                </details>
              )}

              {isReceiptType && receiptItemsEnabled && (
                <details open style={styles.detailSection}>
                  <summary style={styles.detailSummary}>Receipts by tax type</summary>
                  <div style={styles.detailBody}>
                    <p style={styles.sectionHelp}>
                      Create one receipt group per tax type. Each group contains its own items and totals.
                    </p>
                    {(Array.isArray(requestBuilder.receipts) ? requestBuilder.receipts : []).map(
                      (receipt, index) => {
                        const items = Array.isArray(receipt.items) ? receipt.items : [];
                        const showVatFields = receipt.taxType === 'VAT_ABLE';
                        const showTaxProduct =
                          receipt.taxType === 'VAT_FREE' || receipt.taxType === 'VAT_ZERO';
                        return (
                          <div key={`receipt-${index}`} style={styles.receiptCard}>
                            <div style={styles.receiptHeader}>
                              <div>
                                <strong>Receipt group {index + 1}</strong>
                                <span style={styles.receiptSub}>Tax type: {receipt.taxType}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeReceiptGroup(index)}
                                style={styles.smallDangerButton}
                              >
                                Remove group
                              </button>
                            </div>
                            <div style={styles.builderGrid}>
                              <label style={styles.builderLabel}>
                                Tax type
                                <select
                                  value={receipt.taxType || 'VAT_ABLE'}
                                  onChange={(e) => handleReceiptChange(index, 'taxType', e.target.value)}
                                  style={styles.input}
                                >
                                  {taxTypeOptions.map((tax) => (
                                    <option key={tax.value} value={tax.value}>
                                      {tax.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label style={styles.builderLabel}>
                                Group amount
                                <input
                                  type="number"
                                  value={receipt.totalAmount ?? 0}
                                  onChange={(e) =>
                                    handleReceiptChange(index, 'totalAmount', Number(e.target.value) || 0)
                                  }
                                  style={styles.input}
                                />
                              </label>
                              {showVatFields && (
                                <>
                                  <label style={styles.builderLabel}>
                                    Group VAT
                                    <input
                                      type="number"
                                      value={receipt.totalVAT ?? 0}
                                      onChange={(e) =>
                                        handleReceiptChange(index, 'totalVAT', Number(e.target.value) || 0)
                                      }
                                      style={styles.input}
                                    />
                                  </label>
                                  <label style={styles.builderLabel}>
                                    Group city tax
                                    <input
                                      type="number"
                                      value={receipt.totalCityTax ?? 0}
                                      onChange={(e) =>
                                        handleReceiptChange(index, 'totalCityTax', Number(e.target.value) || 0)
                                      }
                                      style={styles.input}
                                    />
                                  </label>
                                </>
                              )}
                              {showTaxProduct && (
                                <label style={styles.builderLabel}>
                                  Tax product code
                                  <input
                                    type="text"
                                    list="taxProductCodes"
                                    value={receipt.taxProductCode ?? ''}
                                    onChange={(e) => handleReceiptChange(index, 'taxProductCode', e.target.value)}
                                    style={styles.input}
                                    placeholder="Select or type the exemption reason"
                                  />
                                </label>
                              )}
                            </div>

                            {supportsItems ? (
                              <div style={styles.itemsContainer}>
                                {items.map((item, itemIndex) => (
                                  <div key={`item-${itemIndex}`} style={styles.itemCard}>
                                    <div style={styles.itemHeader}>
                                      <strong>Item {itemIndex + 1}</strong>
                                      <button
                                        type="button"
                                      onClick={() => removeReceiptItem(index, itemIndex)}
                                      style={styles.smallButton}
                                    >
                                      Remove item
                                    </button>
                                  </div>
                                  <div style={styles.builderGrid}>
                                    <label style={styles.builderLabel}>
                                      Name
                                      <input
                                        type="text"
                                        value={item.name || ''}
                                        onChange={(e) =>
                                          handleReceiptItemChange(index, itemIndex, 'name', e.target.value)
                                        }
                                        style={styles.input}
                                      />
                                    </label>
                                    <label style={styles.builderLabel}>
                                      Barcode
                                      <input
                                        type="text"
                                        value={item.barCode || ''}
                                        onChange={(e) =>
                                          handleReceiptItemChange(index, itemIndex, 'barCode', e.target.value)
                                        }
                                        style={styles.input}
                                      />
                                    </label>
                                    <label style={styles.builderLabel}>
                                      Classification code
                                      <input
                                        type="text"
                                        value={item.classificationCode || ''}
                                        onChange={(e) =>
                                          handleReceiptItemChange(
                                            index,
                                            itemIndex,
                                            'classificationCode',
                                            e.target.value,
                                          )
                                        }
                                        style={styles.input}
                                      />
                                    </label>
                                    {showTaxProduct && (
                                      <label style={styles.builderLabel}>
                                        Tax product code
                                        <input
                                          type="text"
                                          list="taxProductCodes"
                                          value={item.taxProductCode ?? ''}
                                          onChange={(e) =>
                                            handleReceiptItemChange(
                                              index,
                                              itemIndex,
                                              'taxProductCode',
                                              e.target.value,
                                            )
                                          }
                                          style={styles.input}
                                        />
                                      </label>
                                    )}
                                    <label style={styles.builderLabel}>
                                      Measure unit
                                      <input
                                        type="text"
                                        value={item.measureUnit || ''}
                                        onChange={(e) =>
                                          handleReceiptItemChange(
                                            index,
                                            itemIndex,
                                            'measureUnit',
                                            e.target.value,
                                          )
                                        }
                                        style={styles.input}
                                      />
                                    </label>
                                    <label style={styles.builderLabel}>
                                      Quantity
                                      <input
                                        type="number"
                                        value={item.qty ?? 0}
                                        onChange={(e) =>
                                          handleReceiptItemChange(
                                            index,
                                            itemIndex,
                                            'qty',
                                            Number(e.target.value) || 0,
                                          )
                                        }
                                        style={styles.input}
                                      />
                                    </label>
                                    <label style={styles.builderLabel}>
                                      Unit price
                                      <input
                                        type="number"
                                        value={item.price ?? 0}
                                        onChange={(e) =>
                                          handleReceiptItemChange(
                                            index,
                                            itemIndex,
                                            'price',
                                            Number(e.target.value) || 0,
                                          )
                                        }
                                        style={styles.input}
                                      />
                                    </label>
                                    {showVatFields && (
                                      <label style={styles.builderLabel}>
                                        City tax
                                        <input
                                          type="number"
                                          value={item.cityTax ?? 0}
                                          onChange={(e) =>
                                            handleReceiptItemChange(
                                              index,
                                              itemIndex,
                                              'cityTax',
                                              Number(e.target.value) || 0,
                                            )
                                          }
                                          style={styles.input}
                                        />
                                      </label>
                                    )}
                                    <label style={styles.builderLabel}>
                                      VAT tax type
                                      <select
                                        value={item.vatTaxType || receipt.taxType || 'VAT_ABLE'}
                                        onChange={(e) =>
                                          handleReceiptItemChange(
                                            index,
                                            itemIndex,
                                            'vatTaxType',
                                            e.target.value,
                                          )
                                        }
                                        style={styles.input}
                                      >
                                        {taxTypeOptions.map((tax) => (
                                          <option key={tax.value} value={tax.value}>
                                            {tax.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label style={styles.builderLabel}>
                                      Lot number
                                      <input
                                        type="text"
                                        value={item.lotNo || ''}
                                        onChange={(e) =>
                                          handleReceiptItemChange(index, itemIndex, 'lotNo', e.target.value)
                                        }
                                        style={styles.input}
                                      />
                                    </label>
                                  </div>
                                </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => addReceiptItem(index)}
                                  style={styles.smallButton}
                                >
                                  + Add item
                                </button>
                              </div>
                            ) : (
                              <div style={styles.serviceOnlyHint}>
                                Items are disabled for this endpoint. Enable "Includes receipt items" and
                                the "Enable receipt items" toggle to manage goods-level details.
                              </div>
                            )}
                          </div>
                        );
                      },
                    )}
                    <button type="button" onClick={addReceiptGroup} style={styles.smallButton}>
                      + Add receipt group
                    </button>
                  </div>
                </details>
              )}

              {isReceiptType && (
                <details open style={styles.detailSection}>
                  <summary style={styles.detailSummary}>Payments</summary>
                  <div style={styles.detailBody}>
                    <div style={styles.paymentsTable}>
                      {(Array.isArray(requestBuilder.payments) ? requestBuilder.payments : []).map(
                        (payment, index) => {
                          const type = payment.type || 'CASH';
                          const draftKey = String(index);
                          const draftValue =
                            paymentDataDrafts[draftKey] ?? JSON.stringify(payment.data ?? {}, null, 2);
                          const dataError = paymentDataErrors[draftKey];
                          const isPaymentCard = type === 'PAYMENT_CARD';
                          const isEasyBank = type === 'EASY_BANK_CARD';
                          return (
                            <div key={`payment-${index}`} style={styles.paymentGroup}>
                              <div style={styles.paymentRow}>
                                <select
                                  value={type}
                                  onChange={(e) => handlePaymentChange(index, 'type', e.target.value)}
                                  style={styles.paymentSelect}
                                  title={PAYMENT_DESCRIPTIONS[type] || ''}
                                >
                                  {paymentTypeOptions.map((paymentType) => (
                                    <option key={paymentType.value} value={paymentType.value}>
                                      {paymentType.label}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  value={payment.amount ?? 0}
                                  onChange={(e) =>
                                    handlePaymentChange(index, 'amount', Number(e.target.value) || 0)
                                  }
                                  style={styles.paymentAmount}
                                />
                                <button
                                  type="button"
                                  onClick={() => removePayment(index)}
                                  style={styles.smallDangerButton}
                                >
                                  Remove
                                </button>
                              </div>
                              {isPaymentCard && (
                                <div style={styles.paymentDataContainer}>
                                  <label style={styles.paymentDataLabel}>
                                    Payment data (JSON)
                                    <textarea
                                      value={draftValue}
                                      onChange={(e) => handlePaymentDataChange(index, e.target.value)}
                                      style={styles.paymentDataTextarea}
                                      rows={4}
                                    />
                                  </label>
                                  {dataError && <div style={styles.inlineError}>{dataError}</div>}
                                </div>
                              )}
                              {isEasyBank && (
                                <div style={styles.paymentDataContainer}>
                                  <div style={styles.easyBankGrid}>
                                    <label style={styles.paymentDataLabel}>
                                      Retrieval reference number (RRN)
                                      <input
                                        type="text"
                                        value={payment.data?.rrn || ''}
                                        onChange={(e) => handleEasyBankDataChange(index, 'rrn', e.target.value)}
                                        style={styles.input}
                                      />
                                    </label>
                                    <label style={styles.paymentDataLabel}>
                                      Approval code
                                      <input
                                        type="text"
                                        value={payment.data?.approvalCode || ''}
                                        onChange={(e) =>
                                          handleEasyBankDataChange(index, 'approvalCode', e.target.value)
                                        }
                                        style={styles.input}
                                      />
                                    </label>
                                    <label style={styles.paymentDataLabel}>
                                      Terminal ID
                                      <input
                                        type="text"
                                        value={payment.data?.terminalId || ''}
                                        onChange={(e) =>
                                          handleEasyBankDataChange(index, 'terminalId', e.target.value)
                                        }
                                        style={styles.input}
                                      />
                                    </label>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                    <div style={styles.paymentSummary}>
                      <div>Payment total: {paymentsTotal.toLocaleString()}</div>
                      <div>Total amount: {(requestBuilder.totalAmount ?? 0).toLocaleString()}</div>
                      {!paymentsBalanced && (
                        <div style={styles.warningText}>
                          The sum of payments must equal the total amount.
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={addPayment} style={styles.smallButton}>
                      + Add payment method
                    </button>
                  </div>
                </details>
              )}

              {isStockType && (
                <details open style={styles.detailSection}>
                  <summary style={styles.detailSummary}>Stock QR payload</summary>
                  <div style={styles.detailBody}>
                    <p style={styles.sectionHelp}>
                      Define the stock codes that should be encoded into the QR payload.
                    </p>
                    {(Array.isArray(requestBuilder.stockCodes) ? requestBuilder.stockCodes : []).map(
                      (stock, index) => (
                        <div key={`stock-${index}`} style={styles.itemCard}>
                          <div style={styles.itemHeader}>
                            <strong>Stock entry {index + 1}</strong>
                            <button
                              type="button"
                              onClick={() => removeStockItem(index)}
                              style={styles.smallButton}
                            >
                              Remove
                            </button>
                          </div>
                          <div style={styles.builderGrid}>
                            <label style={styles.builderLabel}>
                              Code
                              <input
                                type="text"
                                value={stock.code || ''}
                                onChange={(e) => handleStockItemChange(index, 'code', e.target.value)}
                                style={styles.input}
                              />
                            </label>
                            <label style={styles.builderLabel}>
                              Name
                              <input
                                type="text"
                                value={stock.name || ''}
                                onChange={(e) => handleStockItemChange(index, 'name', e.target.value)}
                                style={styles.input}
                              />
                            </label>
                            <label style={styles.builderLabel}>
                              Classification code
                              <input
                                type="text"
                                value={stock.classificationCode || ''}
                                onChange={(e) =>
                                  handleStockItemChange(index, 'classificationCode', e.target.value)
                                }
                                style={styles.input}
                              />
                            </label>
                            <label style={styles.builderLabel}>
                              Quantity
                              <input
                                type="number"
                                value={stock.qty ?? 0}
                                onChange={(e) =>
                                  handleStockItemChange(index, 'qty', Number(e.target.value) || 0)
                                }
                                style={styles.input}
                              />
                            </label>
                            <label style={styles.builderLabel}>
                              Measure unit
                              <input
                                type="text"
                                value={stock.measureUnit || ''}
                                onChange={(e) => handleStockItemChange(index, 'measureUnit', e.target.value)}
                                style={styles.input}
                              />
                            </label>
                            <label style={styles.builderLabel}>
                              Lot number
                              <input
                                type="text"
                                value={stock.lotNo || ''}
                                onChange={(e) => handleStockItemChange(index, 'lotNo', e.target.value)}
                                style={styles.input}
                              />
                            </label>
                          </div>
                        </div>
                      ),
                    )}
                    <button type="button" onClick={addStockItem} style={styles.smallButton}>
                      + Add stock entry
                    </button>
                  </div>
                </details>
              )}
            </>
          )}
          <datalist id="taxProductCodes">
            {TAX_PRODUCT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} label={option.label} />
            ))}
          </datalist>
        </section>

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
          Request body schema (JSON)
          <textarea
            value={formState.requestSchemaText}
            onChange={(e) => handleChange('requestSchemaText', e.target.value)}
            style={styles.textarea}
            rows={10}
          />
        </label>
        <label style={styles.labelFull}>
          Response description
          <input
            type="text"
            value={formState.responseDescription}
            onChange={(e) => handleChange('responseDescription', e.target.value)}
            style={styles.input}
            placeholder="Receipt submission response"
          />
        </label>
        <label style={styles.labelFull}>
          Response body schema (JSON)
          <textarea
            value={formState.responseSchemaText}
            onChange={(e) => handleChange('responseSchemaText', e.target.value)}
            style={styles.textarea}
            rows={10}
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
              {requestFieldHints.state === 'ok' && (
                <span style={styles.hintCount}>{requestFieldHints.items.length} fields</span>
              )}
            </div>
            {requestFieldHints.state === 'empty' && (
              <p style={styles.hintEmpty}>Add request field hints in the JSON textarea above.</p>
            )}
            {requestFieldHints.state === 'error' && (
              <div style={styles.hintError}>{requestFieldHints.error}</div>
            )}
            {requestFieldHints.state === 'ok' && (
              <ul style={styles.hintList}>
                {requestFieldHints.items.map((hint, index) => {
                  const normalized = normalizeHintEntry(hint);
                  const fieldLabel = normalized.field || '(unnamed field)';
                  return (
                    <li key={`request-hint-${fieldLabel}-${index}`} style={styles.hintItem}>
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
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div style={styles.hintCard}>
            <div style={styles.hintHeader}>
              <h3 style={styles.hintTitle}>Response fields</h3>
              {responseFieldHints.state === 'ok' && (
                <span style={styles.hintCount}>{responseFieldHints.items.length} fields</span>
              )}
            </div>
            {responseFieldHints.state === 'empty' && (
              <p style={styles.hintEmpty}>Add response field hints in the JSON textarea above.</p>
            )}
            {responseFieldHints.state === 'error' && (
              <div style={styles.hintError}>{responseFieldHints.error}</div>
            )}
            {responseFieldHints.state === 'ok' && (
              <ul style={styles.hintList}>
                {responseFieldHints.items.map((hint, index) => {
                  const normalized = normalizeHintEntry(hint);
                  const fieldLabel = normalized.field || '(unnamed field)';
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
          <label style={{ ...styles.label, flex: 1 }}>
            Test server URL
            <input
              type="text"
              value={formState.testServerUrl}
              onChange={(e) => handleChange('testServerUrl', e.target.value)}
              style={styles.input}
              placeholder="https://posapi-test.tax.gov.mn"
            />
          </label>
          <label style={{ ...styles.checkboxLabel, marginTop: '1.5rem' }}>
            <input
              type="checkbox"
              checked={formState.testable}
              onChange={(e) => handleChange('testable', e.target.checked)}
            />
            Testable endpoint
          </label>
        </div>

        <div style={styles.previewSection}>
          <div style={styles.previewCard}>
            <div style={styles.previewHeader}>
              <h3 style={styles.previewTitle}>Request sample</h3>
              {requestPreview.state === 'ok' && <span style={styles.previewTag}>JSON</span>}
            </div>
            {requestPreview.state === 'empty' && (
              <p style={styles.previewEmpty}>Paste JSON above to see a preview.</p>
            )}
            {requestPreview.state === 'error' && (
              <div style={styles.previewErrorBox}>
                <strong>Invalid JSON:</strong> {requestPreview.error}
              </div>
            )}
            {requestPreview.state === 'ok' && (
              <pre style={styles.codeBlock}>{requestPreview.formatted}</pre>
            )}
          </div>
          <div style={styles.previewCard}>
            <div style={styles.previewHeader}>
              <h3 style={styles.previewTitle}>Response sample</h3>
              {responsePreview.state === 'ok' && <span style={styles.previewTag}>JSON</span>}
            </div>
            {responsePreview.state === 'empty' && (
              <p style={styles.previewEmpty}>Paste JSON above to see a preview.</p>
            )}
            {responsePreview.state === 'error' && (
              <div style={styles.previewErrorBox}>
                <strong>Invalid JSON:</strong> {responsePreview.error}
              </div>
            )}
            {responsePreview.state === 'ok' && (
              <pre style={styles.codeBlock}>{responsePreview.formatted}</pre>
            )}
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
          <button type="button" onClick={handleFetchDoc} disabled={loading} style={styles.fetchButton}>
            {loading ? 'Fetching…' : 'Fetch documentation'}
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

        <div style={styles.actions}>
          <button
            type="button"
            onClick={handleTest}
            disabled={
              loading ||
              testState.running ||
              !formState.testable ||
              !formState.testServerUrl.trim()
            }
            style={styles.testButton}
          >
            {testState.running ? 'Testing…' : 'Test endpoint'}
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || (!selectedId && !formState.id)}
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

      {activeTab === 'info' && (
        <div style={styles.infoContainer}>
          <h1>POSAPI Information</h1>
          <p style={{ maxWidth: '760px' }}>
            Configure automated synchronization of POSAPI reference data and manually refresh or
            upload static CSV lists such as classification and VAT exemption reasons.
          </p>
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
              <div style={styles.inlineFields}>
                <label style={{ ...styles.label, flex: 1 }}>
                  Usage
                  <select
                    value={infoSyncUsage}
                    onChange={(e) => handleInfoUsageChange(e.target.value)}
                    style={styles.input}
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
                </label>
                <label style={{ ...styles.label, flex: 1 }}>
                  Tables to sync
                  <select
                    multiple
                    value={infoSyncTables}
                    onChange={handleInfoTableSelection}
                    style={{ ...styles.input, minHeight: '140px' }}
                  >
                    {infoSyncTableOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span style={styles.checkboxHint}>Leave empty to update every table.</span>
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
              <h3 style={{ marginTop: 0 }}>Upload static lists (CSV)</h3>
              <p>Select the code type and upload a CSV with columns <code>code,name</code>.</p>
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
                  CSV file
                  <input type="file" accept=".csv,text/csv" onChange={handleStaticUpload} style={styles.input} />
                </label>
              </div>
            </div>
          </div>
          <div style={styles.infoActions}>
            <button type="button" style={styles.saveButton} onClick={saveInfoSettings} disabled={infoSyncLoading}>
              {infoSyncLoading ? 'Saving…' : 'Save settings'}
            </button>
          </div>
          <div style={styles.logsCard}>
            <h3 style={{ marginTop: 0 }}>Synchronization log</h3>
            {infoSyncLogs.length === 0 && <p style={{ margin: 0 }}>No sync history yet.</p>}
            {infoSyncLogs.length > 0 && (
              <table style={styles.logTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Duration (ms)</th>
                    <th>Added</th>
                    <th>Updated</th>
                    <th>Inactive</th>
                    <th>Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {infoSyncLogs.map((log, index) => (
                    <tr key={`${log.timestamp}-${index}`}>
                      <td>{new Date(log.timestamp).toLocaleString()}</td>
                      <td>{log.durationMs || 0}</td>
                      <td>{log.added || 0}</td>
                      <td>{log.updated || 0}</td>
                      <td>{log.deactivated || 0}</td>
                      <td>{log.trigger || 'manual'}</td>
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
    alignItems: 'flex-start',
  },
  infoContainer: {
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '1.5rem',
    background: '#fff',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '1rem',
    marginTop: '1rem',
    marginBottom: '1rem',
  },
  infoActions: {
    display: 'flex',
    justifyContent: 'flex-end',
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
  infoMeta: {
    marginTop: '0.5rem',
    fontSize: '0.9rem',
    color: '#334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
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
  },
  listButtonActive: {
    borderColor: '#2563eb',
    background: '#dbeafe',
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
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '1.5rem',
    maxWidth: '900px',
    position: 'relative',
    overflow: 'hidden',
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
  sampleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '1rem',
    marginTop: '1rem',
  },
  sampleCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
  },
  sampleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  sampleActions: {
    display: 'flex',
    gap: '0.4rem',
  },
  samplePre: {
    background: '#0f172a',
    color: '#f8fafc',
    borderRadius: '4px',
    padding: '0.75rem',
    fontSize: '0.75rem',
    maxHeight: '220px',
    overflow: 'auto',
  },
  sampleImportContainer: {
    marginTop: '1rem',
    borderTop: '1px solid #e2e8f0',
    paddingTop: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  sampleImportLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    fontWeight: 600,
    fontSize: '0.85rem',
    color: '#1f2937',
  },
  sampleTextarea: {
    width: '100%',
    borderRadius: '4px',
    border: '1px solid #cbd5f5',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    padding: '0.6rem',
  },
  sampleImportControls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    alignItems: 'center',
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
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
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
