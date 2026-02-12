const NON_FINANCIAL_FLAG_SET_CODE = 'FS_NON_FINANCIAL';
const REQUIRED_CONDITION = 'REQUIRED';
const NOT_ALLOWED_CONDITION = 'NOT_ALLOWED';
const SUCCESS_STATUS = 'SUCCESS';
const FAILED_STATUS = 'FAILED';

const tableColumnCache = new Map();
let cachedDefaultPool = null;

async function getDefaultPool() {
  if (cachedDefaultPool) {
    return cachedDefaultPool;
  }
  const dbModule = await import('../../db/index.js');
  cachedDefaultPool = dbModule.pool;
  return cachedDefaultPool;
}

function normalizeIdentifier(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function assertSafeIdentifier(value, label) {
  const normalized = normalizeIdentifier(value);
  if (!/^[A-Za-z0-9_]+$/.test(normalized)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return normalized;
}

function pickFirstDefined(row, keys = []) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return undefined;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function evaluateExpression(expression, context = {}) {
  if (!expression || typeof expression !== 'string') {
    return 0;
  }
  const source = expression.trim();
  if (!source) {
    return 0;
  }

  const fn = new Function(
    'ctx',
    `"use strict"; const { txn, fields, Math: SafeMath } = ctx; return (${source});`,
  );
  const value = fn({ ...context, Math });
  return toNumber(value);
}

async function getTableColumns(conn, tableName) {
  if (tableColumnCache.has(tableName)) {
    return tableColumnCache.get(tableName);
  }
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName],
  );
  const columns = new Set(rows.map((row) => row.COLUMN_NAME));
  tableColumnCache.set(tableName, columns);
  return columns;
}

async function insertRow(conn, tableName, data) {
  const columns = await getTableColumns(conn, tableName);
  const entries = Object.entries(data).filter(([key, value]) => columns.has(key) && value !== undefined);
  if (!entries.length) {
    throw new Error(`No insertable columns found for table ${tableName}`);
  }

  const columnSql = entries.map(([key]) => `\`${key}\``).join(', ');
  const valuesSql = entries.map(() => '?').join(', ');
  const values = entries.map(([, value]) => value);
  const [result] = await conn.query(
    `INSERT INTO \`${tableName}\` (${columnSql}) VALUES (${valuesSql})`,
    values,
  );
  return result.insertId;
}

async function updateRowById(conn, tableName, id, data) {
  const columns = await getTableColumns(conn, tableName);
  const entries = Object.entries(data).filter(([key, value]) => columns.has(key) && value !== undefined);
  if (!entries.length) {
    return;
  }
  const setSql = entries.map(([key]) => `\`${key}\` = ?`).join(', ');
  const params = [...entries.map(([, value]) => value), id];
  await conn.query(`UPDATE \`${tableName}\` SET ${setSql} WHERE id = ?`, params);
}

function parseFlagList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseFlagList(parsed);
      } catch {
        // fall through to split parser
      }
    }
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, flagEnabled]) => Boolean(flagEnabled))
      .map(([flagCode]) => flagCode.trim())
      .filter(Boolean);
  }
  return [];
}

function deriveFlagsFromTransaction(transactionRow, financialFields) {
  const explicit = [
    ...parseFlagList(transactionRow?.fin_flags),
    ...parseFlagList(transactionRow?.flag_codes),
    ...parseFlagList(transactionRow?.flags),
  ];

  const fromMappedFields = Object.entries(financialFields || {})
    .filter(([, value]) => Boolean(value))
    .map(([fieldCode]) => fieldCode)
    .filter((code) => typeof code === 'string' && code.toUpperCase().startsWith('FLAG_'));

  return new Set([...explicit, ...fromMappedFields]);
}

async function fetchTransactionById(conn, sourceTable, sourceId) {
  return fetchTransactionByIdWithOptions(conn, sourceTable, sourceId, { forUpdate: true });
}

