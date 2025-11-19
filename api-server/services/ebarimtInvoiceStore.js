import { pool } from '../../db/index.js';
import { createColumnLookup, computePosApiUpdates } from './posApiPersistence.js';

const masterTableColumnCache = new Map();

function toNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function toStringValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value ?? '').trim();
}

function normalizeBillType(type) {
  const raw = toStringValue(type).toUpperCase();
  if (!raw) return 'B2C';
  if (raw === 'STOCK_QR') return 'STOCK_QR';
  if (raw === 'B2B_PURCHASE') return 'B2B_PURCHASE';
  if (raw === 'B2B_SALE') return 'B2B_SALE';
  if (raw === 'B2C') return 'B2C';
  if (raw === 'B2B') return 'B2B_SALE';
  if (raw === 'B2C_RECEIPT' || raw === 'B2C_INVOICE') return 'B2C';
  if (raw === 'B2B_RECEIPT' || raw === 'B2B_INVOICE') return 'B2B_SALE';
  return 'B2C';
}

function deriveInvoiceNo(record, masterTable, masterId) {
  const candidates = [
    'invoice_no',
    'invoiceNo',
    'invoice_number',
    'invoiceNumber',
    'bill_no',
    'billNo',
    'bill_number',
    'billNumber',
    'receipt_no',
    'receiptNo',
    'or_num',
    'orNum',
    'order_id',
    'orderId',
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = record?.[candidate];
    const str = toStringValue(value);
    if (str) return str;
  }
  const prefix = masterTable || 'transaction';
  return `${prefix}-${masterId}`;
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const str = toStringValue(value);
  if (!str) return null;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function deriveReceiptDate(record) {
  const candidates = [
    'receipt_date',
    'receiptDate',
    'or_date',
    'pos_date',
    'order_date',
    'created_at',
    'createdAt',
    'date',
  ];
  for (const candidate of candidates) {
    const date = parseDateValue(record?.[candidate]);
    if (date) return date;
  }
  return new Date();
}

async function masterTableHasColumn(table, column) {
  if (!table || !column) return false;
  const key = `${table}::${column}`;
  if (masterTableColumnCache.has(key)) {
    return masterTableColumnCache.get(key);
  }
  try {
    const [rows] = await pool.query(
      `SELECT 1
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1`,
      [table, column],
    );
    const exists = Array.isArray(rows) && rows.length > 0;
    masterTableColumnCache.set(key, exists);
    return exists;
  } catch (err) {
    console.error('Failed to inspect table columns for POSAPI snapshot', { table, column, error: err });
    masterTableColumnCache.set(key, false);
    return false;
  }
}

function collectReceiptItems(payload) {
  const receipts = Array.isArray(payload?.receipts) ? payload.receipts : [];
  const items = [];
  receipts.forEach((receipt, receiptIndex) => {
    const entryItems = Array.isArray(receipt?.items) ? receipt.items : [];
    entryItems.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      items.push({ ...item, __receiptIndex: receiptIndex });
    });
  });
  return items;
}

function collectPayments(payload) {
  if (Array.isArray(payload?.payments) && payload.payments.length) {
    return payload.payments;
  }
  const receipts = Array.isArray(payload?.receipts) ? payload.receipts : [];
  return receipts
    .map((entry, index) => {
      const paymentList = Array.isArray(entry?.payments) ? entry.payments : [];
      return paymentList.map((payment) => ({ ...payment, __receiptIndex: index }));
    })
    .flat();
}

