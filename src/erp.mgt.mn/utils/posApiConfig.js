export const POS_API_FIELDS = [
  { key: 'totalAmount', label: 'Total amount' },
  { key: 'totalVAT', label: 'Total VAT' },
  { key: 'totalCityTax', label: 'Total city tax' },
  { key: 'customerTin', label: 'Customer TIN' },
  { key: 'consumerNo', label: 'Consumer number' },
  { key: 'taxType', label: 'Tax type' },
  { key: 'lotNo', label: 'Lot number (pharmacy)' },
  { key: 'branchNo', label: 'Branch number' },
  { key: 'posNo', label: 'POS number' },
  { key: 'merchantTin', label: 'Merchant TIN override' },
  { key: 'districtCode', label: 'District code' },
  { key: 'itemsField', label: 'Items array column' },
  { key: 'paymentsField', label: 'Payments array column' },
  { key: 'receiptsField', label: 'Receipts array column' },
  { key: 'paymentType', label: 'Default payment type column' },
  { key: 'taxTypeField', label: 'Header tax type column' },
  { key: 'classificationCodeField', label: 'Classification code column' },
];

export const POS_API_ITEM_FIELDS = [
  { key: 'name', label: 'Item name' },
  { key: 'description', label: 'Item description' },
  { key: 'qty', label: 'Quantity' },
  { key: 'price', label: 'Unit price' },
  { key: 'totalAmount', label: 'Line total amount' },
  { key: 'totalVAT', label: 'Line VAT' },
  { key: 'totalCityTax', label: 'Line city tax' },
  { key: 'taxType', label: 'Line tax type' },
  { key: 'classificationCode', label: 'Classification code' },
  { key: 'taxProductCode', label: 'Tax product code' },
  { key: 'barCode', label: 'Barcode' },
  { key: 'measureUnit', label: 'Measure unit' },
];

export const POS_API_PAYMENT_FIELDS = [
  { key: 'type', label: 'Payment type' },
  { key: 'paidAmount', label: 'Paid amount' },
  { key: 'amount', label: 'Amount (legacy)' },
  { key: 'status', label: 'Status' },
  { key: 'currency', label: 'Currency' },
  { key: 'method', label: 'Method' },
  { key: 'reference', label: 'Reference number' },
  { key: 'data.terminalID', label: 'Terminal ID' },
  { key: 'data.rrn', label: 'RRN' },
  { key: 'data.maskedCardNumber', label: 'Masked card number' },
  { key: 'data.easy', label: 'Easy Bank flag' },
];

export const POS_API_RECEIPT_FIELDS = [
  { key: 'totalAmount', label: 'Receipt total amount' },
  { key: 'totalVAT', label: 'Receipt total VAT' },
  { key: 'totalCityTax', label: 'Receipt total city tax' },
  { key: 'taxType', label: 'Receipt tax type' },
  { key: 'items', label: 'Receipt items path' },
  { key: 'payments', label: 'Receipt payments path' },
  { key: 'description', label: 'Receipt description' },
];

export const SERVICE_RECEIPT_FIELDS = [
  { key: 'totalAmount', label: 'Total amount' },
  { key: 'totalVAT', label: 'Total VAT' },
  { key: 'totalCityTax', label: 'Total city tax' },
  { key: 'taxType', label: 'Tax type override' },
];

export const SERVICE_PAYMENT_FIELDS = [
  { key: 'paidAmount', label: 'Paid amount' },
  { key: 'amount', label: 'Amount (legacy)' },
  { key: 'currency', label: 'Currency' },
  { key: 'reference', label: 'Reference number' },
];

export const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  PAYMENT_CARD: 'Payment card',
  BANK_TRANSFER: 'Bank transfer',
  MOBILE_WALLET: 'Mobile wallet',
  EASY_BANK_CARD: 'Easy Bank card',
  SERVICE_PAYMENT: 'Service payment',
};

export const DEFAULT_ENDPOINT_RECEIPT_TYPES = [
  'B2C',
  'B2B_SALE',
  'B2B_PURCHASE',
  'STOCK_QR',
];

export const DEFAULT_ENDPOINT_TAX_TYPES = ['VAT_ABLE', 'VAT_FREE', 'VAT_ZERO', 'NO_VAT'];

export const DEFAULT_ENDPOINT_PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS);

