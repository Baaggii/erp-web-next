import {
  pool,
  insertTableRow,
  getEmploymentSession,
  listTableColumnsDetailed,
} from '../../db/index.js';
import { getFormConfig } from './transactionFormConfig.js';
import {
  buildReceiptFromDynamicTransaction,
  sendReceipt,
  resolvePosApiEndpoint,
} from './posApiService.js';
import {
  computePosApiUpdates,
  createColumnLookup,
} from './posApiPersistence.js';
import { logUserAction } from './userActivityLog.js';
import {
  saveEbarimtInvoiceSnapshot,
  persistEbarimtInvoiceResponse,
} from './ebarimtInvoiceStore.js';
import { getMerchantById } from './merchantService.js';

const TEMP_TABLE = 'transaction_temporaries';
const TEMP_REVIEW_HISTORY_TABLE = 'transaction_temporary_review_history';
let ensurePromise = null;

const RESERVED_TEMPORARY_COLUMNS = new Set(['rows']);
const STRING_COLUMN_TYPES = new Set([
  'char',
  'varchar',
  'tinytext',
  'text',
  'mediumtext',
  'longtext',
  'enum',
  'set',
]);

const LABEL_WRAPPER_KEYS = new Set([
  'value',
  'label',
  'name',
  'title',
  'text',
  'display',
  'displayName',
  'code',
]);

function stripLabelWrappers(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    let changed = false;
    const mapped = value.map((item) => {
      const next = stripLabelWrappers(item);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? mapped : value;
  }
  if (value instanceof Date || (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))) {
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Object.prototype.hasOwnProperty.call(value, 'value')) {
    const keys = Object.keys(value);
    const onlyKnownKeys = keys.every((key) => LABEL_WRAPPER_KEYS.has(key));
    if (onlyKnownKeys) {
      return stripLabelWrappers(value.value);
    }
  }
  let changed = false;
  const result = {};
  for (const [key, val] of Object.entries(value)) {
    const next = stripLabelWrappers(val);
    if (next !== val) changed = true;
    result[key] = next;
  }
  return changed ? result : value;
}

function normalizeEmpId(empid) {
  if (!empid) return null;
  const trimmed = String(empid).trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function normalizeTemporaryId(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  const stringValue = typeof value === 'string' ? value.trim() : '';
  if (stringValue && /^\d+$/.test(stringValue)) {
    const numeric = Number(stringValue);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }
  return null;
}

function normalizeTemporaryIdList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const normalized = list
    .map((item) => normalizeTemporaryId(item))
    .filter((item) => item !== null);
  return Array.from(new Set(normalized));
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

function isDynamicSqlTriggerError(err) {
  if (!err) return false;
  const message = String(err.sqlMessage || err.message || '').toLowerCase();
  return err.errno === 1336 || message.includes('dynamic sql is not allowed');
}

function formatDbErrorDetails(err) {
  return {
    errno: err?.errno ?? null,
    code: err?.code || null,
    sqlState: err?.sqlState || null,
    message: err?.sqlMessage || err?.message || null,
  };
}

function attachDynamicSqlErrorDetails(err, context = {}) {
  const details = {
    ...formatDbErrorDetails(err),
    ...context,
  };
  const codeParts = [];
  if (details.errno !== null && details.errno !== undefined) {
    codeParts.push(`errno=${details.errno}`);
  }
  if (details.code) {
    codeParts.push(`code=${details.code}`);
  }
  if (details.sqlState) {
    codeParts.push(`sqlState=${details.sqlState}`);
  }
  const suffix = codeParts.length > 0 ? ` (${codeParts.join(', ')})` : '';
  const formattedMessage = `${details.message || 'Dynamic SQL trigger error'}${suffix}`;
  const enriched = new Error(formattedMessage);
  enriched.status = err?.status || err?.statusCode || 400;
  enriched.details = details;
  return enriched;
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

function normalizeTransactionTypeValue(value) {
  if (value === undefined || value === null) return '';
  const unwrapped = stripLabelWrappers(value);
  if (
    typeof unwrapped === 'string' ||
    typeof unwrapped === 'number' ||
    typeof unwrapped === 'boolean'
  ) {
    return String(unwrapped).trim().toLowerCase();
  }
  return '';
}

function normalizeFieldName(name) {
  if (!name) return '';
  return String(name).trim().toLowerCase();
}

function extractTransactionTypeValue(row, fieldName) {
  const normalizedField = normalizeFieldName(fieldName);
  if (!normalizedField) return undefined;
  const sources = [
    row?.values,
    row?.cleanedValues,
    row?.rawValues,
    row?.payload?.values,
    row?.payload?.cleanedValues,
    row?.payload?.rawValues,
  ];

  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const [key, val] of Object.entries(source)) {
      if (normalizeFieldName(key) === normalizedField) {
        return stripLabelWrappers(val);
      }
    }
  }
  return undefined;
}

function formatHashAsUuid(hashHex) {
  if (!hashHex || typeof hashHex !== 'string' || hashHex.length < 32) return null;
  const normalized = hashHex.padEnd(32, '0');
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join('-');
}

function extractFingerprintValue(fieldName, sources = []) {
  const normalizedField = normalizeFieldName(fieldName);
  if (!normalizedField) return '';
  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const [key, val] of Object.entries(source)) {
      if (normalizeFieldName(key) === normalizedField) {
        const stripped = stripLabelWrappers(val);
        if (stripped === undefined || stripped === null) return '';
        if (typeof stripped === 'object') {
          try {
            return JSON.stringify(stripped);
          } catch {
            return '';
          }
        }
        return String(stripped);
      }
    }
  }
  return '';
}

function resolveForwardMeta(payload, fallbackCreator, currentId) {
  const meta = isPlainObject(payload?.forwardMeta) ? payload.forwardMeta : {};
  const chainIds = normalizeTemporaryIdList(meta.chainIds);
  const normalizedCurrentId = normalizeTemporaryId(currentId);
  if (normalizedCurrentId) chainIds.push(normalizedCurrentId);
  const uniqueChainIds = Array.from(new Set(chainIds));
  const originCreator = normalizeEmpId(meta.originCreator) || normalizeEmpId(fallbackCreator);
  const rootTemporaryId =
    normalizeTemporaryId(meta.rootTemporaryId) || normalizedCurrentId || meta.rootTemporaryId || null;
  const parentTemporaryId = normalizeTemporaryId(meta.parentTemporaryId) || null;
  return {
    originCreator,
    rootTemporaryId,
    parentTemporaryId,
    chainIds: uniqueChainIds,
  };
}

export function expandForwardMeta(forwardMeta, { currentId, createdBy }) {
  const normalizedCurrentId = normalizeTemporaryId(currentId);
  const normalizedRootId =
    normalizeTemporaryId(forwardMeta?.rootTemporaryId) || normalizedCurrentId;
  const normalizedParentId =
    normalizeTemporaryId(forwardMeta?.parentTemporaryId) || normalizedCurrentId;
  const forwardChain = Array.from(
    new Set(
      [
        ...normalizeTemporaryIdList(forwardMeta?.chainIds),
        normalizedCurrentId,
        normalizedParentId,
        normalizedRootId,
      ].filter(Boolean),
    ),
  );
  return {
    ...forwardMeta,
    originCreator: forwardMeta?.originCreator || normalizeEmpId(createdBy),
    rootTemporaryId: normalizedRootId,
    parentTemporaryId: normalizedCurrentId,
    chainIds: forwardChain,
  };
}

