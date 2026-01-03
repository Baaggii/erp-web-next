import { pool, getPrimaryKeyColumns } from '../../db/index.js';
import { getFormConfig } from './transactionFormConfig.js';
import {
  buildReceiptFromDynamicTransaction,
  sendReceipt,
  resolvePosApiEndpoint,
} from './posApiService.js';
import {
  computePosApiUpdates,
  createColumnLookup,
  collectEndpointResponseMappings,
} from './posApiPersistence.js';
import {
  saveEbarimtInvoiceSnapshot,
  persistEbarimtInvoiceResponse,
} from './ebarimtInvoiceStore.js';
import { getMerchantById } from './merchantService.js';

function normalizeName(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed;
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

async function persistPosApiDetails(
  table,
  pkColumn,
  recordId,
  response,
  record,
  options = {},
) {
  if (!response || typeof response !== 'object') return;
  if (recordId === undefined || recordId === null) return;
  const lookup = createColumnLookup(record);
  const updates = computePosApiUpdates(lookup, response, options);
  const entries = Object.entries(updates || {});
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
  session = null,
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

  const merchantId = record?.merchant_id ?? record?.merchantId ?? null;
  const merchantInfo = merchantId ? await getMerchantById(merchantId) : null;
  if (!merchantInfo) {
    const err = new Error('Merchant information is required for POSAPI submissions');
    err.status = 400;
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
  const endpoint = await resolvePosApiEndpoint(formCfg.posApiEndpointId);
  const responseFieldMapping = collectEndpointResponseMappings(endpoint);
  const receiptType = formCfg.posApiType || process.env.POSAPI_RECEIPT_TYPE || '';
  const payload = await buildReceiptFromDynamicTransaction(record, mapping, receiptType, {
    typeField: formCfg.posApiTypeField,
    merchantInfo,
    aggregations: endpoint?.aggregations || [],
    session,
  });
  if (!payload) {
    const err = new Error('POSAPI receipt payload could not be generated from the transaction');
    err.status = 400;
    throw err;
  }

  const invoiceId = await saveEbarimtInvoiceSnapshot({
    masterTable: tableName,
    masterId: recordId,
    record,
    payload,
    merchantInfo,
  });

  const response = await sendReceipt(payload, { endpoint });
  await persistPosApiDetails(tableName, pkColumn, recordId, response, record, {
    fieldsFromPosApi: formCfg.fieldsFromPosApi,
    responseFieldMapping,
    targetTable: tableName,
    aggregations: endpoint?.aggregations || [],
  });
  if (invoiceId) {
    await persistEbarimtInvoiceResponse(invoiceId, response, {
      fieldsFromPosApi: formCfg.fieldsFromPosApi,
      responseFieldMapping,
      targetTable: 'ebarimt_invoice',
      allowCrossTableMapping: false,
      aggregations: endpoint?.aggregations || [],
    });
  }

  return { id: recordId, ebarimtInvoiceId: invoiceId, posApi: { payload, response } };
}
