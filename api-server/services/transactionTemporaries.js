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
  collectEndpointResponseMappings,
} from './posApiPersistence.js';
import { logUserAction } from './userActivityLog.js';
import { notifyUser } from './notificationService.js';
import {
  saveEbarimtInvoiceSnapshot,
  persistEbarimtInvoiceResponse,
} from './ebarimtInvoiceStore.js';
import { getMerchantById } from './merchantService.js';
import { renameImages, resolveImageNaming } from './transactionImageService.js';
import formatTimestamp from '../../src/erp.mgt.mn/utils/formatTimestamp.js';
import { sanitizeRowForTable } from '../utils/schemaSanitizer.js';

const TEMP_TABLE = 'transaction_temporaries';
const TEMP_REVIEW_HISTORY_TABLE = 'transaction_temporary_review_history';
let ensurePromise = null;
const DEFAULT_TEMPORARY_LIMIT = 50;
const MAX_TEMPORARY_LIMIT = 100;

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
const NUMERIC_COLUMN_PATTERN =
  /(int|decimal|float|double|bit|year|bigint|smallint|mediumint|tinyint)/i;

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

function parseEmpIdList(value) {
  if (value === undefined || value === null) return [];
  const rawList = [];
  if (Array.isArray(value)) {
    rawList.push(...value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        rawList.push(...parsed);
      } else {
        rawList.push(trimmed);
      }
    } catch {
      rawList.push(trimmed);
    }
  } else {
    rawList.push(value);
  }
  const normalized = rawList
    .map((item) => normalizeEmpId(item))
    .filter((item) => Boolean(item));
  return Array.from(new Set(normalized));
}

function serializeEmpIdList(empIds = []) {
  if (!Array.isArray(empIds)) return serializeEmpIdList(parseEmpIdList(empIds));
  const normalized = empIds.map((id) => normalizeEmpId(id)).filter(Boolean);
  if (normalized.length === 0) return null;
  if (normalized.length === 1) return normalized[0];
  return safeJsonStringify(normalized);
}

