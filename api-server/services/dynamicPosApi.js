import { pool, getPrimaryKeyColumns } from '../../db/index.js';
import { getFormConfig } from './transactionFormConfig.js';
import {
  buildReceiptFromDynamicTransaction,
  sendReceipt,
} from './posApiService.js';

function normalizeName(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed;
}

function createColumnLookup(record = {}) {
  const map = new Map();
  Object.keys(record).forEach((key) => {
    map.set(key.toLowerCase(), key);
  });
  return map;
}

function findColumn(record, candidates) {
  const lookup = createColumnLookup(record);
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = lookup.get(candidate.toLowerCase());
    if (key) return key;
  }
  return null;
}

async function persistPosApiDetails(table, pkColumn, recordId, response, record) {
  if (!response || typeof response !== 'object') return;
  if (recordId === undefined || recordId === null) return;
  const lookup = createColumnLookup(record);
  const updates = {};
  const billIdCol =
    findColumn(record, [
      'bill_id',
      'billid',
      'ebarimt_id',
      'ebarimt_no',
      'ebarimt_number',
      'posapi_bill_id',
      'posapi_billno',
    ]) || null;
  const statusCol =
    findColumn(record, ['posapi_status', 'ebarimt_status', 'receipt_status']) || null;
  const errorCol =
    findColumn(record, [
      'posapi_error_code',
      'posapi_error_codes',
      'ebarimt_error_code',
      'ebarimt_error_codes',
      'posapi_error',
      'ebarimt_error',
    ]) || null;
  const responseCol =
    findColumn(record, ['posapi_response', 'ebarimt_response', 'posapi_response_json']) || null;
  if (response.lottery) {
    const lotteryCol =
      lookup.get('lottery') ||
      lookup.get('lottery_no') ||
      lookup.get('lottery_number') ||
      lookup.get('ddtd');
    if (lotteryCol) updates[lotteryCol] = response.lottery;
  }
  if (response.qrData) {
    const qrCol =
      lookup.get('qr_data') ||
      lookup.get('qrdata') ||
      lookup.get('qr_code');
    if (qrCol) updates[qrCol] = response.qrData;
  }
  if (billIdCol && response.billId) {
    updates[billIdCol] = response.billId;
  }
  if (statusCol && response.status) {
    updates[statusCol] = response.status;
  }
  const rawErrors =
    response.errorCodes ?? response.errorCode ?? response.error ?? response.errors;
  if (errorCol && rawErrors) {
    let normalizedError = rawErrors;
    if (Array.isArray(rawErrors)) {
      normalizedError = rawErrors.join(',');
    } else if (typeof rawErrors === 'object') {
      try {
        normalizedError = JSON.stringify(rawErrors);
      } catch {
        normalizedError = String(rawErrors);
      }
    }
    updates[errorCol] = normalizedError;
  }
  if (responseCol) {
    try {
      updates[responseCol] = JSON.stringify(response);
    } catch {
      updates[responseCol] = String(response);
    }
  }
  const entries = Object.entries(updates);
  if (entries.length === 0) return;
  const setParts = entries.map(() => '?? = ?').join(', ');
  const params = [table];
  entries.forEach(([col, value]) => {
    params.push(col, value);
  });
  params.push(pkColumn, recordId);
  try {
    await pool.query(`UPDATE ?? SET ${setParts} WHERE ?? = ?`, params);
  } catch (err) {
    console.error('Failed to persist POSAPI response details', {
      table,
      pkColumn,
      recordId,
      error: err,
    });
  }
}

export async function issueDynamicTransactionEbarimt(
  table,
  formName,
  recordId,
  companyId = 0,
) {
  const tableName = normalizeName(table);
  const configName = normalizeName(formName);
  if (!tableName) {
    const err = new Error('table is required');
    err.status = 400;
    throw err;
  }
  if (!configName) {
    const err = new Error('formName is required');
    err.status = 400;
    throw err;
  }
  if (recordId === undefined || recordId === null || `${recordId}`.trim() === '') {
    const err = new Error('recordId is required');
    err.status = 400;
    throw err;
  }

  const { config: formCfg } = await getFormConfig(tableName, configName, companyId);
  if (!formCfg?.posApiEnabled) {
    const err = new Error('POSAPI is not enabled for this form');
    err.status = 400;
    throw err;
  }

  const pkColumns = await getPrimaryKeyColumns(tableName);
  if (!Array.isArray(pkColumns) || pkColumns.length === 0) {
    const err = new Error(`Table ${tableName} has no primary key`);
    err.status = 400;
    throw err;
  }
  if (pkColumns.length > 1) {
    const err = new Error('POSAPI submission requires a single-column primary key');
    err.status = 400;
    throw err;
  }
  const pkColumn = pkColumns[0];

  const [rows] = await pool.query(
    'SELECT * FROM ?? WHERE ?? = ? LIMIT 1',
    [tableName, pkColumn, recordId],
  );
  const record = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!record) {
    const err = new Error('Transaction not found');
    err.status = 404;
    throw err;
  }

  const companyColumn = findColumn(record, ['company_id']);
  if (
    companyColumn &&
    record[companyColumn] !== undefined &&
    record[companyColumn] !== null &&
    companyId !== undefined &&
    companyId !== null &&
    `${companyId}`.trim() !== '' &&
    Number(record[companyColumn]) !== Number(companyId)
  ) {
    const err = new Error('Transaction does not belong to the current company');
    err.status = 403;
    throw err;
  }

  const mapping = formCfg.posApiMapping || {};
  const receiptType = formCfg.posApiType || process.env.POSAPI_RECEIPT_TYPE || '';
  const payload = buildReceiptFromDynamicTransaction(record, mapping, receiptType);
  if (!payload) {
    const err = new Error('POSAPI receipt payload could not be generated from the transaction');
    err.status = 400;
    throw err;
  }

  const response = await sendReceipt(payload);
  await persistPosApiDetails(tableName, pkColumn, recordId, response, record);

  return { id: recordId, posApi: { payload, response } };
}
