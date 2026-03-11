export function isProductionMode() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

export function normalizeSourceTransactionCode(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function extractEventSourceTransactionCode(event = {}) {
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  return normalizeSourceTransactionCode(
    payload.transactionCode
      ?? payload.transaction_type_code
      ?? payload.transaction_code
      ?? payload?.postingRequest?.transaction_code
      ?? payload?.after?.transaction_type
      ?? payload?.after?.trtype
      ?? payload?.after?.UITransType
      ?? payload?.before?.transaction_type
      ?? payload?.before?.trtype
      ?? payload?.before?.UITransType,
  );
}

export function buildEventPolicyWhereClause({
  companyId,
  eventType,
  sourceTable = null,
  sourceTransactionType = null,
  sourceTransactionCode = null,
  includeSamplePolicies = true,
} = {}) {
  const where = [
    'company_id = ?',
    'event_type = ?',
    'is_active = 1',
    'deleted_at IS NULL',
    '(source_table IS NULL OR source_table = ?)',
    '(source_transaction_type IS NULL OR source_transaction_type = ?)',
    '(source_transaction_code IS NULL OR source_transaction_code = ?)',
  ];

  const params = [
    companyId,
    eventType,
    sourceTable,
    sourceTransactionType,
    normalizeSourceTransactionCode(sourceTransactionCode),
  ];

  if (!includeSamplePolicies && isProductionMode()) {
    where.push('is_sample = 0');
  }

  return { whereSql: where.join(' AND '), params };
}