async function fetchTransactionByIdWithOptions(conn, sourceTable, sourceId, { forUpdate = false } = {}) {
  const safeTable = assertSafeIdentifier(sourceTable, 'source_table');
  const lockSql = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await conn.query(
    `SELECT * FROM \`${safeTable}\` WHERE id = ?${lockSql}`,
    [sourceId],
  );
  if (!rows.length) {
    throw new Error(`Transaction not found in ${safeTable} with id ${sourceId}`);
  }
  return rows[0];
}

async function buildJournalPreviewPayload(conn, safeTable, sourceId, { forUpdate = false } = {}) {
  const transactionRow = await fetchTransactionByIdWithOptions(conn, safeTable, sourceId, { forUpdate });
  const transType = pickFirstDefined(transactionRow, ['TransType', 'trans_type', 'UITransType']);
  if (!transType) {
    throw new Error(`Transaction ${safeTable}#${sourceId} is missing TransType`);
  }

  const flagSetCode = await resolveFlagSetCode(conn, transType);

  if (flagSetCode === NON_FINANCIAL_FLAG_SET_CODE) {
    const financialFields = {};
    return {
      transactionRow,
      transType,
      flagSetCode,
      financialFields,
      selectedRule: null,
      lines: [],
      nonFinancial: true,
    };
  }

  const fieldMap = await loadFinancialFieldMap(conn, safeTable);
  const financialFields = buildFinancialContext(transactionRow, fieldMap);
  const presentFlags = deriveFlagsFromTransaction(transactionRow, financialFields);
  const selectedRule = await selectMatchingJournalRule(conn, flagSetCode, presentFlags);

  const [ruleLines] = await conn.query(
    `SELECT *
       FROM fin_journal_rule_line
      WHERE fin_journal_rule_id = ?
      ORDER BY COALESCE(line_no, 999999), id`,
    [selectedRule.id],
  );

  if (!ruleLines.length) {
    throw new Error(`Selected rule ${selectedRule.id} has no journal lines`);
  }

  const context = { txn: transactionRow, financialFields, fields: financialFields };
  const lines = [];
  let debitTotal = 0;
  let creditTotal = 0;

  for (const line of ruleLines) {
    const direction = normalizeDrCr(pickFirstDefined(line, ['entry_type', 'dr_cr']));
    const accountCode = await resolveAccountCode(conn, line, context);
    const amount = Math.abs(await resolveAmount(conn, line, context));
    if (!amount) continue;

    const { dimensionTypeCode, dimensionId } = resolveDimension(line, context);
    const debitAmount = direction === 'DEBIT' ? amount : 0;
    const creditAmount = direction === 'CREDIT' ? amount : 0;
    debitTotal += debitAmount;
    creditTotal += creditAmount;

    lines.push({
      lineNo: pickFirstDefined(line, ['line_no', 'line_number']) ?? null,
      account_code: accountCode,
      debit_amount: debitAmount,
      credit_amount: creditAmount,
      dimension_type_code: dimensionTypeCode,
      dimension_id: dimensionId,
    });
  }

  if (Math.abs(debitTotal - creditTotal) > 0.000001) {
    throw new Error(`Journal imbalance detected: debit=${debitTotal}, credit=${creditTotal}`);
  }

  return {
    transactionRow,
    transType,
    flagSetCode,
    financialFields,
    selectedRule,
    lines,
    debitTotal,
    creditTotal,
    nonFinancial: false,
  };
}

async function loadFinancialFieldMap(conn, sourceTable) {
  const [rows] = await conn.query(
    `SELECT *
       FROM fin_transaction_field_map
      WHERE source_table = ?
      ORDER BY id ASC`,
    [sourceTable],
  );
  return rows;
}

function buildFinancialContext(transactionRow, fieldMappings = []) {
  const financialFields = {};
  for (const mapRow of fieldMappings) {
    const sourceField = pickFirstDefined(mapRow, ['source_field', 'source_column', 'transaction_field']);
    const targetCode = pickFirstDefined(mapRow, ['financial_field_code', 'field_code', 'target_field_code']);
    if (!sourceField || !targetCode) continue;
    financialFields[targetCode] = transactionRow[sourceField];
  }
  return financialFields;
}

