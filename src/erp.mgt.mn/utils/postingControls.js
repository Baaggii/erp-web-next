export const POSTING_SOURCE_TABLES = new Set([
  'transactions_income',
  'transactions_expense',
  'transactions_inventory',
  'transactions_pos',
]);

export const NON_FINANCIAL_FLAG_SET_CODE = 'FS_NON_FINANCIAL';

export function isPostingSourceTable(table) {
  return POSTING_SOURCE_TABLES.has(String(table || '').trim());
}

export function isPostedStatus(value) {
  return String(value || '').trim().toUpperCase() === 'POSTED';
}

export function isNonFinancialRow(row = {}) {
  return String(row?.fin_flag_set_code || '').trim().toUpperCase() === NON_FINANCIAL_FLAG_SET_CODE;
}