export const BADGE_BASE_STYLE = {
  borderRadius: '999px',
  padding: '0.1rem 0.5rem',
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

export const REQUIRED_BADGE_STYLE = {
  background: '#fee2e2',
  color: '#b91c1c',
};

export const OPTIONAL_BADGE_STYLE = {
  background: '#e2e8f0',
  color: '#475569',
};

export function resolveFeatureToggle(value, supported, fallback = supported) {
  if (!supported) return false;
  if (typeof value === 'boolean') return value;
  return fallback;
}

export function normaliseEndpointUsage(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (['transaction', 'info', 'admin'].includes(normalized)) return normalized;
  return 'other';
}

export function normaliseEndpointList(list, fallback) {
  const source = Array.isArray(list) ? list : fallback;
  const cleaned = source
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  const effective = cleaned.length > 0 ? cleaned : fallback;
  return Array.from(new Set(effective));
}

export function withEndpointMetadata(endpoint) {
  if (!endpoint || typeof endpoint !== 'object') return endpoint;
  const usage = normaliseEndpointUsage(endpoint.usage);
  const isTransaction = usage === 'transaction';
  const inferredReceiptTypes = Array.isArray(endpoint.receiptTypes) ? endpoint.receiptTypes : [];
  const inferredTaxTypes = Array.isArray(endpoint.taxTypes)
    ? endpoint.taxTypes
    : Array.isArray(endpoint.receiptTaxTypes)
      ? endpoint.receiptTaxTypes
      : [];
  const inferredPaymentMethods = Array.isArray(endpoint.paymentMethods) ? endpoint.paymentMethods : [];
  const receiptTypesEnabled = isTransaction
    ? endpoint.enableReceiptTypes === true || inferredReceiptTypes.length > 0
    : false;
  const receiptTaxTypesEnabled = isTransaction
    ? endpoint.enableReceiptTaxTypes === true || inferredTaxTypes.length > 0
    : false;
  const paymentMethodsEnabled = isTransaction
    ? endpoint.enablePaymentMethods === true || inferredPaymentMethods.length > 0
    : false;
  const receiptItemsEnabled = isTransaction && endpoint.supportsItems === true && endpoint.enableReceiptItems !== false;
  const allowMultipleReceiptTypes = receiptTypesEnabled && endpoint.allowMultipleReceiptTypes !== false;
  const allowMultipleReceiptTaxTypes = receiptTaxTypesEnabled && endpoint.allowMultipleReceiptTaxTypes !== false;
  const allowMultiplePaymentMethods = paymentMethodsEnabled && endpoint.allowMultiplePaymentMethods !== false;
  const allowMultipleReceiptItems = receiptItemsEnabled && endpoint.allowMultipleReceiptItems !== false;
  const receiptTypes = receiptTypesEnabled
    ? normaliseEndpointList(inferredReceiptTypes, [])
    : [];
  const receiptTaxTypes = receiptTaxTypesEnabled
    ? normaliseEndpointList(inferredTaxTypes, [])
    : [];
  const paymentMethods = paymentMethodsEnabled
    ? normaliseEndpointList(inferredPaymentMethods, [])
    : [];
  const supportsItems = isTransaction && endpoint.supportsItems === true;
  return {
    ...endpoint,
    usage,
    defaultForForm: isTransaction ? Boolean(endpoint.defaultForForm) : false,
    supportsMultipleReceipts: isTransaction ? Boolean(endpoint.supportsMultipleReceipts) : false,
    supportsMultiplePayments: isTransaction ? Boolean(endpoint.supportsMultiplePayments) : false,
    supportsItems,
    enableReceiptTypes: receiptTypesEnabled,
    allowMultipleReceiptTypes,
    receiptTypes,
    enableReceiptTaxTypes: receiptTaxTypesEnabled,
    allowMultipleReceiptTaxTypes,
    receiptTaxTypes,
    enablePaymentMethods: paymentMethodsEnabled,
    allowMultiplePaymentMethods,
    paymentMethods,
    enableReceiptItems: receiptItemsEnabled,
    allowMultipleReceiptItems,
  };
}

export function withPosApiEndpointMetadata(endpoint) {
  return withEndpointMetadata(endpoint);
}

export function formatPosApiTypeLabel(type) {
  if (!type) return '';
  const lookup = {
    B2C: 'B2C Receipt',
    B2B_SALE: 'B2B Sale Invoice',
    B2B_PURCHASE: 'B2B Purchase Invoice',
    STOCK_QR: 'Stock QR Receipt',
  };
  return lookup[type] || type.replace(/_/g, ' ');
}

export function formatPosApiTypeLabelText(type) {
  return formatPosApiTypeLabel(type);
}