async function resolveFlagSetCode(conn, transType) {
  const [rows] = await conn.query(
    `SELECT fin_flag_set_code
       FROM code_transaction
      WHERE UITransType = ?
      LIMIT 1`,
    [transType],
  );
  if (!rows.length || !rows[0].fin_flag_set_code) {
    throw new Error(`No fin_flag_set_code configured for TransType ${transType}`);
  }
  return rows[0].fin_flag_set_code;
}

async function selectMatchingJournalRule(conn, flagSetCode, presentFlags) {
  const [ruleRows] = await conn.query(
    `SELECT *
       FROM fin_journal_rule
      WHERE fin_flag_set_code = ?
      ORDER BY COALESCE(priority, 999999), rule_id`,
    [flagSetCode],
  );

  for (const rule of ruleRows) {
    const [conditions] = await conn.query(
      `SELECT *
         FROM fin_journal_rule_condition
        WHERE fin_journal_rule_id = ?`,
      [rule.id],
    );

    const allSatisfied = conditions.every((condition) => {
      const conditionType = String(
        pickFirstDefined(condition, ['condition_type', 'condition_kind']) || '',
      ).toUpperCase();
      const flagCode = pickFirstDefined(condition, ['flag_code', 'fin_flag_code']);
      if (!flagCode) return true;

      if (conditionType === REQUIRED_CONDITION) {
        return presentFlags.has(flagCode);
      }
      if (conditionType === NOT_ALLOWED_CONDITION) {
        return !presentFlags.has(flagCode);
      }
      return true;
    });

    if (allSatisfied) {
      return rule;
    }
  }

  throw new Error(`No matching fin_journal_rule for flag set ${flagSetCode}`);
}

async function resolveAccountCode(conn, line, context) {
  const resolverCode = pickFirstDefined(line, ['account_resolver_code', 'fin_account_resolver_code']);
  if (!resolverCode) {
    const inlineAccount = pickFirstDefined(line, ['account_code', 'gl_account_code']);
    if (inlineAccount) return String(inlineAccount);
    throw new Error(`No account resolver configured for journal line ${line.id}`);
  }

  const [rows] = await conn.query(
    `SELECT * FROM fin_account_resolver WHERE code = ? LIMIT 1`,
    [resolverCode],
  );
  if (!rows.length) {
    throw new Error(`Account resolver not found: ${resolverCode}`);
  }
  const resolver = rows[0];
  const resolveMode = String(pickFirstDefined(resolver, ['resolve_mode', 'mode']) || 'STATIC').toUpperCase();

  if (resolveMode === 'STATIC') {
    const code = pickFirstDefined(resolver, ['account_code', 'resolved_account_code']);
    if (!code) throw new Error(`STATIC resolver ${resolverCode} is missing account_code`);
    return String(code);
  }

  if (resolveMode === 'FIELD') {
    const sourceCode = pickFirstDefined(resolver, ['source_field_code', 'financial_field_code']);
    if (!sourceCode) throw new Error(`FIELD resolver ${resolverCode} missing source_field_code`);
    const value = context.financialFields[sourceCode];
    if (!value) throw new Error(`FIELD resolver ${resolverCode} resolved empty value for ${sourceCode}`);
    return String(value);
  }

  const expression = pickFirstDefined(resolver, ['expression', 'resolver_expression']);
  const value = evaluateExpression(expression, context);
  if (!value) throw new Error(`EXPRESSION resolver ${resolverCode} produced empty account`);
  return String(value);
}

async function resolveAmount(conn, line, context) {
  const amountExpressionCode = pickFirstDefined(line, ['amount_expression_code', 'fin_amount_expression_code']);
  if (!amountExpressionCode) {
    return toNumber(pickFirstDefined(line, ['amount', 'fixed_amount']));
  }

  const [rows] = await conn.query(
    `SELECT * FROM fin_amount_expression WHERE code = ? LIMIT 1`,
    [amountExpressionCode],
  );
  if (!rows.length) {
    throw new Error(`Amount expression not found: ${amountExpressionCode}`);
  }

  const expression = pickFirstDefined(rows[0], ['expression', 'amount_expression']);
  return toNumber(evaluateExpression(expression, context));
}

