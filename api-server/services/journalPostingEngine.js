// Tenant visibility update:
// - All business-table reads now go through create_tenant_temp_table via tenantScope helpers.
// - Manual (company_id = ? OR company_id = 0) and deleted_at filtering were removed from service SQL.
// - Query logic now reads from tenant-scoped temp tables, delegating visibility rules to DB policy engine.

import { createTmpBusinessTable, queryWithTenantScope } from './tenantScope.js';

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

function normalizeCompanyScopeId(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.trunc(numeric);
}

function deriveTenantAuditContext(transactionRow = {}) {
  return {
    company_id: normalizeCompanyScopeId(
      pickFirstDefined(transactionRow, ['company_id', 'companyId', 'company']),
    ),
    created_by: pickFirstDefined(transactionRow, ['created_by', 'createdBy']),
    created_at: pickFirstDefined(transactionRow, ['created_at', 'createdAt']),
    updated_by: pickFirstDefined(transactionRow, ['updated_by', 'updatedBy']),
    updated_at: pickFirstDefined(transactionRow, ['updated_at', 'updatedAt']),
  };
}

function buildAuditInsertFields(context = {}) {
  const hasCompanyId = Number.isFinite(Number(context.company_id));
  return {
    company_id: hasCompanyId ? Number(context.company_id) : undefined,
    created_by: context.created_by,
    created_at: context.created_at,
    updated_by: context.updated_by,
    updated_at: context.updated_at,
  };
}

