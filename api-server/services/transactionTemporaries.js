import {
  pool,
  insertTableRow,
  getEmploymentSession,
  listTableColumns,
} from '../../db/index.js';
import { getFormConfig } from './transactionFormConfig.js';
import { logUserAction } from './userActivityLog.js';

const TEMP_TABLE = 'transaction_temporaries';
let ensurePromise = null;

const RESERVED_TEMPORARY_COLUMNS = new Set(['rows']);

function normalizeEmpId(empid) {
  if (!empid) return null;
  const trimmed = String(empid).trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function normalizeScopePreference(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed;
  }
  return value;
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

function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
  );
}

function extractPromotableValues(source) {
  if (!isPlainObject(source)) return null;
  const seen = new Set();
  let current = source;
  while (isPlainObject(current) && !seen.has(current)) {
    seen.add(current);
    const nextKey = ['values', 'cleanedValues', 'data', 'record'].find((key) =>
      isPlainObject(current[key]),
    );
    if (!nextKey) break;
    current = current[nextKey];
  }
  return isPlainObject(current) ? current : null;
}

export async function sanitizeCleanedValuesForInsert(tableName, values, columns) {
  if (!tableName || !values) return {};
  if (!isPlainObject(values)) return {};
  const entries = Object.entries(values);
  if (entries.length === 0) return {};

  let resolvedColumns = columns;
  if (!Array.isArray(resolvedColumns)) {
    resolvedColumns = await listTableColumns(tableName);
  }
  if (!Array.isArray(resolvedColumns) || resolvedColumns.length === 0) {
    return {};
  }

  const lookup = new Map();
  resolvedColumns.forEach((col) => {
    if (typeof col === 'string' && col) {
      lookup.set(col.toLowerCase(), col);
    }
  });

  const sanitized = {};
  for (const [rawKey, rawValue] of entries) {
    if (rawValue === undefined) continue;
    const key = typeof rawKey === 'string' ? rawKey.trim() : String(rawKey || '');
    if (!key) continue;
    const lower = key.toLowerCase();
    if (RESERVED_TEMPORARY_COLUMNS.has(lower)) continue;
    const columnName = lookup.get(lower);
    if (!columnName) continue;
    let normalizedValue = rawValue;
    if (typeof normalizedValue === 'string') {
      const trimmed = normalizedValue.trim();
      if (trimmed) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if (
          (first === '{' && last === '}') ||
          (first === '[' && last === ']') ||
          (first === '"' && last === '"')
        ) {
          try {
            normalizedValue = JSON.parse(trimmed);
          } catch {
            normalizedValue = rawValue;
          }
        }
      }
    }
    if (Array.isArray(normalizedValue)) {
      normalizedValue = JSON.stringify(normalizedValue);
    } else if (
      normalizedValue &&
      typeof normalizedValue === 'object' &&
      !(normalizedValue instanceof Date) &&
      !(normalizedValue instanceof Buffer)
    ) {
      normalizedValue = JSON.stringify(normalizedValue);
    } else if (typeof normalizedValue === 'bigint') {
      normalizedValue = normalizedValue.toString();
    }
    sanitized[columnName] = normalizedValue;
  }
  return sanitized;
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
  tenant = {},
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
  const branchPrefSpecified = Object.prototype.hasOwnProperty.call(
    tenant,
    'branch_id',
  );
  const departmentPrefSpecified = Object.prototype.hasOwnProperty.call(
    tenant,
    'department_id',
  );
  const rawBranchPref = branchPrefSpecified ? tenant.branch_id : branchId;
  const rawDepartmentPref = departmentPrefSpecified
    ? tenant.department_id
    : departmentId;
  const normalizedBranchPref = branchPrefSpecified
    ? normalizeScopePreference(rawBranchPref)
    : undefined;
  const normalizedDepartmentPref = departmentPrefSpecified
    ? normalizeScopePreference(rawDepartmentPref)
    : undefined;

  const conn = await pool.getConnection();
  try {
    await ensureTemporaryTable(conn);
    await conn.query('BEGIN');
    const session = await getEmploymentSession(normalizedCreator, companyId, {
      ...(branchPrefSpecified ? { branchId: normalizedBranchPref } : {}),
      ...(departmentPrefSpecified
        ? { departmentId: normalizedDepartmentPref }
        : {}),
    });
    const reviewerEmpId =
      normalizeEmpId(session?.senior_empid) ||
      normalizeEmpId(session?.senior_plan_empid);
    const fallbackBranch = normalizeScopePreference(branchId);
    const fallbackDepartment = normalizeScopePreference(departmentId);
    const insertBranchId = branchPrefSpecified
      ? normalizedBranchPref ?? null
      : fallbackBranch ?? null;
    const insertDepartmentId = departmentPrefSpecified
      ? normalizedDepartmentPref ?? null
      : fallbackDepartment ?? null;
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
        insertBranchId,
        insertDepartmentId,
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
  const payload = safeJsonParse(row.payload_json, {});
  const cleanedContainer = safeJsonParse(row.cleaned_values_json, {});
  const rawContainer = safeJsonParse(row.raw_values_json, {});
  const cleanedValues =
    extractPromotableValues(cleanedContainer) ??
    (isPlainObject(cleanedContainer) ? cleanedContainer : {});
  const promotableValues =
    extractPromotableValues(cleanedContainer) ??
    extractPromotableValues(payload?.cleanedValues) ??
    extractPromotableValues(payload?.values) ??
    extractPromotableValues(rawContainer) ??
    {};
  return {
    id: row.id,
    companyId: row.company_id,
    tableName: row.table_name,
    formName: row.form_name,
    configName: row.config_name,
    moduleKey: row.module_key,
    payload,
    rawValues: rawContainer,
    cleanedValues,
    values: promotableValues,
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

function buildModuleSlug(key) {
  if (!key) return '';
  return String(key)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function enrichTemporaryMetadata(rows, companyId) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const cache = new Map();

  const loadConfig = async (tableName, formName) => {
    const cacheKey = `${companyId ?? 0}::${tableName ?? ''}::${formName ?? ''}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    let meta = {};
    if (tableName && formName) {
      try {
        const { config } = await getFormConfig(tableName, formName, companyId);
        if (config) {
          meta = {
            moduleKey: config.moduleKey || '',
            moduleLabel: config.moduleLabel || '',
            formLabel: config.moduleLabel || formName,
          };
        }
      } catch {
        meta = {};
      }
    }
    cache.set(cacheKey, meta);
    return meta;
  };

  return Promise.all(
    rows.map(async (row) => {
      if (!row) return row;
      let next = { ...row };
      const needsModuleKey = !next.moduleKey || !next.moduleKey.trim();
      const needsFormLabel = !next.formLabel || !String(next.formLabel).trim();
      const needsModuleLabel = !next.moduleLabel || !String(next.moduleLabel).trim();
      let meta;
      if (
        (needsModuleKey || needsFormLabel || needsModuleLabel) &&
        next.tableName &&
        (next.formName || next.configName)
      ) {
        meta = await loadConfig(next.tableName, next.formName || next.configName);
      }
      if (meta?.moduleKey && needsModuleKey) {
        next = { ...next, moduleKey: meta.moduleKey };
      }
      if (meta?.formLabel && needsFormLabel) {
        next = { ...next, formLabel: meta.formLabel };
      }
      if (meta?.moduleLabel && needsModuleLabel) {
        next = { ...next, moduleLabel: meta.moduleLabel };
      }
      if ((!next.formLabel || !String(next.formLabel).trim()) && next.formName) {
        next = { ...next, formLabel: next.formName };
      }
      if (next.moduleKey && !next.moduleSlug) {
        next = { ...next, moduleSlug: buildModuleSlug(next.moduleKey) };
      } else if (!next.moduleSlug) {
        next = { ...next, moduleSlug: '' };
      }
      return next;
    }),
  );
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
  const mapped = rows.map(mapTemporaryRow);
  return enrichTemporaryMetadata(mapped, companyId);
}

export async function getTemporarySummary(empId, companyId) {
  await ensureTemporaryTable();
  const normalizedEmp = normalizeEmpId(empId);
  const [[created]] = await pool.query(
    `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_cnt,
        COUNT(*) AS total_cnt
       FROM \`${TEMP_TABLE}\`
      WHERE created_by = ?
        AND (company_id = ? OR company_id IS NULL)`,
    [normalizedEmp, companyId ?? null],
  );
  const [[review]] = await pool.query(
    `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_cnt,
        COUNT(*) AS total_cnt
       FROM \`${TEMP_TABLE}\`
      WHERE plan_senior_empid = ?
        AND (company_id = ? OR company_id IS NULL)`,
    [normalizedEmp, companyId ?? null],
  );
  const createdPending = Number(created?.pending_cnt) || 0;
  const reviewPending = Number(review?.pending_cnt) || 0;
  return {
    createdPending,
    reviewPending,
    isReviewer: (Number(review?.total_cnt) || 0) > 0,
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
    const columns = await listTableColumns(row.table_name);
    const payloadJson = safeJsonParse(row.payload_json, {});
    const candidateSources = [
      extractPromotableValues(safeJsonParse(row.cleaned_values_json)),
      extractPromotableValues(payloadJson?.cleanedValues),
      extractPromotableValues(payloadJson?.values),
      extractPromotableValues(payloadJson),
      extractPromotableValues(safeJsonParse(row.raw_values_json)),
    ].filter(isPlainObject);

    let sanitizedCleaned = {};
    for (const source of candidateSources) {
      // sanitizeCleanedValuesForInsert performs its own plain-object guard.
      // eslint-disable-next-line no-await-in-loop
      const next = await sanitizeCleanedValuesForInsert(
        row.table_name,
        source,
        columns,
      );
      if (Object.keys(next).length > 0) {
        sanitizedCleaned = next;
        break;
      }
    }

    if (Object.keys(sanitizedCleaned).length === 0) {
      const err = new Error('Temporary submission is missing promotable values');
      err.status = 422;
      throw err;
    }

    const mutationContext = {
      companyId: row.company_id ?? null,
      changedBy: normalizedReviewer,
    };
    const inserted = await insertTableRow(
      row.table_name,
      sanitizedCleaned,
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