function empIdListIncludes(empIds, target) {
  const normalizedTarget = normalizeEmpId(target);
  if (!normalizedTarget) return false;
  const list = parseEmpIdList(empIds);
  return list.some((id) => id === normalizedTarget);
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

function parseEnumOptions(type) {
  if (!type) return [];
  const match = String(type).match(/^(enum|set)\((.*)\)$/i);
  if (!match) return [];
  const options = [];
  const raw = match[2] || '';
  const re = /'((?:\\'|[^'])*)'/g;
  let found = null;
  while ((found = re.exec(raw))) {
    options.push(found[1].replace(/\\'/g, "'"));
  }
  return options;
}

function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
  );
}

function mergePlainObjectSources(...sources) {
  const merged = {};
  sources.forEach((source) => {
    if (isPlainObject(source)) {
      Object.entries(source).forEach(([key, value]) => {
        merged[key] = value;
      });
    }
  });
  return merged;
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

export async function updateTemporaryChainStatus(
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
    temporaryOnly = false,
    applyToChain = false,
  },
) {
  const normalizedChain = normalizeTemporaryId(chainId);
  const normalizedTemporaryId = normalizeTemporaryId(temporaryId);
  if (!conn || (!normalizedChain && !normalizedTemporaryId)) return;
  let targetChainId = normalizedChain;
  const shouldTargetTemporary = !applyToChain && (temporaryOnly || normalizedTemporaryId);
  if (!targetChainId && !shouldTargetTemporary && normalizedTemporaryId) {
    const [chainRows] = await conn.query(
      `SELECT chain_id FROM \`${TEMP_TABLE}\` WHERE id = ? LIMIT 1`,
      [normalizedTemporaryId],
    );
    const resolvedChain = normalizeTemporaryId(chainRows?.[0]?.chain_id);
    if (resolvedChain) {
      targetChainId = resolvedChain;
    }
  }
  const columns = ['status = ?', 'reviewed_by = ?', 'reviewed_at = NOW()', 'review_notes = ?'];
  const params = [status ?? null, reviewerEmpId ?? null, notes ?? null];
  if (promotedRecordId !== undefined) {
    columns.push('promoted_record_id = ?');
    params.push(promotedRecordId);
  }
  if (clearReviewerAssignment || (status && status !== 'pending')) {
    columns.push('plan_senior_empid = NULL');
  }
  const shouldTargetTemporaryOnly = shouldTargetTemporary && normalizedTemporaryId;
  const whereClause = shouldTargetTemporaryOnly
    ? pendingOnly
      ? 'id = ? AND status = "pending"'
      : 'id = ?'
    : pendingOnly
    ? 'chain_id = ? AND status = "pending"'
    : 'chain_id = ?';
  params.push(shouldTargetTemporaryOnly ? normalizedTemporaryId : targetChainId);
  const [result] = await conn.query(
    `UPDATE \`${TEMP_TABLE}\` SET ${columns.join(', ')} WHERE ${whereClause}`,
    params,
  );
  const updateResult = Array.isArray(result) ? result[0] : result;
  const affected = updateResult?.affectedRows ?? 0;
  const normalized = Number.isFinite(Number(affected)) ? Number(affected) : 0;
  return normalized;
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
    let normalizedValue = stripLabelWrappers(rawValue);
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
      if (type && NUMERIC_COLUMN_PATTERN.test(type)) {
        if (normalizedValue === '') {
          warnings.push({ column: columnInfo.name, type: 'emptyNumeric' });
          continue;
        }
        const numericValue = Number(normalizedValue);
        if (!Number.isFinite(numericValue)) {
          warnings.push({ column: columnInfo.name, type: 'invalidNumeric' });
          continue;
        }
        normalizedValue = numericValue;
      }
      const enumOptions = type ? parseEnumOptions(type) : [];
      if (enumOptions.length > 0) {
        if (!enumOptions.includes(normalizedValue)) {
          warnings.push({
            column: columnInfo.name,
            type: 'invalidEnum',
          });
          continue;
        }
      }
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

async function sanitizePayloadForTable(value, tableName, db) {
  if (Array.isArray(value)) {
    const sanitizedRows = [];
    for (const row of value) {
      if (isPlainObject(row)) {
        // eslint-disable-next-line no-await-in-loop
        sanitizedRows.push(await sanitizeRowForTable(row, tableName, db));
      } else {
        sanitizedRows.push(row);
      }
    }
    return sanitizedRows;
  }
  if (isPlainObject(value)) {
    return sanitizeRowForTable(value, tableName, db);
  }
  return value;
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
        last_promoter_empid VARCHAR(64) DEFAULT NULL,
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
        KEY idx_temp_last_promoter (last_promoter_empid),
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
      if (!columnLookup.has('last_promoter_empid')) {
        await conn.query(
          `ALTER TABLE \`${TEMP_TABLE}\`
             ADD COLUMN last_promoter_empid VARCHAR(64) DEFAULT NULL AFTER plan_senior_empid`,
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
      const [existingIndexes] = await conn.query(
        `SELECT INDEX_NAME
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?`,
        [TEMP_TABLE],
      );
      const indexLookup = new Set(
        Array.isArray(existingIndexes)
          ? existingIndexes
              .map((row) => row?.INDEX_NAME?.toLowerCase?.())
              .filter(Boolean)
          : [],
      );
      const ensureIndex = async (name, definition) => {
        if (!indexLookup.has(name.toLowerCase())) {
          await conn.query(`ALTER TABLE \`${TEMP_TABLE}\` ADD ${definition}`);
        }
      };
      await ensureIndex('idx_temp_company', 'KEY idx_temp_company (company_id)');
      await ensureIndex('idx_temp_status', 'KEY idx_temp_status (status)');
      await ensureIndex('idx_temp_table', 'KEY idx_temp_table (table_name)');
      await ensureIndex(
        'idx_temp_plan_senior',
        'KEY idx_temp_plan_senior (plan_senior_empid)',
      );
      await ensureIndex(
        'idx_temp_last_promoter',
        'KEY idx_temp_last_promoter (last_promoter_empid)',
      );
      await ensureIndex('idx_temp_creator', 'KEY idx_temp_creator (created_by)');
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

    try {
      const [historyColumns] = await conn.query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?`,
        [TEMP_REVIEW_HISTORY_TABLE],
      );
      const historyColumnLookup = new Set(
        Array.isArray(historyColumns)
          ? historyColumns
              .map((row) =>
                row && typeof row.COLUMN_NAME === 'string'
                  ? row.COLUMN_NAME.toLowerCase()
                  : null,
              )
              .filter(Boolean)
          : [],
      );
      if (!historyColumnLookup.has('chain_id')) {
        await conn.query(
          `ALTER TABLE \`${TEMP_REVIEW_HISTORY_TABLE}\`
             ADD COLUMN chain_id BIGINT UNSIGNED DEFAULT NULL AFTER temporary_id`,
        );
        await conn.query(
          `UPDATE \`${TEMP_REVIEW_HISTORY_TABLE}\`
              SET chain_id = temporary_id
            WHERE chain_id IS NULL`,
        );
      }

      const [historyIndexes] = await conn.query(
        `SELECT INDEX_NAME
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?`,
        [TEMP_REVIEW_HISTORY_TABLE],
      );
      const historyIndexLookup = new Set(
        Array.isArray(historyIndexes)
          ? historyIndexes
              .map((row) =>
                row && typeof row.INDEX_NAME === 'string'
                  ? row.INDEX_NAME.toLowerCase()
                  : null,
              )
              .filter(Boolean)
          : [],
      );
      const ensureHistoryIndex = async (name, definition) => {
        if (!historyIndexLookup.has(name.toLowerCase())) {
          await conn.query(
            `ALTER TABLE \`${TEMP_REVIEW_HISTORY_TABLE}\` ADD ${definition}`,
          );
        }
      };
      await ensureHistoryIndex('idx_temp_history_temp', 'KEY idx_temp_history_temp (temporary_id)');
      await ensureHistoryIndex('idx_temp_history_chain', 'KEY idx_temp_history_chain (chain_id)');
      await ensureHistoryIndex('idx_temp_history_action', 'KEY idx_temp_history_action (action)');
    } catch (historyErr) {
      console.error('Failed to ensure temporary review history metadata', historyErr);
    }
  })()
    .catch((err) => {
      ensurePromise = null;
      throw err;
    });
  return ensurePromise;
}

async function insertNotification(
  conn,
  {
    companyId,
    recipientEmpId,
    recipientEmpIds,
    message,
    createdBy,
    relatedId,
    type = 'request',
    kind = 'temporary',
  },
) {
  const recipients = recipientEmpIds ?? recipientEmpId;
  const normalizedRecipients = parseEmpIdList(recipients);
  if (normalizedRecipients.length === 0) return;
  for (const recipient of normalizedRecipients) {
    // eslint-disable-next-line no-await-in-loop
    await notifyUser({
      companyId,
      recipientEmpId: recipient,
      type,
      kind,
      relatedId,
      message,
      createdBy,
      connection: conn,
    });
  }
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
  const [result] = await conn.query(
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
  return result?.affectedRows ?? 0;
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
  chainId = null,
  companyId,
  branchId,
  departmentId,
  createdBy,
  tenant = {},
}, runtimeDeps = {}) {
  const {
    connection: providedConnection = null,
    connectionFactory = () => pool.getConnection(),
    employmentSessionFetcher = getEmploymentSession,
    notificationInserter = insertNotification,
  } = runtimeDeps;
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
  const normalizedChainId = normalizeTemporaryId(chainId);

  const conn = providedConnection || (await connectionFactory());
  const shouldReleaseConnection = !providedConnection;
  try {
    await ensureTemporaryTable(conn);
    await conn.query('BEGIN');
    const session = await employmentSessionFetcher(normalizedCreator, companyId, {
      ...(branchPrefSpecified ? { branchId: normalizedBranchPref } : {}),
      ...(departmentPrefSpecified
        ? { departmentId: normalizedDepartmentPref }
        : {}),
    });
    const reviewerEmpIds = parseEmpIdList(session?.senior_empid ?? session?.seniorEmpId);
    const fallbackBranch = normalizeScopePreference(branchId);
    const fallbackDepartment = normalizeScopePreference(departmentId);
    const insertBranchId = branchPrefSpecified
      ? normalizedBranchPref ?? null
      : fallbackBranch ?? null;
    const insertDepartmentId = departmentPrefSpecified
      ? normalizedDepartmentPref ?? null
      : fallbackDepartment ?? null;
    const cleanedWithCalculated = mergeCalculatedValues(cleanedValues, payload);
    const cleanedValuesForStorage = await sanitizePayloadForTable(
      cleanedWithCalculated,
      tableName,
      conn,
    );
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
        safeJsonStringify(cleanedValuesForStorage),
        normalizedCreator,
        serializeEmpIdList(reviewerEmpIds),
        insertBranchId,
        insertDepartmentId,
        normalizedChainId,
      ],
    );
    const temporaryId = result.insertId;
    const persistedChainId = normalizedChainId ?? temporaryId;
    if (!normalizedChainId) {
      await conn.query(`UPDATE \`${TEMP_TABLE}\` SET chain_id = ? WHERE id = ?`, [temporaryId, temporaryId]);
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
    const reviewerCount = reviewerEmpIds.length;
    if (reviewerCount > 0) {
      await notificationInserter(conn, {
        companyId,
        recipientEmpIds: reviewerEmpIds,
        createdBy: normalizedCreator,
        relatedId: temporaryId,
        message: `Temporary submission pending review for ${tableName}${
          reviewerCount > 1 ? ` (shared with ${reviewerCount} senior reviewers)` : ''
        }`,
        type: 'request',
      });
    }
    await conn.query('COMMIT');
    return {
      id: temporaryId,
      reviewerEmpIds,
      reviewerEmpId: reviewerEmpIds?.[0] || null,
      planSenior: reviewerEmpIds?.[0] || null,
      chainId: persistedChainId,
    };
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

function mapTemporaryRow(row) {
  if (!row) return null;
  const payload = safeJsonParse(row.payload_json, {});
  const cleanedContainer = safeJsonParse(row.cleaned_values_json, {});
  const rawContainer = safeJsonParse(row.raw_values_json, {});
  const parsedPlanSeniorEmpIds = parseEmpIdList(row.plan_senior_empid);
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
    chainId: row.chainId || row.chain_id || null,
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
    planSeniorEmpIds: parsedPlanSeniorEmpIds,
    planSeniorEmpId: parsedPlanSeniorEmpIds[0] || null,
    reviewerEmpIds: parsedPlanSeniorEmpIds,
    reviewerEmpId: parsedPlanSeniorEmpIds[0] || null,
    lastPromoterEmpId: row.last_promoter_empid || null,
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
  formName,
  configName,
  empId,
  companyId,
  status,
  transactionTypeField,
  transactionTypeValue,
  limit = DEFAULT_TEMPORARY_LIMIT,
  offset = 0,
  includeHasMore = false,
}) {
  await ensureTemporaryTable();
  const normalizedEmp = normalizeEmpId(empId);
  const conditions = [];
  const params = [];
  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : null;
  const enforcePendingScope = scope === 'review';
  if (enforcePendingScope) {
    conditions.push("status = 'pending'");
  } else if (normalizedStatus && normalizedStatus !== 'all' && normalizedStatus !== 'any') {
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
  if (tableName) {
    conditions.push('table_name = ?');
    params.push(tableName);
  }
  const normalizedFormName =
    formName !== undefined && formName !== null ? String(formName).trim() : '';
  const normalizedConfigName =
    configName !== undefined && configName !== null ? String(configName).trim() : '';
  const nameFilters = [];
  if (normalizedFormName) {
    nameFilters.push(normalizedFormName);
  }
  if (normalizedConfigName && normalizedConfigName !== normalizedFormName) {
    nameFilters.push(normalizedConfigName);
  }
  if (nameFilters.length > 0) {
    const placeholders = nameFilters.map(() => '?').join(', ');
    conditions.push(`(form_name IN (${placeholders}) OR config_name IN (${placeholders}))`);
    params.push(...nameFilters, ...nameFilters);
  }
  if (scope === 'review') {
    conditions.push(
      '((JSON_VALID(plan_senior_empid) AND JSON_CONTAINS(plan_senior_empid, ?, \"$\")) OR plan_senior_empid = ?)',
    );
    params.push(`"${normalizedEmp}"`, normalizedEmp);
  } else {
    conditions.push('created_by = ?');
    params.push(normalizedEmp);
  }
  if (companyId !== undefined && companyId !== null && String(companyId).trim() !== '') {
    conditions.push('company_id = ?');
    params.push(Number(companyId));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const chainGroupKey = (alias = '') =>
    `COALESCE(${alias ? `${alias}.` : ''}chain_id, ${alias ? `${alias}.` : ''}id)`;
  const filteredQuery = `SELECT * FROM \`${TEMP_TABLE}\` ${where}`;
  const requestedLimit = Number(limit);
  const normalizedLimit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_TEMPORARY_LIMIT)
      : DEFAULT_TEMPORARY_LIMIT;
  const requestedOffset = Number(offset);
  const normalizedOffset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
  const effectiveLimit = includeHasMore ? normalizedLimit + 1 : normalizedLimit;
  const groupingQuery = `
    WITH filtered AS (${filteredQuery}),
    ranked AS (
      SELECT
        filtered.*,
        ROW_NUMBER() OVER (
          PARTITION BY ${chainGroupKey('filtered')}
          ORDER BY filtered.updated_at DESC, filtered.created_at DESC, filtered.id DESC
        ) AS chain_rank
      FROM filtered
    )
    SELECT *
      FROM ranked
     WHERE chain_rank = 1
     ORDER BY updated_at DESC, created_at DESC, id DESC
     LIMIT ? OFFSET ?`;
  const [rows] = await pool.query(groupingQuery, [...params, effectiveLimit, normalizedOffset]);
  const hasMore = includeHasMore ? rows.length > normalizedLimit : false;
  const limitedRows = includeHasMore ? rows.slice(0, normalizedLimit) : rows;
  const mapped = limitedRows.map(mapTemporaryRow);
  const filtered = filterRowsByTransactionType(
    mapped,
    transactionTypeField,
    transactionTypeValue,
  );
  const grouped = groupTemporaryRowsByChain(filtered);
  const enriched = await enrichTemporaryMetadata(grouped, companyId);
  return {
    rows: enriched,
    hasMore,
    nextOffset: hasMore ? normalizedOffset + normalizedLimit : null,
  };
}

function formatTemporaryStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'promoted') return 'Promoted';
  if (normalized === 'rejected') return 'Rejected';
  return 'Pending';
}