export function buildChainIdsForUpdate(forwardMeta, currentId) {
  const baseChain = normalizeTemporaryIdList(forwardMeta?.chainIds);
  const normalizedCurrent = normalizeTemporaryId(currentId);
  if (normalizedCurrent) {
    baseChain.push(normalizedCurrent);
  }
  const normalizedParent = normalizeTemporaryId(forwardMeta?.parentTemporaryId);
  if (normalizedParent) {
    baseChain.push(normalizedParent);
  }
  const normalizedRoot = normalizeTemporaryId(forwardMeta?.rootTemporaryId);
  if (normalizedRoot) {
    baseChain.push(normalizedRoot);
  }
  return Array.from(new Set(baseChain));
}

export async function resolveChainIdsForUpdate(conn, forwardMeta, currentId) {
  const chainIds = buildChainIdsForUpdate(forwardMeta, currentId);
  if (!conn || chainIds.length === 0) return [];
  const placeholders = chainIds.map(() => '?').join(', ');
  const [rows] = await conn.query(
    `SELECT id FROM \`${TEMP_TABLE}\` WHERE id IN (${placeholders}) FOR UPDATE`,
    chainIds,
  );
  const existing = new Set(
    Array.isArray(rows)
      ? rows
          .map((row) => normalizeTemporaryId(row?.id))
          .filter((id) => id !== null)
      : [],
  );
  return chainIds.filter((id) => existing.has(id));
}

function filterRowsByTransactionType(rows, fieldName, value) {
  const normalizedField = normalizeFieldName(fieldName);
  const normalizedValue = normalizeTransactionTypeValue(value);
  if (!normalizedField || !normalizedValue) return rows;
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  return rows.filter((row) => {
    const rowValue = extractTransactionTypeValue(row, normalizedField);
    if (rowValue === undefined || rowValue === null) return false;
    return normalizeTransactionTypeValue(rowValue) === normalizedValue;
  });
}

function groupTemporaryRowsByChain(rows) {
  if (!Array.isArray(rows)) return [];
  const lookup = new Map();
  rows.forEach((row) => {
    if (!row) return;
    const key = row.chainId || row.id;
    const existing = lookup.get(key);
    if (!existing) {
      lookup.set(key, row);
      return;
    }
    const existingDate = existing.updatedAt ? new Date(existing.updatedAt) : null;
    const nextDate = row.updatedAt ? new Date(row.updatedAt) : null;
    if (existingDate && nextDate && nextDate > existingDate) {
      lookup.set(key, row);
    }
  });
  return Array.from(lookup.values());
}

async function updateTemporaryChainStatus(
  conn,
  chainId,
  {
    status,
    reviewerEmpId = null,
    notes = null,
    promotedRecordId = null,
    clearReviewerAssignment = false,
    pendingOnly = false,
    temporaryId = null,
  },
) {
  const normalizedChain = normalizeTemporaryId(chainId);
  const hasChain = chainId != null && chainId !== undefined && normalizedChain;
  const normalizedTemporaryId = normalizeTemporaryId(temporaryId);
  if (!conn || (!hasChain && !normalizedTemporaryId)) return;
  const columns = ['status = ?', 'reviewed_by = ?', 'reviewed_at = NOW()', 'review_notes = ?'];
  const params = [status ?? null, reviewerEmpId ?? null, notes ?? null];
  if (promotedRecordId !== undefined) {
    columns.push('promoted_record_id = ?');
    params.push(promotedRecordId);
  }
  if (clearReviewerAssignment || (status && status !== 'pending')) {
    columns.push('plan_senior_empid = NULL');
  }
  const whereClause = hasChain
    ? pendingOnly
      ? 'chain_id = ? AND status = "pending"'
      : 'chain_id = ?'
    : pendingOnly
    ? 'id = ? AND status = "pending"'
    : 'id = ?';
  params.push(hasChain ? normalizedChain : normalizedTemporaryId);
  await conn.query(
    `UPDATE \`${TEMP_TABLE}\` SET ${columns.join(', ')} WHERE ${whereClause}`,
    params,
  );
}

