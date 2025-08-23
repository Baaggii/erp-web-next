import {
  pool,
  updateTableRow,
  deleteTableRow,
  listTableColumns,
  getPrimaryKeyColumns,
} from '../../db/index.js';
import { logUserAction } from './userActivityLog.js';

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

export async function createRequest({ tableName, recordId, empId, requestType, proposedData }) {
  await ensureValidTableName(tableName);
  if (!ALLOWED_REQUEST_TYPES.has(requestType)) {
    throw new Error('Invalid request type');
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
    if (requestType === 'delete') {
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
    const [result] = await conn.query(
      `INSERT INTO pending_request (table_name, record_id, emp_id, senior_empid, request_type, proposed_data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        tableName,
        recordId,
        String(empId).trim().toUpperCase(),
        senior,
        requestType,
        finalProposed ? JSON.stringify(finalProposed) : null,
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
    date_from,
    date_to,
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
  if (date_from) {
    conditions.push('created_at >= ?');
    params.push(date_from);
  }
  if (date_to) {
    conditions.push('created_at <= ?');
    params.push(date_to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT * FROM pending_request ${where}`,
    params,
  );

  const result = [];
  for (const row of rows) {
    const parsed = parseProposedData(row.proposed_data);
    let original = null;
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

    result.push({
      ...row,
      proposed_data: parsed,
      original,
    });
  }

  return result;
}

export async function listRequestsByEmp(
  emp_id,
  { status, table_name, date_from, date_to } = {},
) {
  return listRequests({
    requested_empid: emp_id,
    status,
    table_name,
    date_from,
    date_to,
  });
}

export async function respondRequest(
  id,
  responseEmpid,
  status,
  notes,
) {
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

    if (status === 'accepted') {
      const data = parseProposedData(req.proposed_data);
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
        [responseEmpid, notes || null, id],
      );
      await logUserAction(
        {
          emp_id: responseEmpid,
          table_name: req.table_name,
          record_id: req.record_id,
          action: 'approve',
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
        [responseEmpid, notes || null, id],
      );
      await logUserAction(
        {
          emp_id: responseEmpid,
          table_name: req.table_name,
          record_id: req.record_id,
          action: 'decline',
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

export async function getSeenCounts(empId) {
  const [rows] = await pool.query(
    `SELECT incoming_pending, incoming_accepted, incoming_declined,
            outgoing_accepted, outgoing_declined
       FROM request_seen_counts WHERE emp_id = ? LIMIT 1`,
    [empId],
  );
  const row = rows[0] || {};
  return {
    incoming: {
      pending: row.incoming_pending || 0,
      accepted: row.incoming_accepted || 0,
      declined: row.incoming_declined || 0,
    },
    outgoing: {
      accepted: row.outgoing_accepted || 0,
      declined: row.outgoing_declined || 0,
    },
  };
}

export async function markSeenCounts(empId, { incoming = {}, outgoing = {} } = {}) {
  const data = [
    Number(incoming.pending) || 0,
    Number(incoming.accepted) || 0,
    Number(incoming.declined) || 0,
    Number(outgoing.accepted) || 0,
    Number(outgoing.declined) || 0,
    empId,
    Number(incoming.pending) || 0,
    Number(incoming.accepted) || 0,
    Number(incoming.declined) || 0,
    Number(outgoing.accepted) || 0,
    Number(outgoing.declined) || 0,
  ];
  await pool.query(
    `INSERT INTO request_seen_counts
       (incoming_pending, incoming_accepted, incoming_declined,
        outgoing_accepted, outgoing_declined, emp_id)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       incoming_pending = ?,
       incoming_accepted = ?,
       incoming_declined = ?,
       outgoing_accepted = ?,
       outgoing_declined = ?,
       updated_at = CURRENT_TIMESTAMP`,
    data,
  );
}