function deriveTemporaryTransactionType(row) {
  if (!row) return 'Other transaction';
  const fallback =
    row.formLabel ||
    row.formName ||
    row.configName ||
    row.moduleLabel ||
    row.moduleKey ||
    row.tableName ||
    'Other transaction';
  return String(fallback || '').trim() || 'Other transaction';
}

function groupTemporaryRows(entries = []) {
  const buckets = [];
  const lookup = new Map();
  entries.forEach((entry) => {
    if (!entry) return;
    const user = entry.createdBy || '';
    const transactionType = deriveTemporaryTransactionType(entry);
    const status = entry.status || 'pending';
    const dateValue = entry.updatedAt || entry.createdAt || entry.reviewedAt || null;
    const dateObj = dateValue ? new Date(dateValue) : null;
    const dateKey = dateObj && !Number.isNaN(dateObj.getTime())
      ? dateObj.toISOString().slice(0, 10)
      : 'unknown';
    const dateLabel = dateObj && !Number.isNaN(dateObj.getTime())
      ? formatTimestamp(dateObj)
      : 'Unknown date';
    const key = `${user || 'unknown'}|${transactionType || 'unknown'}|${dateKey}|${status}`;
    let bucket = lookup.get(key);
    if (!bucket) {
      bucket = {
        key,
        user,
        transactionType,
        dateKey,
        dateLabel,
        status,
        statusLabel: formatTemporaryStatusLabel(status),
        statusColor: status === 'rejected' ? '#dc2626' : '#2563eb',
        entries: [],
        count: 0,
        latest: dateObj ? dateObj.getTime() : 0,
        sampleEntry: null,
      };
      lookup.set(key, bucket);
      buckets.push(bucket);
    }
    bucket.entries.push(entry);
    bucket.count += 1;
    const ts = dateObj ? dateObj.getTime() : 0;
    bucket.latest = Math.max(bucket.latest, ts);
    if (!bucket.sampleEntry) {
      bucket.sampleEntry = entry;
    }
  });
  buckets.sort((a, b) => b.latest - a.latest);
  return buckets.map((bucket) => ({
    ...bucket,
    count: bucket.count || bucket.entries.length,
    sampleEntry: bucket.sampleEntry || bucket.entries[0] || null,
  }));
}