export async function sanitizeCleanedValuesForInsert(tableName, values, columns) {
  if (!tableName || !values) return { values: {}, warnings: [] };
  if (!isPlainObject(values)) return { values: {}, warnings: [] };
  const entries = Object.entries(values);
  if (entries.length === 0) return { values: {}, warnings: [] };

  let resolvedColumns = columns;
  if (!Array.isArray(resolvedColumns)) {
    resolvedColumns = await listTableColumnsDetailed(tableName);
  }
  if (!Array.isArray(resolvedColumns) || resolvedColumns.length === 0) {
    return { values: {}, warnings: [] };
  }

  const lookup = new Map();
  resolvedColumns.forEach((col) => {
    if (!col) return;
    if (typeof col === 'string') {
      const key = col.trim().toLowerCase();
      if (key) {
        lookup.set(key, {
          name: col,
          type: null,
          maxLength: null,
        });
      }
      return;
    }
    if (typeof col === 'object' && typeof col.name === 'string') {
      const key = col.name.trim().toLowerCase();
      if (!key) return;
      lookup.set(key, {
        name: col.name,
        type: col.type ? String(col.type).toLowerCase() : null,
        maxLength: col.maxLength != null ? Number(col.maxLength) : null,
      });
    }
  });

  if (lookup.size === 0) {
    return { values: {}, warnings: [] };
  }

  const sanitized = {};
  const warnings = [];
  for (const [rawKey, rawValue] of entries) {
    if (rawValue === undefined) continue;
    const key = typeof rawKey === 'string' ? rawKey.trim() : String(rawKey || '');
    if (!key) continue;
    const lower = key.toLowerCase();
    if (RESERVED_TEMPORARY_COLUMNS.has(lower)) continue;
    const columnInfo = lookup.get(lower);
    if (!columnInfo) continue;
    let normalizedValue = rawValue;
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
    if (typeof normalizedValue === 'string') {
      normalizedValue = normalizedValue.trim();
      const { type, maxLength } = columnInfo;
      if (
        typeof maxLength === 'number' &&
        maxLength > 0 &&
        STRING_COLUMN_TYPES.has(type)
      ) {
        const stringLength = normalizedValue.length;
        if (stringLength > maxLength) {
          warnings.push({
            column: columnInfo.name,
            maxLength,
            actualLength: stringLength,
            type: 'maxLength',
          });
          normalizedValue = normalizedValue.slice(0, maxLength);
        }
      }
    }
    sanitized[columnInfo.name] = normalizedValue;
  }
  return { values: sanitized, warnings };
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
        chain_id BIGINT UNSIGNED DEFAULT NULL,
        is_pending TINYINT(1) AS (IF(status = 'pending', 1, NULL)) STORED,
        review_notes TEXT DEFAULT NULL,
        reviewed_by VARCHAR(64) DEFAULT NULL,
        reviewed_at DATETIME DEFAULT NULL,
        promoted_record_id VARCHAR(64) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT chk_temp_pending_reviewer
          CHECK (status = 'pending' OR plan_senior_empid IS NULL),
        PRIMARY KEY (id),
        KEY idx_temp_company (company_id),
        KEY idx_temp_status (status),
        KEY idx_temp_table (table_name),
        KEY idx_temp_plan_senior (plan_senior_empid),
        KEY idx_temp_status_plan_senior (status, plan_senior_empid),
        UNIQUE KEY idx_temp_chain_pending (chain_id, is_pending),
        KEY idx_temp_creator (created_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    );
    try {
      const [columns] = await conn.query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?`,
        [TEMP_TABLE],
      );
      const columnLookup = new Set(
        Array.isArray(columns)
          ? columns
              .map((row) => (row && typeof row.COLUMN_NAME === 'string' ? row.COLUMN_NAME.toLowerCase() : null))
              .filter(Boolean)
          : [],
      );
      if (!columnLookup.has('chain_id')) {
        await conn.query(
          `ALTER TABLE \`${TEMP_TABLE}\`
             ADD COLUMN chain_id BIGINT UNSIGNED DEFAULT NULL`,
        );
      }
      if (!columnLookup.has('is_pending')) {
        await conn.query(
          `ALTER TABLE \`${TEMP_TABLE}\`
             ADD COLUMN is_pending TINYINT(1) AS (IF(status = 'pending', 1, NULL)) STORED`,
        );
      }
      const [constraints] = await conn.query(
        `SELECT CONSTRAINT_NAME
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND CONSTRAINT_NAME = 'chk_temp_pending_reviewer'
          LIMIT 1`,
        [TEMP_TABLE],
      );
      const hasConstraint =
        Array.isArray(constraints) &&
        constraints.some(
          (row) =>
            row &&
            typeof row.CONSTRAINT_NAME === 'string' &&
            row.CONSTRAINT_NAME.toLowerCase() === 'chk_temp_pending_reviewer',
        );
      if (!hasConstraint) {
        await conn.query(
          `ALTER TABLE \`${TEMP_TABLE}\`
             ADD CONSTRAINT chk_temp_pending_reviewer
             CHECK (status = 'pending' OR plan_senior_empid IS NULL)`,
        );
      }
      const [indexes] = await conn.query(
        `SELECT INDEX_NAME
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND INDEX_NAME = 'idx_temp_status_plan_senior'
          LIMIT 1`,
        [TEMP_TABLE],
      );
      const hasCompositeIndex =
        Array.isArray(indexes) &&
        indexes.some(
          (row) =>
            row &&
            typeof row.INDEX_NAME === 'string' &&
            row.INDEX_NAME.toLowerCase() === 'idx_temp_status_plan_senior',
      );
      if (!hasCompositeIndex) {
        await conn.query(
          `ALTER TABLE \`${TEMP_TABLE}\`
             ADD INDEX idx_temp_status_plan_senior (status, plan_senior_empid)`,
        );
      }
      const [chainIndexes] = await conn.query(
        `SELECT INDEX_NAME
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND INDEX_NAME = 'idx_temp_chain_pending'
          LIMIT 1`,
        [TEMP_TABLE],
      );
      const hasChainIndex =
        Array.isArray(chainIndexes) &&
        chainIndexes.some(
          (row) =>
            row && typeof row.INDEX_NAME === 'string' && row.INDEX_NAME.toLowerCase() === 'idx_temp_chain_pending',
        );
      if (!hasChainIndex) {
        await conn.query(
          `ALTER TABLE \`${TEMP_TABLE}\`
             ADD UNIQUE INDEX idx_temp_chain_pending (chain_id, is_pending)`,
        );
      } else {
        await conn.query(
          `ALTER TABLE \`${TEMP_TABLE}\`
             DROP INDEX idx_temp_chain_pending,
             ADD UNIQUE INDEX idx_temp_chain_pending (chain_id, is_pending)`,
        );
      }
      const [triggers] = await conn.query(
        `SELECT TRIGGER_NAME
           FROM INFORMATION_SCHEMA.TRIGGERS
          WHERE TRIGGER_SCHEMA = DATABASE()
            AND TRIGGER_NAME = 'trg_temp_clear_reviewer'
          LIMIT 1`,
      );
      const hasTrigger =
        Array.isArray(triggers) &&
        triggers.some(
          (row) =>
            row &&
            typeof row.TRIGGER_NAME === 'string' &&
            row.TRIGGER_NAME.toLowerCase() === 'trg_temp_clear_reviewer',
        );
      if (!hasTrigger) {
        await conn.query(
          `CREATE TRIGGER \`trg_temp_clear_reviewer\`
             BEFORE UPDATE ON \`${TEMP_TABLE}\`
             FOR EACH ROW
             SET NEW.plan_senior_empid = IF(NEW.status = 'pending', NEW.plan_senior_empid, NULL)`,
        );
      }
    } catch (constraintErr) {
      console.error('Failed to ensure reviewer/status constraint', constraintErr);
    }
    await conn.query(
      `CREATE TABLE IF NOT EXISTS \`${TEMP_REVIEW_HISTORY_TABLE}\` (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        temporary_id BIGINT UNSIGNED NOT NULL,
        chain_id BIGINT UNSIGNED NOT NULL,
        action ENUM('forwarded','promoted','rejected') NOT NULL,
        reviewer_empid VARCHAR(64) NOT NULL,
        forwarded_to_empid VARCHAR(64) DEFAULT NULL,
        promoted_record_id VARCHAR(64) DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_temp_history_temp (temporary_id),
        KEY idx_temp_history_chain (chain_id),
        KEY idx_temp_history_action (action)
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

const REVIEW_ACTIONS = new Set(['forwarded', 'promoted', 'rejected']);

async function recordTemporaryReviewHistory(
  conn,
  {
    temporaryId,
    action,
    reviewerEmpId,
    notes = null,
    forwardedToEmpId = null,
    promotedRecordId = null,
    chainId = null,
  },
) {
  const normalizedId = normalizeTemporaryId(temporaryId);
  const normalizedReviewer = normalizeEmpId(reviewerEmpId);
  const normalizedChainId = normalizeTemporaryId(chainId);
  if (!conn || !normalizedId || !normalizedReviewer || !REVIEW_ACTIONS.has(action) || !normalizedChainId) return;
  await ensureTemporaryTable(conn);
  const normalizedForward = normalizeEmpId(forwardedToEmpId);
  const recordId = promotedRecordId ? String(promotedRecordId) : null;
  await conn.query(
    `INSERT INTO \`${TEMP_REVIEW_HISTORY_TABLE}\`
     (temporary_id, chain_id, action, reviewer_empid, forwarded_to_empid, promoted_record_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      normalizedId,
      normalizedChainId,
      action,
      normalizedReviewer,
      normalizedForward ?? null,
      recordId,
      notes ?? null,
    ],
  );
}

function mergeCalculatedValues(cleanedValues, payload) {
  const base = isPlainObject(cleanedValues) ? { ...cleanedValues } : {};
  if (!payload || typeof payload !== 'object') return base;

  const candidates = [
    payload.calculatedValues,
    payload.recalculatedValues,
    payload.values?.calculatedValues,
    payload.values?.recalculatedValues,
  ];

  for (const candidate of candidates) {
    if (!isPlainObject(candidate)) continue;
    Object.entries(candidate).forEach(([key, value]) => {
      if (value === undefined) return;
      base[key] = value;
    });
  }
  return base;
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
  const shouldReleaseConnection = true;
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
    const cleanedWithCalculated = mergeCalculatedValues(cleanedValues, payload);
    const forwardMeta = resolveForwardMeta(payload, normalizedCreator, null);
    let chainId = normalizeTemporaryId(forwardMeta?.rootTemporaryId) || null;
    let chainShouldExist = false;
    if (!chainId && reviewerEmpId) {
      try {
        const reviewerSession = await getEmploymentSession(
          reviewerEmpId,
          companyId,
          {
            ...(insertBranchId !== undefined ? { branchId: insertBranchId } : {}),
            ...(insertDepartmentId !== undefined ? { departmentId: insertDepartmentId } : {}),
          },
        );
        const reviewerSenior =
          normalizeEmpId(reviewerSession?.senior_empid) ||
          normalizeEmpId(reviewerSession?.senior_plan_empid);
        chainShouldExist = Boolean(reviewerSenior);
      } catch (sessionErr) {
        console.error('Failed to resolve reviewer chain status', {
          reviewerEmpId,
          error: sessionErr,
        });
      }
    }
    if (chainId) {
      const [existingChainRows] = await conn.query(
        `SELECT id FROM \`${TEMP_TABLE}\` WHERE id = ? LIMIT 1 FOR UPDATE`,
        [chainId],
      );
      if (!Array.isArray(existingChainRows) || existingChainRows.length === 0) {
        chainId = null;
      }
    }
    if (chainId) {
      const [pendingRows] = await conn.query(
        `SELECT id FROM \`${TEMP_TABLE}\` WHERE chain_id = ? AND status = 'pending' LIMIT 1 FOR UPDATE`,
        [chainId],
      );
      if (Array.isArray(pendingRows) && pendingRows.length > 0) {
        const err = new Error('A pending temporary already exists for this transaction');
        err.status = 409;
        throw err;
      }
    }
    const [result] = await conn.query(
      `INSERT INTO \`${TEMP_TABLE}\`
        (company_id, table_name, form_name, config_name, module_key, payload_json,
         raw_values_json, cleaned_values_json, created_by, plan_senior_empid,
         branch_id, department_id, chain_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId ?? null,
        tableName,
        formName ?? null,
        configName ?? null,
        moduleKey ?? null,
        safeJsonStringify(payload),
        safeJsonStringify(rawValues),
        safeJsonStringify(cleanedWithCalculated),
        normalizedCreator,
        reviewerEmpId,
        insertBranchId,
        insertDepartmentId,
        chainId,
      ],
    );
    const temporaryId = result.insertId;
    if (chainId || chainShouldExist) {
      if (!chainId) {
        chainId = temporaryId;
      }
      await conn.query(`UPDATE \`${TEMP_TABLE}\` SET chain_id = ? WHERE id = ?`, [chainId, temporaryId]);
    }
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
    return { id: temporaryId, reviewerEmpId, planSenior: reviewerEmpId, chainId };
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch {}
    if (isDynamicSqlTriggerError(err)) {
      throw attachDynamicSqlErrorDetails(err, {
        table: row?.table_name || null,
        temporaryId: id,
        reviewerEmpId: normalizedReviewer,
      });
    }
    throw err;
  } finally {
    if (shouldReleaseConnection) {
      conn.release();
    }
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
    chainId: row.chain_id || row.id || null,
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
  status,
  transactionTypeField,
  transactionTypeValue,
}) {
  await ensureTemporaryTable();
  const normalizedEmp = normalizeEmpId(empId);
  const conditions = [];
  const params = [];
  let normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : null;
  if (!normalizedStatus && scope === 'review') {
    normalizedStatus = 'pending';
  }
  if (normalizedStatus && normalizedStatus !== 'all' && normalizedStatus !== 'any') {
    if (normalizedStatus === 'processed') {
      conditions.push("status <> 'pending'");
    } else {
      const statusParts = normalizedStatus
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      if (statusParts.length === 1) {
        conditions.push('status = ?');
        params.push(statusParts[0]);
      } else if (statusParts.length > 1) {
        conditions.push(`status IN (${statusParts.map(() => '?').join(', ')})`);
        params.push(...statusParts);
      }
    }
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
  const chainKey = (alias = '') =>
    `COALESCE(${alias ? `${alias}.` : ''}chain_id, ${alias ? `${alias}.` : ''}id)`;
  const baseSelect = `SELECT * FROM \`${TEMP_TABLE}\` ${where}`;
  const [rows] = await pool.query(
    `SELECT filtered.*
       FROM (${baseSelect}) filtered
       JOIN (
             SELECT ${chainKey('f')} AS chain_key, MAX(f.updated_at) AS max_updated_at
               FROM (${baseSelect}) f
              GROUP BY ${chainKey('f')}
            ) latest
         ON ${chainKey('filtered')} = latest.chain_key
        AND filtered.updated_at = latest.max_updated_at
      ORDER BY filtered.updated_at DESC, filtered.created_at DESC
      LIMIT 200`,
    [...params, ...params],
  );
  const mapped = rows.map(mapTemporaryRow);
  const filtered = filterRowsByTransactionType(
    mapped,
    transactionTypeField,
    transactionTypeValue,
  );
  const grouped = groupTemporaryRowsByChain(filtered);
  return enrichTemporaryMetadata(grouped, companyId);
}

export async function getTemporarySummary(
  empId,
  companyId,
  { tableName = null, transactionTypeField = null, transactionTypeValue = null } = {},
) {
  await ensureTemporaryTable();
  const createdRows = await listTemporarySubmissions({
    scope: 'created',
    tableName,
    empId,
    companyId,
    status: 'any',
    transactionTypeField,
    transactionTypeValue,
  });
  const reviewRows = await listTemporarySubmissions({
    scope: 'review',
    tableName,
    empId,
    companyId,
    status: 'any',
    transactionTypeField,
    transactionTypeValue,
  });
  const createdPending = createdRows.filter((row) => row.status === 'pending').length;
  const reviewPending = reviewRows.filter((row) => row.status === 'pending').length;
  return {
    createdPending,
    reviewPending,
    createdReviewed: createdRows.filter((row) => row.status !== 'pending').length,
    reviewReviewed: reviewRows.filter((row) => row.status !== 'pending').length,
    createdTotal: createdRows.length,
    reviewTotal: reviewRows.length,
    createdLatestUpdate: createdRows[0]?.updatedAt || null,
    reviewLatestUpdate: reviewRows[0]?.updatedAt || null,
    isReviewer: reviewRows.length > 0,
  };
}

function formatChainHistoryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    chainId: row.chainId || row.chain_id || null,
    status: row.status,
    planSeniorEmpId: row.plan_senior_empid || null,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    reviewNotes: row.review_notes || null,
    promotedRecordId: row.promoted_record_id || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function formatReviewHistoryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    temporaryId: row.temporary_id,
    chainId: row.chainId || row.chain_id || row.temporary_id || null,
    action: row.action,
    reviewerEmpId: row.reviewer_empid || null,
    forwardedToEmpId: row.forwarded_to_empid || null,
    promotedRecordId: row.promoted_record_id || null,
    notes: row.notes || null,
    createdAt: row.created_at || null,
  };
}