function resolveDimension(line, context) {
  const dimensionTypeCode = pickFirstDefined(line, ['dimension_type_code', 'fin_dimension_type_code']) || null;

  const staticId = pickFirstDefined(line, ['dimension_id', 'dimension_fixed_id']);
  if (staticId !== undefined && staticId !== null && staticId !== '') {
    return { dimensionTypeCode, dimensionId: String(staticId) };
  }

  const sourceFieldCode = pickFirstDefined(line, ['dimension_source_field_code', 'dimension_field_code']);
  if (sourceFieldCode && context.financialFields[sourceFieldCode] !== undefined) {
    return {
      dimensionTypeCode,
      dimensionId: String(context.financialFields[sourceFieldCode]),
    };
  }

  const dimensionExpression = pickFirstDefined(line, ['dimension_expression', 'dimension_id_expression']);
  if (dimensionExpression) {
    return {
      dimensionTypeCode,
      dimensionId: String(evaluateExpression(dimensionExpression, context)),
    };
  }

  return { dimensionTypeCode, dimensionId: null };
}

function normalizeDrCr(value) {
  const upper = String(value || '').toUpperCase();
  if (upper === 'DR' || upper === 'DEBIT') return 'DEBIT';
  if (upper === 'CR' || upper === 'CREDIT') return 'CREDIT';
  throw new Error(`Unsupported entry type ${value}`);
}

async function insertPostingLog(conn, payload) {
  await insertRow(conn, 'fin_posting_log', {
    source_table: payload.sourceTable,
    source_id: payload.sourceId,
    status: payload.status,
    error_message: payload.errorMessage || null,
    created_at: payload.createdAt || new Date(),
  });
}

export async function post_single_transaction({
  source_table: sourceTable,
  source_id: sourceId,
  force_repost: forceRepost = false,
  dbPool = null,
} = {}) {
  const safeTable = assertSafeIdentifier(sourceTable, 'source_table');
  const activePool = dbPool || (await getDefaultPool());
  const conn = await activePool.getConnection();

  try {
    await conn.beginTransaction();

    const currentRow = await fetchTransactionById(conn, safeTable, sourceId);
    const existingJournalId = currentRow.fin_journal_id;
    const postStatus = String(currentRow.fin_post_status || '').toUpperCase();

    if (postStatus === 'POSTED' && existingJournalId && !forceRepost) {
      await insertPostingLog(conn, {
        sourceTable: safeTable,
        sourceId,
        status: SUCCESS_STATUS,
        errorMessage: `Already posted as journal ${existingJournalId}`,
      });
      await conn.commit();
      return existingJournalId;
    }

    if (forceRepost && existingJournalId) {
      await conn.query('DELETE FROM fin_journal_line WHERE fin_journal_header_id = ?', [existingJournalId]);
      await conn.query('DELETE FROM fin_journal_header WHERE id = ?', [existingJournalId]);
    }

    const preview = await buildJournalPreviewPayload(conn, safeTable, sourceId, { forUpdate: true });
    const { transType, flagSetCode } = preview;
    if (preview.nonFinancial) {
      await insertPostingLog(conn, {
        sourceTable: safeTable,
        sourceId,
        status: SUCCESS_STATUS,
        errorMessage: `Skipped non-financial transaction (flag set ${flagSetCode})`,
      });
      await conn.commit();
      return null;
    }
    const selectedRule = preview.selectedRule;

    const journalHeaderId = await insertRow(conn, 'fin_journal_header', {
      source_table: safeTable,
      source_id: sourceId,
      trans_type: transType,
      fin_journal_rule_id: selectedRule.id,
      fin_flag_set_code: flagSetCode,
      posting_date: new Date(),
      ledger_code: pickFirstDefined(selectedRule, ['ledger_code']) || 'PRIMARY',
      created_at: new Date(),
    });

    for (const line of preview.lines) {
      await insertRow(conn, 'fin_journal_line', {
        fin_journal_header_id: journalHeaderId,
        line_no: line.lineNo,
        account_code: line.account_code,
        debit_amount: line.debit_amount,
        credit_amount: line.credit_amount,
        dimension_type_code: line.dimension_type_code,
        dimension_id: line.dimension_id,
        created_at: new Date(),
      });
    }

    await updateRowById(conn, safeTable, sourceId, {
      fin_post_status: 'POSTED',
      fin_journal_id: journalHeaderId,
      fin_posted_at: new Date(),
    });

    await insertPostingLog(conn, {
      sourceTable: safeTable,
      sourceId,
      status: SUCCESS_STATUS,
      errorMessage: null,
    });

    await conn.commit();
    return journalHeaderId;
  } catch (error) {
    await conn.rollback();

    try {
      await conn.beginTransaction();
      await insertPostingLog(conn, {
        sourceTable: safeTable,
        sourceId,
        status: FAILED_STATUS,
        errorMessage: String(error.message || error),
      });
      await conn.commit();
    } catch {
      await conn.rollback();
    }

    throw error;
  } finally {
    conn.release();
  }
}

