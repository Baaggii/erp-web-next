import { pool, insertTableRow, getEmploymentSession } from '../../db/index.js';
import { logUserAction } from './userActivityLog.js';

const TEMP_TABLE = 'transaction_temporaries';
let ensurePromise = null;

function normalizeEmpId(empid) {
  if (!empid) return null;
  const trimmed = String(empid).trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify(null);
  }
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function ensureTemporaryTable(conn = pool) {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS \`${TEMP_TABLE}\` (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        company_id BIGINT NOT NULL,
        table_name VARCHAR(255) NOT NULL,
        form_name VARCHAR(255) DEFAULT NULL,
        config_name VARCHAR(255) DEFAULT NULL,
        module_key VARCHAR(255) DEFAULT NULL,
        payload_json LONGTEXT NOT NULL,
        raw_values_json LONGTEXT DEFAULT NULL,
        cleaned_values_json LONGTEXT DEFAULT NULL,
        created_by VARCHAR(64) NOT NULL,
        plan_senior_empid VARCHAR(64) DEFAULT NULL,
        branch_id BIGINT DEFAULT NULL,
        department_id BIGINT DEFAULT NULL,
        status ENUM('pending','promoted','rejected') NOT NULL DEFAULT 'pending',
        review_notes TEXT DEFAULT NULL,
        reviewed_by VARCHAR(64) DEFAULT NULL,
        reviewed_at DATETIME DEFAULT NULL,
        promoted_record_id VARCHAR(64) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_temp_company (company_id),
        KEY idx_temp_status (status),
        KEY idx_temp_table (table_name),
        KEY idx_temp_plan_senior (plan_senior_empid),
        KEY idx_temp_creator (created_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    );
  })()
    .catch((err) => {
      ensurePromise = null;
      throw err;
    });
  return ensurePromise;
}

async function insertNotification(
  conn,
  { companyId, recipientEmpId, message, createdBy, relatedId, type = 'request' },
) {
  const recipient = normalizeEmpId(recipientEmpId);
  if (!recipient) return;
  await conn.query(
    `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      companyId ?? null,
      recipient,
      type ?? 'request',
      relatedId ?? null,
      message ?? '',
      createdBy ?? null,
    ],
  );
}