export async function getTemporaryChainHistory(id) {
  const normalizedId = normalizeTemporaryId(id);
  if (!normalizedId) return [];
  const conn = await pool.getConnection();
  try {
    await ensureTemporaryTable(conn);
    const [rows] = await conn.query(
      `SELECT id, chain_id AS chainId, status, plan_senior_empid, reviewed_by, reviewed_at, review_notes, promoted_record_id, created_by, created_at, updated_at
         FROM \`${TEMP_TABLE}\`
        WHERE id = ?
        LIMIT 1`,
      [normalizedId],
    );
    const row = rows[0];
    if (!row) return [];
    const chainId = normalizeTemporaryId(row.chainId) || normalizeTemporaryId(row.chain_id) || null;
    let chainRows = [];
    if (chainId) {
      const [rowsByChain] = await conn.query(
        `SELECT id, chain_id AS chainId, status, plan_senior_empid, reviewed_by, reviewed_at, review_notes, promoted_record_id, created_by, created_at, updated_at
           FROM \`${TEMP_TABLE}\`
          WHERE chain_id = ?
          ORDER BY created_at ASC, id ASC`,
        [chainId],
      );
      chainRows = Array.isArray(rowsByChain) ? rowsByChain : [];
    }
    if (!Array.isArray(chainRows) || chainRows.length === 0) {
      chainRows = [
        {
          ...row,
          chainId,
        },
      ];
    }
    const formattedChain = chainRows.map((item) => formatChainHistoryRow(item)).filter(Boolean);
    let reviewHistory = [];
    if (chainId) {
      const [historyRows] = await conn.query(
        `SELECT id, temporary_id, chain_id AS chainId, action, reviewer_empid, forwarded_to_empid, promoted_record_id, notes, created_at
           FROM \`${TEMP_REVIEW_HISTORY_TABLE}\`
          WHERE chain_id = ?
          ORDER BY created_at ASC, id ASC`,
        [chainId],
      );
      reviewHistory = Array.isArray(historyRows)
        ? historyRows.map((item) => formatReviewHistoryRow(item)).filter(Boolean)
        : [];
    }
    return { chainId, chain: formattedChain, reviewHistory };
  } finally {
    conn.release();
  }
}