function serializeJson(value) {
  if (!value || typeof value !== 'object') return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

async function ensureEbarimtCustomer(conn, payload, record) {
  const customerTin = toStringValue(payload?.customerTin);
  const consumerNo = toStringValue(payload?.consumerNo);
  if (!customerTin && !consumerNo) return null;
  const identifier = customerTin || consumerNo;
  const selector = customerTin
    ? 'SELECT id FROM ebarimt_customer WHERE tin = ? LIMIT 1'
    : 'SELECT id FROM ebarimt_customer WHERE ebarimt_consumer_no = ? LIMIT 1';
  const [rows] = await conn.query(selector, [identifier]);
  const customerType = customerTin ? 'BUSINESS' : 'INDIVIDUAL';
  const customerName =
    toStringValue(payload?.customerName) ||
    toStringValue(record?.customer_name) ||
    toStringValue(payload?.buyerName) ||
    'POS Customer';
  const registrationNo =
    toStringValue(payload?.customerRegistrationNo) ||
    toStringValue(record?.customer_registration_no) ||
    toStringValue(record?.registration_no);
  const buyerName = toStringValue(payload?.buyerName) || toStringValue(record?.buyer_name);
  if (rows && rows[0]) {
    await conn.query(
      `UPDATE ebarimt_customer
          SET customer_type = ?,
              name = ?,
              registration_no = ?,
              tin = ?,
              ebarimt_consumer_no = ?,
              buyer_name = ?
        WHERE id = ?`,
      [customerType, customerName, registrationNo || null, customerTin || null, consumerNo || null, buyerName || null, rows[0].id],
    );
    return rows[0].id;
  }
  const [insert] = await conn.query(
    `INSERT INTO ebarimt_customer (customer_type, name, registration_no, tin, ebarimt_consumer_no, buyer_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [customerType, customerName, registrationNo || null, customerTin || null, consumerNo || null, buyerName || null],
  );
  return insert?.insertId ?? null;
}

async function replaceInvoiceItems(conn, invoiceId, payload) {
  await conn.query('DELETE FROM ebarimt_invoice_item WHERE invoice_id = ?', [invoiceId]);
  const items = collectReceiptItems(payload);
  for (const item of items) {
    const qty = toNumber(item.qty ?? item.quantity ?? 1) ?? 1;
    const unitPrice = toNumber(item.price ?? item.unitPrice ?? item.unit_price);
    const totalAmount =
      toNumber(item.totalAmount ?? item.amount ?? item.total) ??
      (qty !== null && unitPrice !== null ? qty * unitPrice : 0);
    const vatAmount = toNumber(item.totalVAT ?? item.vat ?? item.vatAmount);
    const cityTaxAmount = toNumber(item.totalCityTax ?? item.cityTax ?? item.cityTaxAmount);
    const bonusAmount = toNumber(item.bonusAmount ?? item.totalBonus);
    const barcodeType = toStringValue(item.barcodeType ?? item.barCodeType);
    const measureUnit =
      toStringValue(item.measureUnit ?? item.unit ?? item.measure_unit) || null;
    const productCode =
      toStringValue(item.productCode ?? item.product_code ?? item.code ?? item.barCode) || null;
    const description =
      toStringValue(item.name ?? item.description ?? item.productName) || 'POS Item';
    const dataPayload = {};
    if (item.data && typeof item.data === 'object') {
      dataPayload.data = item.data;
    }
    if (item.reference) {
      dataPayload.reference = item.reference;
    }
    if (Number.isInteger(item.__receiptIndex)) {
      dataPayload.receiptIndex = item.__receiptIndex;
    }
    const dataJson = Object.keys(dataPayload).length ? serializeJson(dataPayload) : null;
    await conn.query(
      `INSERT INTO ebarimt_invoice_item
         (invoice_id, product_code, name, measure_unit, quantity, unit_price, total_amount,
          vat_amount, city_tax_amount, bonus_amount, barcode_text, barcode_type,
          classification_code, tax_product_code, tax_type, tax_reason_code, item_data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceId,
        productCode,
        description,
        measureUnit,
        qty,
        unitPrice ?? (totalAmount / qty || 0),
        totalAmount,
        vatAmount,
        cityTaxAmount,
        bonusAmount,
        toStringValue(item.barCode ?? item.barcode ?? item.barcodeText) || null,
        barcodeType || null,
        toStringValue(item.classificationCode) || null,
        toStringValue(item.taxProductCode) || null,
        toStringValue(item.taxType) || null,
        toStringValue(item.taxReasonCode ?? item.tax_reason_code) || null,
        dataJson,
      ],
    );
  }
}