export async function createTemporarySubmission({
  tableName,
  formName,
  configName,
  moduleKey,
  payload,
  rawValues,
  cleanedValues,
  companyId,
  branchId,
  departmentId,
  createdBy,
}) {
  if (!tableName) {
    const err = new Error('tableName required');
    err.status = 400;
    throw err;
  }
  const normalizedCreator = normalizeEmpId(createdBy);
  if (!normalizedCreator) {
    const err = new Error('createdBy required');
    err.status = 400;
    throw err;
  }
  const conn = await pool.getConnection();
  try {
    await ensureTemporaryTable(conn);
    await conn.query('BEGIN');
    const session = await getEmploymentSession(normalizedCreator, companyId);
    const reviewerEmpId =
      normalizeEmpId(session?.senior_empid) ||
      normalizeEmpId(session?.senior_plan_empid);
    const [result] = await conn.query(
      `INSERT INTO \`${TEMP_TABLE}\`
        (company_id, table_name, form_name, config_name, module_key, payload_json,
         raw_values_json, cleaned_values_json, created_by, plan_senior_empid,
         branch_id, department_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId ?? null,
        tableName,
        formName ?? null,
        configName ?? null,
        moduleKey ?? null,
        safeJsonStringify(payload),
        safeJsonStringify(rawValues),
        safeJsonStringify(cleanedValues),
        normalizedCreator,
        reviewerEmpId,
        branchId ?? null,
        departmentId ?? null,
      ],
    );
    const temporaryId = result.insertId;
    await logUserAction(
      {
        emp_id: normalizedCreator,
        table_name: tableName,
        record_id: temporaryId,
        action: 'create',
        details: {
          formName: formName ?? null,
          configName: configName ?? null,
          temporarySubmission: true,
        },
        company_id: companyId ?? null,
      },
      conn,
    );
    if (reviewerEmpId) {
      await insertNotification(conn, {
        companyId,
        recipientEmpId: reviewerEmpId,
        createdBy: normalizedCreator,
        relatedId: temporaryId,
        message: `Temporary submission pending review for ${tableName}`,
        type: 'request',
      });
    }
    await conn.query('COMMIT');
    return { id: temporaryId, reviewerEmpId, planSenior: reviewerEmpId };
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

function mapTemporaryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    tableName: row.table_name,
    formName: row.form_name,
    configName: row.config_name,
    moduleKey: row.module_key,
    payload: safeJsonParse(row.payload_json, {}),
    rawValues: safeJsonParse(row.raw_values_json, {}),
    cleanedValues: safeJsonParse(row.cleaned_values_json, {}),
    createdBy: row.created_by,
    planSeniorEmpId: row.plan_senior_empid,
    reviewerEmpId: row.plan_senior_empid,
    branchId: row.branch_id,
    departmentId: row.department_id,
    status: row.status,
    reviewNotes: row.review_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    promotedRecordId: row.promoted_record_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTemporarySubmissions({
  scope,
  tableName,
  empId,
  companyId,
  status = 'pending',
}) {
  await ensureTemporaryTable();
  const normalizedEmp = normalizeEmpId(empId);
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (companyId != null) {
    conditions.push('(company_id = ? OR company_id IS NULL)');
    params.push(companyId);
  }
  if (tableName) {
    conditions.push('table_name = ?');
    params.push(tableName);
  }
  if (scope === 'review') {
    conditions.push('plan_senior_empid = ?');
    params.push(normalizedEmp);
  } else {
    conditions.push('created_by = ?');
    params.push(normalizedEmp);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT * FROM \`${TEMP_TABLE}\` ${where} ORDER BY created_at DESC LIMIT 200`,
    params,
  );
  return rows.map(mapTemporaryRow);
}

export async function getTemporarySummary(empId, companyId) {
  await ensureTemporaryTable();
  const normalizedEmp = normalizeEmpId(empId);
  const [[created]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM \`${TEMP_TABLE}\`
     WHERE created_by = ? AND status = 'pending' AND (company_id = ? OR company_id IS NULL)`,
    [normalizedEmp, companyId ?? null],
  );
  const [[review]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM \`${TEMP_TABLE}\`
     WHERE plan_senior_empid = ? AND status = 'pending' AND (company_id = ? OR company_id IS NULL)`,
    [normalizedEmp, companyId ?? null],
  );
  return {
    createdPending: created?.cnt ?? 0,
    reviewPending: review?.cnt ?? 0,
    isReviewer: (review?.cnt ?? 0) > 0,
  };
}

export async function promoteTemporarySubmission(id, { reviewerEmpId, notes, io }) {
  const normalizedReviewer = normalizeEmpId(reviewerEmpId);
  if (!normalizedReviewer) {
    const err = new Error('reviewerEmpId required');
    err.status = 400;
    throw err;
  }
  const conn = await pool.getConnection();
  try {
    await ensureTemporaryTable(conn);
    await conn.query('BEGIN');
    const [rows] = await conn.query(
      `SELECT * FROM \`${TEMP_TABLE}\` WHERE id = ? FOR UPDATE`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      const err = new Error('Temporary submission not found');
      err.status = 404;
      throw err;
    }
    const allowedReviewer =
      normalizeEmpId(row.plan_senior_empid) === normalizedReviewer ||
      normalizeEmpId(row.created_by) === normalizedReviewer;
    if (!allowedReviewer) {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
    if (row.status !== 'pending') {
      const err = new Error('Temporary submission already reviewed');
      err.status = 409;
      throw err;
    }
    const cleaned =
      safeJsonParse(row.cleaned_values_json) ??
      safeJsonParse(row.payload_json)?.cleanedValues ??
      safeJsonParse(row.payload_json) ?? {};
    const mutationContext = {
      companyId: row.company_id ?? null,
      changedBy: normalizedReviewer,
    };
    const inserted = await insertTableRow(
      row.table_name,
      cleaned,
      undefined,
      undefined,
      false,
      normalizedReviewer,
      { conn, mutationContext },
    );
    const promotedId = inserted?.id ? String(inserted.id) : null;
    await conn.query(
      `UPDATE \`${TEMP_TABLE}\`
       SET status = 'promoted', reviewed_by = ?, reviewed_at = NOW(), review_notes = ?, promoted_record_id = ?
       WHERE id = ?`,
      [normalizedReviewer, notes ?? null, promotedId, id],
    );
    await logUserAction(
      {
        emp_id: normalizedReviewer,
        table_name: row.table_name,
        record_id: id,
        action: 'approve',
        details: {
          promotedRecordId: promotedId,
          formName: row.form_name ?? null,
          temporaryAction: 'promote',
        },
        company_id: row.company_id ?? null,
      },
      conn,
    );
    await insertNotification(conn, {
      companyId: row.company_id,
      recipientEmpId: row.created_by,
      createdBy: normalizedReviewer,
      relatedId: id,
      message: `Temporary submission for ${row.table_name} approved`,
      type: 'response',
    });
    await insertNotification(conn, {
      companyId: row.company_id,
      recipientEmpId: normalizedReviewer,
      createdBy: normalizedReviewer,
      relatedId: id,
      message: `You approved temporary submission #${id} for ${row.table_name}`,
      type: 'response',
    });
    await conn.query('COMMIT');
    if (io) {
      io.to(`user:${row.created_by}`).emit('temporaryReviewed', {
        id,
        status: 'promoted',
        promotedRecordId: promotedId,
      });
      io.to(`user:${normalizedReviewer}`).emit('temporaryReviewed', {
        id,
        status: 'promoted',
        promotedRecordId: promotedId,
      });
    }
    return { id, promotedRecordId: promotedId };
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

export async function rejectTemporarySubmission(id, { reviewerEmpId, notes, io }) {
  const normalizedReviewer = normalizeEmpId(reviewerEmpId);
  if (!normalizedReviewer) {
    const err = new Error('reviewerEmpId required');
    err.status = 400;
    throw err;
  }
  const conn = await pool.getConnection();
  try {
    await ensureTemporaryTable(conn);
    await conn.query('BEGIN');
    const [rows] = await conn.query(
      `SELECT * FROM \`${TEMP_TABLE}\` WHERE id = ? FOR UPDATE`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      const err = new Error('Temporary submission not found');
      err.status = 404;
      throw err;
    }
    const allowedReviewer =
      normalizeEmpId(row.plan_senior_empid) === normalizedReviewer ||
      normalizeEmpId(row.created_by) === normalizedReviewer;
    if (!allowedReviewer) {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
    if (row.status !== 'pending') {
      const err = new Error('Temporary submission already reviewed');
      err.status = 409;
      throw err;
    }
    await conn.query(
      `UPDATE \`${TEMP_TABLE}\`
       SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_notes = ?
       WHERE id = ?`,
      [normalizedReviewer, notes ?? null, id],
    );
    await logUserAction(
      {
        emp_id: normalizedReviewer,
        table_name: row.table_name,
        record_id: id,
        action: 'decline',
        details: { formName: row.form_name ?? null, temporaryAction: 'reject' },
        company_id: row.company_id ?? null,
      },
      conn,
    );
    await insertNotification(conn, {
      companyId: row.company_id,
      recipientEmpId: row.created_by,
      createdBy: normalizedReviewer,
      relatedId: id,
      message: `Temporary submission for ${row.table_name} rejected`,
      type: 'response',
    });
    await insertNotification(conn, {
      companyId: row.company_id,
      recipientEmpId: normalizedReviewer,
      createdBy: normalizedReviewer,
      relatedId: id,
      message: `You rejected temporary submission #${id} for ${row.table_name}`,
      type: 'response',
    });
    await conn.query('COMMIT');
    if (io) {
      io.to(`user:${row.created_by}`).emit('temporaryReviewed', {
        id,
        status: 'rejected',
      });
      io.to(`user:${normalizedReviewer}`).emit('temporaryReviewed', {
        id,
        status: 'rejected',
      });
    }
    return { id, status: 'rejected' };
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