export async function promoteTemporarySubmission(
  id,
  {
    reviewerEmpId,
    notes,
    io,
    cleanedValues: cleanedOverride,
    promoteAsTemporary = false,
  },
  runtimeDeps = {},
) {
  const normalizedReviewer = normalizeEmpId(reviewerEmpId);
  if (!normalizedReviewer) {
    const err = new Error('reviewerEmpId required');
    err.status = 400;
    throw err;
  }
  const {
    connection: providedConnection = null,
    connectionFactory = () => pool.getConnection(),
    columnLister = listTableColumnsDetailed,
    tableInserter = insertTableRow,
    employmentSessionFetcher = getEmploymentSession,
    chainStatusUpdater = updateTemporaryChainStatus,
    formConfigResolver = getFormConfig,
    activityLogger = logUserAction,
    notificationInserter = insertNotification,
  } = runtimeDeps;

  const conn = providedConnection || (await connectionFactory());
  const shouldReleaseConnection = !providedConnection;
  let row = null;
  try {
    await ensureTemporaryTable(conn);
    await conn.query('BEGIN');
    const [rows] = await conn.query(
      `SELECT * FROM \`${TEMP_TABLE}\` WHERE id = ? FOR UPDATE`,
      [id],
    );
    row = rows[0];
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
    const columns = await columnLister(row.table_name);
    const payloadJson = safeJsonParse(row.payload_json, {});
    const chainIdFromRow = normalizeTemporaryId(row.chain_id) || null;
    const forwardMeta = resolveForwardMeta(payloadJson, row.created_by, row.id);
    const updatedForwardMeta = expandForwardMeta(forwardMeta, {
      currentId: row.id,
      createdBy: row.created_by,
    });
    const resolvedChainId =
      chainIdFromRow || normalizeTemporaryId(updatedForwardMeta.rootTemporaryId) || null;
    const effectiveChainId = resolvedChainId || null;
    if (effectiveChainId) {
      updatedForwardMeta.rootTemporaryId = effectiveChainId;
    }
    if (effectiveChainId) {
      const [otherPending] = await conn.query(
        `SELECT id FROM \`${TEMP_TABLE}\` WHERE chain_id = ? AND status = 'pending' AND id <> ? LIMIT 1 FOR UPDATE`,
        [effectiveChainId, id],
      );
      if (Array.isArray(otherPending) && otherPending.length > 0) {
        const err = new Error('A pending temporary already exists for this chain');
        err.status = 409;
        throw err;
      }
    }
    const candidateSources = [];
    const pushCandidate = (source) => {
      if (!source) return;
      const maybePlain = isPlainObject(source)
        ? source
        : extractPromotableValues(source);
      if (!isPlainObject(maybePlain)) return;
      const stripped = stripLabelWrappers(maybePlain);
      if (isPlainObject(stripped)) {
        candidateSources.push(stripped);
      }
    };
    pushCandidate(cleanedOverride);
    pushCandidate(safeJsonParse(row.cleaned_values_json));
    pushCandidate(payloadJson?.cleanedValues);
    pushCandidate(payloadJson?.calculatedValues);
    pushCandidate(payloadJson?.recalculatedValues);
    pushCandidate(payloadJson?.values);
    pushCandidate(payloadJson);
    pushCandidate(safeJsonParse(row.raw_values_json));

    let sanitizedCleaned = { values: {}, warnings: [] };
    for (const source of candidateSources) {
      // sanitizeCleanedValuesForInsert performs its own plain-object guard.
      // eslint-disable-next-line no-await-in-loop
      const next = await sanitizeCleanedValuesForInsert(
        row.table_name,
        source,
        columns,
      );
      const nextValues = next?.values || {};
      if (Object.keys(nextValues).length > 0) {
        sanitizedCleaned = next;
        break;
      }
    }

    let sanitizedValues = { ...(sanitizedCleaned?.values || {}) };
    const sanitationWarnings = Array.isArray(sanitizedCleaned?.warnings)
      ? sanitizedCleaned.warnings
      : [];

    const errorRevokedFields = Array.isArray(payloadJson?.errorRevokedFieldsOnly)
      ? payloadJson.errorRevokedFieldsOnly
          .map((field) => (typeof field === 'string' ? field.trim() : ''))
          .filter(Boolean)
      : [];
    if (errorRevokedFields.length > 0) {
      const revokedLookup = new Set(
        errorRevokedFields.map((field) => field.toLowerCase()),
      );
      sanitizedValues = Object.fromEntries(
        Object.entries(sanitizedValues).filter(
          ([key]) => !revokedLookup.has(String(key || '').toLowerCase()),
        ),
      );
    }

    if (Object.keys(sanitizedValues).length === 0) {
      const err = new Error('Temporary submission is missing promotable values');
      err.status = 422;
      throw err;
    }

    const formName = row.form_name || row.config_name || null;
    let formCfg = null;
    if (formName) {
      try {
        const { config } = await formConfigResolver(
          row.table_name,
          formName,
          row.company_id,
        );
        formCfg = config || null;
      } catch (cfgErr) {
        console.error('Failed to load transaction form config', {
          table: row.table_name,
          formName,
          error: cfgErr,
        });
      }
    }

    const allowedField =
      typeof formCfg?.isAllowedField === 'string'
        ? formCfg.isAllowedField.trim()
        : '';
    if (allowedField) {
      const matchKey = Object.keys(sanitizedValues).find(
        (key) => key && key.trim().toLowerCase() === allowedField.toLowerCase(),
      );
      const allowedValue = matchKey ? sanitizedValues[matchKey] : undefined;
      const isAllowed =
        allowedValue === 1 ||
        allowedValue === true ||
        (typeof allowedValue === 'string' && allowedValue.trim() === '1') ||
        String(allowedValue ?? '').trim() === '1';
      if (!isAllowed) {
        const err = new Error(
          `Transaction not allowed: ${matchKey || allowedField} must equal 1`,
        );
        err.status = 403;
        throw err;
      }
    }

    const fallbackCreator = normalizeEmpId(row.created_by);
    if (fallbackCreator) {
      const hasCreatedByColumn = Array.isArray(columns)
        ? columns.some(
            (col) =>
              col &&
              typeof col.name === 'string' &&
              col.name.trim().toLowerCase() === 'created_by',
          )
        : false;
      if (hasCreatedByColumn) {
        const hasSanitizedCreator = Object.prototype.hasOwnProperty.call(
          sanitizedValues,
          'created_by',
        );
        const sanitizedCreator = hasSanitizedCreator
          ? sanitizedValues.created_by
          : undefined;
        const creatorMissing =
          sanitizedCreator === undefined ||
          sanitizedCreator === null ||
          (typeof sanitizedCreator === 'string' && !sanitizedCreator.trim());
        if (creatorMissing || sanitizedCreator !== fallbackCreator) {
          sanitizedValues.created_by = fallbackCreator;
        }
      }
    }

    const resolvedBranchPref = normalizeScopePreference(row.branch_id);
    const resolvedDepartmentPref = normalizeScopePreference(row.department_id);
    let forwardReviewerEmpId = null;
    if (promoteAsTemporary === true) {
      try {
        const reviewerSession = await employmentSessionFetcher(
          normalizedReviewer,
          row.company_id,
          {
            ...(resolvedBranchPref ? { branchId: resolvedBranchPref } : {}),
            ...(resolvedDepartmentPref
              ? { departmentId: resolvedDepartmentPref }
              : {}),
          },
        );
        forwardReviewerEmpId =
          normalizeEmpId(reviewerSession?.senior_empid) ||
          normalizeEmpId(reviewerSession?.senior_plan_empid);
      } catch (sessionErr) {
        console.error('Failed to resolve reviewer senior for temporary forward', {
          error: sessionErr,
          reviewer: normalizedReviewer,
          company: row.company_id,
        });
      }
    }

    const mutationContext = {
      companyId: row.company_id ?? null,
      changedBy: normalizedReviewer,
    };
    const shouldSkipTriggers =
      payloadJson?.skipTriggerOnPromote === true ||
      errorRevokedFields.length > 0;
    const skipTriggers = shouldSkipTriggers;
    const shouldForwardTemporary =
      promoteAsTemporary === true &&
      forwardReviewerEmpId &&
      forwardReviewerEmpId !== normalizedReviewer;
    const trimmedNotes =
      typeof notes === 'string' && notes.trim() ? notes.trim() : '';
    const baseReviewNotes = trimmedNotes ? trimmedNotes : null;
    let reviewNotesValue = baseReviewNotes;
    if (sanitationWarnings.length > 0) {
      const warningSummary = sanitationWarnings
        .map((warn) => {
          if (!warn || !warn.column) return null;
          if (
            warn.type === 'maxLength' &&
            warn.maxLength != null &&
            warn.actualLength != null
          ) {
            return `${warn.column} (trimmed from ${warn.actualLength} to ${warn.maxLength})`;
          }
          return warn.column;
        })
        .filter(Boolean)
        .join(', ');
      if (warningSummary) {
        const autoNote = `Auto-adjusted fields: ${warningSummary}`;
        reviewNotesValue = reviewNotesValue
          ? `${reviewNotesValue}\n\n${autoNote}`
          : autoNote;
      }
    }
    let skipSessionEnabled = false;
    let insertedId = null;
    if (!shouldForwardTemporary) {
      try {
        if (skipTriggers) {
          await conn.query('SET @skip_triggers = 1;');
          skipSessionEnabled = true;
        }
        try {
          const inserted = await tableInserter(
            row.table_name,
            sanitizedValues,
            undefined,
            undefined,
            false,
            normalizedReviewer,
            { conn, mutationContext },
          );
          insertedId = inserted?.id ?? null;
        } catch (err) {
          if (!isDynamicSqlTriggerError(err)) {
            throw err;
          }
          console.warn('Dynamic SQL trigger error during promotion, applying fallback insert', {
            table: row.table_name,
            id,
            error: err,
          });
          let recordForInsert = sanitizedValues;
          if (!skipSessionEnabled) {
            await conn.query('SET @skip_triggers = 1;');
            skipSessionEnabled = true;
          }
          try {
            const inserted = await tableInserter(
              row.table_name,
              recordForInsert,
              undefined,
              undefined,
              false,
              normalizedReviewer,
              { conn, mutationContext },
            );
            insertedId = inserted?.id ?? null;
          } catch (skipErr) {
            if (!isDynamicSqlTriggerError(skipErr)) {
              throw skipErr;
            }
            console.warn(
              'Dynamic SQL trigger error persisted after skip trigger session flag, falling back to direct insert',
              {
                table: row.table_name,
                id,
                error: skipErr,
              },
            );
          }
          if (insertedId === null) {
            const keys = Object.keys(recordForInsert);
            if (keys.length === 0) {
              throw err;
            }
            const columnsSql = keys.map((k) => `\`${k}\``).join(', ');
            const placeholders = keys.map(() => '?').join(', ');
            const params = keys.map((k) => recordForInsert[k]);
            const [fallbackResult] = await conn.query(
              `INSERT INTO \`${row.table_name}\` (${columnsSql}) VALUES (${placeholders})`,
              params,
            );
            insertedId = fallbackResult?.insertId ?? null;
          }
        }
      } finally {
        if (skipSessionEnabled) {
          try {
            await conn.query('SET @skip_triggers = NULL;');
          } catch (cleanupErr) {
            console.error('Failed to reset skip triggers session variable', cleanupErr);
          }
        }
      }
    }
    const promotedId = insertedId ? String(insertedId) : null;
    if (shouldForwardTemporary) {
      await chainStatusUpdater(conn, effectiveChainId, {
        status: 'promoted',
        reviewerEmpId: normalizedReviewer,
        notes: reviewNotesValue ?? null,
        clearReviewerAssignment: true,
        promotedRecordId: null,
        pendingOnly: false,
        temporaryId: id,
      });
      const mergedPayload = isPlainObject(payloadJson) ? { ...payloadJson } : {};
      const sanitizedPayloadValues = isPlainObject(mergedPayload.cleanedValues)
        ? { ...mergedPayload.cleanedValues }
        : {};
      Object.entries(sanitizedValues).forEach(([key, value]) => {
        sanitizedPayloadValues[key] = value;
      });
      mergedPayload.cleanedValues = sanitizedPayloadValues;
      mergedPayload.forwardMeta = {
        ...updatedForwardMeta,
        chainId: effectiveChainId,
      };
      const [forwardResult] = await conn.query(
        `INSERT INTO \`${TEMP_TABLE}\`
        (company_id, table_name, form_name, config_name, module_key, payload_json,
         raw_values_json, cleaned_values_json, created_by, plan_senior_empid,
         branch_id, department_id, chain_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.company_id ?? null,
        row.table_name,
        row.form_name ?? null,
        row.config_name ?? null,
        row.module_key ?? null,
        safeJsonStringify(mergedPayload),
        row.raw_values_json ?? null,
        safeJsonStringify(sanitizedPayloadValues),
        normalizedReviewer,
        forwardReviewerEmpId,
        row.branch_id ?? null,
        row.department_id ?? null,
        effectiveChainId,
      ],
    );
      const forwardTemporaryId = forwardResult?.insertId || null;
      console.info('Temporary forward chain update', {
        id,
        forwardMeta,
        updatedForwardMeta,
        effectiveChainId,
      });
      await recordTemporaryReviewHistory(conn, {
        temporaryId: id,
        action: 'forwarded',
        reviewerEmpId: normalizedReviewer,
        forwardedToEmpId: forwardReviewerEmpId,
        notes: reviewNotesValue ?? null,
        chainId: effectiveChainId,
      });
      await activityLogger(
        {
          emp_id: normalizedReviewer,
          table_name: row.table_name,
          record_id: id,
          action: 'approve',
          details: {
            formName: row.form_name ?? null,
            temporaryAction: 'forward',
            forwardedTo: forwardReviewerEmpId,
            nextTemporaryId: forwardTemporaryId,
          },
          company_id: row.company_id ?? null,
        },
        conn,
      );
      await notificationInserter(conn, {
        companyId: row.company_id,
        recipientEmpId: forwardReviewerEmpId,
        createdBy: normalizedReviewer,
        relatedId: forwardTemporaryId ?? id,
        message: `Temporary submission pending review for ${row.table_name}`,
        type: 'request',
      });
      const originRecipient = updatedForwardMeta.originCreator || row.created_by;
      if (originRecipient) {
        await notificationInserter(conn, {
          companyId: row.company_id,
          recipientEmpId: originRecipient,
          createdBy: normalizedReviewer,
          relatedId: id,
          message: `Temporary submission #${id} forwarded for additional review`,
          type: 'response',
        });
      }
      await conn.query('COMMIT');
      if (io) {
        const reviewPayload = {
          id,
          status: 'promoted',
          warnings: sanitationWarnings,
          forwardedTo: forwardReviewerEmpId,
          forwardedTemporaryId: forwardTemporaryId,
        };
        if (originRecipient) {
          io.to(`user:${originRecipient}`).emit('temporaryReviewed', reviewPayload);
        }
        io.to(`user:${row.created_by}`).emit('temporaryReviewed', reviewPayload);
        io.to(`user:${normalizedReviewer}`).emit('temporaryReviewed', reviewPayload);
        io.to(`user:${forwardReviewerEmpId}`).emit('temporaryReviewed', {
          id: forwardTemporaryId ?? id,
          status: 'pending',
          warnings: sanitationWarnings,
          forwardedFrom: id,
        });
      }
      return {
        id,
        forwardedTo: forwardReviewerEmpId,
        forwardedTemporaryId: forwardTemporaryId,
        warnings: sanitationWarnings,
      };
    }

    if (formName && formCfg) {
      try {
        if (formCfg.posApiEnabled) {
          const mapping = formCfg.posApiMapping || {};
          const endpoint = await resolvePosApiEndpoint(formCfg.posApiEndpointId);
          let masterRecord = { ...sanitizedValues };
          if (insertedId) {
            try {
              const [masterRows] = await conn.query(
                `SELECT * FROM \`${row.table_name}\` WHERE id = ? LIMIT 1`,
                [insertedId],
              );
              if (Array.isArray(masterRows) && masterRows[0]) {
                masterRecord = masterRows[0];
              }
            } catch (selectErr) {
              console.error(
                'Failed to load persisted transaction for POSAPI submission',
                {
                  table: row.table_name,
                  id: insertedId,
                  error: selectErr,
                },
              );
            }
          }
          const merchantId = masterRecord?.merchant_id ?? masterRecord?.merchantId ?? null;
          const merchantInfo = merchantId ? await getMerchantById(merchantId) : null;
          if (!merchantInfo) {
            throw new Error('Merchant information is required for POSAPI submissions');
          }
          const receiptType =
            formCfg.posApiType || process.env.POSAPI_RECEIPT_TYPE || '';
          const payload = await buildReceiptFromDynamicTransaction(
            masterRecord,
            mapping,
            receiptType,
            { typeField: formCfg.posApiTypeField, merchantInfo },
          );
          if (payload) {
            try {
              const invoiceId = insertedId
                ? await saveEbarimtInvoiceSnapshot({
                    masterTable: row.table_name,
                    masterId: insertedId,
                    record: masterRecord,
                    payload,
                    merchantInfo,
                  })
                : null;
              const posApiResponse = await sendReceipt(payload, { endpoint });
              if (posApiResponse && insertedId) {
                const columnNames = Array.isArray(columns)
                  ? columns
                      .map((col) => (col && typeof col.name === 'string' ? col.name : null))
                      .filter(Boolean)
                  : [];
                const lookup = createColumnLookup(columnNames);
                const updates = computePosApiUpdates(lookup, posApiResponse, {
                  fieldsFromPosApi: formCfg.fieldsFromPosApi,
                });
                const entries = Object.entries(updates || {});
                if (entries.length > 0) {
                  const setClause = entries
                    .map(([col]) => `\`${col}\` = ?`)
                    .join(', ');
                  const params = entries.map(([, value]) => value);
                  params.push(insertedId);
                  try {
                    await conn.query(
                      `UPDATE \`${row.table_name}\` SET ${setClause} WHERE id = ?`,
                      params,
                    );
                  } catch (updateErr) {
                    console.error('Failed to persist POSAPI response details', {
                      table: row.table_name,
                      id: insertedId,
                      error: updateErr,
                    });
                  }
                }
                if (invoiceId) {
                  await persistEbarimtInvoiceResponse(invoiceId, posApiResponse, {
                    fieldsFromPosApi: formCfg.fieldsFromPosApi,
                  });
                }
              }
            } catch (posErr) {
              console.error('POSAPI receipt submission failed', {
                table: row.table_name,
                recordId: insertedId,
                error: posErr,
              });
            }
          }
        }
      } catch (cfgErr) {
        console.error('Failed to evaluate POSAPI configuration', {
          table: row.table_name,
          formName,
          error: cfgErr,
        });
      }
    }
    console.info('Temporary promotion chain update', {
      id,
      forwardMeta,
      updatedForwardMeta,
      chainId: effectiveChainId,
    });
    await chainStatusUpdater(conn, effectiveChainId, {
      status: 'promoted',
      reviewerEmpId: normalizedReviewer,
      notes: reviewNotesValue ?? null,
      promotedRecordId: promotedId,
      clearReviewerAssignment: true,
      pendingOnly: false,
      temporaryId: id,
    });
    await recordTemporaryReviewHistory(conn, {
      temporaryId: id,
      action: 'promoted',
      reviewerEmpId: normalizedReviewer,
      promotedRecordId: promotedId,
      notes: reviewNotesValue ?? null,
      chainId: effectiveChainId,
    });
    await activityLogger(
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
    const originRecipient = updatedForwardMeta.originCreator;
    await notificationInserter(conn, {
      companyId: row.company_id,
      recipientEmpId: row.created_by,
      createdBy: normalizedReviewer,
      relatedId: id,
      message: `Temporary submission for ${row.table_name} approved`,
      type: 'response',
    });
    if (originRecipient && originRecipient !== row.created_by) {
      await notificationInserter(conn, {
        companyId: row.company_id,
        recipientEmpId: originRecipient,
        createdBy: normalizedReviewer,
        relatedId: id,
        message: `Temporary submission for ${row.table_name} approved`,
        type: 'response',
      });
    }
    await notificationInserter(conn, {
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
        warnings: sanitationWarnings,
      });
      if (originRecipient && originRecipient !== row.created_by) {
        io.to(`user:${originRecipient}`).emit('temporaryReviewed', {
          id,
          status: 'promoted',
          promotedRecordId: promotedId,
          warnings: sanitationWarnings,
        });
      }
      io.to(`user:${normalizedReviewer}`).emit('temporaryReviewed', {
        id,
        status: 'promoted',
        promotedRecordId: promotedId,
        warnings: sanitationWarnings,
      });
    }
    return { id, promotedRecordId: promotedId, warnings: sanitationWarnings };
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch {}
    if (isDynamicSqlTriggerError(err)) {
      throw attachDynamicSqlErrorDetails(err, {
        table: row?.table_name || null,
        temporaryId: id,
        reviewerEmpId: normalizedReviewer,
      });
    }
    throw err;
  } finally {
    conn.release();
  }
}

