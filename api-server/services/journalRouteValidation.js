export const ALLOWED_SOURCE_TABLES = new Set([
  'transactions_income',
  'transactions_expense',
  'transactions_inventory',
  'transactions_pos',
]);

export function validateJournalRequestBody(body = {}, { allowForceRepost = false } = {}) {
  const sourceTable = typeof body.source_table === 'string' ? body.source_table.trim() : '';
  const sourceId = Number(body.source_id);
  const forceRepost = allowForceRepost ? Boolean(body.force_repost) : false;

  if (!ALLOWED_SOURCE_TABLES.has(sourceTable)) {
    return { ok: false, message: 'Invalid source_table' };
  }
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return { ok: false, message: 'source_id must be a positive integer' };
  }

  return {
    ok: true,
    value: {
      source_table: sourceTable,
      source_id: sourceId,
      force_repost: forceRepost,
    },
  };
}
