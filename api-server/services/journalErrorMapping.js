export function mapJournalErrorToStatus(error) {
  const message = String(error?.message || error || 'Unknown journal error');
  const code = String(error?.code || '').trim().toUpperCase();
  const businessPatterns = [
    'Transaction not found',
    'missing TransType',
    'No fin_flag_set_code configured',
    'No matching fin_journal_rule',
    'has no journal lines',
    'Journal imbalance detected',
    'FS_NON_FINANCIAL',
    'Invalid source_table',
    'source_id must be a positive integer',
  ];
  const isBusiness = businessPatterns.some((pattern) => message.includes(pattern));
  const looksLikeSqlValidationError =
    code.startsWith('ER_') ||
    message.includes('Unknown column') ||
    message.includes("doesn't exist") ||
    message.includes('Incorrect') ||
    message.includes('Invalid');

  return {
    status: isBusiness || looksLikeSqlValidationError || message ? 400 : 500,
    message,
  };
}