export async function listTemporarySubmissionGroups(options) {
  const result = await listTemporarySubmissions({
    ...options,
    includeHasMore: true,
  });
  const grouped = groupTemporaryRows(result.rows);
  return {
    rows: result.rows,
    groups: grouped,
    hasMore: result.hasMore,
    nextOffset: result.nextOffset,
  };
}

async function ensureTemporaryChainAssignment(conn, row) {
  const normalizedId = normalizeTemporaryId(row?.id);
  const normalizedChainId = normalizeTemporaryId(row?.chain_id) || normalizedId;
  if (!conn || !normalizedId || !normalizedChainId) {
    return { chainId: normalizedChainId || null, updated: false };
  }
  if (!normalizeTemporaryId(row?.chain_id)) {
    await conn.query(
      `UPDATE \`${TEMP_TABLE}\`
          SET chain_id = ?
        WHERE id = ?`,
      [normalizedChainId, normalizedId],
    );
    if (row) {
      row.chain_id = normalizedChainId;
      row.chainId = normalizedChainId;
    }
    return { chainId: normalizedChainId, updated: true };
  }
  return { chainId: normalizedChainId, updated: false };
}

function shouldForcePromote(forcePromoteFlag, payloadJson) {
  if (forcePromoteFlag === true) return true;
  if (!payloadJson || typeof payloadJson !== 'object') return false;
  return (
    payloadJson.forcePromote === true ||
    payloadJson.allowDirectPromotion === true ||
    payloadJson.allowDirectPost === true ||
    payloadJson.canPostDirectly === true
  );
}

