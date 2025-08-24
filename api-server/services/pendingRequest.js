import {
  pool,
  updateTableRow,
  deleteTableRow,
  listTableColumns,
  getPrimaryKeyColumns,
} from '../../db/index.js';
import { logUserAction } from './userActivityLog.js';
import { isDeepStrictEqual } from 'util';

export const ALLOWED_REQUEST_TYPES = new Set(['edit', 'delete']);

async function ensureValidTableName(tableName) {
  const cols = await listTableColumns(tableName);
  if (!cols.length) {
    const err = new Error('invalid table_name');
    err.status = 400;
    throw err;
  }
}

function parseProposedData(value) {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

export async function createRequest({
  tableName,
  recordId,
  empId,
  requestType,
  proposedData,
  requestReason,
}) {
  await ensureValidTableName(tableName);
  if (!ALLOWED_REQUEST_TYPES.has(requestType)) {
    throw new Error('Invalid request type');
  }
  if (!requestReason || !String(requestReason).trim()) {
    const err = new Error('request_reason required');
    err.status = 400;
    throw err;
  }
  const conn = await pool.getConnection();
  try {
    await conn.query('BEGIN');
    const [rows] = await conn.query(
      'SELECT employment_senior_empid FROM tbl_employment WHERE employment_emp_id = ? LIMIT 1',
      [empId],
    );
    const seniorRaw = rows[0]?.employment_senior_empid;
    const senior = seniorRaw ? String(seniorRaw).trim().toUpperCase() : null;
    let finalProposed = proposedData;
    let originalData = null;
    if (requestType === 'edit') {
      const pkCols = await getPrimaryKeyColumns(tableName);
      let currentRow = null;
      if (pkCols.length === 1) {
        const col = pkCols[0];
        const where = col === 'id' ? 'id = ?' : `\`${col}\` = ?`;
        const [r] = await conn.query(
          `SELECT * FROM ?? WHERE ${where} LIMIT 1`,
          [tableName, recordId],
        );
        currentRow = r[0] || null;
      } else if (pkCols.length > 1) {
        const parts = String(recordId).split('-');
        const where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
        const [r] = await conn.query(
          `SELECT * FROM ?? WHERE ${where} LIMIT 1`,
          [tableName, ...parts],
        );
        currentRow = r[0] || null;
      }
      originalData = currentRow;
    } else if (requestType === 'delete') {
      const pkCols = await getPrimaryKeyColumns(tableName);
      let currentRow = null;
      if (pkCols.length === 1) {
        const col = pkCols[0];
        const where = col === 'id' ? 'id = ?' : `\`${col}\` = ?`;
        const [r] = await conn.query(
          `SELECT * FROM ?? WHERE ${where} LIMIT 1`,
          [tableName, recordId],
        );
        currentRow = r[0] || null;
      } else if (pkCols.length > 1) {
        const parts = String(recordId).split('-');
        const where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
        const [r] = await conn.query(
          `SELECT * FROM ?? WHERE ${where} LIMIT 1`,
          [tableName, ...parts],
        );
        currentRow = r[0] || null;
      }
      finalProposed = currentRow;
    }
    const normalizedEmp = String(empId).trim().toUpperCase();
    const [existing] = await conn.query(
      `SELECT request_id, proposed_data FROM pending_request
       WHERE table_name = ? AND record_id = ? AND emp_id = ?
         AND request_type = ? AND status = 'pending'
       LIMIT 1`,
      [tableName, recordId, normalizedEmp, requestType],
    );
    if (existing.length) {
      const existingData = parseProposedData(existing[0].proposed_data);
      if (isDeepStrictEqual(existingData, finalProposed || null)) {
        const err = new Error('Duplicate pending request');
        err.status = 409;
        throw err;
      }
    }
    const [result] = await conn.query(
      `INSERT INTO pending_request (table_name, record_id, emp_id, senior_empid, request_type, request_reason, proposed_data, original_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tableName,
        recordId,
        normalizedEmp,
        senior,
        requestType,
        requestReason,
        finalProposed ? JSON.stringify(finalProposed) : null,
        originalData ? JSON.stringify(originalData) : null,
      ],
    );
    const requestId = result.insertId;
    await logUserAction(
      {
        emp_id: empId,
        table_name: tableName,
        record_id: recordId,
        action: requestType === 'edit' ? 'request_edit' : 'request_delete',
        details: finalProposed || null,
        request_id: requestId,
      },
      conn,
    );
    if (senior) {
      await conn.query(
        `INSERT INTO notifications (recipient_empid, type, related_id, message)
         VALUES (?, 'request', ?, ?)`,
        [senior, requestId, `Pending ${requestType} request for ${tableName}#${recordId}`],
      );
    }
    await conn.query('COMMIT');
    return { request_id: requestId, senior_empid: senior };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}

export async function listRequests(filters) {
  const {
    status,
    senior_empid,
    requested_empid,
    table_name,
    request_type,
    date_from,
    date_to,
    date_field = 'created',
    page = 1,
    per_page = 2,
  } = filters || {};

  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('LOWER(TRIM(status)) = ?');
    params.push(String(status).trim().toLowerCase());
  }
  if (senior_empid) {
    conditions.push('UPPER(TRIM(senior_empid)) = ?');
    params.push(String(senior_empid).trim().toUpperCase());
  }
  if (requested_empid) {
    conditions.push('UPPER(TRIM(emp_id)) = ?');
    params.push(String(requested_empid).trim().toUpperCase());
  }
  if (table_name) {
    conditions.push('table_name = ?');
    params.push(table_name);
  }
  if (request_type) {
    conditions.push('request_type = ?');
    params.push(request_type);
  }
  const dateColumn = date_field === 'responded' ? 'responded_at' : 'created_at';
  if (date_from || date_to) {
    if (date_from) {
      conditions.push(`${dateColumn} >= ?`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`${dateColumn} <= ?`);
      params.push(date_to);
    }
  } else {
    conditions.push(`${dateColumn} >= CURDATE()`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Number(per_page) > 0 ? Number(per_page) : 2;
  const offset = (Number(page) > 0 ? Number(page) - 1 : 0) * limit;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as count FROM pending_request ${where}`,
    params,
  );
  const total = countRows[0]?.count || 0;

  const [rows] = await pool.query(
    `SELECT *, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_fmt, DATE_FORMAT(responded_at, '%Y-%m-%d %H:%i:%s') AS responded_at_fmt FROM pending_request ${where} ORDER BY ${dateColumn} DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

    const result = await Promise.all(
      rows.map(async (row) => {
        const parsed = parseProposedData(row.proposed_data);
        let original = parseProposedData(row.original_data);
        if (!original) {
          try {
            const pkCols = await getPrimaryKeyColumns(row.table_name);
            if (pkCols.length === 1) {
              const col = pkCols[0];
              const whereClause = col === 'id' ? 'id = ?' : `\`${col}\` = ?`;
              const [r] = await pool.query(
                `SELECT * FROM ?? WHERE ${whereClause} LIMIT 1`,
                [row.table_name, row.record_id],
              );
              original = r[0] || null;
            } else if (pkCols.length > 1) {
              const parts = String(row.record_id).split('-');
              const whereClause = pkCols
                .map((c) => `\`${c}\` = ?`)
                .join(' AND ');
              const [r] = await pool.query(
                `SELECT * FROM ?? WHERE ${whereClause} LIMIT 1`,
                [row.table_name, ...parts],
              );
              original = r[0] || null;
            }
          } catch {
            original = null;
          }
        }

        const { created_at_fmt, responded_at_fmt, ...rest } = row;
        return {
          ...rest,
          created_at: created_at_fmt || null,
          responded_at: responded_at_fmt || null,
          proposed_data: parsed,
          original,
        };
      }),
    );

  return { rows: result, total };
}

export async function listRequestsByEmp(
  emp_id,
  { status, table_name, request_type, date_from, date_to, date_field, page, per_page } = {},
) {
  return listRequests({
    requested_empid: emp_id,
    status,
    table_name,
    request_type,
    date_from,
    date_to,
    date_field,
    page,
    per_page,
  });
}

export async function respondRequest(
  id,
  responseEmpid,
  status,
  notes,
) {
  if (!notes || !String(notes).trim()) {
    const err = new Error('response_notes required');
    err.status = 400;
    throw err;
  }
  const conn = await pool.getConnection();
  try {
    await conn.query('BEGIN');
    const [rows] = await conn.query(
      'SELECT * FROM pending_request WHERE request_id = ?',
      [id],
    );
    const req = rows[0];
    if (!req) throw new Error('Request not found');
    const responder = String(responseEmpid).trim().toUpperCase();
    const senior = req.senior_empid
      ? String(req.senior_empid).trim().toUpperCase()
      : null;
    const requester = String(req.emp_id).trim().toUpperCase();
    if (responder !== requester && responder !== senior)
      throw new Error('Forbidden');

    const proposedData = parseProposedData(req.proposed_data);

    if (status === 'accepted') {
      const data = proposedData;
      if (req.request_type === 'edit' && data) {
        await updateTableRow(req.table_name, req.record_id, data, conn);
        await logUserAction(
          {
            emp_id: responseEmpid,
            table_name: req.table_name,
            record_id: req.record_id,
            action: 'update',
            details: data,
            request_id: id,
          },
          conn,
        );
      } else if (req.request_type === 'delete') {
        await deleteTableRow(req.table_name, req.record_id, conn);
        await logUserAction(
          {
            emp_id: responseEmpid,
            table_name: req.table_name,
            record_id: req.record_id,
            action: 'delete',
            request_id: id,
          },
          conn,
        );
      }
      await conn.query(
        `UPDATE pending_request SET status = 'accepted', responded_at = NOW(), response_empid = ?, response_notes = ? WHERE request_id = ?`,
        [responseEmpid, notes, id],
      );
      await logUserAction(
        {
          emp_id: responseEmpid,
          table_name: req.table_name,
          record_id: req.record_id,
          action: 'approve',
          details: { proposed_data: proposedData, notes },
          request_id: id,
        },
        conn,
      );
      await conn.query(
        `INSERT INTO notifications (recipient_empid, type, related_id, message)
         VALUES (?, 'response', ?, ?)`,
        [req.emp_id, id, 'Request approved'],
      );
    } else {
      await conn.query(
        `UPDATE pending_request SET status = 'declined', responded_at = NOW(), response_empid = ?, response_notes = ? WHERE request_id = ?`,
        [responseEmpid, notes, id],
      );
      await logUserAction(
        {
          emp_id: responseEmpid,
          table_name: req.table_name,
          record_id: req.record_id,
          action: 'decline',
          details: { proposed_data: proposedData, notes },
          request_id: id,
        },
        conn,
      );
      await conn.query(
        `INSERT INTO notifications (recipient_empid, type, related_id, message)
         VALUES (?, 'response', ?, ?)`,
        [req.emp_id, id, 'Request declined'],
      );
    }
    await conn.query('COMMIT');
    return { requester, status };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}
