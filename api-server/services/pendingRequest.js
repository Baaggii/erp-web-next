import { pool, updateTableRow, deleteTableRow } from '../../db/index.js';
import { logUserAction } from './userActivityLog.js';

export const ALLOWED_REQUEST_TYPES = new Set(['edit', 'delete']);
export const ALLOWED_TABLES = new Set([
  'users',
  'user_companies',
  'companies',
  'transactions',
  'transaction_forms',
  'transaction_images',
  'permissions',
]);

function parseProposedData(value) {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

export async function createRequest({ tableName, recordId, empId, requestType, proposedData }) {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error('Invalid table name');
  }
  if (!ALLOWED_REQUEST_TYPES.has(requestType)) {
    throw new Error('Invalid request type');
  }
  const [rows] = await pool.query(
    'SELECT employment_senior_empid FROM tbl_employment WHERE employment_emp_id = ? LIMIT 1',
    [empId]
  );
  const senior = rows[0]?.employment_senior_empid || null;
  const [result] = await pool.query(
    `INSERT INTO pending_request (table_name, record_id, emp_id, senior_empid, request_type, proposed_data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tableName, recordId, empId, senior, requestType, proposedData ? JSON.stringify(proposedData) : null]
  );
  const requestId = result.insertId;
  await logUserAction({
    emp_id: empId,
    table_name: tableName,
    record_id: recordId,
    action: requestType === 'edit' ? 'request_edit' : 'request_delete',
    details: proposedData || null,
    request_id: requestId,
  });
  if (senior) {
    await pool.query(
      `INSERT INTO notifications (recipient_empid, type, related_id, message)
       VALUES (?, 'request', ?, ?)`,
      [senior, requestId, `Pending ${requestType} request for ${tableName}#${recordId}`]
    );
  }
  return { request_id: requestId, senior_empid: senior };
}

export async function listRequests(status, seniorEmpid) {
  const [rows] = await pool.query(
    `SELECT * FROM pending_request WHERE status = ? AND senior_empid = ?`,
    [status, seniorEmpid]
  );
  return rows.map((row) => ({
    ...row,
    proposed_data: parseProposedData(row.proposed_data),
  }));
}

export async function respondRequest(id, responseEmpid, status, notes) {
  const [rows] = await pool.query(
    'SELECT * FROM pending_request WHERE request_id = ?',
    [id]
  );
  const req = rows[0];
  if (!req) throw new Error('Request not found');
  if (req.senior_empid !== responseEmpid) throw new Error('Forbidden');

  if (status === 'accepted') {
    const data = parseProposedData(req.proposed_data);
    if (req.request_type === 'edit' && data) {
      await updateTableRow(req.table_name, req.record_id, data);
      await logUserAction({
        emp_id: responseEmpid,
        table_name: req.table_name,
        record_id: req.record_id,
        action: 'update',
        details: data,
        request_id: id,
      });
    } else if (req.request_type === 'delete') {
      await deleteTableRow(req.table_name, req.record_id);
      await logUserAction({
        emp_id: responseEmpid,
        table_name: req.table_name,
        record_id: req.record_id,
        action: 'delete',
        request_id: id,
      });
    }
    await pool.query(
      `UPDATE pending_request SET status = 'accepted', responded_at = NOW(), response_empid = ?, response_notes = ? WHERE request_id = ?`,
      [responseEmpid, notes || null, id]
    );
    await logUserAction({
      emp_id: responseEmpid,
      table_name: req.table_name,
      record_id: req.record_id,
      action: 'approve',
      request_id: id,
    });
    await pool.query(
      `INSERT INTO notifications (recipient_empid, type, related_id, message)
       VALUES (?, 'response', ?, ?)`,
      [req.emp_id, id, 'Request approved']
    );
  } else {
    await pool.query(
      `UPDATE pending_request SET status = 'declined', responded_at = NOW(), response_empid = ?, response_notes = ? WHERE request_id = ?`,
      [responseEmpid, notes || null, id]
    );
    await logUserAction({
      emp_id: responseEmpid,
      table_name: req.table_name,
      record_id: req.record_id,
      action: 'decline',
      request_id: id,
    });
    await pool.query(
      `INSERT INTO notifications (recipient_empid, type, related_id, message)
       VALUES (?, 'response', ?, ?)`,
      [req.emp_id, id, 'Request declined']
    );
  }
}