export async function rejectTemporarySubmission(
  id,
  { reviewerEmpId, notes, io },
  runtimeDeps = {},
) {
  const normalizedReviewer = normalizeEmpId(reviewerEmpId);
  if (!normalizedReviewer) {
    const err = new Error('reviewerEmpId required');
    err.status = 400;
    throw err;
  }
  const {
    connection: providedConnection = null,
    connectionFactory = () => pool.getConnection(),
    chainStatusUpdater = updateTemporaryChainStatus,
    activityLogger = logUserAction,
    notificationInserter = insertNotification,
  } = runtimeDeps;

  const conn = providedConnection || (await connectionFactory());
  const shouldReleaseConnection = !providedConnection;
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
    const payloadJson = safeJsonParse(row.payload_json, {});
    const forwardMeta = resolveForwardMeta(payloadJson, row.created_by, row.id);
    const updatedForwardMeta = expandForwardMeta(forwardMeta, {
      currentId: row.id,
      createdBy: row.created_by,
    });
    const chainIdFromRow = normalizeTemporaryId(row.chain_id) || null;
    const resolvedChainId =
      chainIdFromRow || normalizeTemporaryId(updatedForwardMeta.rootTemporaryId) || null;
    const effectiveChainId = resolvedChainId || null;
    if (effectiveChainId) {
      updatedForwardMeta.rootTemporaryId = effectiveChainId;
    }
    console.info('Temporary rejection chain update', {
      id,
      forwardMeta,
      updatedForwardMeta,
      chainId: effectiveChainId,
    });
    await chainStatusUpdater(conn, effectiveChainId, {
      status: 'rejected',
      reviewerEmpId: normalizedReviewer,
      notes: notes ?? null,
      promotedRecordId: null,
      clearReviewerAssignment: true,
      pendingOnly: false,
      temporaryId: id,
    });
    await recordTemporaryReviewHistory(conn, {
      temporaryId: id,
      action: 'rejected',
      reviewerEmpId: normalizedReviewer,
      notes: notes ?? null,
      chainId: effectiveChainId,
    });
    await activityLogger(
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
    await notificationInserter(conn, {
      companyId: row.company_id,
      recipientEmpId: row.created_by,
      createdBy: normalizedReviewer,
      relatedId: id,
      message: `Temporary submission for ${row.table_name} rejected`,
      type: 'response',
    });
    const originRecipient = updatedForwardMeta.originCreator;
    if (originRecipient && originRecipient !== row.created_by) {
      await notificationInserter(conn, {
        companyId: row.company_id,
        recipientEmpId: originRecipient,
        createdBy: normalizedReviewer,
        relatedId: id,
        message: `Temporary submission for ${row.table_name} rejected`,
        type: 'response',
      });
    }
    await notificationInserter(conn, {
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
      if (originRecipient && originRecipient !== row.created_by) {
        io.to(`user:${originRecipient}`).emit('temporaryReviewed', {
          id,
          status: 'rejected',
        });
      }
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
    if (shouldReleaseConnection) {
      conn.release();
    }
  }
}

export async function deleteTemporarySubmission(id, { requesterEmpId }) {
  const normalizedRequester = normalizeEmpId(requesterEmpId);
  if (!normalizedRequester) {
    const err = new Error('requesterEmpId required');
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
    const normalizedCreator = normalizeEmpId(row.created_by);
    if (normalizedCreator !== normalizedRequester) {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
    if (row.status !== 'rejected') {
      const err = new Error('Only rejected temporary submissions can be removed');
      err.status = 409;
      throw err;
    }
    await conn.query(`DELETE FROM \`${TEMP_TABLE}\` WHERE id = ?`, [id]);
    await logUserAction(
      {
        emp_id: normalizedRequester,
        table_name: row.table_name,
        record_id: id,
        action: 'delete',
        details: { formName: row.form_name ?? null, temporaryAction: 'delete' },
        company_id: row.company_id ?? null,
      },
      conn,
    );
    await conn.query('COMMIT');
    return { id, deleted: true };
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