function evaluateExpression(expression, context = {}) {
  if (!expression || typeof expression !== 'string') {
    return 0;
  }

  const source = expression.trim();
  if (!source) {
    return 0;
  }

  // 🔥 Inject canonical financial fields into local scope
  const scope = { ...context.financialFields };

  const fn = new Function(
    ...Object.keys(scope),
    `"use strict"; return (${source});`
  );

  return toNumber(fn(...Object.values(scope)));
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

async function fetchTransactionById(conn, sourceTable, sourceId, companyId) {
  return fetchTransactionByIdWithOptions(conn, sourceTable, sourceId, companyId, { forUpdate: true });
}

async function fetchTransactionByIdWithOptions(conn, sourceTable, sourceId, companyId, { forUpdate = false } = {}) {
  const safeTable = assertSafeIdentifier(sourceTable, 'source_table');
  const lockSql = forUpdate ? ' FOR UPDATE' : '';
  if (Number(companyId) > 0) {
    const scope = await createTmpBusinessTable(conn, safeTable, companyId);
    const [rows] = await conn.query(
      `SELECT * FROM \`${scope.tempTableName}\` WHERE id = ?${lockSql}`,
      [sourceId],
    );
    if (!rows.length) {
      throw new Error(`Transaction not found in ${safeTable} with id ${sourceId}`);
    }
    return rows[0];
  }

  // Bootstrap fallback: allow lookup by primary key to discover company scope when caller did not provide company_id.
  const [rows] = await conn.query(
    `SELECT * FROM \`${safeTable}\` WHERE id = ?${lockSql}`,
    [sourceId],
  );
  if (!rows.length) {
    throw new Error(`Transaction not found in ${safeTable} with id ${sourceId}`);
  }
  return rows[0];
}

async function buildJournalPreviewPayload(conn, safeTable, sourceId, companyId, { forUpdate = false } = {}) {
  const transactionRow = await fetchTransactionByIdWithOptions(conn, safeTable, sourceId, companyId, { forUpdate });
  const transType = pickFirstDefined(transactionRow, ['TransType', 'trans_type', 'UITransType']);
  if (!transType) {
    throw new Error(`Transaction ${safeTable}#${sourceId} is missing TransType`);
  }

  const scopedCompanyId = normalizeCompanyScopeId(
    companyId ?? pickFirstDefined(transactionRow, ['company_id', 'companyId', 'company']),
  );
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

  const fieldMap = await loadFinancialFieldMap(conn, safeTable, scopedCompanyId);
  const financialFields = buildFinancialContext(transactionRow, fieldMap);
  const presentFlags = deriveFlagsFromTransaction(transactionRow, financialFields);
  const selectedRule = await selectMatchingJournalRule(conn, flagSetCode, presentFlags, scopedCompanyId);

  const [ruleLines] = await queryWithTenantScope(
    conn,
    'fin_journal_rule_line',
    scopedCompanyId,
    `SELECT *
       FROM {{table}}
      WHERE rule_id = ?
      ORDER BY COALESCE(line_order, 999999), id`,
    [selectedRule.rule_id],
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
    const accountCode = await resolveAccountCode(conn, line, context, scopedCompanyId);
    const amount = Math.abs(await resolveAmount(conn, line, context));
    if (!amount) continue;

    const { dimensionTypeCode, dimensionId } = resolveDimension(line, context);
    const debitAmount = direction === 'DEBIT' ? amount : 0;
    const creditAmount = direction === 'CREDIT' ? amount : 0;
    debitTotal += debitAmount;
    creditTotal += creditAmount;

    lines.push({
      lineNo: line.line_order ?? null,
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

async function loadFinancialFieldMap(conn, sourceTable, companyId) {
  const [rows] = await queryWithTenantScope(
    conn,
    'fin_transaction_field_map',
    companyId,
    `SELECT *
       FROM {{table}}
      WHERE source_table = ?
      ORDER BY id ASC`,
    [sourceTable],
  );
  return rows;
}

function buildFinancialContext(transactionRow, fieldMappings = []) {
  const financialFields = {};

  for (const mapRow of fieldMappings) {
    const sourceField = mapRow.source_column;     // actual DB column
    const targetCode = mapRow.canonical_field;    // canonical name

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

async function selectMatchingJournalRule(
  conn,
  flagSetCode,
  presentFlags,
  companyId,
) {
  const [ruleRows] = await queryWithTenantScope(
    conn,
    'fin_journal_rule',
    companyId,
    `SELECT *
       FROM {{table}}
      WHERE fin_flag_set_code = ?
      ORDER BY COALESCE(priority, 999999), rule_id`,
    [flagSetCode],
  );


  for (const rule of ruleRows) {
    const [conditions] = await queryWithTenantScope(
      conn,
      'fin_journal_rule_condition',
      companyId,
      `SELECT *
         FROM {{table}}
        WHERE rule_id = ?`,
      [rule.rule_id],
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

async function resolveAccountCode(conn, line, context, companyId) {
  const resolverCode = pickFirstDefined(line, ['account_resolver_code']);
  if (!resolverCode) {
    const inlineAccount = pickFirstDefined(line, ['account_code']);
    if (inlineAccount) return String(inlineAccount);
    throw new Error(`No account resolver configured for journal line ${line.id}`);
  }

  const [rows] = await queryWithTenantScope(
    conn,
    'fin_account_resolver',
    companyId,
    `SELECT *
       FROM {{table}}
      WHERE resolver_code = ?
      LIMIT 1`,
    [resolverCode],
  );

  if (!rows.length) {
    throw new Error(`Account resolver not found: ${resolverCode}`);
  }

  const resolver = rows[0];
  const resolverType = String(resolver.resolver_type || '').toUpperCase();

  let accountCode;

  // FIXED ACCOUNT
  if (resolverType === 'FIXED_ACCOUNT') {
    if (!resolver.base_account_code) {
      throw new Error(`FIXED_ACCOUNT resolver ${resolverCode} missing base_account_code`);
    }
    accountCode = resolver.base_account_code;
  }

  // BANK dynamic
  else if (resolverType === 'BANK_ACCOUNT_SUFFIX') {
    const bankId = context.financialFields[resolver.source_column];
    if (!bankId) {
      throw new Error(`BANK_ACCOUNT_SUFFIX resolver ${resolverCode} missing source value`);
    }
    accountCode = resolver.base_account_code;
  }

  // VENDOR subaccount
  else if (resolverType === 'VENDOR_SUBACCOUNT') {
    const vendorId = context.financialFields[resolver.source_column];
    if (!vendorId) {
      throw new Error(`VENDOR_SUBACCOUNT resolver ${resolverCode} missing source value`);
    }
    accountCode = resolver.base_account_code;
  }

  else {
    throw new Error(`Unsupported resolver type ${resolverType}`);
  }

  // 🔥 Now validate against COA
  const [coaRows] = await queryWithTenantScope(
    conn,
    'fin_chart_of_accounts',
    companyId,
    `SELECT *
       FROM {{table}}
      WHERE account_code = ?
      LIMIT 1`,
    [accountCode],
  );

  if (!coaRows.length) {
    throw new Error(`Account ${accountCode} not found in Chart of Accounts`);
  }

  if (!coaRows[0].is_active) {
    throw new Error(`Account ${accountCode} is inactive`);
  }

  return String(accountCode);
}




async function resolveAmount(conn, line, context) {
  const amountExpressionCode = line.amount_expression_code;
  if (!amountExpressionCode) {
    return 0;
  }

  const [rows] = await queryWithTenantScope(
    conn,
    'fin_amount_expression',
    0,
    `SELECT * FROM {{table}} WHERE expression_code = ? LIMIT 1`,
    [amountExpressionCode],
  );

  if (!rows.length) {
    throw new Error(`Amount expression not found: ${amountExpressionCode}`);
  }

  const expr = rows[0];

  // COLUMN type → resolve from canonical financial fields
  if (expr.source_type === 'COLUMN') {
    const canonicalField = expr.source_column;  // e.g. TOTAL_AMOUNT
    const value = context.financialFields[canonicalField];
    return toNumber(value);
  }

  // FORMULA type → evaluate using canonical fields only
  if (expr.source_type === 'FORMULA') {
    return toNumber(
      evaluateExpression(expr.formula, {
        txn: context.financialFields,   // 🔥 only canonical
        financialFields: context.financialFields,
      })
    );
  }

  return 0;
}


function resolveDimension(line, context) {
  const dimensionTypeCode = line.dimension_type_code || null;

  // Static dimension
  if (line.dimension_id !== undefined && line.dimension_id !== null) {
    return {
      dimensionTypeCode,
      dimensionId: String(line.dimension_id),
    };
  }

  // Dynamic from canonical field
  if (line.dimension_source_field) {
    const value = context.financialFields[line.dimension_source_field];
    return {
      dimensionTypeCode,
      dimensionId: value ? String(value) : null,
    };
  }

  return { dimensionTypeCode, dimensionId: null };
}


function normalizeDrCr(value) {
  const upper = String(value || '').toUpperCase();

  if (upper === 'D' || upper === 'DR' || upper === 'DEBIT') return 'DEBIT';
  if (upper === 'C' || upper === 'CR' || upper === 'CREDIT') return 'CREDIT';

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
  company_id: companyId,
  force_repost: forceRepost = false,
  dbPool = null,
} = {}) {
  const safeTable = assertSafeIdentifier(sourceTable, 'source_table');
  const activePool = dbPool || (await getDefaultPool());
  const conn = await activePool.getConnection();

  try {
    await conn.beginTransaction();

    const currentRow = await fetchTransactionById(conn, safeTable, sourceId, companyId);
    const tenantAuditContext = deriveTenantAuditContext(currentRow);
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
      await conn.query('DELETE FROM fin_journal_line WHERE journal_id  = ?', [existingJournalId]);
      await conn.query('DELETE FROM fin_journal_header WHERE journal_id  = ?', [existingJournalId]);
    }

    const preview = await buildJournalPreviewPayload(conn, safeTable, sourceId, companyId, { forUpdate: true });
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

    const auditInsertFields = buildAuditInsertFields(tenantAuditContext);

    const journalHeaderId = await insertRow(conn, 'fin_journal_header', {
      source_table: safeTable,
      source_id: sourceId,
      document_date: new Date(),
      currency: 'MNT',
      exchange_rate: 1,
      is_posted: 1,
      ...auditInsertFields,
    });


    for (const line of preview.lines) {
      const isDebit = Number(line.debit_amount || 0) > 0;

      await insertRow(conn, 'fin_journal_line', {
        journal_id: journalHeaderId,
        line_order: line.lineNo,
        dr_cr: isDebit ? 'D' : 'C',
        account_code: line.account_code,
        amount: isDebit
          ? Number(line.debit_amount || 0)
          : Number(line.credit_amount || 0),
        dimension_type_code: line.dimension_type_code || null,
        dimension_id: line.dimension_id || null,
        ...auditInsertFields,
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
  company_id: companyId,
  dbPool = null,
} = {}) {
  const safeTable = assertSafeIdentifier(sourceTable, 'source_table');
  const activePool = dbPool || (await getDefaultPool());
  const conn = await activePool.getConnection();

  try {
    const preview = await buildJournalPreviewPayload(conn, safeTable, sourceId, companyId, { forUpdate: false });
    return {
      source_table: safeTable,
      source_id: sourceId,
      trans_type: preview.transType,
      fin_flag_set_code: preview.flagSetCode,
      fin_journal_rule_id: preview.selectedRule?.rule_id ?? null,
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
  company_id: companyId,
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

    const [rows] = await queryWithTenantScope(
      conn,
      safeTable,
      companyId,
      `SELECT id
         FROM {{table}}
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
          company_id: companyId,
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