export async function getTemporarySummary(
  empId,
  companyId,
  {
    tableName = null,
    formName = null,
    configName = null,
    transactionTypeField = null,
    transactionTypeValue = null,
  } = {},
) {
  await ensureTemporaryTable();
  const createdRows = await listTemporarySubmissions({
    scope: 'created',
    tableName,
    formName,
    configName,
    empId,
    companyId,
    status: 'any',
    limit: MAX_TEMPORARY_LIMIT,
    transactionTypeField,
    transactionTypeValue,
  });
  const reviewRows = await listTemporarySubmissions({
    scope: 'review',
    tableName,
    formName,
    configName,
    empId,
    companyId,
    status: 'any',
    limit: MAX_TEMPORARY_LIMIT,
    transactionTypeField,
    transactionTypeValue,
  });
  const createdPending = createdRows.rows.filter((row) => row.status === 'pending').length;
  const reviewPending = reviewRows.rows.filter((row) => row.status === 'pending').length;
  return {
    createdPending,
    reviewPending,
    createdReviewed: createdRows.rows.filter((row) => row.status !== 'pending').length,
    reviewReviewed: reviewRows.rows.filter((row) => row.status !== 'pending').length,
    createdTotal: createdRows.rows.length,
    reviewTotal: reviewRows.rows.length,
    createdLatestUpdate: createdRows.rows[0]?.updatedAt || null,
    reviewLatestUpdate: reviewRows.rows[0]?.updatedAt || null,
    isReviewer: reviewRows.rows.length > 0,
  };
}