export async function preview_single_transaction({
  source_table: sourceTable,
  source_id: sourceId,
  dbPool = null,
} = {}) {
  const safeTable = assertSafeIdentifier(sourceTable, 'source_table');
  const activePool = dbPool || (await getDefaultPool());
  const conn = await activePool.getConnection();

  try {
    const preview = await buildJournalPreviewPayload(conn, safeTable, sourceId, { forUpdate: false });
    return {
      source_table: safeTable,
      source_id: sourceId,
      trans_type: preview.transType,
      fin_flag_set_code: preview.flagSetCode,
      fin_journal_rule_id: preview.selectedRule?.id ?? null,
      non_financial: preview.nonFinancial,
      lines: preview.lines,
      totals: {
        debit: preview.debitTotal || 0,
        credit: preview.creditTotal || 0,
      },
      transaction: {
        fin_post_status: preview.transactionRow?.fin_post_status || null,
        fin_journal_id: preview.transactionRow?.fin_journal_id || null,
        fin_posted_at: preview.transactionRow?.fin_posted_at || null,
      },
    };
  } finally {
    conn.release();
  }
}

export async function post_batch({
  source_table: sourceTable,
  date_from: dateFrom,
  date_to: dateTo,
  dbPool = null,
  log = console,
} = {}) {
  const safeTable = assertSafeIdentifier(sourceTable, 'source_table');
  const activePool = dbPool || (await getDefaultPool());
  const conn = await activePool.getConnection();

  try {
    const columns = await getTableColumns(conn, safeTable);
    const dateColumn = columns.has('transaction_date')
      ? 'transaction_date'
      : columns.has('created_at')
        ? 'created_at'
        : null;

    const whereClauses = ['(fin_post_status IS NULL OR fin_post_status <> ?)'];
    const params = ['POSTED'];

    if (dateColumn && dateFrom) {
      whereClauses.push(`\`${dateColumn}\` >= ?`);
      params.push(dateFrom);
    }
    if (dateColumn && dateTo) {
      whereClauses.push(`\`${dateColumn}\` <= ?`);
      params.push(dateTo);
    }

    const [rows] = await conn.query(
      `SELECT id
         FROM \`${safeTable}\`
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY id`,
      params,
    );

    const summary = {
      source_table: safeTable,
      total: rows.length,
      success: 0,
      failed: 0,
      results: [],
    };

    for (const row of rows) {
      try {
        const journalId = await post_single_transaction({
          source_table: safeTable,
          source_id: row.id,
          dbPool: activePool,
        });
        summary.success += 1;
        summary.results.push({ source_id: row.id, status: SUCCESS_STATUS, journal_id: journalId });
      } catch (error) {
        summary.failed += 1;
        const message = String(error.message || error);
        summary.results.push({ source_id: row.id, status: FAILED_STATUS, error_message: message });
        log.error?.('[journal-posting] failed transaction', {
          source_table: safeTable,
          source_id: row.id,
          error: message,
        });
      }
    }

    return summary;
  } finally {
    conn.release();
  }
}