async function replaceInvoicePayments(conn, invoiceId, payload) {
  await conn.query('DELETE FROM ebarimt_invoice_payment WHERE invoice_id = ?', [invoiceId]);
  const payments = collectPayments(payload);
  for (const payment of payments) {
    const amount =
      toNumber(payment.amount ?? payment.paidAmount ?? payment.total ?? payment.value) ?? 0;
    const code =
      toStringValue(payment.type ?? payment.code ?? payment.method ?? 'CASH') || 'CASH';
    const status = toStringValue(payment.status) || 'PAID';
    const exchangeCode = toStringValue(payment.currency ?? payment.exchangeCode) || null;
    const dataPayload = {};
    if (payment.data && typeof payment.data === 'object') {
      dataPayload.data = payment.data;
    }
    if (payment.reference) {
      dataPayload.reference = payment.reference;
    }
    if (Number.isInteger(payment.__receiptIndex)) {
      dataPayload.receiptIndex = payment.__receiptIndex;
    }
    const paymentJson = Object.keys(dataPayload).length ? serializeJson(dataPayload) : null;
    await conn.query(
      `INSERT INTO ebarimt_invoice_payment
         (invoice_id, payment_code, payment_status, amount, exchange_code, payment_data_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [invoiceId, code, status || 'PAID', amount, exchangeCode, paymentJson],
    );
  }
}

export async function saveEbarimtInvoiceSnapshot({
  masterTable,
  masterId,
  record,
  payload,
  merchantInfo,
}) {
  if (!masterTable || masterId === undefined || masterId === null) return null;
  if (!payload || typeof payload !== 'object') return null;
  const merchantId = record?.merchant_id ?? merchantInfo?.id ?? null;
  if (!merchantId) {
    throw new Error('Merchant information is required for POSAPI invoices');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let invoiceId = record?.ebarimt_invoice_id ?? null;
    const invoiceNo = deriveInvoiceNo(record || {}, masterTable, masterId);
    const billType = normalizeBillType(payload.type);
    const customerTin = toStringValue(payload.customerTin) || null;
    const consumerNo = toStringValue(payload.consumerNo) || null;
    const totalAmount = toNumber(payload.totalAmount) ?? 0;
    const totalVat = toNumber(payload.totalVAT);
    const totalCityTax = toNumber(payload.totalCityTax);
    const totalBonus = toNumber(payload.totalBonus ?? record?.total_bonus ?? null);
    const receiptDate = deriveReceiptDate(record || {});
    const baseParams = [
      invoiceNo,
      toStringValue(payload.billIdSuffix || payload.bill_id_suffix || '').slice(0, 6) || null,
      billType,
      customerTin,
      consumerNo,
      totalAmount,
      totalVat !== null ? totalVat : null,
      totalCityTax !== null ? totalCityTax : null,
      totalBonus !== null ? totalBonus : null,
      receiptDate,
      merchantId,
    ];
    if (invoiceId) {
      await conn.query(
        `UPDATE ebarimt_invoice
            SET invoice_no = ?,
                bill_id_suffix = ?,
                bill_type = ?,
                customer_tin = ?,
                consumer_no = ?,
                total_amount = ?,
                total_vat = ?,
                total_city_tax = ?,
                total_bonus = ?,
                receipt_date = ?,
                merchant_id = ?,
                status = 'PENDING',
                error_code = NULL,
                error_message = NULL,
                ebarimt_id = NULL,
                ebarimt_date = NULL,
                updated_at = NOW()
          WHERE id = ?`,
        [...baseParams, invoiceId],
      );
    } else {
      const [insert] = await conn.query(
        `INSERT INTO ebarimt_invoice
           (invoice_no, bill_id_suffix, bill_type, customer_tin, consumer_no,
            total_amount, total_vat, total_city_tax, total_bonus, receipt_date, merchant_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        baseParams,
      );
      invoiceId = insert.insertId;
      if (await masterTableHasColumn(masterTable, 'ebarimt_invoice_id')) {
        await conn.query('UPDATE ?? SET ebarimt_invoice_id = ? WHERE id = ?', [masterTable, invoiceId, masterId]);
      }
    }
    await ensureEbarimtCustomer(conn, payload, record || {});
    await replaceInvoiceItems(conn, invoiceId, payload);
    await replaceInvoicePayments(conn, invoiceId, payload);
    await conn.commit();
    return invoiceId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function persistEbarimtInvoiceResponse(invoiceId, response, options = {}) {
  if (!invoiceId || !response || typeof response !== 'object') return;
  try {
    const [rows] = await pool.query('SELECT * FROM ebarimt_invoice WHERE id = ? LIMIT 1', [invoiceId]);
    const invoiceRecord = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!invoiceRecord) return;
    const lookup = createColumnLookup(invoiceRecord);
    const updates = computePosApiUpdates(lookup, response, options);
    const entries = Object.entries(updates || {});
    if (!entries.length) return;
    const setClause = entries.map(([col]) => `\`${col}\` = ?`).join(', ');
    const params = entries.map(([, value]) => value);
    params.push(invoiceId);
    await pool.query(`UPDATE ebarimt_invoice SET ${setClause} WHERE id = ?`, params);
  } catch (err) {
    console.error('Failed to persist POSAPI response to ebarimt_invoice', {
      invoiceId,
      error: err,
    });
  }
}