function formatChainHistoryRow(row) {
  if (!row) return null;
  const parsedPlanSeniorEmpIds = parseEmpIdList(row.plan_senior_empid);
  return {
    id: row.id,
    chainId: row.chainId || row.chain_id || null,
    status: row.status,
    planSeniorEmpIds: parsedPlanSeniorEmpIds,
    planSeniorEmpId: parsedPlanSeniorEmpIds[0] || row.plan_senior_empid || null,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    reviewNotes: row.review_notes || null,
    promotedRecordId: row.promoted_record_id || null,
    lastPromoterEmpId: row.last_promoter_empid || null,
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
      `SELECT id, chain_id AS chainId, chain_id, status, plan_senior_empid, last_promoter_empid, reviewed_by, reviewed_at, review_notes, promoted_record_id, created_by, created_at, updated_at
         FROM \`${TEMP_TABLE}\`
        WHERE id = ?
        LIMIT 1`,
      [normalizedId],
    );
    const row = rows[0];
    if (!row) return [];
    const { chainId } = await ensureTemporaryChainAssignment(conn, row);
    let chainRows = [];
    if (chainId) {
      const [rowsByChain] = await conn.query(
        `SELECT id, chain_id AS chainId, chain_id, status, plan_senior_empid, last_promoter_empid, reviewed_by, reviewed_at, review_notes, promoted_record_id, created_by, created_at, updated_at
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
        `SELECT id, temporary_id, chain_id AS chainId, chain_id, action, reviewer_empid, forwarded_to_empid, promoted_record_id, notes, created_at
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
    forcePromote: forcePromoteFlag = false,
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
    session = null,
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
      empIdListIncludes(row.plan_senior_empid, normalizedReviewer) ||
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
    const { chainId: ensuredChainId } = await ensureTemporaryChainAssignment(conn, row);
    const columns = await columnLister(row.table_name);
    const payloadJson = safeJsonParse(row.payload_json, {});
    const effectiveChainId =
      normalizeTemporaryId(ensuredChainId) || normalizeTemporaryId(row.id) || null;
    const isDirectReviewer = empIdListIncludes(row.plan_senior_empid, normalizedReviewer);
    const applyToChain = Boolean(effectiveChainId) && isDirectReviewer;
    const requestedForcePromote =
      forcePromoteFlag === true ||
      shouldForcePromote(
        cleanedOverride?.forcePromote ?? payloadJson?.forcePromote ?? false,
        payloadJson,
      );
    const allowForcePromote = requestedForcePromote && isDirectReviewer;
    let otherPendingRows = [];
    if (effectiveChainId) {
      const [pendingRows] = await conn.query(
        `SELECT id, created_by, plan_senior_empid
           FROM \`${TEMP_TABLE}\`
          WHERE chain_id = ? AND status = 'pending' AND id <> ? FOR UPDATE`,
        [effectiveChainId, id],
      );
      otherPendingRows = Array.isArray(pendingRows) ? pendingRows : [];
      if (otherPendingRows.length > 0 && !allowForcePromote) {
        const err = new Error('Another temporary submission in this chain is pending');
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
    let forwardReviewerEmpIds = [];
    let reviewerPlanSupervisorIds = [];
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
      forwardReviewerEmpIds = parseEmpIdList(reviewerSession?.senior_empid);
      reviewerPlanSupervisorIds = parseEmpIdList(reviewerSession?.senior_plan_empid);
      forwardReviewerEmpId = forwardReviewerEmpIds[0] || null;
    } catch (sessionErr) {
      console.error('Failed to resolve reviewer senior for temporary forward', {
        error: sessionErr,
        reviewer: normalizedReviewer,
        company: row.company_id,
      });
    }
    if (forwardReviewerEmpIds.length > 0) {
      forwardReviewerEmpIds = forwardReviewerEmpIds.filter((id) => id !== normalizedReviewer);
      forwardReviewerEmpId = forwardReviewerEmpIds[0] || null;
    }
    const forcePromote =
      allowForcePromote || normalizeEmpId(row.last_promoter_empid) === normalizedReviewer;

    const mutationContext = {
      companyId: row.company_id ?? null,
      changedBy: normalizedReviewer,
    };
    const shouldSkipTriggers =
      payloadJson?.skipTriggerOnPromote === true ||
      errorRevokedFields.length > 0 ||
      forcePromote;
    const skipTriggers = shouldSkipTriggers;
    const shouldForwardTemporary = !forcePromote && Boolean(forwardReviewerEmpId);
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
    const forceResolutionNote =
      'Auto-resolved other pending drafts in this chain before promotion.';
    let resolvedPendingRows = [];
    if (allowForcePromote && otherPendingRows.length > 0) {
      const bulkResolutionNotes = reviewNotesValue
        ? `${reviewNotesValue}\n\n${forceResolutionNote}`
        : forceResolutionNote;
      for (const pendingRow of otherPendingRows) {
        // eslint-disable-next-line no-await-in-loop
        const resolvedCount = await chainStatusUpdater(conn, effectiveChainId, {
          status: 'rejected',
          reviewerEmpId: normalizedReviewer,
          notes: bulkResolutionNotes,
          promotedRecordId: null,
          clearReviewerAssignment: true,
          pendingOnly: true,
          temporaryId: pendingRow.id,
          temporaryOnly: true,
          applyToChain: false,
        });
        if (Number(resolvedCount) > 0) {
          resolvedPendingRows.push(pendingRow);
        }
      }
      if (resolvedPendingRows.length > 0) {
        reviewNotesValue = bulkResolutionNotes;
      }
    }
    const sanitizedRowForInsert = await sanitizeRowForTable(
      sanitizedValues,
      row.table_name,
      conn,
    );
    if (Object.keys(sanitizedRowForInsert).length === 0) {
      const err = new Error('Temporary submission is missing promotable values');
      err.status = 422;
      throw err;
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
            sanitizedRowForInsert,
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
          let recordForInsert = sanitizedRowForInsert;
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
      await conn.query(
        `UPDATE \`${TEMP_TABLE}\`
            SET last_promoter_empid = ?
          WHERE id = ?`,
        [normalizedReviewer, id],
      );
      const updateCount = Number(
        await chainStatusUpdater(conn, effectiveChainId, {
          status: 'forwarded',
          reviewerEmpId: normalizedReviewer,
          notes: reviewNotesValue ?? null,
          clearReviewerAssignment: true,
          promotedRecordId: null,
          pendingOnly: true,
          temporaryId: id,
          temporaryOnly: true,
          applyToChain,
        }),
      );
      if (!Number.isFinite(updateCount) || updateCount === 0) {
        const err = new Error('Temporary submission status could not be updated');
        err.status = 409;
        throw err;
      }
      const mergedPayload = isPlainObject(payloadJson) ? { ...payloadJson } : {};
      const sanitizedPayloadValues = isPlainObject(mergedPayload.cleanedValues)
        ? { ...mergedPayload.cleanedValues }
        : {};
      Object.entries(sanitizedRowForInsert).forEach(([key, value]) => {
        sanitizedPayloadValues[key] = value;
      });
      mergedPayload.cleanedValues = sanitizedPayloadValues;
      const [forwardResult] = await conn.query(
        `INSERT INTO \`${TEMP_TABLE}\`
         (company_id, table_name, form_name, config_name, module_key, payload_json,
        raw_values_json, cleaned_values_json, created_by, plan_senior_empid,
         last_promoter_empid, branch_id, department_id, chain_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          serializeEmpIdList(forwardReviewerEmpIds),
          normalizedReviewer,
          row.branch_id ?? null,
          row.department_id ?? null,
          effectiveChainId,
          'pending',
        ],
      );
      const forwardTemporaryId = forwardResult?.insertId || null;
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
        recipientEmpIds: forwardReviewerEmpIds,
        createdBy: normalizedReviewer,
        relatedId: forwardTemporaryId ?? id,
        message: `Temporary submission pending review for ${row.table_name}${
          forwardReviewerEmpIds.length > 1
            ? ` (shared with ${forwardReviewerEmpIds.length} senior reviewers)`
            : ''
        }`,
        type: 'request',
      });
      await notificationInserter(conn, {
        companyId: row.company_id,
        recipientEmpId: row.created_by,
        createdBy: normalizedReviewer,
        relatedId: id,
        message: `Temporary submission #${id} forwarded for additional review`,
        type: 'response',
      });
      await conn.query('COMMIT');
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
          const responseFieldMapping = collectEndpointResponseMappings(endpoint);
          const payload = await buildReceiptFromDynamicTransaction(
            masterRecord,
            mapping,
            receiptType,
            {
              typeField: formCfg.posApiTypeField,
              merchantInfo,
              aggregations: endpoint?.aggregations || [],
              session,
            },
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
                  responseFieldMapping,
                  targetTable: row.table_name,
                  aggregations: endpoint?.aggregations || [],
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
                    responseFieldMapping,
                    allowCrossTableMapping: false,
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
    const hasImageConfig =
      (Array.isArray(formCfg?.imagenameField) &&
        formCfg.imagenameField.filter(Boolean).length > 0) ||
      Boolean(formCfg?.imageIdField);
    if (hasImageConfig) {
      const rawValues = safeJsonParse(row.raw_values_json, null);
      const cleanedValues = safeJsonParse(row.cleaned_values_json, null);
      const tempImageSource = mergePlainObjectSources(
        rawValues,
        cleanedValues,
        payloadJson?.values,
        payloadJson?.cleanedValues,
        payloadJson?.rawValues,
        payloadJson,
      );
      const { name: oldImageName, folder: oldImageFolder } = resolveImageNaming(
        tempImageSource,
        formCfg,
        row.table_name,
      );
      let promotedRow = null;
      if (insertedId) {
        try {
          const [promotedRows] = await conn.query(
            `SELECT * FROM \`${row.table_name}\` WHERE id = ? LIMIT 1`,
            [insertedId],
          );
          if (Array.isArray(promotedRows) && promotedRows[0]) {
            promotedRow = promotedRows[0];
          }
        } catch (selectErr) {
          console.error('Failed to load promoted transaction for image rename', {
            table: row.table_name,
            id: insertedId,
            error: selectErr,
          });
        }
      }
      const targetImageSource = promotedRow || sanitizedValues;
      const { name: newImageName, folder: newImageFolder } = resolveImageNaming(
        targetImageSource,
        formCfg,
        row.table_name,
      );
      if (
        oldImageName &&
        newImageName &&
        (oldImageName !== newImageName || oldImageFolder !== newImageFolder)
      ) {
        try {
          await renameImages(
            row.table_name,
            oldImageName,
            newImageName,
            newImageFolder,
            row.company_id,
            oldImageFolder,
          );
        } catch (renameErr) {
          console.error('Failed to rename images after temporary promotion', {
            table: row.table_name,
            id,
            oldImageName,
            newImageName,
            error: renameErr,
          });
        }
      }
    }
    console.info('Temporary promotion chain update', {
      id,
      chainId: effectiveChainId,
    });
    const primaryUpdateCount = await chainStatusUpdater(conn, effectiveChainId, {
      status: 'promoted',
      reviewerEmpId: normalizedReviewer,
      notes: reviewNotesValue ?? null,
      promotedRecordId: promotedId,
      clearReviewerAssignment: true,
      pendingOnly: true,
      temporaryId: id,
      temporaryOnly: true,
      applyToChain,
    });
    const normalizedUpdateCount = Number(primaryUpdateCount);
    if (!Number.isFinite(normalizedUpdateCount) || normalizedUpdateCount === 0) {
      const err = new Error('Temporary submission status could not be updated');
      err.status = 409;
      throw err;
    }
    if (effectiveChainId) {
      await conn.query(
        `UPDATE \`${TEMP_TABLE}\`
            SET last_promoter_empid = NULL
          WHERE chain_id = ?`,
        [effectiveChainId],
      );
    } else {
      await conn.query(
        `UPDATE \`${TEMP_TABLE}\`
            SET last_promoter_empid = NULL
          WHERE id = ?`,
        [id],
      );
    }
    await recordTemporaryReviewHistory(conn, {
      temporaryId: id,
      action: 'promoted',
      reviewerEmpId: normalizedReviewer,
      promotedRecordId: promotedId,
      notes: reviewNotesValue ?? null,
      chainId: effectiveChainId,
    });
    if (resolvedPendingRows.length > 0) {
      for (const resolvedRow of resolvedPendingRows) {
        // eslint-disable-next-line no-await-in-loop
        await recordTemporaryReviewHistory(conn, {
          temporaryId: resolvedRow.id,
          action: 'rejected',
          reviewerEmpId: normalizedReviewer,
          notes: reviewNotesValue ?? null,
          chainId: effectiveChainId,
        });
      }
    }
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
    const participantRecipients = new Set();
    if (effectiveChainId) {
      try {
        const [participants] = await conn.query(
          `SELECT DISTINCT created_by FROM \`${TEMP_TABLE}\` WHERE chain_id = ?`,
          [effectiveChainId],
        );
        if (Array.isArray(participants)) {
          participants.forEach((participant) => {
            const normalized = normalizeEmpId(participant?.created_by);
            if (normalized) {
              participantRecipients.add(normalized);
            }
          });
        }
      } catch (participantErr) {
        console.error('Failed to load temporary chain participants', {
          chainId: effectiveChainId,
          error: participantErr,
        });
      }
    }
    const creatorRecipient = normalizeEmpId(row.created_by);
    if (creatorRecipient) {
      participantRecipients.add(creatorRecipient);
    }
    const planReviewerRecipients = new Set(
      Array.isArray(reviewerPlanSupervisorIds) ? reviewerPlanSupervisorIds : [],
    );
    planReviewerRecipients.delete(normalizedReviewer);
    const promotionMessage = `Temporary submission for ${row.table_name} approved`;
    for (const recipientEmpId of participantRecipients) {
      await notificationInserter(conn, {
        companyId: row.company_id,
        recipientEmpId,
        createdBy: normalizedReviewer,
        relatedId: id,
        message: promotionMessage,
        type: 'response',
      });
    }
    if (planReviewerRecipients.size > 0) {
      const sharedMessage = `${promotionMessage} (shared with ${planReviewerRecipients.size} senior reviewers)`;
      for (const recipientEmpId of planReviewerRecipients) {
        await notificationInserter(conn, {
          companyId: row.company_id,
          recipientEmpId,
          createdBy: normalizedReviewer,
          relatedId: id,
          message: sharedMessage,
          type: 'response',
        });
      }
    }
    if (resolvedPendingRows.length > 0) {
      const resolutionMessage = `Temporary submission auto-resolved due to promotion in chain #${effectiveChainId}`;
      for (const resolvedRow of resolvedPendingRows) {
        const resolvedCreator = normalizeEmpId(resolvedRow.created_by);
        if (resolvedCreator) {
          await notificationInserter(conn, {
            companyId: row.company_id,
            recipientEmpId: resolvedCreator,
            createdBy: normalizedReviewer,
            relatedId: resolvedRow.id,
            message: resolutionMessage,
            type: 'response',
          });
        }
      }
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
      empIdListIncludes(row.plan_senior_empid, normalizedReviewer) ||
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
    const { chainId: ensuredChainId } = await ensureTemporaryChainAssignment(conn, row);
    const lastPromoterEmpId = normalizeEmpId(row.last_promoter_empid);
    const originalCreatorEmpId = normalizeEmpId(row.created_by);
    const rejectionReturnEmpId = lastPromoterEmpId || originalCreatorEmpId;
    if (rejectionReturnEmpId && rejectionReturnEmpId !== originalCreatorEmpId) {
      await conn.query(
        `UPDATE \`${TEMP_TABLE}\`
            SET created_by = ?
          WHERE id = ?`,
        [rejectionReturnEmpId, id],
      );
      row.created_by = rejectionReturnEmpId;
    }
    const effectiveChainId =
      normalizeTemporaryId(ensuredChainId) || normalizeTemporaryId(row.id) || null;
    const isDirectReviewer = empIdListIncludes(row.plan_senior_empid, normalizedReviewer);
    const applyToChain = Boolean(effectiveChainId) && isDirectReviewer;
    console.info('Temporary rejection chain update', {
      id,
      chainId: effectiveChainId,
    });
    const primaryUpdateCount = await chainStatusUpdater(conn, effectiveChainId, {
      status: 'rejected',
      reviewerEmpId: normalizedReviewer,
      notes: notes ?? null,
      promotedRecordId: null,
      clearReviewerAssignment: true,
      pendingOnly: true,
      temporaryId: id,
      temporaryOnly: true,
      applyToChain,
    });
    const normalizedUpdateCount = Number(primaryUpdateCount);
    if (!Number.isFinite(normalizedUpdateCount) || normalizedUpdateCount === 0) {
      const err = new Error('Temporary submission status could not be updated');
      err.status = 409;
      throw err;
    }
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
    const rejectionRecipients = new Set();
    if (effectiveChainId) {
      try {
        const [participants] = await conn.query(
          `SELECT DISTINCT created_by FROM \`${TEMP_TABLE}\` WHERE chain_id = ?`,
          [effectiveChainId],
        );
        if (Array.isArray(participants)) {
          participants.forEach((participant) => {
            const normalized = normalizeEmpId(participant?.created_by);
            if (normalized) {
              rejectionRecipients.add(normalized);
            }
          });
        }
      } catch (participantErr) {
        console.error('Failed to load temporary chain participants for rejection', {
          chainId: effectiveChainId,
          error: participantErr,
        });
      }
    }
    const creatorRecipient = normalizeEmpId(row.created_by);
    if (creatorRecipient) {
      rejectionRecipients.add(creatorRecipient);
    }
    const rejectionMessage = `Temporary submission for ${row.table_name} rejected`;
    for (const recipientEmpId of rejectionRecipients) {
      await notificationInserter(conn, {
        companyId: row.company_id,
        recipientEmpId,
        createdBy: normalizedReviewer,
        relatedId: id,
        message: rejectionMessage,
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

export async function updateTemporarySubmissionImageName(
  id,
  { requesterEmpId, imageName },
) {
  const normalizedRequester = normalizeEmpId(requesterEmpId);
  if (!normalizedRequester) {
    const err = new Error('requesterEmpId required');
    err.status = 400;
    throw err;
  }
  const normalizedImageName = String(imageName || '').trim();
  if (!normalizedImageName) {
    const err = new Error('imageName required');
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
    const reviewerIds = parseEmpIdList(row.plan_senior_empid);
    const isReviewer = reviewerIds.includes(normalizedRequester);
    if (normalizedCreator !== normalizedRequester && !isReviewer) {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
    const payload = safeJsonParse(row.payload_json, {});
    const cleanedValues = safeJsonParse(row.cleaned_values_json, {});
    const rawValues = safeJsonParse(row.raw_values_json, {});
    const applyImageName = (value) => {
      if (!isPlainObject(value)) return value;
      return {
        ...value,
        _imageName: normalizedImageName,
        imageName: normalizedImageName,
        image_name: normalizedImageName,
        imagename: normalizedImageName,
      };
    };
    const nextPayload = isPlainObject(payload) ? { ...payload } : {};
    nextPayload.values = applyImageName(nextPayload.values);
    nextPayload.cleanedValues = applyImageName(nextPayload.cleanedValues);
    nextPayload.rawValues = applyImageName(nextPayload.rawValues);
    const nextCleanedValues = applyImageName(cleanedValues);
    const nextRawValues = applyImageName(rawValues);
    await conn.query(
      `UPDATE \`${TEMP_TABLE}\`
       SET payload_json = ?, cleaned_values_json = ?, raw_values_json = ?
       WHERE id = ?`,
      [
        safeJsonStringify(nextPayload),
        safeJsonStringify(nextCleanedValues),
        safeJsonStringify(nextRawValues),
        id,
      ],
    );
    await conn.query('COMMIT');
    return { id, imageName: normalizedImageName };
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    conn.release();
  }
}
