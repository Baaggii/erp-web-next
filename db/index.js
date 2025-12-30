let mysql;
import crypto from "crypto";

function basicEscape(value) {
  if (value === undefined || value === null) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (value instanceof Date) {
    const normalized = Number.isNaN(value.getTime())
      ? null
      : formatDateForDb(value);
    return normalized ? `'${normalized}'` : 'NULL';
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString('hex')}'`;
  }

  const str = String(value);
  const escaped = str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${escaped}'`;
}

function basicFormat(sql, params) {
  if (typeof sql !== 'string' || !sql.includes('?')) {
    return sql;
  }
  if (!Array.isArray(params) || params.length === 0) {
    return sql;
  }
  const queue = [...params];
  return sql.replace(/\?/g, () => {
    const next = queue.length ? queue.shift() : undefined;
    return basicEscape(next);
  });
}

try {
  const mysqlPromiseMod = await import("mysql2/promise");
  const mysqlPromise = mysqlPromiseMod?.default ?? mysqlPromiseMod;
  const mysqlPrepared = {};
  if (mysqlPromise && (typeof mysqlPromise === 'object' || typeof mysqlPromise === 'function')) {
    for (const key of Object.getOwnPropertyNames(mysqlPromise)) {
      mysqlPrepared[key] = mysqlPromise[key];
    }
  }
  if (
    typeof mysqlPrepared.createPool !== 'function' &&
    typeof mysqlPromise?.createPool === 'function'
  ) {
    mysqlPrepared.createPool = mysqlPromise.createPool.bind(mysqlPromise);
  }
  if (
    typeof mysqlPrepared.format !== 'function' ||
    typeof mysqlPrepared.escape !== 'function'
  ) {
    try {
      const mysqlCoreMod = await import("mysql2");
      const mysqlCore = mysqlCoreMod?.default ?? mysqlCoreMod;
      if (
        typeof mysqlPrepared.format !== 'function' &&
        typeof mysqlCore?.format === 'function'
      ) {
        mysqlPrepared.format = mysqlCore.format.bind(mysqlCore);
      }
      if (
        typeof mysqlPrepared.escape !== 'function' &&
        typeof mysqlCore?.escape === 'function'
      ) {
        mysqlPrepared.escape = mysqlCore.escape.bind(mysqlCore);
      }
    } catch {
      // ignore optional mysql2 import failures; fall back to stubs below
    }
  }
  if (typeof mysqlPrepared.format === 'function') {
    const originalFormat = mysqlPrepared.format;
    mysqlPrepared.format = (sql, params) => {
      try {
        const formatted = originalFormat.call(mysqlPrepared, sql, params);
        if (typeof formatted === 'string') {
          return formatted;
        }
        if (formatted == null) {
          return basicFormat(sql, params);
        }
        return typeof formatted === 'object'
          ? basicFormat(sql, params)
          : String(formatted);
      } catch {
        return basicFormat(sql, params);
      }
    };
  } else {
    mysqlPrepared.format = basicFormat;
  }
  if (typeof mysqlPrepared.escape === 'function') {
    const originalEscape = mysqlPrepared.escape;
    mysqlPrepared.escape = (value) => {
      try {
        const escaped = originalEscape.call(mysqlPrepared, value);
        if (typeof escaped === 'string') {
          return escaped;
        }
        if (escaped == null) {
          return basicEscape(value);
        }
        return typeof escaped === 'object'
          ? basicEscape(value)
          : String(escaped);
      } catch {
        return basicEscape(value);
      }
    };
  } else {
    mysqlPrepared.escape = basicEscape;
  }
  mysql = mysqlPrepared;
} catch {
  mysql = {
    createPool() {
      return {
        query: async () => {
          throw new Error("MySQL not available");
        },
        end: async () => {},
      };
    },
    format: basicFormat,
    escape: basicEscape,
  };
}
let dotenv;
try {
  dotenv = await import("dotenv");
} catch {
  dotenv = { config: () => {} };
}
dotenv.config();
export const adminUserSource = process.env.ERP_ADMIN_USER
  ? "ERP_ADMIN_USER"
  : process.env.DB_ADMIN_USER
    ? "DB_ADMIN_USER"
    : "DB_USER";
let bcrypt;
try {
  const mod = await import("bcryptjs");
  bcrypt = mod.default || mod;
} catch {
  bcrypt = { hash: async (s) => s, compare: async () => false };
}
import defaultModules from "./defaultModules.js";
import { logDb } from "./debugLog.js";
import fs from "fs/promises";
import path from "path";
import { tenantConfigPath, getConfigPath } from "../api-server/utils/configPaths.js";
import { getDisplayFields as getDisplayCfg } from "../api-server/services/displayFieldConfig.js";
import { listCustomRelations } from "../api-server/services/tableRelationsConfig.js";
import { GLOBAL_COMPANY_ID } from "../config/0/constants.js";
import { formatDateForDb } from "../api-server/utils/formatDate.js";

const PROTECTED_PROCEDURE_PREFIXES = ["dynrep_"];

function escapeForDiagnostics(value) {
  if (value === undefined || value === null) {
    return "NULL";
  }

  if (mysql && typeof mysql.escape === "function") {
    try {
      return mysql.escape(value);
    } catch {
      // fall through to manual escaping
    }
  }

  if (value instanceof Date) {
    return `'${formatDateForDb(value)}'`;
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString("hex")}'`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => escapeForDiagnostics(item)).join(", ");
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return Number.isFinite(Number(value)) ? String(value) : "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  if (typeof value === "object") {
    return escapeForDiagnostics(JSON.stringify(value));
  }

  const str = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\u0008/g, "\\b")
    .replace(/\u000c/g, "\\f")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\u0000/g, "\\0")
    .replace(/\u001a/g, "\\Z")
    .replace(/'/g, "\\'");
  return `'${str}'`;
}

function formatSqlForDiagnostics(sql, params) {
  if (!sql) return "";
  if (!Array.isArray(params) || params.length === 0) {
    return sql;
  }

  if (mysql && typeof mysql.format === "function") {
    try {
      return mysql.format(sql, params);
    } catch {
      // fall back to manual formatting below
    }
  }

  let index = 0;
  const formatted = sql.replace(/\?/g, () => {
    if (index >= params.length) {
      return "?";
    }
    const replacement = escapeForDiagnostics(params[index]);
    index += 1;
    return replacement;
  });

  if (index < params.length) {
    return `${formatted} /* +${params.length - index} params */`;
  }

  return formatted;
}

async function isProtectedProcedure(name) {
  if (!name) return false;
  if (PROTECTED_PROCEDURE_PREFIXES.some((p) => name.startsWith(p))) return true;
  const base = path.join(
    process.cwd(),
    "config",
    "0",
    "report_builder",
    "procedures",
  );
  try {
    await fs.access(path.join(base, `${name}.json`));
    return true;
  } catch {}
  try {
    await fs.access(path.join(base, `${name}.sql`));
    return true;
  } catch {}
  return false;
}

const permissionRegistryCache = new Map();

async function loadPermissionRegistry(companyId = GLOBAL_COMPANY_ID) {
  if (!permissionRegistryCache.has(companyId)) {
    try {
      const { path: actionsPath } = await getConfigPath(
        "permissionActions.json",
        companyId,
      );
      const raw = await fs.readFile(actionsPath, "utf8");
      permissionRegistryCache.set(companyId, JSON.parse(raw));
    } catch {
      permissionRegistryCache.set(companyId, {});
    }
  }
  return permissionRegistryCache.get(companyId);
}

function buildDisplayExpr(alias, cfg, fallback) {
  const fields = (cfg?.displayFields || []).map((f) => `${alias}.${f}`);
  if (fields.length) {
    return `TRIM(CONCAT_WS(' ', ${fields.join(', ')}))`;
  }
  return fallback;
}

const tableColumnsCache = new Map();

const softDeleteConfigCache = new Map();

const tenantTableKeyConfigCache = new Map();

function normalizeColumnKey(value) {
  return String(value ?? '').toLowerCase().replace(/_/g, '');
}

const DEFAULT_TENANT_KEY_ALIASES = [
  {
    key: "company_id",
    aliases: ["company_id", "companyid", "companyId", "companyID"],
  },
  {
    key: "branch_id",
    aliases: ["branch_id", "branchid", "branchId", "branchID"],
  },
  {
    key: "department_id",
    aliases: [
      "department_id",
      "departmentid",
      "departmentId",
      "departmentID",
      "dept_id",
      "deptid",
    ],
  },
];

const tenantKeyAliasLookup = new Map();
for (const { key, aliases } of DEFAULT_TENANT_KEY_ALIASES) {
  const canonical = normalizeColumnKey(key);
  if (!canonical) continue;
  tenantKeyAliasLookup.set(canonical, canonical);
  if (Array.isArray(aliases)) {
    for (const alias of aliases) {
      const normalized = normalizeColumnKey(alias);
      if (!normalized) continue;
      tenantKeyAliasLookup.set(normalized, canonical);
    }
  }
}

function escapeIdentifier(name) {
  return `\`${String(name).replace(/`/g, "``")}\``;
}

function aliasedColumn(alias, column) {
  return `${alias}.${escapeIdentifier(column)}`;
}

function unwrapDisplayConfig(result) {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    if (result.config && typeof result.config === "object") {
      return result.config;
    }
  }
  return result || {};
}

function getRelationEntry(config, column) {
  if (!config || typeof config !== "object") return null;
  const direct = config[column];
  if (Array.isArray(direct) && direct.length > 0) {
    return direct[0];
  }
  const lower = String(column || "").toLowerCase();
  return (
    Object.entries(config).find(
      ([key, value]) =>
        typeof key === "string" &&
        key.toLowerCase() === lower &&
        Array.isArray(value) &&
        value.length > 0,
    )?.[1]?.[0] ?? null
  );
}

async function resolveEmploymentRelation({
  baseColumn,
  alias,
  defaultTable,
  defaultIdField,
  defaultFallbackColumn,
  defaultDisplayConfig = {},
  defaultJoinExtras = [],
  relationConfig,
  companyId = GLOBAL_COMPANY_ID,
}) {
  const fallbackColumn = defaultFallbackColumn || defaultIdField;
  const defaultNameExpr = buildDisplayExpr(
    alias,
    defaultDisplayConfig,
    `${alias}.${escapeIdentifier(fallbackColumn)}`,
  );
  const defaultJoinConditions = [
    `${aliasedColumn("e", baseColumn)} = ${alias}.${escapeIdentifier(
      defaultIdField,
    )}`,
    ...defaultJoinExtras,
  ];
  const defaultJoin = `LEFT JOIN ${escapeIdentifier(defaultTable)} ${alias} ON ${defaultJoinConditions.join(
    " AND ",
  )}`;

  const relation = getRelationEntry(relationConfig, baseColumn);
  if (!relation || !relation.table || !relation.column) {
    return { join: defaultJoin, nameExpr: defaultNameExpr };
  }

  const targetTable = relation.table;
  const targetIdField = relation.idField || relation.column;
  const displayCfg = unwrapDisplayConfig(await getDisplayCfg(targetTable, companyId));
  const mergedDisplayCfg = {
    idField: relation.idField || displayCfg.idField || targetIdField,
    displayFields:
      Array.isArray(relation.displayFields) && relation.displayFields.length > 0
        ? relation.displayFields
        : displayCfg.displayFields || [],
  };
  const nameExpr = buildDisplayExpr(
    alias,
    mergedDisplayCfg,
    `${alias}.${escapeIdentifier(mergedDisplayCfg.idField || targetIdField)}`,
  );

  const joinConditions = [
    `${aliasedColumn("e", baseColumn)} = ${alias}.${escapeIdentifier(
      mergedDisplayCfg.idField || targetIdField,
    )}`,
  ];
  const tenantInfo = await getTenantTable(targetTable, companyId);
  const companyKey = Array.isArray(tenantInfo?.tenantKeys)
    ? tenantInfo.tenantKeys.find(
        (key) => String(key || "").toLowerCase() === "company_id",
      )
    : null;
  if (companyKey) {
    joinConditions.push(
      `${alias}.${escapeIdentifier(companyKey)} IN (${GLOBAL_COMPANY_ID}, ${aliasedColumn(
        "e",
        "employment_company_id",
      )})`,
    );
  }

  const join = `LEFT JOIN ${escapeIdentifier(targetTable)} ${alias} ON ${joinConditions.join(
    " AND ",
  )}`;
  return { join, nameExpr };
}

async function loadSoftDeleteConfig(companyId = GLOBAL_COMPANY_ID) {
  if (!softDeleteConfigCache.has(companyId)) {
    try {
      const { path: cfgPath } = await getConfigPath(
        "softDeleteTables.json",
        companyId,
      );
      const raw = await fs.readFile(cfgPath, "utf8");
      softDeleteConfigCache.set(companyId, JSON.parse(raw));
    } catch {
      softDeleteConfigCache.set(companyId, {});
    }
  }
  return softDeleteConfigCache.get(companyId);
}

async function loadTenantTableKeyConfig(companyId = GLOBAL_COMPANY_ID) {
  if (!tenantTableKeyConfigCache.has(companyId)) {
    try {
      const { path: cfgPath } = await getConfigPath(
        "tenantTableKeys.json",
        companyId,
      );
      const raw = await fs.readFile(cfgPath, "utf8");
      const parsed = JSON.parse(raw);
      tenantTableKeyConfigCache.set(
        companyId,
        parsed && typeof parsed === "object" ? parsed : {},
      );
    } catch {
      tenantTableKeyConfigCache.set(companyId, {});
    }
  }
  return tenantTableKeyConfigCache.get(companyId);
}

const uniqueIndexCache = new Map();

async function listTableUniqueIndexes(tableName) {
  if (!tableName) return [];
  if (uniqueIndexCache.has(tableName)) {
    return uniqueIndexCache.get(tableName);
  }

  let rows = [];
  try {
    [rows] = await pool.query(
      `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND NON_UNIQUE = 0
        ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [tableName],
    );
  } catch (err) {
    if (err?.code === "ER_NO_SUCH_TABLE") {
      uniqueIndexCache.set(tableName, []);
      return [];
    }
    throw err;
  }

  const groups = new Map();
  for (const row of rows || []) {
    const indexName = row?.INDEX_NAME;
    const columnName = row?.COLUMN_NAME;
    const seq = Number(row?.SEQ_IN_INDEX);
    if (!indexName || !columnName || !Number.isFinite(seq)) continue;
    if (!groups.has(indexName)) {
      groups.set(indexName, []);
    }
    const bucket = groups.get(indexName);
    bucket[seq - 1] = columnName;
  }

  const indexes = [];
  for (const [indexName, columns] of groups.entries()) {
    const filtered = (columns || []).filter(Boolean);
    if (!filtered.length) continue;
    indexes.push({ indexName, columns: filtered });
  }

  indexes.sort((a, b) => {
    if (a.columns.length !== b.columns.length) {
      return a.columns.length - b.columns.length;
    }
    return String(a.indexName).localeCompare(String(b.indexName));
  });

  uniqueIndexCache.set(tableName, indexes);
  return indexes;
}

async function fetchSnapshotRowByAlternateKey(
  tableName,
  recordId,
  { companyId, tenantFilters } = {},
) {
  if (
    recordId === undefined ||
    recordId === null ||
    (typeof recordId === "string" && !recordId.trim())
  ) {
    return null;
  }

  const normalizedRecordId =
    typeof recordId === "string" ? recordId.trim() : recordId;
  const uniqueIndexes = await listTableUniqueIndexes(tableName);
  if (!uniqueIndexes.length) {
    return null;
  }

  const pkColumns = await getPrimaryKeyColumns(tableName);
  const pkSignature = pkColumns
    .map((col) => normalizeColumnKey(col))
    .join("|");

  const knownValues = new Map();
  const setKnownValue = (key, value) => {
    if (value === undefined || value === null || value === "") return;
    const normalized = normalizeColumnKey(key);
    if (!normalized) return;
    knownValues.set(normalized, value);
    const canonical = tenantKeyAliasLookup.get(normalized);
    if (canonical && canonical !== normalized) {
      knownValues.set(canonical, value);
    }
  };

  setKnownValue("company_id", companyId);
  if (tenantFilters && typeof tenantFilters === "object") {
    for (const [key, value] of Object.entries(tenantFilters)) {
      setKnownValue(key, value);
    }
  }

  const resolveKnownValue = (column) => {
    const normalized = normalizeColumnKey(column);
    if (!normalized) return undefined;
    if (knownValues.has(normalized)) {
      return knownValues.get(normalized);
    }
    const canonical = tenantKeyAliasLookup.get(normalized);
    if (canonical && knownValues.has(canonical)) {
      return knownValues.get(canonical);
    }
    return undefined;
  };

  const fallbackChecks = [];

  for (const { columns } of uniqueIndexes) {
    if (!Array.isArray(columns) || !columns.length) continue;
    const signature = columns.map((col) => normalizeColumnKey(col)).join("|");
    if (signature && signature === pkSignature) {
      continue;
    }

    const knownAssignments = [];
    const values = [];
    let recordColumn = null;
    let missingRequiredValue = false;

    for (const column of columns) {
      const knownValue = resolveKnownValue(column);
      if (knownValue !== undefined && knownValue !== null && knownValue !== "") {
        values.push(knownValue);
        knownAssignments.push({ column, value: knownValue });
        continue;
      }
      if (!recordColumn) {
        recordColumn = column;
        values.push(normalizedRecordId);
        continue;
      }
      missingRequiredValue = true;
    }

    if (!recordColumn) {
      continue;
    }

    fallbackChecks.push({ recordColumn, knownAssignments });

    if (values.some((value) => value === undefined || value === null || value === "")) {
      continue;
    }

    if (missingRequiredValue) {
      continue;
    }

    const whereClause = columns
      .map((column) => `${escapeIdentifier(column)} = ?`)
      .join(" AND ");

    try {
      const [rows] = await pool.query(
        `SELECT * FROM ?? WHERE ${whereClause} LIMIT 1`,
        [tableName, ...values],
      );
      if (rows && rows[0]) {
        return rows[0];
      }
    } catch (err) {
      if (err?.code === "ER_NO_SUCH_TABLE") {
        return null;
      }
      throw err;
    }
  }

  if (!fallbackChecks.length) {
    return null;
  }

  fallbackChecks.sort((a, b) => b.knownAssignments.length - a.knownAssignments.length);

  const triedFallback = new Set();

  for (const { recordColumn, knownAssignments } of fallbackChecks) {
    const normalizedRecordKey = normalizeColumnKey(recordColumn);
    if (!normalizedRecordKey) continue;
    const signatureParts = [normalizedRecordKey];
    const assignmentKeys = knownAssignments
      .map(({ column }) => normalizeColumnKey(column))
      .filter(Boolean)
      .sort();
    signatureParts.push(...assignmentKeys);
    const signature = signatureParts.join("|");
    if (triedFallback.has(signature)) {
      continue;
    }
    triedFallback.add(signature);

    const whereParts = [];
    const params = [tableName];
    const usedColumns = new Set();

    for (const { column, value } of knownAssignments) {
      if (value === undefined || value === null || value === "") continue;
      const normalized = normalizeColumnKey(column);
      if (!normalized) continue;
      whereParts.push(`${escapeIdentifier(column)} = ?`);
      params.push(value);
      usedColumns.add(normalized);
    }

    if (!usedColumns.has(normalizedRecordKey)) {
      whereParts.push(`${escapeIdentifier(recordColumn)} = ?`);
      params.push(normalizedRecordId);
      usedColumns.add(normalizedRecordKey);
    }

    if (tenantFilters && typeof tenantFilters === "object") {
      for (const [column, value] of Object.entries(tenantFilters)) {
        if (value === undefined || value === null || value === "") continue;
        const normalized = normalizeColumnKey(column);
        if (!normalized || usedColumns.has(normalized)) continue;
        whereParts.push(`${escapeIdentifier(column)} = ?`);
        params.push(value);
        usedColumns.add(normalized);
      }
    }

    const normalizedCompanyKey = normalizeColumnKey("company_id");
    if (
      companyId !== undefined &&
      companyId !== null &&
      companyId !== "" &&
      !usedColumns.has(normalizedCompanyKey)
    ) {
      whereParts.push("`company_id` = ?");
      params.push(companyId);
      usedColumns.add(normalizedCompanyKey);
    }

    if (!whereParts.length) {
      continue;
    }

    const whereClause = whereParts.join(" AND ");

    try {
      const [rows] = await pool.query(
        `SELECT * FROM ?? WHERE ${whereClause} LIMIT 2`,
        params,
      );
      if (Array.isArray(rows) && rows.length === 1) {
        return rows[0];
      }
    } catch (err) {
      if (err?.code === "ER_NO_SUCH_TABLE") {
        return null;
      }
      throw err;
    }
  }

  return null;
}
const SOFT_DELETE_CANDIDATES = [
  "is_deleted",
  "deleted",
  "deleted_at",
  "isDeleted",
  "deletedAt",
];

function pickSoftDeleteColumn(columns, cfgVal) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return null;
  }
  const normalized = columns.map((c) => String(c));
  const lower = normalized.map((c) => c.toLowerCase());
  if (typeof cfgVal === "string") {
    const idx = lower.indexOf(cfgVal.toLowerCase());
    if (idx !== -1) return normalized[idx];
  } else if (
    cfgVal &&
    typeof cfgVal === "object" &&
    typeof cfgVal.column === "string"
  ) {
    const idx = lower.indexOf(cfgVal.column.toLowerCase());
    if (idx !== -1) return normalized[idx];
  }
  for (const cand of SOFT_DELETE_CANDIDATES) {
    const idx = lower.indexOf(cand.toLowerCase());
    if (idx !== -1) return normalized[idx];
  }
  return null;
}

async function getSoftDeleteColumn(tableName, companyId = GLOBAL_COMPANY_ID) {
  const softDeleteConfig = await loadSoftDeleteConfig(companyId);
  const hasExplicitConfig = Object.prototype.hasOwnProperty.call(
    softDeleteConfig,
    tableName,
  );
  const cfgVal = softDeleteConfig[tableName];
  if (hasExplicitConfig && (cfgVal === false || cfgVal === null)) {
    return null;
  }
  const columns = await getTableColumnsSafe(tableName);
  const resolved = pickSoftDeleteColumn(columns, cfgVal);
  if (resolved) {
    return resolved;
  }
  try {
    const fresh = await listTableColumns(tableName);
    if (Array.isArray(fresh) && fresh.length) {
      const normalizedFresh = fresh.map((c) => String(c));
      tableColumnsCache.set(tableName, normalizedFresh);
      const refreshed = pickSoftDeleteColumn(normalizedFresh, cfgVal);
      if (refreshed) {
        return refreshed;
      }
    }
  } catch {}
  return null;
}

const DELETED_AT_COLUMN_CANDIDATES = ["deleted_at", "deletedat", "deletedAt"];
const DELETED_BY_COLUMN_CANDIDATES = ["deleted_by", "deletedby", "deletedBy"];
const UPDATED_AT_COLUMN_CANDIDATES = ["updated_at", "updatedat", "updatedAt"];
const UPDATED_BY_COLUMN_CANDIDATES = ["updated_by", "updatedby", "updatedBy"];

function resolveColumnName(columns, lowerColumns, candidates) {
  for (const cand of candidates) {
    const idx = lowerColumns.indexOf(String(cand).toLowerCase());
    if (idx !== -1) {
      return columns[idx];
    }
  }
  return null;
}

function buildSoftDeleteUpdateClause(
  columns,
  softDeleteColumn,
  deletedBy,
  { now } = {},
) {
  const normalized = Array.isArray(columns)
    ? columns.map((col) => String(col))
    : [];
  const lowerColumns = normalized.map((col) => col.toLowerCase());
  const resolvedSoftDeleteColumn = softDeleteColumn
    ? resolveColumnName(normalized, lowerColumns, [softDeleteColumn])
    : null;
  const resolvedDeletedAtColumn = resolveColumnName(
    normalized,
    lowerColumns,
    DELETED_AT_COLUMN_CANDIDATES,
  );
  const resolvedDeletedByColumn = resolveColumnName(
    normalized,
    lowerColumns,
    DELETED_BY_COLUMN_CANDIDATES,
  );

  let timestamp = now;
  const ensureTimestamp = () => {
    if (!timestamp) {
      timestamp = formatDateForDb(new Date());
    }
    return timestamp;
  };

  const assignments = [];
  const params = [];

  if (resolvedSoftDeleteColumn) {
    const softLower = resolvedSoftDeleteColumn.toLowerCase();
    if (
      resolvedDeletedAtColumn &&
      softLower === resolvedDeletedAtColumn.toLowerCase()
    ) {
      assignments.push(`\`${resolvedSoftDeleteColumn}\` = ?`);
      params.push(ensureTimestamp());
    } else if (
      resolvedDeletedByColumn &&
      softLower === resolvedDeletedByColumn.toLowerCase()
    ) {
      assignments.push(`\`${resolvedSoftDeleteColumn}\` = ?`);
      params.push(deletedBy ?? null);
    } else {
      assignments.push(`\`${resolvedSoftDeleteColumn}\` = 1`);
    }
  }

  if (
    resolvedDeletedByColumn &&
    (!resolvedSoftDeleteColumn ||
      resolvedDeletedByColumn.toLowerCase() !==
        resolvedSoftDeleteColumn.toLowerCase())
  ) {
    assignments.push(`\`${resolvedDeletedByColumn}\` = ?`);
    params.push(deletedBy ?? null);
  }

  if (
    resolvedDeletedAtColumn &&
    (!resolvedSoftDeleteColumn ||
      resolvedDeletedAtColumn.toLowerCase() !==
        resolvedSoftDeleteColumn.toLowerCase())
  ) {
    assignments.push(`\`${resolvedDeletedAtColumn}\` = ?`);
    params.push(ensureTimestamp());
  }

  if (assignments.length === 0) {
    return { clause: '', params: [], supported: false };
  }

  return {
    clause: assignments.join(', '),
    params,
    supported: true,
  };
}

function buildSeedUpsertUpdateClause(
  columns,
  insertColumns,
  softDeleteColumn,
  { updatedByFallback = null } = {},
) {
  const normalized = Array.isArray(columns)
    ? columns.map((col) => String(col))
    : [];
  const lowerColumns = normalized.map((col) => col.toLowerCase());
  const insertList = Array.isArray(insertColumns)
    ? insertColumns.map((col) => String(col))
    : [];
  const insertLower = new Set(insertList.map((col) => col.toLowerCase()));

  const resolvedSoftDeleteColumn = softDeleteColumn
    ? resolveColumnName(normalized, lowerColumns, [softDeleteColumn])
    : null;
  const resolvedDeletedAtColumn = resolveColumnName(
    normalized,
    lowerColumns,
    DELETED_AT_COLUMN_CANDIDATES,
  );
  const resolvedDeletedByColumn = resolveColumnName(
    normalized,
    lowerColumns,
    DELETED_BY_COLUMN_CANDIDATES,
  );
  const resolvedUpdatedAtColumn = resolveColumnName(
    normalized,
    lowerColumns,
    UPDATED_AT_COLUMN_CANDIDATES,
  );
  const resolvedUpdatedByColumn = resolveColumnName(
    normalized,
    lowerColumns,
    UPDATED_BY_COLUMN_CANDIDATES,
  );

  const specialLower = new Set(
    [
      resolvedSoftDeleteColumn,
      resolvedDeletedAtColumn,
      resolvedDeletedByColumn,
      resolvedUpdatedAtColumn,
      resolvedUpdatedByColumn,
    ]
      .filter(Boolean)
      .map((name) => name.toLowerCase()),
  );

  const assignments = [];
  const params = [];

  for (const columnName of insertList) {
    if (specialLower.has(columnName.toLowerCase())) continue;
    assignments.push(`\`${columnName}\` = VALUES(\`${columnName}\`)`);
  }

  const pushResetAssignment = (columnName) => {
    if (!columnName) return;
    const lower = columnName.toLowerCase();
    if (insertLower.has(lower)) {
      assignments.push(`\`${columnName}\` = VALUES(\`${columnName}\`)`);
    } else {
      assignments.push(`\`${columnName}\` = DEFAULT(\`${columnName}\`)`);
    }
  };

  if (resolvedSoftDeleteColumn) {
    pushResetAssignment(resolvedSoftDeleteColumn);
  }
  if (
    resolvedDeletedAtColumn &&
    (!resolvedSoftDeleteColumn ||
      resolvedDeletedAtColumn.toLowerCase() !==
        resolvedSoftDeleteColumn.toLowerCase())
  ) {
    pushResetAssignment(resolvedDeletedAtColumn);
  }
  if (
    resolvedDeletedByColumn &&
    (!resolvedSoftDeleteColumn ||
      resolvedDeletedByColumn.toLowerCase() !==
        resolvedSoftDeleteColumn.toLowerCase())
  ) {
    pushResetAssignment(resolvedDeletedByColumn);
  }

  if (resolvedUpdatedAtColumn) {
    assignments.push(`\`${resolvedUpdatedAtColumn}\` = NOW()`);
  }

  if (resolvedUpdatedByColumn) {
    if (insertLower.has(resolvedUpdatedByColumn.toLowerCase())) {
      assignments.push(
        `\`${resolvedUpdatedByColumn}\` = VALUES(\`${resolvedUpdatedByColumn}\`)`,
      );
    } else {
      assignments.push(`\`${resolvedUpdatedByColumn}\` = ?`);
      params.push(updatedByFallback);
    }
  }

  if (assignments.length === 0 && insertList.length > 0) {
    const first = insertList[0];
    assignments.push(`\`${first}\` = VALUES(\`${first}\`)`);
  }

  return {
    clause: assignments.join(', '),
    params,
  };
}

async function getTableColumnsSafe(tableName) {
  if (!tableColumnsCache.has(tableName)) {
    const cols = await listTableColumns(tableName);
    tableColumnsCache.set(tableName, cols);
  }
  return tableColumnsCache.get(tableName);
}

async function ensureValidColumns(tableName, columns, names) {
  let lower = new Set(columns.map((c) => c.toLowerCase()));
  let refresh = false;
  for (const name of names) {
    if (!lower.has(String(name).toLowerCase())) {
      refresh = true;
      break;
    }
  }
  if (refresh) {
    const fresh = await listTableColumns(tableName);
    tableColumnsCache.set(tableName, fresh);
    lower = new Set(fresh.map((c) => c.toLowerCase()));
    for (const name of names) {
      if (!lower.has(String(name).toLowerCase())) {
        throw new Error(`Invalid column name: ${name}`);
      }
    }
  }
}

// Create a connection pool
export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
});

const adminUser =
  process.env.ERP_ADMIN_USER ||
  process.env.DB_ADMIN_USER ||
  process.env.DB_USER ||
  null;

const adminPass =
  process.env.ERP_ADMIN_PASS ||
  process.env.DB_ADMIN_PASS ||
  process.env.DB_PASS ||
  null;

export const adminPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: adminUser,
  password: adminPass,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
});

export function getAdminCredentialMetadata() {
  const fallbackReasons = [];
  if (!process.env.ERP_ADMIN_USER) {
    fallbackReasons.push("ERP_ADMIN_USER not set");
  }
  if (adminUserSource !== "ERP_ADMIN_USER" && !process.env.DB_ADMIN_USER) {
    fallbackReasons.push("DB_ADMIN_USER not set");
  }
  return {
    adminUser,
    adminUserSource,
    fallbackReasons,
    dbUser: process.env.DB_USER || null,
  };
}

function normalizeDateTimeInput(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function isDynamicSqlTriggerError(err) {
  if (!err) return false;
  const message = String(err.sqlMessage || err.message || '').toLowerCase();
  return err.errno === 1336 || message.includes('dynamic sql is not allowed');
}

/**
 * Test database connection
 */
export async function testConnection() {
  try {
    await pool.query("SELECT 1");
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Fetch a user by employee ID
 */
export async function getUserByEmpId(empid) {
  const [rows] = await pool.query(
    `SELECT *
     FROM users
     WHERE empid = ?
     LIMIT 1`,
    [empid],
  );
  if (rows.length === 0) return null;
  const user = rows[0];
  user.verifyPassword = async (plain) => bcrypt.compare(plain, user.password);
  return user;
}

function mapEmploymentRow(row) {
  const {
    company_id,
    merchant_tin,
    branch_id,
    department_id,
    position_id,
    senior_empid,
    senior_plan_empid,
    workplace_id,
    workplace_name,
    workplace_session_id,
    pos_no,
    merchant_id,
    permission_list,
    ...rest
  } = row;
  const flags = new Set((permission_list || "").split(","));
  const all = [
    "new_records",
    "edit_delete_request",
    "edit_records",
    "delete_records",
    "image_handler",
    "audition",
    "supervisor",
    "companywide",
    "branchwide",
    "departmentwide",
    "developer",
    "common_settings",
    "system_settings",
    "license_settings",
    "ai",
    "dashboard",
    "ai_dashboard",
  ];
  const permissions = {};
  for (const k of all) permissions[k] = flags.has(k);
  const resolvedWorkplaceSessionId =
    workplace_session_id !== undefined && workplace_session_id !== null
      ? workplace_session_id
      : workplace_id ?? null;
  return {
    company_id,
    branch_id,
    department_id,
    position_id,
    senior_empid,
    senior_plan_empid,
    workplace_id,
    workplace_name,
    workplace_session_id: resolvedWorkplaceSessionId,
    pos_no,
    merchant_id,
    merchant_tin,
    ...rest,
    permissions,
  };
}

let employmentScheduleColumnCache = null;
let companyMerchantColumnCache = null;

async function getCompanyMerchantTinColumnInfo() {
  if (companyMerchantColumnCache) return companyMerchantColumnCache;
  try {
    const columns = await getTableColumnsSafe("companies");
    const lower = new Set(columns.map((c) => String(c).toLowerCase()));
    companyMerchantColumnCache = { hasMerchantTin: lower.has("merchant_tin") };
  } catch (err) {
    if (err?.code === "ER_NO_SUCH_TABLE") {
      companyMerchantColumnCache = { hasMerchantTin: false };
    } else {
      throw err;
    }
  }
  return companyMerchantColumnCache;
}

async function getEmploymentScheduleColumnInfo() {
  if (employmentScheduleColumnCache) return employmentScheduleColumnCache;
  if (process.env.SKIP_SCHEDULE_COLUMN_CHECK === "1") {
    employmentScheduleColumnCache = { hasPosNo: true, hasMerchantId: true };
    return employmentScheduleColumnCache;
  }
  try {
    const columns = await getTableColumnsSafe("tbl_employment_schedule");
    const lower = new Set(columns.map((c) => String(c).toLowerCase()));
    employmentScheduleColumnCache = {
      hasPosNo: lower.has("pos_no"),
      hasMerchantId: lower.has("merchant_id"),
    };
  } catch (err) {
    if (err?.code === "ER_NO_SUCH_TABLE") {
      employmentScheduleColumnCache = { hasPosNo: false, hasMerchantId: false };
    } else {
      throw err;
    }
  }
  return employmentScheduleColumnCache;
}

/**
 * List all employment sessions for an employee
 */
export async function getEmploymentSessions(empid, options = {}) {
  const configCompanyId = GLOBAL_COMPANY_ID;
  const scheduleDate = options?.effectiveDate
    ? formatDateForDb(options.effectiveDate).slice(0, 10)
    : null;
  const scheduleDateSql = scheduleDate ? '?' : 'CURRENT_DATE()';
  const scheduleDateParams = scheduleDate
    ? [scheduleDate, scheduleDate, scheduleDate, scheduleDate]
    : [];
  const [
    companyCfgRaw,
    branchCfgRaw,
    deptCfgRaw,
    empCfgRaw,
    relationCfg,
    companyMerchantInfo,
  ] = await Promise.all([
    getDisplayCfg("companies", configCompanyId),
    getDisplayCfg("code_branches", configCompanyId),
    getDisplayCfg("code_department", configCompanyId),
    getDisplayCfg("tbl_employee", configCompanyId),
    listCustomRelations("tbl_employment", configCompanyId),
    getCompanyMerchantTinColumnInfo(),
  ]);

  const companyCfg = unwrapDisplayConfig(companyCfgRaw);
  const branchCfg = unwrapDisplayConfig(branchCfgRaw);
  const deptCfg = unwrapDisplayConfig(deptCfgRaw);
  const empCfg = unwrapDisplayConfig(empCfgRaw);
  const relationConfig = relationCfg?.config || {};
  const merchantTinExpr = companyMerchantInfo?.hasMerchantTin
    ? "c.merchant_tin"
    : "NULL";
  const scheduleInfo = await getEmploymentScheduleColumnInfo();
  const posNoExpr = scheduleInfo.hasPosNo ? "es.pos_no" : "NULL";
  const merchantExpr = scheduleInfo.hasMerchantId ? "es.merchant_id" : "NULL";

  const [companyRel, branchRel, deptRel] = await Promise.all([
    resolveEmploymentRelation({
      baseColumn: "employment_company_id",
      alias: "c",
      defaultTable: "companies",
      defaultIdField: companyCfg?.idField || "id",
      defaultFallbackColumn: "name",
      defaultDisplayConfig: companyCfg,
      relationConfig,
      companyId: configCompanyId,
    }),
    resolveEmploymentRelation({
      baseColumn: "employment_branch_id",
      alias: "b",
      defaultTable: "code_branches",
      defaultIdField: "branch_id",
      defaultFallbackColumn: "name",
      defaultDisplayConfig: branchCfg,
      defaultJoinExtras: [
        `${aliasedColumn("b", "company_id")} = ${aliasedColumn(
          "e",
          "employment_company_id",
        )}`,
      ],
      relationConfig,
      companyId: configCompanyId,
    }),
    resolveEmploymentRelation({
      baseColumn: "employment_department_id",
      alias: "d",
      defaultTable: "code_department",
      defaultIdField: deptCfg?.idField || "id",
      defaultFallbackColumn: "name",
      defaultDisplayConfig: deptCfg,
      defaultJoinExtras: [
        `${aliasedColumn("d", "company_id")} IN (${GLOBAL_COMPANY_ID}, ${aliasedColumn(
          "e",
          "employment_company_id",
        )})`,
      ],
      relationConfig,
      companyId: configCompanyId,
    }),
  ]);

  const empName = buildDisplayExpr(
    "emp",
    empCfg,
    "CONCAT_WS(' ', emp.emp_fname, emp.emp_lname)",
  );

  const sql = `SELECT
          e.employment_company_id AS company_id,
          ${merchantTinExpr} AS merchant_tin,
          ${companyRel.nameExpr} AS company_name,
          e.employment_branch_id AS branch_id,
          ${branchRel.nameExpr} AS branch_name,
          e.employment_department_id AS department_id,
          ${deptRel.nameExpr} AS department_name,
          es.workplace_id AS workplace_id,
          es.workplace_session_id AS workplace_session_id,
          ${posNoExpr} AS pos_no,
          ${merchantExpr} AS merchant_id,
          cw.workplace_name AS workplace_name,
          e.employment_position_id AS position_id,
          e.employment_senior_empid AS senior_empid,
          e.employment_senior_plan_empid AS senior_plan_empid,
          ${empName} AS employee_name,
          e.employment_user_level AS user_level,
          ul.name AS user_level_name,
          GROUP_CONCAT(DISTINCT up.action_key) AS permission_list
       FROM tbl_employment e
       ${companyRel.join}
       ${branchRel.join}
       ${deptRel.join}
       LEFT JOIN (
         SELECT
            es.company_id,
            es.branch_id,
            es.department_id,
            es.emp_id,
            es.workplace_id,
            NULL AS workplace_session_id,
            ${posNoExpr} AS pos_no,
            ${merchantExpr} AS merchant_id
         FROM tbl_employment_schedule es
         INNER JOIN (
           SELECT
             company_id,
             branch_id,
             department_id,
             emp_id,
             MAX(start_date) AS latest_start_date
           FROM tbl_employment_schedule
           WHERE start_date <= ${scheduleDateSql}
             AND (end_date IS NULL OR end_date >= ${scheduleDateSql})
             AND deleted_at IS NULL
           GROUP BY company_id, branch_id, department_id, emp_id
         ) latest
           ON latest.company_id = es.company_id
          AND latest.branch_id = es.branch_id
          AND latest.department_id = es.department_id
          AND latest.emp_id = es.emp_id
          AND latest.latest_start_date = es.start_date
         WHERE es.start_date <= ${scheduleDateSql}
           AND (es.end_date IS NULL OR es.end_date >= ${scheduleDateSql})
           AND es.deleted_at IS NULL
       ) es
         ON es.emp_id = e.employment_emp_id
        AND es.company_id = e.employment_company_id
        AND es.branch_id = e.employment_branch_id
       AND es.department_id = e.employment_department_id
       LEFT JOIN tbl_workplace tw
         ON tw.company_id = e.employment_company_id
        AND tw.branch_id = e.employment_branch_id
        AND tw.department_id = e.employment_department_id
        AND tw.workplace_id = es.workplace_id
       LEFT JOIN code_workplace cw ON cw.workplace_id = es.workplace_id
       LEFT JOIN tbl_employee emp ON e.employment_emp_id = emp.emp_id
       LEFT JOIN user_levels ul ON e.employment_user_level = ul.userlevel_id
       LEFT JOIN user_level_permissions up ON up.userlevel_id = ul.userlevel_id AND up.action = 'permission' AND up.company_id IN (${GLOBAL_COMPANY_ID}, e.employment_company_id)
       WHERE e.employment_emp_id = ?
      GROUP BY e.employment_company_id, company_name,
                ${merchantTinExpr},
                e.employment_branch_id, branch_name,
                e.employment_department_id, department_name,
                es.workplace_id, cw.workplace_name,
                pos_no, merchant_id,
                e.employment_position_id,
                e.employment_senior_empid,
                e.employment_senior_plan_empid,
                employee_name, e.employment_user_level, ul.name
      ORDER BY company_name, department_name, branch_name, workplace_name, user_level_name`;
  const querySql = sql.replace(/`/g, "");
  const normalizedSql = querySql.replace(/`/g, "");
  const params = [...scheduleDateParams, empid];
  let rows;
  try {
    [rows] = await pool.query(normalizedSql, params);
  } catch (err) {
    if (
      err?.code === "ER_BAD_FIELD_ERROR" &&
      /\b(pos_no|merchant_id|merchant_tin)\b/i.test(err.message || "")
    ) {
      employmentScheduleColumnCache = { hasPosNo: false, hasMerchantId: false };
      companyMerchantColumnCache = { hasMerchantTin: false };
      const replaceExpr = (text, target, replacement) =>
        text.split(target).join(replacement);
      const withoutPos = replaceExpr(normalizedSql, posNoExpr, "NULL");
      const withoutMerchantId = replaceExpr(withoutPos, merchantExpr, "NULL");
      const fallbackSql = replaceExpr(withoutMerchantId, merchantTinExpr, "NULL");
      [rows] = await pool.query(fallbackSql, params);
    } else {
      console.warn("Employment sessions query failed; returning empty list", {
        error: err?.message || err,
      });
      rows = [];
    }
  }
  const sessions = rows.map(mapEmploymentRow);
  if (options?.includeDiagnostics) {
    const sqlText =
      typeof normalizedSql === 'string' ? normalizedSql : String(normalizedSql ?? '');
    const diagnostics = { sql: sqlText, params };
    let formattedSql = null;
    if (typeof mysql?.format === 'function') {
      try {
        formattedSql = mysql.format(sql, params);
      } catch {
        formattedSql = null;
      }
    }
    if (typeof formattedSql === 'string') {
      const trimmed = formattedSql.trim();
      formattedSql = trimmed.length ? trimmed : null;
    } else {
      formattedSql = null;
    }
    diagnostics.formattedSql =
      formattedSql && formattedSql.trim().length > 0 ? formattedSql : sqlText;
    Object.defineProperty(sessions, '__diagnostics', {
      value: diagnostics,
      enumerable: false,
    });
  }
  return sessions;
}

/**
 * Fetch employment session info and permission flags for an employee.
 * Optionally filter by company ID.
 */
export async function getEmploymentSession(empid, companyId, options = {}) {
  const hasBranchPref =
    options && Object.prototype.hasOwnProperty.call(options, 'branchId');
  const hasDepartmentPref =
    options && Object.prototype.hasOwnProperty.call(options, 'departmentId');
  const branchPreference = hasBranchPref ? options.branchId ?? null : undefined;
  const departmentPreference = hasDepartmentPref
    ? options.departmentId ?? null
    : undefined;
  const scheduleDate = options?.effectiveDate
    ? formatDateForDb(options.effectiveDate).slice(0, 10)
    : null;
  const scheduleDateSql = scheduleDate ? '?' : 'CURRENT_DATE()';
  const scheduleDateParams = scheduleDate
    ? [scheduleDate, scheduleDate, scheduleDate, scheduleDate]
    : [];

  if (companyId !== undefined && companyId !== null) {
    const configCompanyId = Number.isFinite(Number(companyId))
      ? Number(companyId)
      : GLOBAL_COMPANY_ID;
  const [
    companyCfgRaw,
    branchCfgRaw,
    deptCfgRaw,
    empCfgRaw,
    relationCfg,
    companyMerchantInfo,
  ] = await Promise.all([
    getDisplayCfg("companies", configCompanyId),
    getDisplayCfg("code_branches", configCompanyId),
    getDisplayCfg("code_department", configCompanyId),
    getDisplayCfg("tbl_employee", configCompanyId),
    listCustomRelations("tbl_employment", configCompanyId),
    getCompanyMerchantTinColumnInfo(),
  ]);

  const companyCfg = unwrapDisplayConfig(companyCfgRaw);
  const branchCfg = unwrapDisplayConfig(branchCfgRaw);
  const deptCfg = unwrapDisplayConfig(deptCfgRaw);
  const empCfg = unwrapDisplayConfig(empCfgRaw);
  const relationConfig = relationCfg?.config || {};
  const merchantTinExpr = companyMerchantInfo?.hasMerchantTin
    ? "c.merchant_tin"
    : "NULL";
  const scheduleInfo = await getEmploymentScheduleColumnInfo();
  const posNoExpr = scheduleInfo.hasPosNo ? "es.pos_no" : "NULL";
  const merchantExpr = scheduleInfo.hasMerchantId ? "es.merchant_id" : "NULL";

  const [companyRel, branchRel, deptRel] = await Promise.all([
    resolveEmploymentRelation({
      baseColumn: "employment_company_id",
      alias: "c",
      defaultTable: "companies",
      defaultIdField: companyCfg?.idField || "id",
      defaultFallbackColumn: "name",
      defaultDisplayConfig: companyCfg,
      relationConfig,
      companyId: configCompanyId,
    }),
    resolveEmploymentRelation({
      baseColumn: "employment_branch_id",
      alias: "b",
      defaultTable: "code_branches",
      defaultIdField: "branch_id",
      defaultFallbackColumn: "name",
      defaultDisplayConfig: branchCfg,
      defaultJoinExtras: [
        `${aliasedColumn("b", "company_id")} = ${aliasedColumn(
          "e",
          "employment_company_id",
        )}`,
      ],
      relationConfig,
      companyId: configCompanyId,
    }),
    resolveEmploymentRelation({
      baseColumn: "employment_department_id",
      alias: "d",
      defaultTable: "code_department",
      defaultIdField: deptCfg?.idField || "id",
      defaultFallbackColumn: "name",
      defaultDisplayConfig: deptCfg,
      defaultJoinExtras: [
        `${aliasedColumn("d", "company_id")} IN (${GLOBAL_COMPANY_ID}, ${aliasedColumn(
          "e",
          "employment_company_id",
        )})`,
      ],
      relationConfig,
      companyId: configCompanyId,
    }),
  ]);

  const empName = buildDisplayExpr(
    "emp",
    empCfg,
    "CONCAT_WS(' ', emp.emp_fname, emp.emp_lname)",
  );

  const orderPriority = [];
  const params = [empid, companyId];
  if (hasBranchPref) {
    orderPriority.push('CASE WHEN e.employment_branch_id <=> ? THEN 0 ELSE 1 END');
    params.push(branchPreference);
  }
  if (hasDepartmentPref) {
    orderPriority.push(
      'CASE WHEN e.employment_department_id <=> ? THEN 0 ELSE 1 END',
    );
    params.push(departmentPreference);
  }
  const orderParts = [
    ...orderPriority,
    'company_name',
    'department_name',
    'branch_name',
    'workplace_name',
    'user_level_name',
  ];

  const baseSql = `SELECT
            e.employment_company_id AS company_id,
            ${merchantTinExpr} AS merchant_tin,
            ${companyRel.nameExpr} AS company_name,
            e.employment_branch_id AS branch_id,
            ${branchRel.nameExpr} AS branch_name,
            e.employment_department_id AS department_id,
            ${deptRel.nameExpr} AS department_name,
            es.workplace_id AS workplace_id,
            es.workplace_session_id AS workplace_session_id,
            ${posNoExpr} AS pos_no,
            ${merchantExpr} AS merchant_id,
            cw.workplace_name AS workplace_name,
            e.employment_position_id AS position_id,
            e.employment_senior_empid AS senior_empid,
            e.employment_senior_plan_empid AS senior_plan_empid,
            ${empName} AS employee_name,
            e.employment_user_level AS user_level,
            ul.name AS user_level_name,
            GROUP_CONCAT(DISTINCT up.action_key) AS permission_list
         FROM tbl_employment e
         ${companyRel.join}
         ${branchRel.join}
         ${deptRel.join}
         LEFT JOIN (
           SELECT
             es.company_id,
             es.branch_id,
             es.department_id,
             es.emp_id,
             es.workplace_id,
             NULL AS workplace_session_id,
             ${posNoExpr} AS pos_no,
             ${merchantExpr} AS merchant_id
           FROM tbl_employment_schedule es
           INNER JOIN (
             SELECT
               company_id,
               branch_id,
               department_id,
               emp_id,
               MAX(start_date) AS latest_start_date
             FROM tbl_employment_schedule
             WHERE start_date <= ${scheduleDateSql}
               AND (end_date IS NULL OR end_date >= ${scheduleDateSql})
               AND deleted_at IS NULL
             GROUP BY company_id, branch_id, department_id, emp_id
           ) latest
             ON latest.company_id = es.company_id
            AND latest.branch_id = es.branch_id
            AND latest.department_id = es.department_id
            AND latest.emp_id = es.emp_id
            AND latest.latest_start_date = es.start_date
           WHERE es.start_date <= ${scheduleDateSql}
             AND (es.end_date IS NULL OR es.end_date >= ${scheduleDateSql})
             AND es.deleted_at IS NULL
         ) es
           ON es.emp_id = e.employment_emp_id
          AND es.company_id = e.employment_company_id
          AND es.branch_id = e.employment_branch_id
         AND es.department_id = e.employment_department_id
         LEFT JOIN tbl_workplace tw
           ON tw.company_id = e.employment_company_id
          AND tw.branch_id = e.employment_branch_id
          AND tw.department_id = e.employment_department_id
          AND tw.workplace_id = es.workplace_id
         LEFT JOIN code_workplace cw ON cw.workplace_id = es.workplace_id
         LEFT JOIN tbl_employee emp ON e.employment_emp_id = emp.emp_id
         LEFT JOIN user_levels ul ON e.employment_user_level = ul.userlevel_id
         LEFT JOIN user_level_permissions up ON up.userlevel_id = ul.userlevel_id AND up.action = 'permission' AND up.company_id IN (${GLOBAL_COMPANY_ID}, e.employment_company_id)
         WHERE e.employment_emp_id = ? AND e.employment_company_id = ?
         GROUP BY e.employment_company_id, company_name,
                   ${merchantTinExpr},
                   e.employment_branch_id, branch_name,
                   e.employment_department_id, department_name,
                   es.workplace_id, cw.workplace_name,
                   pos_no, merchant_id,
                   e.employment_position_id,
                   e.employment_senior_empid,
                   e.employment_senior_plan_empid,
                   employee_name, e.employment_user_level, ul.name
         ORDER BY ${orderParts.join(', ')}
         LIMIT 1`;
    const normalizedSql = baseSql.replace(/`/g, "");
    const queryParams = [...scheduleDateParams, ...params];
    let rows;
    try {
      [rows] = await pool.query(normalizedSql, queryParams);
    } catch (err) {
      if (
        err?.code === "ER_BAD_FIELD_ERROR" &&
        /\b(pos_no|merchant_id|merchant_tin)\b/i.test(err.message || "")
      ) {
        employmentScheduleColumnCache = { hasPosNo: false, hasMerchantId: false };
        companyMerchantColumnCache = { hasMerchantTin: false };
        const replaceExpr = (text, target, replacement) =>
          text.split(target).join(replacement);
        const withoutPos = replaceExpr(normalizedSql, posNoExpr, "NULL");
        const withoutMerchantId = replaceExpr(withoutPos, merchantExpr, "NULL");
        const fallbackSql = replaceExpr(withoutMerchantId, merchantTinExpr, "NULL");
        [rows] = await pool.query(fallbackSql, queryParams);
      } else {
        console.warn("Employment session query failed; returning null", {
          error: err?.message || err,
        });
        return null;
      }
    }
    if (rows.length === 0) return null;
    return mapEmploymentRow(rows[0]);
  }
  const sessions = await getEmploymentSessions(empid);
  return sessions[0] || null;
}

export async function listUserLevels() {
  const [rows] = await pool.query(
    'SELECT userlevel_id AS id, name FROM user_levels ORDER BY userlevel_id',
  );
  return rows;
}

export async function getUserLevelActions(
  userLevelId,
  companyId = GLOBAL_COMPANY_ID,
) {
  const id = Number(userLevelId);
  const [rows] = await pool.query(
    `SELECT action, action_key
       FROM user_level_permissions
       WHERE company_id = ? AND userlevel_id = ? AND action IS NOT NULL`,
    [companyId, userLevelId],
  );
  if (id === 1) {
    const perms = {};
    const [mods] = await pool.query('SELECT module_key FROM modules');
    for (const { module_key } of mods) perms[module_key] = true;
    const registry = await loadPermissionRegistry(companyId);
    const forms = registry.forms || {};
    const permissions = registry.permissions || [];
    if (Object.keys(forms).length || permissions.length) {
      perms.buttons = {};
      perms.functions = {};
      perms.api = {};
      perms.permissions = {};
      for (const form of Object.values(forms)) {
        form.buttons?.forEach((b) => {
          const key = typeof b === 'string' ? b : b.key;
          perms.buttons[key] = true;
        });
        form.functions?.forEach((f) => (perms.functions[f] = true));
        form.api?.forEach((a) => {
          const key = typeof a === 'string' ? a : a.key;
          perms.api[key] = true;
        });
      }
      permissions.forEach((p) => {
        const key = typeof p === 'string' ? p : p.key;
        perms.permissions[key] = true;
      });
    }
    return perms;
  }
  const perms = {};
  for (const { action, action_key: key } of rows) {
    if (action === 'module_key' && key) {
      perms[key] = true;
    } else if (action === 'button' && key) {
      (perms.buttons ||= {})[key] = true;
    } else if (action === 'function' && key) {
      (perms.functions ||= {})[key] = true;
    } else if (action === 'API' && key) {
      (perms.api ||= {})[key] = true;
    } else if (action === 'permission' && key) {
      (perms.permissions ||= {})[key] = true;
    }
  }
  return perms;
}

export async function listActionGroups(companyId = GLOBAL_COMPANY_ID) {
  const registry = await loadPermissionRegistry(companyId);
  const groups = {
    modules: new Set(Object.keys(registry.forms || {})),
    buttons: new Set(),
    functions: new Set(),
    api: new Set(),
    permissions: new Set(),
  };
  const forms = registry.forms || {};
  for (const form of Object.values(forms)) {
    form.buttons?.forEach((b) => {
      const key = typeof b === 'string' ? b : b.key;
      if (key) groups.buttons.add(key);
    });
    form.functions?.forEach((f) => {
      const key = typeof f === 'string' ? f : f.key;
      if (key) groups.functions.add(key);
    });
    form.api?.forEach((a) => {
      const key = typeof a === 'string' ? a : a.key;
      if (key) groups.api.add(key);
    });
  }
  const perms = registry.permissions || [];
  perms.forEach((p) => {
    const key = typeof p === 'string' ? p : p.key;
    if (key) groups.permissions.add(key);
  });
  return {
    modules: Array.from(groups.modules),
    buttons: Array.from(groups.buttons),
    functions: Array.from(groups.functions),
    api: Array.from(groups.api),
    permissions: Array.from(groups.permissions),
  };
}

export async function setUserLevelActions(
  userLevelId,
  { modules = [], buttons = [], functions = [], api = [], permissions = [] },
  companyId = GLOBAL_COMPANY_ID,
) {
  await pool.query(
    'DELETE FROM user_level_permissions WHERE userlevel_id = ? AND action IS NOT NULL AND company_id = ?',
    [userLevelId, companyId],
  );
  const values = [];
  const params = [];
  for (const m of modules) {
    values.push(`(${companyId}, ?,'module_key',?)`);
    params.push(userLevelId, m);
  }
  for (const b of buttons) {
    values.push(`(${companyId}, ?,'button',?)`);
    params.push(userLevelId, b);
  }
  for (const f of functions) {
    values.push(`(${companyId}, ?,'function',?)`);
    params.push(userLevelId, f);
  }
  for (const a of api) {
    values.push(`(${companyId}, ?,'API',?)`);
    params.push(userLevelId, a);
  }
  for (const p of permissions) {
    values.push(`(${companyId}, ?,'permission',?)`);
    params.push(userLevelId, p);
  }
  if (values.length) {
    const sql =
      'INSERT INTO user_level_permissions (company_id, userlevel_id, action, action_key) VALUES ' +
      values.join(',');
    await pool.query(sql, params);
  }
}

export async function populateMissingPermissions(
  allow = false,
  extraPermissions = [],
  companyId = GLOBAL_COMPANY_ID,
) {
  if (!allow) return;
  const registry = await loadPermissionRegistry(companyId);
  const actions = [];
  const [mods] = await pool.query('SELECT module_key FROM modules');
  for (const { module_key } of mods) actions.push(['module_key', module_key]);
  const forms = registry.forms || {};
  for (const form of Object.values(forms)) {
    form.buttons?.forEach((b) => {
      const key = typeof b === 'string' ? b : b.key;
      actions.push(['button', key]);
    });
    form.functions?.forEach((f) => actions.push(['function', f]));
    form.api?.forEach((a) => {
      const key = typeof a === 'string' ? a : a.key;
      actions.push(['API', key]);
    });
  }
  const perms = [...(registry.permissions || []), ...extraPermissions];
  for (const p of perms) {
    const key = typeof p === 'string' ? p : p.key;
    actions.push(['permission', key]);
  }
  for (const [action, key] of actions) {
    await pool.query(
      `INSERT INTO user_level_permissions (company_id, userlevel_id, action, action_key)
       SELECT ${GLOBAL_COMPANY_ID}, ul.userlevel_id, ?, ?
         FROM user_levels ul
         WHERE ul.userlevel_id <> 1
           AND NOT EXISTS (
             SELECT 1 FROM user_level_permissions up
              WHERE up.userlevel_id = ul.userlevel_id
                AND up.action = ?
                AND up.action_key = ?
                AND up.company_id = ${GLOBAL_COMPANY_ID}
           )`,
      [action, key, action, key],
    );
  }
}

/**
 * List all users
 */
export async function listUsers() {
  const [rows] = await pool.query(
    `SELECT u.id, u.empid, e.employment_position_id AS position_id, u.created_at
       FROM users u
       LEFT JOIN (
         SELECT t1.employment_company_id, t1.employment_emp_id, t1.employment_position_id
           FROM tbl_employment t1
           JOIN (
             SELECT employment_company_id, employment_emp_id, MAX(id) AS max_id
               FROM tbl_employment
               GROUP BY employment_company_id, employment_emp_id
           ) t2 ON t1.employment_company_id = t2.employment_company_id
                AND t1.employment_emp_id = t2.employment_emp_id
                AND t1.id = t2.max_id
       ) e ON u.company_id = e.employment_company_id AND u.empid = e.employment_emp_id`,
  );
  return rows;
}

export async function listUsersByCompany(companyId) {
  const [rows] = await pool.query(
    `SELECT id, empid, created_at
       FROM users
      WHERE company_id = ?`,
    [companyId],
  );
  return rows;
}

/**
 * Get a single user by ID
 */
export async function getUserById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM users WHERE id = ?`,
    [id],
  );
  return rows[0] || null;
}

/**
 * Create a new user
 */
export async function createUser({
  empid,
  password,
  created_by,
}) {
  const hashed = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    "INSERT INTO users (empid, password, created_by) VALUES (?, ?, ?)",
    [empid, hashed, created_by],
  );
  return { id: result.insertId };
}

/**
 * Update an existing user
 */
export async function updateUser(id) {
  return { id };
}

export async function updateUserPassword(id, hashedPassword, updatedBy) {
  await pool.query(
    "UPDATE users SET password = ?, updated_by = ?, updated_at = NOW() WHERE id = ?",
    [hashedPassword, updatedBy, id],
  );
  return { id };
}

/**
 * Delete a user by ID
 */
export async function deleteUserById(id, deletedBy = null) {
  return deleteTableRow('users', id, null, undefined, deletedBy);
}

/**
 * Assign a user to a company with a specific role
 */

/**
 * List all companies
 */
export async function listCompanies(createdBy = null) {
  let sql = 'SELECT * FROM companies';
  const params = [];
  if (createdBy) {
    sql += ' WHERE created_by = ?';
    params.push(createdBy);
  }
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Fetch report data by report ID
 */
export async function fetchReportData(reportId, params = {}) {
  const [rows] = await pool.query(
    "SELECT * FROM report_data WHERE report_id = ?",
    [reportId],
  );
  return rows;
}

/**
 * Get application settings
 */
export async function getSettings() {
  const [rows] = await pool.query("SELECT * FROM settings LIMIT 1");
  return rows[0] || {};
}

/**
 * Update application settings
 */
export async function updateSettings(updates, updatedBy) {
  const keys = Object.keys(updates);
  const values = Object.values(updates);
  const setClause = keys.map((k) => `\`${k}\` = ?`).join(", ");
  await pool.query(
    `UPDATE settings SET ${setClause}, updated_by = ?, updated_at = NOW()`,
    [...values, updatedBy],
  );
  return getSettings();
}

/**
 * Get tenant-specific feature flags
 */
export async function getTenantFlags(companyId) {
  const [rows] = await pool.query(
    "SELECT flag_key, flag_value FROM tenant_feature_flags WHERE company_id = ?",
    [companyId],
  );
  return rows.reduce((acc, { flag_key, flag_value }) => {
    acc[flag_key] = Boolean(flag_value);
    return acc;
  }, {});
}

/**
 * Update tenant-specific feature flags
 */
export async function setTenantFlags(companyId, flags, empid = null) {
  const now = formatDateForDb(new Date());
  for (const [key, value] of Object.entries(flags)) {
    await pool.query(
      "INSERT INTO tenant_feature_flags (company_id, flag_key, flag_value, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE flag_value = VALUES(flag_value), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)",
      [companyId, key, value ? 1 : 0, empid, now],
    );
  }
  return getTenantFlags(companyId);
}

/**
 * List available modules for a user level within a company.
 * Only modules that are both licensed for the company and permitted for the
 * user level are returned.
 */
export async function listModules(userLevelId, companyId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT m.module_key, m.label, m.parent_key, m.show_in_sidebar, m.show_in_header
       FROM modules m
       JOIN company_module_licenses cml
         ON cml.module_key = m.module_key
        AND cml.company_id IN (${GLOBAL_COMPANY_ID}, ?)
        AND cml.licensed = 1
       JOIN user_level_permissions up
         ON up.action_key = m.module_key
        AND up.action = 'module_key'
        AND up.userlevel_id = ?
        AND up.company_id IN (${GLOBAL_COMPANY_ID}, ?)
      ORDER BY m.module_key`,
    [companyId, userLevelId, companyId],
  );
  return rows;
}

export async function upsertModule(
  moduleKey,
  label,
  parentKey = null,
  showInSidebar = true,
  showInHeader = false,
  empid = null,
) {
  logDb(
    `upsertModule ${moduleKey} label=${label} parent=${parentKey} sidebar=${showInSidebar} header=${showInHeader}`,
  );
  const now = formatDateForDb(new Date());
  await pool.query(
    `INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header, created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       parent_key = VALUES(parent_key),
       show_in_sidebar = VALUES(show_in_sidebar),
       show_in_header = VALUES(show_in_header),
       updated_by = VALUES(updated_by),
       updated_at = VALUES(updated_at)`,
    [
      moduleKey,
      label,
      parentKey,
      showInSidebar ? 1 : 0,
      showInHeader ? 1 : 0,
      empid,
      empid,
      now,
    ],
  );
  await pool.query(
    `INSERT INTO user_level_permissions (company_id, userlevel_id, action, action_key)
     SELECT ${GLOBAL_COMPANY_ID}, ul.userlevel_id, 'module_key', ?
       FROM user_levels ul
       WHERE NOT EXISTS (
         SELECT 1 FROM user_level_permissions up
          WHERE up.userlevel_id = ul.userlevel_id
            AND up.action = 'module_key'
            AND up.action_key = ?
            AND up.company_id = ${GLOBAL_COMPANY_ID}
       )`,
    [moduleKey, moduleKey],
  );
  return { moduleKey, label, parentKey, showInSidebar, showInHeader };
}

export async function deleteModule(moduleKey, deletedBy = null) {
  logDb(`deleteModule ${moduleKey}`);
  const result = await deleteTableRow(
    'modules',
    moduleKey,
    null,
    undefined,
    deletedBy,
  );
  return { moduleKey: result?.module_key ?? moduleKey };
}
export async function populateDefaultModules(createdBy = null) {
  for (const m of defaultModules) {
    await upsertModule(
      m.moduleKey,
      m.label,
      m.parentKey,
      m.showInSidebar,
      m.showInHeader,
      createdBy,
    );
  }
}


export async function populateCompanyModuleLicenses(createdBy) {
  await pool.query(
    `INSERT IGNORE INTO company_module_licenses (company_id, module_key, licensed, created_by)
     SELECT c.id AS company_id, m.module_key, 1, ?
       FROM companies c
       CROSS JOIN modules m
       WHERE c.created_by = ?`,
    [createdBy, createdBy],
  );
}

export async function populateUserLevelModulePermissions(createdBy) {
  await pool.query(
    `INSERT INTO user_level_permissions (company_id, userlevel_id, action, action_key, created_by)
     SELECT ${GLOBAL_COMPANY_ID}, ul.userlevel_id, 'module_key', m.module_key, ?
       FROM user_levels ul
       CROSS JOIN modules m
       WHERE m.module_key NOT LIKE 'transactions\\_%'
     ON DUPLICATE KEY UPDATE action = VALUES(action), updated_by = VALUES(created_by), updated_at = NOW()`,
    [createdBy],
  );
}

export async function deleteUserLevelPermissionsForCompany(
  companyId,
  conn = pool,
) {
  if (companyId === undefined || companyId === null) {
    return;
  }
  logDb(
    `deleteUserLevelPermissionsForCompany companyId=${String(companyId)}`,
  );
  await conn.query(
    'DELETE FROM user_level_permissions WHERE company_id = ?',
    [companyId],
  );
}

/**
 * List module licenses for a company. If companyId is omitted, list for all
 * companies. Results can optionally be filtered by the employee who created
 * the company.
 */
export async function listCompanyModuleLicenses(companyId, createdBy = null) {
  const params = [];
  const clauses = [];
  if (companyId != null) {
    clauses.push('c.id = ?');
    params.push(companyId);
  }
  if (createdBy != null) {
    clauses.push('c.created_by = ?');
    params.push(createdBy);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT c.id AS company_id, c.name AS company_name, m.module_key, m.label,
            COALESCE(cml.licensed, 0) AS licensed
       FROM companies c
       CROSS JOIN modules m
       LEFT JOIN company_module_licenses cml
         ON cml.company_id = c.id AND cml.module_key = m.module_key
       ${where}
       ORDER BY c.id, m.module_key`,
    params,
  );
  return rows;
}

/**
 * Set a company's module license flag
 */
export async function setCompanyModuleLicense(
  companyId,
  moduleKey,
  licensed,
  actor = null,
) {
  await pool.query(
    `INSERT INTO company_module_licenses (company_id, module_key, licensed, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       licensed = VALUES(licensed),
       updated_by = VALUES(updated_by)`,
    [companyId, moduleKey, licensed ? 1 : 0, actor, actor],
  );
  return { companyId, moduleKey, licensed: !!licensed };
}

/**
 * List all database tables (for dev tools)
 */
export async function listDatabaseTables() {
  const [rows] = await pool.query('SHOW TABLES');
  return rows.map((r) => Object.values(r)[0]);
}

export async function listDatabaseViews(prefix = '') {
  const [rows] = await pool.query(
    "SHOW FULL TABLES WHERE TABLE_TYPE = 'VIEW'",
  );
  return rows
    .map((r) => Object.values(r)[0])
    .filter(
      (n) =>
        typeof n === 'string' &&
        (!prefix || n.toLowerCase().includes(prefix.toLowerCase())),
    );
}

export async function getViewSql(name) {
  if (!name) return null;
  try {
    const [rows] = await pool.query('SHOW CREATE VIEW ??', [name]);
    const text = rows?.[0]?.['Create View'];
    if (text) return text;
  } catch {}
  try {
    const [rows] = await pool.query(
      `SELECT VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [name],
    );
    return rows?.[0]?.VIEW_DEFINITION || null;
  } catch {
    return null;
  }
}

export async function deleteView(name) {
  if (!name) return;
  await adminPool.query(`DROP VIEW IF EXISTS \`${name}\``);
}

export async function listTableColumns(tableName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [tableName],
  );
  return rows.map((r) => r.COLUMN_NAME);
}

export async function listTableColumnsDetailed(tableName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [tableName],
  );
  return rows.map((r) => ({
    name: r.COLUMN_NAME,
    type: r.DATA_TYPE,
    columnType: r.COLUMN_TYPE,
    maxLength:
      r.CHARACTER_MAXIMUM_LENGTH != null
        ? Number(r.CHARACTER_MAXIMUM_LENGTH)
        : null,
    numericPrecision:
      r.NUMERIC_PRECISION != null ? Number(r.NUMERIC_PRECISION) : null,
    numericScale: r.NUMERIC_SCALE != null ? Number(r.NUMERIC_SCALE) : null,
    enumValues: /^enum\(/i.test(r.COLUMN_TYPE)
      ? r.COLUMN_TYPE
          .slice(5, -1)
          .split(',')
          .map((v) => v.trim().slice(1, -1))
      : [],
  }));
}

export async function listTenantTables() {
  try {
    const [rows] = await pool.query(
      `SELECT table_name, is_shared, seed_on_create FROM tenant_tables`,
    );
    return rows.map((r) => ({
      tableName: r.table_name,
      isShared: !!r.is_shared,
      seedOnCreate: !!r.seed_on_create,
    }));
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

export async function listAllTenantTableOptions() {
  const [tables, tenantFlags] = await Promise.all([
    listDatabaseTables(),
    listTenantTables(),
  ]);
  const flagMap = new Map(tenantFlags.map((t) => [t.tableName, t]));
  return tables.map((tableName) => {
    const info = flagMap.get(tableName) || {};
    return {
      tableName,
      isShared: info.isShared ?? false,
      seedOnCreate: info.seedOnCreate ?? false,
    };
  });
}

export async function upsertTenantTable(
  tableName,
  isShared = 0,
  seedOnCreate = 0,
  createdBy = null,
  updatedBy = null,
) {
  const userId = createdBy ?? updatedBy;
  const sharedFlag = !!isShared;
  const seedFlag = !!seedOnCreate;
  if (sharedFlag && seedFlag) {
    const err = new Error(
      'Shared tables always read from tenant key 0, so they cannot participate in per-company seeding.',
    );
    err.status = 400;
    throw err;
  }
  await pool.query(
    `INSERT INTO tenant_tables (table_name, is_shared, seed_on_create, created_by, created_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       is_shared = VALUES(is_shared),
       seed_on_create = VALUES(seed_on_create),
       updated_by = VALUES(created_by),
       updated_at = NOW()`,
    [tableName, sharedFlag ? 1 : 0, seedFlag ? 1 : 0, userId],
  );
  return { tableName, isShared: sharedFlag, seedOnCreate: seedFlag };
}

export async function getTenantTableFlags(tableName) {
  try {
    const [rows] = await pool.query(
      `SELECT is_shared, seed_on_create FROM tenant_tables WHERE table_name = ?`,
      [tableName],
    );
    if (rows.length === 0) return null;
    return {
      isShared: !!rows[0].is_shared,
      seedOnCreate: !!rows[0].seed_on_create,
    };
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return null;
    throw err;
  }
}

export async function getTenantTable(tableName, companyId = GLOBAL_COMPANY_ID) {
  if (!tableName) return null;
  const [columns, flags, keyConfig] = await Promise.all([
    listTableColumns(tableName),
    getTenantTableFlags(tableName),
    loadTenantTableKeyConfig(companyId),
  ]);
  if (!Array.isArray(columns) || columns.length === 0) {
    return null;
  }
  const columnMap = new Map();
  for (const col of columns) {
    const key = String(col || '').toLowerCase();
    if (!key) continue;
    columnMap.set(key, col);
  }

  let tenantKeys = [];
  const override = keyConfig?.[tableName];
  if (Array.isArray(override)) {
    tenantKeys = override
      .map((key) => columnMap.get(String(key || '').toLowerCase()))
      .filter(Boolean);
  }

  if (tenantKeys.length === 0) {
    for (const { aliases } of DEFAULT_TENANT_KEY_ALIASES) {
      for (const alias of aliases) {
        const actual = columnMap.get(alias.toLowerCase());
        if (actual && !tenantKeys.includes(actual)) {
          tenantKeys.push(actual);
          break;
        }
      }
    }
  }

  return {
    tableName,
    isShared: !!(flags?.isShared),
    tenantKeys,
  };
}

export async function seedTenantTables(
  companyId,
  selectedTables = null,
  recordMap = {},
  overwrite = false,
  createdBy = null,
  updatedBy = createdBy,
  backupOptions = {},
) {
  let tables;
  const summary = {};
  const normalizedRecordMap =
    recordMap && typeof recordMap === 'object' && !Array.isArray(recordMap)
      ? recordMap
      : {};
  const tenantKeyOverrides = await loadTenantTableKeyConfig(companyId);
  if (Array.isArray(selectedTables)) {
    if (selectedTables.length === 0) {
      return { summary, backup: null };
    }
    const placeholders = selectedTables.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT table_name, is_shared FROM tenant_tables WHERE seed_on_create = 1 AND table_name IN (${placeholders})`,
      selectedTables,
    );
    const valid = new Set(rows.map((r) => r.table_name));
    const invalid = selectedTables.filter((t) => !valid.has(t));
    if (invalid.length > 0) {
      throw new Error(`Invalid seed tables: ${invalid.join(', ')}`);
    }
    tables = rows;
  } else {
    const [rows] = await pool.query(
      `SELECT table_name, is_shared FROM tenant_tables WHERE seed_on_create = 1`,
    );
    tables = rows;
  }
  const processedTables = [];
  for (const { table_name, is_shared } of tables || []) {
    if (is_shared) continue;
    const tableSummary = { count: 0 };
    summary[table_name] = tableSummary;
    const meta = await listTableColumnMeta(table_name);
    const columns = meta.map((c) => c.name);
    tableColumnsCache.set(table_name, columns);
    const softDeleteColumn = await getSoftDeleteColumn(table_name, companyId);
    let countSql = 'SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?';
    const countParams = [table_name, companyId];
    if (softDeleteColumn) {
      const identifier = escapeIdentifier(softDeleteColumn);
      const normalizedIdentifier = `LOWER(${identifier})`;
      const activeMarkers = [
        '0',
        'n',
        'no',
        'false',
        'f',
        '0000-00-00 00:00:00',
        '0000-00-00',
      ];
      const markerPlaceholders = activeMarkers.map(() => '?').join(', ');
      countSql += ` AND (${identifier} IS NULL OR ${identifier} IN (0,'')`;
      if (markerPlaceholders) {
        countSql += ` OR ${normalizedIdentifier} IN (${markerPlaceholders})`;
        countParams.push(...activeMarkers);
      }
      countSql += ')';
    }
    const [[{ cnt }]] = await pool.query(countSql, countParams);
    const existingCount = Number(cnt) || 0;
    if (existingCount > 0 && !overwrite) {
      const err = new Error(`Table ${table_name} already contains data`);
      err.status = 400;
      throw err;
    }
    const otherCols = meta
      .filter(
        (c) =>
          c.name !== 'company_id' &&
          !/auto_increment/i.test(c.extra),
      )
      .map((c) => c.name);

    const records = normalizedRecordMap?.[table_name];
    const pkCols = meta.filter((m) => m.key === 'PRI').map((m) => m.name);
    const columnLookup = new Map();
    for (const col of meta) {
      const normalized = String(col?.name || '').toLowerCase();
      if (!normalized) continue;
      columnLookup.set(normalized, col.name);
    }
    let tenantKeys = [];
    const override = tenantKeyOverrides?.[table_name];
    if (Array.isArray(override)) {
      tenantKeys = override
        .map((key) => columnLookup.get(String(key || '').toLowerCase()))
        .filter(Boolean);
    }
    if (tenantKeys.length === 0) {
      for (const { aliases } of DEFAULT_TENANT_KEY_ALIASES) {
        for (const alias of aliases) {
          const actual = columnLookup.get(alias.toLowerCase());
          if (actual && !tenantKeys.includes(actual)) {
            tenantKeys.push(actual);
            break;
          }
        }
      }
    }
    const manualRecords =
      Array.isArray(records) &&
      records.length > 0 &&
      typeof records[0] === 'object' &&
      records[0] !== null
        ? records
        : null;
    const ids = manualRecords ? [] : Array.isArray(records) ? records : [];

    processedTables.push({
      tableName: table_name,
      tableSummary,
      columns,
      otherCols,
      pkCols,
      tenantKeys,
      manualRecords,
      ids,
      existingCount,
      softDeleteColumn,
    });
  }

  let backupMetadata = null;
  const backupRequestedBy =
    backupOptions?.requestedBy !== undefined && backupOptions?.requestedBy !== null
      ? backupOptions.requestedBy
      : createdBy ?? null;
  const shouldBackup =
    overwrite && processedTables.some((info) => Number(info.existingCount) > 0);
  if (shouldBackup) {
    backupMetadata = await createSeedBackupForCompany(companyId, processedTables, {
      backupName: backupOptions?.backupName ?? '',
      originalBackupName:
        backupOptions?.originalBackupName ?? backupOptions?.backupName ?? '',
      requestedBy: backupRequestedBy,
    });
  }

  for (const info of processedTables) {
    const {
      tableName,
      tableSummary,
      columns,
      otherCols,
      pkCols,
      tenantKeys,
      manualRecords,
      ids,
      existingCount,
      softDeleteColumn,
    } = info;

    if (existingCount > 0) {
      const { clause, params: softParams, supported } =
        buildSoftDeleteUpdateClause(
          columns,
          softDeleteColumn,
          updatedBy ?? createdBy ?? null,
        );
      if (!supported) {
        logDb(
          `seedTenantTables abort: ${tableName} lacks soft delete columns for company ${companyId}`,
        );
        const err = new Error(
          `Table ${tableName} does not support soft delete overwrites`,
        );
        err.status = 400;
        throw err;
      }
      await pool.query(`UPDATE ?? SET ${clause} WHERE company_id = ?`, [
        tableName,
        ...softParams,
        companyId,
      ]);
    }

    if (manualRecords) {
      const insertedIds = [];
      for (const row of manualRecords) {
        const rowCols = Object.keys(row).filter((c) => c !== 'company_id');
        await ensureValidColumns(tableName, columns, rowCols);
        const colNames = ['company_id', ...rowCols];
        const colsClause = colNames.map((c) => `\`${c}\``).join(', ');
        const placeholders = colNames.map(() => '?').join(', ');
        const { clause: upsertClause, params: upsertParams } =
          buildSeedUpsertUpdateClause(columns, colNames, softDeleteColumn, {
            updatedByFallback: updatedBy ?? createdBy ?? null,
          });
        const params = [
          tableName,
          ...colNames.map((c) => (c === 'company_id' ? companyId : row[c])),
          ...upsertParams,
        ];
        const [result] = await pool.query(
          `INSERT INTO ?? (${colsClause}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${upsertClause}`,
          params,
        );
        const inserted = Number(result?.affectedRows);
        tableSummary.count += Number.isFinite(inserted) ? inserted : 1;
        if (pkCols.length === 1) {
          const pk = pkCols[0];
          if (row[pk] !== undefined && row[pk] !== null) {
            insertedIds.push(row[pk]);
          } else {
            const insId = Number(result?.insertId);
            if (Number.isFinite(insId) && insId > 0) {
              insertedIds.push(insId);
            }
          }
        } else if (pkCols.length > 1) {
          const composite = {};
          let hasAll = true;
          for (const pk of pkCols) {
            if (row[pk] === undefined) {
              hasAll = false;
              break;
            }
            composite[pk] = row[pk];
          }
          if (hasAll) {
            insertedIds.push(composite);
          }
        }
      }
      if (insertedIds.length > 0) {
        tableSummary.ids = insertedIds;
      }
      continue;
    }

    const colsClause = ['company_id', ...otherCols]
      .map((c) => `\`${c}\``)
      .join(', ');
    const sourceAlias = 'src';
    const companyIdIdentifier = escapeIdentifier('company_id');
    const selectParts = ['? AS company_id'];
    const params = [tableName, companyId];
    for (const col of otherCols) {
      const colIdentifier = escapeIdentifier(col);
      if (col === 'created_by') {
        selectParts.push('?');
        params.push(createdBy);
      } else if (col === 'updated_by') {
        selectParts.push('?');
        params.push(updatedBy ?? createdBy);
      } else if (col === 'created_at' || col === 'updated_at') {
        selectParts.push('NOW()');
      } else {
        selectParts.push(`${sourceAlias}.${colIdentifier}`);
      }
    }
    const selectClause = selectParts.join(', ');
    let sql =
      `INSERT INTO ?? (${colsClause}) SELECT ${selectClause} FROM ?? AS ${sourceAlias} WHERE ${sourceAlias}.${companyIdIdentifier} = ${GLOBAL_COMPANY_ID}`;
    params.push(tableName);

    const idList = Array.isArray(ids) ? ids : [];
    let idFilterColumn = null;
    let idFilterValues = [];
    if (idList.length > 0 && Array.isArray(pkCols) && pkCols.length > 0) {
      const tenantKeySet = new Set(
        (Array.isArray(tenantKeys) ? tenantKeys : []).map((key) =>
          String(key || '').toLowerCase(),
        ),
      );
      const primitiveIds = [];
      const structuredIds = [];
      for (const rawId of idList) {
        if (rawId && typeof rawId === 'object' && !Array.isArray(rawId)) {
          structuredIds.push(rawId);
        } else if (rawId !== undefined && rawId !== null) {
          primitiveIds.push(rawId);
        }
      }
      const getValuesForColumn = (column) => {
        const normalized = String(column || '').toLowerCase();
        if (primitiveIds.length > 0) {
          return [...primitiveIds];
        }
        if (structuredIds.length > 0) {
          const values = [];
          for (const obj of structuredIds) {
            const matchKey = Object.keys(obj || {}).find(
              (key) => String(key || '').toLowerCase() === normalized,
            );
            if (matchKey) {
              const value = obj[matchKey];
              if (value !== undefined && value !== null) {
                values.push(value);
              }
            }
          }
          return values;
        }
        return [];
      };
      const tryColumns = (candidates) => {
        for (const pk of candidates) {
          const values = getValuesForColumn(pk);
          if (values.length > 0) {
            idFilterColumn = pk;
            idFilterValues = values;
            return true;
          }
        }
        return false;
      };
      const nonTenantColumns = pkCols.filter(
        (pk) => !tenantKeySet.has(String(pk || '').toLowerCase()),
      );
      if (!tryColumns(nonTenantColumns)) {
        const nonCompanyColumns = pkCols.filter(
          (pk) => String(pk || '').toLowerCase() !== 'company_id',
        );
        if (!tryColumns(nonCompanyColumns)) {
          tryColumns(pkCols);
        }
      }
    }
    if (idList.length > 0 && idFilterColumn && idFilterValues.length > 0) {
      const placeholders = idFilterValues.map(() => '?').join(', ');
      sql += ` AND ${sourceAlias}.${escapeIdentifier(idFilterColumn)} IN (${placeholders})`;
      params.push(...idFilterValues);
    }

    const { clause: upsertClause, params: upsertParams } =
      buildSeedUpsertUpdateClause(
        columns,
        ['company_id', ...otherCols],
        softDeleteColumn,
        { updatedByFallback: updatedBy ?? createdBy ?? null },
      );
    sql += ` ON DUPLICATE KEY UPDATE ${upsertClause}`;
    params.push(...upsertParams);

    const [result] = await pool.query(sql, params);
    const inserted = Number(result?.affectedRows);
    if (Number.isFinite(inserted)) {
      tableSummary.count += inserted;
    }
    if (idList.length > 0) {
      const summaryIds =
        idFilterColumn && idFilterValues.length > 0 ? idFilterValues : idList;
      if (summaryIds.length > 0) {
        tableSummary.ids = [...summaryIds];
      }
    }
  }

  await pool.query(
    `INSERT INTO user_level_permissions (company_id, userlevel_id, action, action_key, created_by, created_at)
     SELECT ?, userlevel_id, action, action_key, ?, NOW()
       FROM user_level_permissions
       WHERE company_id = ${GLOBAL_COMPANY_ID}
     ON DUPLICATE KEY UPDATE action = VALUES(action)`,
    [companyId, createdBy],
  );

  return { summary, backup: backupMetadata };
}

export async function seedDefaultsForSeedTables(userId, { preview = false } = {}) {
  const [rows] = await pool.query(
    `SELECT table_name FROM tenant_tables WHERE seed_on_create = 1`,
  );
  const tableInfos = [];
  const conflicts = [];
  for (const { table_name } of rows) {
    const tableName = table_name;
    const cols = await getTableColumnsSafe(tableName);
    const lowerCols = cols.map((c) => String(c).toLowerCase());
    if (lowerCols.includes("company_id")) {
      const [tenantRows] = await pool.query(
        `SELECT company_id AS companyId, COUNT(*) AS rowCount
           FROM ??
          WHERE company_id IS NOT NULL AND company_id <> ?
          GROUP BY company_id`,
        [tableName, GLOBAL_COMPANY_ID],
      );
      const companies = (tenantRows || [])
        .map((row) => {
          const rawId =
            row?.companyId ??
            row?.company_id ??
            row?.companyID ??
            row?.company;
          if (rawId === null || rawId === undefined || rawId === '') return null;
          const rows = Number(row?.rowCount ?? row?.count ?? 0);
          if (!Number.isFinite(rows) || rows <= 0) return null;
          return { companyId: String(rawId), rows };
        })
        .filter(Boolean);
      const totalRows = companies.reduce((sum, info) => sum + info.rows, 0);
      if (totalRows > 0) {
        conflicts.push({
          table: tableName,
          rows: totalRows,
          companies,
        });
      }
    }
    tableInfos.push({ tableName, cols, lowerCols });
  }

  if (conflicts.length > 0) {
    const err = new Error(
      "Cannot populate defaults because tenant data exists in seed tables.",
    );
    err.status = 409;
    err.conflicts = conflicts;
    throw err;
  }

  if (preview) {
    return { tables: tableInfos.map((info) => info.tableName) };
  }

  for (const { tableName, cols, lowerCols } of tableInfos) {
    if (!lowerCols.includes("company_id")) continue;
    const sets = ["company_id = ?"];
    const params = [tableName, GLOBAL_COMPANY_ID];
    if (lowerCols.includes("updated_by")) {
      sets.push("updated_by = ?");
      params.push(userId);
    }
    if (lowerCols.includes("updated_at")) {
      sets.push("updated_at = NOW()");
    }
    params.push(GLOBAL_COMPANY_ID);
    await pool.query(
      `UPDATE ?? SET ${sets.join(", ")} WHERE company_id = ?`,
      params,
    );
  }
}

function sanitizeExportName(name) {
  if (!name && name !== 0) return '';
  const normalized = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized;
}

function formatExportTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

const TENANT_DEFAULT_SNAPSHOT_DIR = path.join('defaults');
const TENANT_SEED_BACKUP_DIR = path.join('defaults', 'seed-backups');
const TENANT_SEED_BACKUP_CATALOG = path.join(
  TENANT_SEED_BACKUP_DIR,
  'index.json',
);
const TENANT_DATA_BACKUP_DIR = path.join('backups', 'full-data');
const TENANT_DATA_BACKUP_CATALOG = path.join(
  TENANT_DATA_BACKUP_DIR,
  'index.json',
);

function sanitizeSnapshotFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    const err = new Error('fileName is required');
    err.status = 400;
    throw err;
  }
  const trimmed = fileName.trim();
  if (!trimmed) {
    const err = new Error('fileName is required');
    err.status = 400;
    throw err;
  }
  const base = path.basename(trimmed);
  if (base !== trimmed || base.includes('..')) {
    const err = new Error('Invalid snapshot name');
    err.status = 400;
    throw err;
  }
  if (!/\.sql$/i.test(base)) {
    const err = new Error('Snapshot must be a .sql file');
    err.status = 400;
    throw err;
  }
  return base;
}

function stripSnapshotComments(sql) {
  const lines = sql.split(/\r?\n/);
  const cleaned = [];
  let inBlock = false;
  for (const rawLine of lines) {
    let line = rawLine;
    if (inBlock) {
      const endIdx = line.indexOf('*/');
      if (endIdx === -1) {
        continue;
      }
      line = line.slice(endIdx + 2);
      inBlock = false;
    }
    while (true) {
      const startIdx = line.indexOf('/*');
      if (startIdx === -1) break;
      const endIdx = line.indexOf('*/', startIdx + 2);
      if (endIdx === -1) {
        line = line.slice(0, startIdx);
        inBlock = true;
        break;
      }
      line = line.slice(0, startIdx) + line.slice(endIdx + 2);
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('--') || trimmed.startsWith('#')) continue;
    cleaned.push(line);
  }
  return cleaned.join('\n');
}

function splitSnapshotStatements(sqlText) {
  const sanitized = stripSnapshotComments(sqlText);
  const statements = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < sanitized.length; i += 1) {
    const char = sanitized[i];
    const next = sanitized[i + 1];
    current += char;
    if (char === '\\') {
      if (next !== undefined) {
        current += next;
        i += 1;
      }
      continue;
    }
    if (!inDouble && !inBacktick && char === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inBacktick && char === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === '`') {
      inBacktick = !inBacktick;
      continue;
    }
    if (char === ';' && !inSingle && !inDouble && !inBacktick) {
      const trimmed = current.slice(0, -1).trim();
      if (trimmed) statements.push(trimmed);
      current = '';
    }
  }
  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return statements;
}

function splitTopLevel(str, delimiter = ',') {
  const parts = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < str.length; i += 1) {
    const char = str[i];
    const next = str[i + 1];
    if (char === '\\') {
      current += char;
      if (next !== undefined) {
        current += next;
        i += 1;
      }
      continue;
    }
    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      current += char;
      continue;
    }
    if (!inSingle && char === '"') {
      inDouble = !inDouble;
      current += char;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (char === '(') {
        depth += 1;
        current += char;
        continue;
      }
      if (char === ')') {
        depth = Math.max(0, depth - 1);
        current += char;
        continue;
      }
      if (char === delimiter && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function parseTenantSnapshotSql(sql) {
  const lines = sql.split(/\r?\n/);
  let versionName = null;
  let generatedAtRaw = null;
  let requestedBy = null;
  const tables = new Map();

  const ensureTable = (name) => {
    if (!tables.has(name)) {
      tables.set(name, {
        tableName: name,
        deleteStatements: 0,
        insertStatements: 0,
      });
    }
    return tables.get(name);
  };

  let currentTable = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const versionMatch = line.match(/^--\s*Version:\s*(.+)$/i);
    if (versionMatch) {
      versionName = versionMatch[1].trim() || versionName;
      continue;
    }
    const generatedMatch = line.match(/^--\s*Generated at:\s*(.+)$/i);
    if (generatedMatch) {
      generatedAtRaw = generatedMatch[1].trim() || generatedAtRaw;
      continue;
    }
    const requestedMatch = line.match(/^--\s*Requested by:\s*(.+)$/i);
    if (requestedMatch) {
      requestedBy = requestedMatch[1].trim() || requestedBy;
      continue;
    }
    const tableMatch = line.match(/^--\s*Table:\s*(.+)$/i);
    if (tableMatch) {
      const tableName = tableMatch[1].trim();
      currentTable = tableName || null;
      if (currentTable) ensureTable(currentTable);
      continue;
    }
    if (line.startsWith('--') || line.startsWith('#')) {
      continue;
    }
    const deleteMatch = line.match(/^DELETE\s+FROM\s+`?([A-Za-z0-9_]+)`?/i);
    if (deleteMatch) {
      const tableName = deleteMatch[1];
      currentTable = tableName;
      ensureTable(tableName).deleteStatements += 1;
      continue;
    }
    const insertMatch = line.match(/^INSERT\s+INTO\s+`?([A-Za-z0-9_]+)`?/i);
    if (insertMatch) {
      const tableName = insertMatch[1];
      currentTable = tableName;
      ensureTable(tableName).insertStatements += 1;
      continue;
    }
    if (currentTable) {
      ensureTable(currentTable);
    }
  }

  let generatedAt = null;
  if (generatedAtRaw) {
    const parsed = new Date(generatedAtRaw);
    if (!Number.isNaN(parsed.getTime())) {
      generatedAt = parsed.toISOString();
    }
  }

  const tableSummaries = Array.from(tables.values());
  const rowCount = tableSummaries.reduce(
    (sum, info) => sum + (Number(info.insertStatements) || 0),
    0,
  );

  return {
    versionName,
    generatedAt,
    generatedAtRaw,
    requestedBy,
    tableCount: tableSummaries.length,
    rowCount,
    tables: tableSummaries,
  };
}

async function readTenantSnapshotFile(fileName, { includeSql = false } = {}) {
  const safeName = sanitizeSnapshotFileName(fileName);
  const relativePathRaw = path.join(TENANT_DEFAULT_SNAPSHOT_DIR, safeName);
  const relativePath = relativePathRaw.replace(/\\/g, '/');
  const absolutePath = tenantConfigPath(relativePathRaw);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      const notFound = new Error('Snapshot not found');
      notFound.status = 404;
      throw notFound;
    }
    throw err;
  }
  const sql = await fs.readFile(absolutePath, 'utf8');
  const metadata = parseTenantSnapshotSql(sql);
  return {
    fileName: safeName,
    relativePath,
    absolutePath,
    fileSize: stats.size,
    modifiedAt: stats.mtime ? stats.mtime.toISOString() : null,
    createdAt: stats.birthtime ? stats.birthtime.toISOString() : null,
    ...metadata,
    sql: includeSql ? sql : undefined,
  };
}

export async function exportTenantTableDefaults(versionName, requestedBy = null) {
  const safeName = sanitizeExportName(versionName);
  if (!safeName) {
    const err = new Error('A valid export name is required');
    err.status = 400;
    throw err;
  }

  const generatedAt = new Date();
  const timestampPart = formatExportTimestamp(generatedAt);
  const fileName = `${timestampPart}_${safeName}.sql`;
  const relativePathRaw = path.join('defaults', fileName);
  const relativePath = relativePathRaw.replace(/\\/g, '/');
  const filePath = tenantConfigPath(relativePathRaw);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let tableRows;
  try {
    [tableRows] = await pool.query(
      `SELECT table_name
         FROM tenant_tables
        WHERE is_shared = 1 OR seed_on_create = 1
        ORDER BY table_name`,
    );
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      tableRows = [];
    } else {
      throw err;
    }
  }

  const tableNames = Array.from(
    new Set(
      (tableRows || [])
        .map((row) => row?.table_name)
        .filter((name) => typeof name === 'string' && name.trim()),
    ),
  );

  const lines = [];
  lines.push('-- Tenant table defaults export');
  lines.push(`-- Version: ${safeName}`);
  lines.push(`-- Generated at: ${generatedAt.toISOString()}`);
  if (requestedBy !== null && requestedBy !== undefined) {
    lines.push(`-- Requested by: ${requestedBy}`);
  }
  lines.push('');
  lines.push('START TRANSACTION;');

  const tableSummaries = [];
  let exportedTables = 0;
  let totalRows = 0;

  if (tableNames.length === 0) {
    lines.push('-- No tenant tables matched the export criteria.');
  }

  for (const rawName of tableNames) {
    const tableName = String(rawName);
    let columns = [];
    try {
      columns = await listTableColumns(tableName);
    } catch (err) {
      tableSummaries.push({
        tableName,
        rows: 0,
        skipped: true,
        reason: 'column_lookup_failed',
        error: err.message,
      });
      lines.push('');
      lines.push(`-- Skipped ${tableName}: failed to load column metadata (${err.message}).`);
      continue;
    }

    if (!Array.isArray(columns) || columns.length === 0) {
      tableSummaries.push({
        tableName,
        rows: 0,
        skipped: true,
        reason: 'no_columns',
      });
      lines.push('');
      lines.push(`-- Skipped ${tableName}: no columns available.`);
      continue;
    }

    const lowerCols = columns.map((col) => String(col).toLowerCase());
    if (!lowerCols.includes('company_id')) {
      tableSummaries.push({
        tableName,
        rows: 0,
        skipped: true,
        reason: 'missing_company_id',
      });
      lines.push('');
      lines.push(`-- Skipped ${tableName}: company_id column not found.`);
      continue;
    }

    let rows;
    try {
      [rows] = await pool.query('SELECT * FROM ?? WHERE company_id = ?', [
        tableName,
        GLOBAL_COMPANY_ID,
      ]);
    } catch (err) {
      tableSummaries.push({
        tableName,
        rows: 0,
        skipped: true,
        reason: 'row_fetch_failed',
        error: err.message,
      });
      lines.push('');
      lines.push(`-- Skipped ${tableName}: failed to load rows (${err.message}).`);
      continue;
    }

    const normalizedRows = Array.isArray(rows) ? rows : [];
    const rowCount = normalizedRows.length;
    tableSummaries.push({ tableName, rows: rowCount, skipped: false });
    exportedTables += 1;
    totalRows += rowCount;

    lines.push('');
    lines.push(`-- Table: ${tableName}`);
    lines.push(
      `DELETE FROM ${escapeIdentifier(tableName)} WHERE ${escapeIdentifier(
        'company_id',
      )} = ${GLOBAL_COMPANY_ID};`,
    );

    if (rowCount === 0) {
      lines.push('-- No rows to export.');
      continue;
    }

    const columnIdentifiers = columns.map((col) => escapeIdentifier(col));
    for (const row of normalizedRows) {
      const values = columns.map((col) => {
        if (row && Object.prototype.hasOwnProperty.call(row, col)) {
          const val = row[col];
          return mysql.escape(val === undefined ? null : val);
        }
        return 'NULL';
      });
      lines.push(
        `INSERT INTO ${escapeIdentifier(tableName)} (${columnIdentifiers.join(
          ', ',
        )}) VALUES (${values.join(', ')});`,
      );
    }
  }

  lines.push('');
  lines.push('COMMIT;');
  const sql = lines.join('\n');
  await fs.writeFile(filePath, sql, 'utf8');

  return {
    fileName,
    relativePath,
    generatedAt: generatedAt.toISOString(),
    versionName: safeName,
    originalName: versionName,
    tableCount: exportedTables,
    rowCount: totalRows,
    fileSize: Buffer.byteLength(sql, 'utf8'),
    requestedBy: requestedBy ?? null,
    tables: tableSummaries,
    sql,
  };
}

async function readSeedBackupCatalog(companyId) {
  const catalogPathRaw = TENANT_SEED_BACKUP_CATALOG;
  const catalogPath = tenantConfigPath(catalogPathRaw, companyId);
  let entries = [];
  try {
    const raw = await fs.readFile(catalogPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      entries = parsed;
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      throw err;
    }
  }
  return { entries, catalogPath };
}

async function writeSeedBackupCatalog(companyId, entries) {
  const catalogPathRaw = TENANT_SEED_BACKUP_CATALOG;
  const catalogPath = tenantConfigPath(catalogPathRaw, companyId);
  await fs.mkdir(path.dirname(catalogPath), { recursive: true });
  await fs.writeFile(catalogPath, JSON.stringify(entries, null, 2), 'utf8');
  return catalogPath;
}

async function updateSeedBackupCatalog(companyId, entry) {
  const { entries } = await readSeedBackupCatalog(companyId);
  const normalized = Array.isArray(entries) ? entries : [];
  const filtered = normalized.filter((existing) => existing?.fileName !== entry.fileName);
  filtered.unshift(entry);
  await writeSeedBackupCatalog(companyId, filtered);
}

async function readDataBackupCatalog(companyId) {
  const catalogPathRaw = TENANT_DATA_BACKUP_CATALOG;
  const catalogPath = tenantConfigPath(catalogPathRaw, companyId);
  let entries = [];
  try {
    const raw = await fs.readFile(catalogPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      entries = parsed;
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      throw err;
    }
  }
  return { entries, catalogPath };
}

async function writeDataBackupCatalog(companyId, entries) {
  const catalogPathRaw = TENANT_DATA_BACKUP_CATALOG;
  const catalogPath = tenantConfigPath(catalogPathRaw, companyId);
  await fs.mkdir(path.dirname(catalogPath), { recursive: true });
  await fs.writeFile(catalogPath, JSON.stringify(entries, null, 2), 'utf8');
  return catalogPath;
}

async function updateDataBackupCatalog(companyId, entry) {
  const { entries } = await readDataBackupCatalog(companyId);
  const normalized = Array.isArray(entries) ? entries : [];
  const filtered = normalized.filter((existing) => existing?.fileName !== entry.fileName);
  filtered.unshift(entry);
  await writeDataBackupCatalog(companyId, filtered);
}

async function createSeedBackupForCompany(companyId, tableInfos, options = {}) {
  const candidates = (tableInfos || []).filter(
    (info) => info && Number(info.existingCount) > 0,
  );
  if (candidates.length === 0) {
    return null;
  }

  const generatedAt = new Date();
  const safeNameRaw = sanitizeExportName(options.backupName);
  const sanitizedName = safeNameRaw || 'seed-backup';
  const fileSuffix = `company-${companyId}`;
  const baseName = sanitizedName
    ? `${sanitizedName}_${fileSuffix}`
    : fileSuffix;
  const fileName = `${formatExportTimestamp(generatedAt)}_${baseName}.sql`;
  const relativePathRaw = path.join(TENANT_SEED_BACKUP_DIR, fileName);
  const relativePath = relativePathRaw.replace(/\\/g, '/');
  const backupPath = tenantConfigPath(relativePathRaw, companyId);
  await fs.mkdir(path.dirname(backupPath), { recursive: true });

  const lines = [];
  lines.push('-- Tenant seed backup');
  lines.push(`-- Company ID: ${companyId}`);
  const originalName =
    typeof options.originalBackupName === 'string' && options.originalBackupName.trim()
      ? options.originalBackupName.trim()
      : options.backupName && typeof options.backupName === 'string'
      ? options.backupName
      : sanitizedName;
  lines.push(`-- Backup name: ${originalName}`);
  lines.push(`-- Generated at: ${generatedAt.toISOString()}`);
  if (options.requestedBy !== undefined && options.requestedBy !== null) {
    lines.push(`-- Requested by: ${options.requestedBy}`);
  }
  lines.push('');
  lines.push('START TRANSACTION;');

  let totalRows = 0;
  const tableSummaries = [];

  for (const info of candidates) {
    const tableName = info.tableName;
    lines.push('');
    lines.push(`-- Table: ${tableName}`);
    lines.push(
      `DELETE FROM ${escapeIdentifier(tableName)} WHERE ${escapeIdentifier('company_id')} = ${mysql.escape(
        companyId,
      )};`,
    );
    let rows;
    try {
      [rows] = await pool.query('SELECT * FROM ?? WHERE company_id = ?', [
        tableName,
        companyId,
      ]);
    } catch (err) {
      throw new Error(`Failed to load rows for backup from ${tableName}: ${err.message}`);
    }
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const rowCount = normalizedRows.length;
    tableSummaries.push({ tableName, rows: rowCount });
    totalRows += rowCount;
    if (rowCount === 0) {
      lines.push('-- No rows to backup.');
      continue;
    }
    const columns =
      Array.isArray(info.columns) && info.columns.length > 0
        ? info.columns
        : Object.keys(normalizedRows[0] || {});
    const columnIdentifiers = columns.map((col) => escapeIdentifier(col));
    for (const row of normalizedRows) {
      const values = columns.map((col) =>
        row && Object.prototype.hasOwnProperty.call(row, col)
          ? mysql.escape(row[col] === undefined ? null : row[col])
          : 'NULL',
      );
      lines.push(
        `INSERT INTO ${escapeIdentifier(tableName)} (${columnIdentifiers.join(', ')}) VALUES (${values.join(
          ', ',
        )});`,
      );
    }
  }

  lines.push('');
  lines.push('COMMIT;');
  const sql = lines.join('\n');
  await fs.writeFile(backupPath, sql, 'utf8');

  const normalizedCompanyName =
    typeof options.companyName === 'string' && options.companyName.trim()
      ? options.companyName.trim()
      : null;

  const entry = {
    type: 'seed',
    fileName,
    relativePath,
    generatedAt: generatedAt.toISOString(),
    versionName: sanitizedName,
    originalName,
    requestedBy: options.requestedBy ?? null,
    tableCount: candidates.length,
    rowCount: totalRows,
    companyId: Number(companyId),
    tables: tableSummaries,
  };

  if (normalizedCompanyName) {
    entry.companyName = normalizedCompanyName;
  }

  await updateSeedBackupCatalog(companyId, entry);

  return entry;
}

async function readSeedBackupFile(companyId, fileName, { includeSql = false } = {}) {
  const safeName = sanitizeSnapshotFileName(fileName);
  const relativePathRaw = path.join(TENANT_SEED_BACKUP_DIR, safeName);
  const relativePath = relativePathRaw.replace(/\\/g, '/');
  const absolutePath = tenantConfigPath(relativePathRaw, companyId);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      const notFound = new Error('Backup not found');
      notFound.status = 404;
      throw notFound;
    }
    throw err;
  }
  const sql = await fs.readFile(absolutePath, 'utf8');
  return {
    fileName: safeName,
    relativePath,
    absolutePath,
    fileSize: stats.size,
    modifiedAt: stats.mtime ? stats.mtime.toISOString() : null,
    createdAt: stats.birthtime ? stats.birthtime.toISOString() : null,
    sql: includeSql ? sql : undefined,
  };
}

async function readDataBackupFile(companyId, fileName, { includeSql = false } = {}) {
  const safeName = sanitizeSnapshotFileName(fileName);
  const relativePathRaw = path.join(TENANT_DATA_BACKUP_DIR, safeName);
  const relativePath = relativePathRaw.replace(/\\/g, '/');
  const absolutePath = tenantConfigPath(relativePathRaw, companyId);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      const notFound = new Error('Backup not found');
      notFound.status = 404;
      throw notFound;
    }
    throw err;
  }
  const sql = await fs.readFile(absolutePath, 'utf8');
  return {
    fileName: safeName,
    relativePath,
    absolutePath,
    fileSize: stats.size,
    modifiedAt: stats.mtime ? stats.mtime.toISOString() : null,
    createdAt: stats.birthtime ? stats.birthtime.toISOString() : null,
    sql: includeSql ? sql : undefined,
  };
}

function normalizeBackupEntry(entry = {}, companyId) {
  if (!entry || typeof entry !== 'object') return null;
  const fileName =
    typeof entry.fileName === 'string' && entry.fileName.trim()
      ? entry.fileName.trim()
      : '';
  if (!fileName) return null;
  const typeRaw =
    (typeof entry.type === 'string' && entry.type.trim()) ||
    (typeof entry.backupType === 'string' && entry.backupType.trim()) ||
    (typeof entry.scope === 'string' && entry.scope.trim()) ||
    null;
  let normalizedType = 'seed';
  if (typeRaw) {
    const lowered = typeRaw.toLowerCase();
    if (['full', 'full-data', 'data', 'tenant', 'all'].includes(lowered)) {
      normalizedType = 'full';
    } else if (['seed', 'config', 'defaults'].includes(lowered)) {
      normalizedType = 'seed';
    }
  }
  const generatedAt =
    typeof entry.generatedAt === 'string' && entry.generatedAt.trim()
      ? entry.generatedAt.trim()
      : typeof entry.generatedAtRaw === 'string' && entry.generatedAtRaw.trim()
      ? entry.generatedAtRaw.trim()
      : null;
  const requestedByRaw =
    entry.requestedBy !== undefined && entry.requestedBy !== null
      ? Number(entry.requestedBy)
      : null;
  const normalized = {
    ...entry,
    fileName,
    generatedAt,
    requestedBy: Number.isFinite(requestedByRaw) ? requestedByRaw : null,
    companyId: Number(entry.companyId ?? companyId) || Number(companyId) || 0,
  };
  normalized.type = normalizedType;
  if (
    typeof entry.companyName === 'string' &&
    entry.companyName.trim() &&
    !normalized.companyName
  ) {
    normalized.companyName = entry.companyName.trim();
  }
  return normalized;
}

export async function createCompanySeedBackup(companyId, options = {}) {
  const normalizedId = Number(companyId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    const err = new Error('A valid companyId is required');
    err.status = 400;
    throw err;
  }

  let tableRows;
  try {
    [tableRows] = await pool.query(
      `SELECT table_name, is_shared FROM tenant_tables WHERE seed_on_create = 1`,
    );
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return null;
    }
    throw err;
  }

  const processedTables = [];
  for (const row of tableRows || []) {
    if (!row || row.is_shared) continue;
    const tableName = row.table_name;
    if (!tableName) continue;
    let countRows;
    try {
      [countRows] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?',
        [tableName, normalizedId],
      );
    } catch (err) {
      if (err?.code === 'ER_NO_SUCH_TABLE') continue;
      throw err;
    }
    const existingCount = Number(countRows?.[0]?.cnt) || 0;
    if (existingCount === 0) continue;
    const meta = await listTableColumnMeta(tableName);
    processedTables.push({
      tableName,
      columns: meta.map((m) => m.name),
      existingCount,
    });
  }

  if (processedTables.length === 0) {
    return null;
  }

  const trimmedBackupName =
    typeof options.backupName === 'string' ? options.backupName.trim() : '';
  const originalNameRaw =
    typeof options.originalBackupName === 'string'
      ? options.originalBackupName
      : options.backupName ?? trimmedBackupName;
  const requestedByValue =
    options.requestedBy !== undefined && options.requestedBy !== null
      ? Number(options.requestedBy)
      : null;

  const backupOptions = {
    backupName: trimmedBackupName,
    originalBackupName:
      typeof originalNameRaw === 'string' ? originalNameRaw : trimmedBackupName,
    requestedBy: Number.isFinite(requestedByValue) ? requestedByValue : null,
    companyName:
      typeof options.companyName === 'string' ? options.companyName : undefined,
  };

  const result = await createSeedBackupForCompany(
    normalizedId,
    processedTables,
    backupOptions,
  );
  return result;
}

export async function createCompanyFullBackup(companyId, options = {}) {
  const normalizedId = Number(companyId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    const err = new Error('A valid companyId is required');
    err.status = 400;
    throw err;
  }

  let tableRows;
  [tableRows] = await pool.query(
    `SELECT c.TABLE_NAME AS tableName
       FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES t
         ON c.TABLE_SCHEMA = t.TABLE_SCHEMA
        AND c.TABLE_NAME = t.TABLE_NAME
      WHERE c.TABLE_SCHEMA = DATABASE()
        AND c.COLUMN_NAME = 'company_id'
        AND t.TABLE_TYPE = 'BASE TABLE'
      GROUP BY c.TABLE_NAME
      ORDER BY c.TABLE_NAME`,
  );

  const tableNames = (tableRows || [])
    .map((row) => row?.tableName ?? row?.TABLE_NAME ?? row?.table_name)
    .filter((name) => typeof name === 'string' && name.trim());

  if (tableNames.length === 0) {
    return null;
  }

  const generatedAt = new Date();
  const safeNameRaw = sanitizeExportName(options.backupName);
  const sanitizedName = safeNameRaw || 'tenant-backup';
  const fileSuffix = `company-${companyId}`;
  const baseName = sanitizedName
    ? `${sanitizedName}_${fileSuffix}`
    : fileSuffix;
  const fileName = `${formatExportTimestamp(generatedAt)}_${baseName}.sql`;
  const relativePathRaw = path.join(TENANT_DATA_BACKUP_DIR, fileName);
  const relativePath = relativePathRaw.replace(/\\/g, '/');
  const backupPath = tenantConfigPath(relativePathRaw, companyId);
  await fs.mkdir(path.dirname(backupPath), { recursive: true });

  const lines = [];
  lines.push('-- Tenant full data backup');
  lines.push(`-- Company ID: ${companyId}`);
  const originalName =
    typeof options.originalBackupName === 'string' && options.originalBackupName.trim()
      ? options.originalBackupName.trim()
      : typeof options.backupName === 'string'
      ? options.backupName
      : sanitizedName;
  lines.push(`-- Backup name: ${originalName}`);
  lines.push(`-- Generated at: ${generatedAt.toISOString()}`);
  if (options.requestedBy !== undefined && options.requestedBy !== null) {
    lines.push(`-- Requested by: ${options.requestedBy}`);
  }
  lines.push('');
  lines.push('START TRANSACTION;');

  let totalRows = 0;
  const tableSummaries = [];

  for (const tableName of tableNames) {
    lines.push('');
    lines.push(`-- Table: ${tableName}`);
    lines.push(
      `DELETE FROM ${escapeIdentifier(tableName)} WHERE ${escapeIdentifier('company_id')} = ${mysql.escape(
        normalizedId,
      )};`,
    );
    let columns;
    try {
      columns = await listTableColumns(tableName);
    } catch (err) {
      throw new Error(
        `Failed to enumerate columns for ${tableName}: ${err.message}`,
      );
    }
    if (!Array.isArray(columns) || columns.length === 0) {
      tableSummaries.push({ tableName, rows: 0, columns: 0 });
      lines.push('-- No columns available to export.');
      continue;
    }
    let rows;
    try {
      [rows] = await pool.query('SELECT * FROM ?? WHERE company_id = ?', [
        tableName,
        normalizedId,
      ]);
    } catch (err) {
      throw new Error(
        `Failed to load rows for backup from ${tableName}: ${err.message}`,
      );
    }
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const rowCount = normalizedRows.length;
    tableSummaries.push({
      tableName,
      rows: rowCount,
      columns: columns.length,
    });
    totalRows += rowCount;
    if (rowCount === 0) {
      lines.push('-- No rows to backup.');
      continue;
    }
    const columnIdentifiers = columns.map((col) => escapeIdentifier(col));
    for (const row of normalizedRows) {
      const values = columns.map((col) =>
        row && Object.prototype.hasOwnProperty.call(row, col)
          ? mysql.escape(row[col] === undefined ? null : row[col])
          : 'NULL',
      );
      lines.push(
        `INSERT INTO ${escapeIdentifier(tableName)} (${columnIdentifiers.join(', ')}) VALUES (${values.join(', ')});`,
      );
    }
  }

  lines.push('');
  lines.push('COMMIT;');
  const sql = lines.join('\n');
  await fs.writeFile(backupPath, sql, 'utf8');

  const normalizedCompanyName =
    typeof options.companyName === 'string' && options.companyName.trim()
      ? options.companyName.trim()
      : null;

  const entry = {
    type: 'full',
    fileName,
    relativePath,
    generatedAt: generatedAt.toISOString(),
    versionName: sanitizedName,
    originalName,
    requestedBy: options.requestedBy ?? null,
    tableCount: tableNames.length,
    rowCount: totalRows,
    companyId: Number(companyId),
    tables: tableSummaries,
  };

  if (normalizedCompanyName) {
    entry.companyName = normalizedCompanyName;
  }

  await updateDataBackupCatalog(companyId, entry);

  return entry;
}

export async function listCompanySeedBackupsForUser(
  userId,
  ownedCompanies = [],
) {
  const normalizedUserId = Number(userId);
  if (!Number.isFinite(normalizedUserId)) {
    const err = new Error('A valid userId is required');
    err.status = 400;
    throw err;
  }

  const ownedIdMap = new Map();
  for (const company of ownedCompanies || []) {
    if (!company) continue;
    const idValue =
      company.id !== undefined ? company.id : company.company_id ?? company.id;
    const normalizedId = Number(idValue);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) continue;
    ownedIdMap.set(
      normalizedId,
      company.name || company.company_name || company.companyName || '',
    );
  }

  const configRoot = path.join(process.cwd(), 'config');
  let dirEntries;
  try {
    dirEntries = await fs.readdir(configRoot, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const backups = [];
  for (const dir of dirEntries || []) {
    if (!dir.isDirectory()) continue;
    if (!/^\d+$/.test(dir.name)) continue;
    const companyId = Number(dir.name);
    if (!Number.isFinite(companyId) || companyId <= 0) continue;

    const catalogs = [
      { reader: readSeedBackupCatalog, fallbackType: 'seed' },
      { reader: readDataBackupCatalog, fallbackType: 'full' },
    ];

    for (const { reader, fallbackType } of catalogs) {
      let catalog;
      try {
        catalog = await reader(companyId);
      } catch (err) {
        if (err?.code === 'ENOENT') continue;
        throw err;
      }
      const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
      for (const entry of entries) {
        const normalized = normalizeBackupEntry(
          entry?.type ? entry : { ...entry, type: fallbackType },
          companyId,
        );
        if (!normalized) continue;
        const requestedMatches =
          normalized.requestedBy !== null && normalized.requestedBy === normalizedUserId;
        const owned = ownedIdMap.has(normalized.companyId);
        if (!requestedMatches && !owned) continue;
        if (!normalized.companyName && ownedIdMap.has(normalized.companyId)) {
          normalized.companyName = ownedIdMap.get(normalized.companyId);
        }
        backups.push(normalized);
      }
    }
  }

  backups.sort((a, b) => {
    const dateA = a.generatedAt || '';
    const dateB = b.generatedAt || '';
    if (dateA && dateB) {
      if (dateA < dateB) return 1;
      if (dateA > dateB) return -1;
      return 0;
    }
    if (dateA) return -1;
    if (dateB) return 1;
    return a.fileName.localeCompare(b.fileName);
  });

  return backups;
}

export async function restoreCompanySeedBackup(
  sourceCompanyId,
  fileName,
  targetCompanyId,
  restoredBy = null,
) {
  const sourceId = Number(sourceCompanyId);
  const targetId = Number(targetCompanyId);
  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    const err = new Error('A valid source companyId is required');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(targetId) || targetId <= 0) {
    const err = new Error('A valid target companyId is required');
    err.status = 400;
    throw err;
  }

  const safeName = sanitizeSnapshotFileName(fileName);
  const { entries } = await readSeedBackupCatalog(sourceId);
  const catalogEntries = Array.isArray(entries) ? entries : [];
  const normalizedEntry = catalogEntries
    .map((entry) => normalizeBackupEntry(entry, sourceId))
    .find((entry) => entry && entry.fileName === safeName);
  if (!normalizedEntry) {
    const notFound = new Error('Backup not found');
    notFound.status = 404;
    throw notFound;
  }
  if (normalizedEntry.type && normalizedEntry.type !== 'seed') {
    const err = new Error('Backup type is not compatible with seed restore');
    err.status = 400;
    throw err;
  }
  if (Number(normalizedEntry.companyId) !== sourceId) {
    const err = new Error('Backup company mismatch');
    err.status = 400;
    throw err;
  }

  const backupFile = await readSeedBackupFile(sourceId, safeName, {
    includeSql: true,
  });
  const sql = backupFile.sql || '';
  const statements = splitSnapshotStatements(sql);

  let tableRows;
  try {
    [tableRows] = await pool.query(
      `SELECT table_name
         FROM tenant_tables
        WHERE seed_on_create = 1
          AND is_shared = 0`,
    );
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      const error = new Error('Tenant tables registry is unavailable');
      error.status = 400;
      throw error;
    }
    throw err;
  }

  const allowedTables = new Set(
    (tableRows || [])
      .map((row) => row?.table_name)
      .filter((name) => typeof name === 'string' && name.trim())
      .map((name) => name.toLowerCase()),
  );

  if (allowedTables.size === 0) {
    const err = new Error('No seed-enabled tables registered for recovery.');
    err.status = 400;
    throw err;
  }

  const summaryByTable = new Map();
  const ensureSummary = (name) => {
    if (!summaryByTable.has(name)) {
      summaryByTable.set(name, {
        tableName: name,
        deletedRows: 0,
        insertedRows: 0,
      });
    }
    return summaryByTable.get(name);
  };

  let statementsExecuted = 0;
  let totalDeleted = 0;
  let totalInserted = 0;

  const conn = await pool.getConnection();
  const startedAt = new Date();
  try {
    await conn.beginTransaction();
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      if (/^START\s+TRANSACTION$/i.test(trimmed)) continue;
      if (/^COMMIT$/i.test(trimmed)) continue;
      if (/^ROLLBACK$/i.test(trimmed)) continue;
      if (/^SET\s+/i.test(trimmed)) continue;

      const deleteMatch = trimmed.match(
        /^DELETE\s+FROM\s+`?([A-Za-z0-9_]+)`?\s+WHERE\s+(.+)$/i,
      );
      if (deleteMatch) {
        const tableName = deleteMatch[1];
        ensureAllowedTable(tableName, allowedTables);
        const whereClause = deleteMatch[2];
        const normalizedWhere = whereClause.replace(/[`'";]/g, '').toLowerCase();
        const companyMatch = normalizedWhere.match(/company_id\s*=\s*([0-9]+)/);
        if (!companyMatch) {
          const err = new Error(
            `Backup delete for ${tableName} must restrict to company_id.`,
          );
          err.status = 400;
          throw err;
        }
        const originalId = Number(companyMatch[1]);
        if (!Number.isFinite(originalId) || originalId !== sourceId) {
          const err = new Error(
            `Backup delete for ${tableName} targets unexpected company id.`,
          );
          err.status = 400;
          throw err;
        }
        const deleteSql =
          `DELETE FROM ${escapeIdentifier(tableName)} WHERE ${escapeIdentifier('company_id')} = ${mysql.escape(targetId)}`;
        const [res] = await conn.query(`${deleteSql};`);
        statementsExecuted += 1;
        const affected = Number(res?.affectedRows) || 0;
        totalDeleted += affected;
        ensureSummary(tableName).deletedRows += affected;
        continue;
      }

      const insertMatch = trimmed.match(
        /^INSERT\s+INTO\s+`?([A-Za-z0-9_]+)`?\s*\(([^)]+)\)\s*VALUES\s*\((.*)\)$/i,
      );
      if (insertMatch) {
        const tableName = insertMatch[1];
        ensureAllowedTable(tableName, allowedTables);
        const columnList = splitTopLevel(insertMatch[2]);
        const valuesList = splitTopLevel(insertMatch[3]);
        if (columnList.length !== valuesList.length) {
          const err = new Error(
            `Column/value count mismatch in backup insert for ${tableName}.`,
          );
          err.status = 400;
          throw err;
        }
        const normalizedColumns = columnList.map((col) =>
          col.replace(/`/g, '').trim().toLowerCase(),
        );
        const companyIdx = normalizedColumns.indexOf('company_id');
        if (companyIdx === -1) {
          const err = new Error(
            `Backup insert for ${tableName} must include company_id.`,
          );
          err.status = 400;
          throw err;
        }
        const rawValue = valuesList[companyIdx]?.trim() ?? '';
        const normalizedValue = rawValue.replace(/^['"]|['"]$/g, '');
        const originalId = Number(normalizedValue);
        if (!Number.isFinite(originalId) || originalId !== sourceId) {
          const err = new Error(
            `Backup insert for ${tableName} targets unexpected company id.`,
          );
          err.status = 400;
          throw err;
        }
        valuesList[companyIdx] = mysql.escape(targetId);
        const insertSql =
          `INSERT INTO ${escapeIdentifier(tableName)} (${columnList.join(', ')}) VALUES (${valuesList.join(', ')});`;
        const [res] = await conn.query(insertSql);
        statementsExecuted += 1;
        const affected = Number(res?.affectedRows) || 0;
        totalInserted += affected;
        ensureSummary(tableName).insertedRows += affected;
        continue;
      }

      const err = new Error(
        `Unsupported statement in company backup: ${trimmed.slice(0, 60)}...`,
      );
      err.status = 400;
      throw err;
    }
    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    throw err;
  } finally {
    conn.release();
  }

  const completedAt = new Date();
  const tables = Array.from(summaryByTable.values()).sort((a, b) =>
    a.tableName.localeCompare(b.tableName),
  );

  return {
    fileName: safeName,
    relativePath: backupFile.relativePath,
    versionName: normalizedEntry.versionName ?? null,
    originalName: normalizedEntry.originalName ?? null,
    companyName: normalizedEntry.companyName ?? null,
    sourceCompanyId: sourceId,
    targetCompanyId: targetId,
    generatedAt:
      normalizedEntry.generatedAt ??
      normalizedEntry.generatedAtRaw ??
      backupFile.modifiedAt ??
      null,
    requestedBy: normalizedEntry.requestedBy ?? null,
    restoredBy:
      restoredBy !== undefined && restoredBy !== null
        ? restoredBy
        : null,
    tableCount: tables.length,
    totalDeleted,
    totalInserted,
    statementsExecuted,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    tables,
  };
}

export async function restoreCompanyFullBackup(
  sourceCompanyId,
  fileName,
  targetCompanyId,
  restoredBy = null,
) {
  const sourceId = Number(sourceCompanyId);
  const targetId = Number(targetCompanyId);
  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    const err = new Error('A valid source companyId is required');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(targetId) || targetId <= 0) {
    const err = new Error('A valid target companyId is required');
    err.status = 400;
    throw err;
  }

  const safeName = sanitizeSnapshotFileName(fileName);
  const { entries } = await readDataBackupCatalog(sourceId);
  const catalogEntries = Array.isArray(entries) ? entries : [];
  const normalizedEntry = catalogEntries
    .map((entry) => normalizeBackupEntry(entry, sourceId))
    .find((entry) => entry && entry.fileName === safeName);
  if (!normalizedEntry) {
    const notFound = new Error('Backup not found');
    notFound.status = 404;
    throw notFound;
  }
  if (normalizedEntry.type && normalizedEntry.type !== 'full') {
    const err = new Error('Backup type is not compatible with full restore');
    err.status = 400;
    throw err;
  }
  if (Number(normalizedEntry.companyId) !== sourceId) {
    const err = new Error('Backup company mismatch');
    err.status = 400;
    throw err;
  }

  const backupFile = await readDataBackupFile(sourceId, safeName, {
    includeSql: true,
  });
  const sql = backupFile.sql || '';
  const statements = splitSnapshotStatements(sql);

  let tableRows;
  [tableRows] = await pool.query(
    `SELECT c.TABLE_NAME AS tableName
       FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES t
         ON c.TABLE_SCHEMA = t.TABLE_SCHEMA
        AND c.TABLE_NAME = t.TABLE_NAME
      WHERE c.TABLE_SCHEMA = DATABASE()
        AND c.COLUMN_NAME = 'company_id'
        AND t.TABLE_TYPE = 'BASE TABLE'`,
  );

  const allowedTables = new Set(
    (tableRows || [])
      .map((row) => row?.tableName ?? row?.TABLE_NAME ?? row?.table_name)
      .filter((name) => typeof name === 'string' && name.trim())
      .map((name) => name.toLowerCase()),
  );

  if (allowedTables.size === 0) {
    const err = new Error(
      'No tenant tables with company_id are available for recovery.',
    );
    err.status = 400;
    throw err;
  }

  const summaryByTable = new Map();
  const ensureSummary = (name) => {
    if (!summaryByTable.has(name)) {
      summaryByTable.set(name, {
        tableName: name,
        deletedRows: 0,
        insertedRows: 0,
      });
    }
    return summaryByTable.get(name);
  };

  let statementsExecuted = 0;
  let totalDeleted = 0;
  let totalInserted = 0;

  const conn = await pool.getConnection();
  const startedAt = new Date();
  try {
    await conn.beginTransaction();
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      if (/^START\s+TRANSACTION$/i.test(trimmed)) continue;
      if (/^COMMIT$/i.test(trimmed)) continue;
      if (/^ROLLBACK$/i.test(trimmed)) continue;
      if (/^SET\s+/i.test(trimmed)) continue;

      const deleteMatch = trimmed.match(
        /^DELETE\s+FROM\s+`?([A-Za-z0-9_]+)`?\s+WHERE\s+(.+)$/i,
      );
      if (deleteMatch) {
        const tableName = deleteMatch[1];
        ensureAllowedDataTable(tableName, allowedTables);
        const whereClause = deleteMatch[2];
        const normalizedWhere = whereClause.replace(/[`'";]/g, '').toLowerCase();
        const companyMatch = normalizedWhere.match(/company_id\s*=\s*([0-9]+)/);
        if (!companyMatch) {
          const err = new Error(
            `Backup delete for ${tableName} must restrict to company_id.`,
          );
          err.status = 400;
          throw err;
        }
        const originalId = Number(companyMatch[1]);
        if (!Number.isFinite(originalId) || originalId !== sourceId) {
          const err = new Error(
            `Backup delete for ${tableName} targets unexpected company id.`,
          );
          err.status = 400;
          throw err;
        }
        const deleteSql =
          `DELETE FROM ${escapeIdentifier(tableName)} WHERE ${escapeIdentifier('company_id')} = ${mysql.escape(targetId)}`;
        const [res] = await conn.query(`${deleteSql};`);
        statementsExecuted += 1;
        const affected = Number(res?.affectedRows) || 0;
        totalDeleted += affected;
        ensureSummary(tableName).deletedRows += affected;
        continue;
      }

      const insertMatch = trimmed.match(
        /^INSERT\s+INTO\s+`?([A-Za-z0-9_]+)`?\s*\(([^)]+)\)\s*VALUES\s*\((.*)\)$/i,
      );
      if (insertMatch) {
        const tableName = insertMatch[1];
        ensureAllowedDataTable(tableName, allowedTables);
        const columnList = splitTopLevel(insertMatch[2]);
        const valuesList = splitTopLevel(insertMatch[3]);
        if (columnList.length !== valuesList.length) {
          const err = new Error(
            `Column/value count mismatch in backup insert for ${tableName}.`,
          );
          err.status = 400;
          throw err;
        }
        const normalizedColumns = columnList.map((col) =>
          col.replace(/`/g, '').trim().toLowerCase(),
        );
        const companyIdx = normalizedColumns.indexOf('company_id');
        if (companyIdx === -1) {
          const err = new Error(
            `Backup insert for ${tableName} must include company_id.`,
          );
          err.status = 400;
          throw err;
        }
        const rawValue = valuesList[companyIdx]?.trim() ?? '';
        const normalizedValue = rawValue.replace(/^['"]|['"]$/g, '');
        const originalId = Number(normalizedValue);
        if (!Number.isFinite(originalId) || originalId !== sourceId) {
          const err = new Error(
            `Backup insert for ${tableName} targets unexpected company id.`,
          );
          err.status = 400;
          throw err;
        }
        valuesList[companyIdx] = mysql.escape(targetId);
        const insertSql =
          `INSERT INTO ${escapeIdentifier(tableName)} (${columnList.join(', ')}) VALUES (${valuesList.join(', ')});`;
        const [res] = await conn.query(insertSql);
        statementsExecuted += 1;
        const affected = Number(res?.affectedRows) || 0;
        totalInserted += affected;
        ensureSummary(tableName).insertedRows += affected;
        continue;
      }

      const err = new Error(
        `Unsupported statement in company backup: ${trimmed.slice(0, 60)}...`,
      );
      err.status = 400;
      throw err;
    }
    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    throw err;
  } finally {
    conn.release();
  }

  const completedAt = new Date();
  const tables = Array.from(summaryByTable.values()).sort((a, b) =>
    a.tableName.localeCompare(b.tableName),
  );

  return {
    type: 'full',
    fileName: safeName,
    relativePath: backupFile.relativePath,
    versionName: normalizedEntry.versionName ?? null,
    originalName: normalizedEntry.originalName ?? null,
    companyName: normalizedEntry.companyName ?? null,
    sourceCompanyId: sourceId,
    targetCompanyId: targetId,
    generatedAt:
      normalizedEntry.generatedAt ??
      normalizedEntry.generatedAtRaw ??
      backupFile.modifiedAt ??
      null,
    requestedBy: normalizedEntry.requestedBy ?? null,
    restoredBy:
      restoredBy !== undefined && restoredBy !== null
        ? restoredBy
        : null,
    tableCount: tables.length,
    totalDeleted,
    totalInserted,
    statementsExecuted,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    tables,
  };
}

export async function listTenantDefaultSnapshots() {
  const dirPath = tenantConfigPath(TENANT_DEFAULT_SNAPSHOT_DIR);
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  const snapshots = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.sql$/i.test(entry.name)) continue;
    try {
      const info = await readTenantSnapshotFile(entry.name, { includeSql: false });
      delete info.sql;
      snapshots.push(info);
    } catch (err) {
      if (err?.status === 404) continue;
      throw err;
    }
  }
  snapshots.sort((a, b) => {
    const dateA = a.generatedAt || a.modifiedAt || '';
    const dateB = b.generatedAt || b.modifiedAt || '';
    if (dateA && dateB) {
      return dateA < dateB ? 1 : dateA > dateB ? -1 : 0;
    }
    if (dateA) return -1;
    if (dateB) return 1;
    return a.fileName.localeCompare(b.fileName);
  });
  return snapshots;
}

function ensureAllowedTable(tableName, allowedSet) {
  if (!allowedSet.has(tableName.toLowerCase())) {
    const err = new Error(
      `Snapshot references table ${tableName} that is not registered as shared or seed-enabled.`,
    );
    err.status = 400;
    throw err;
  }
}

function ensureAllowedDataTable(tableName, allowedSet) {
  if (!allowedSet.has(tableName.toLowerCase())) {
    const err = new Error(
      `Backup references table ${tableName} that does not expose a company_id column.`,
    );
    err.status = 400;
    throw err;
  }
}

function ensureCompanyIdIsZero(columns, values) {
  const normalizedColumns = columns.map((col) => col.replace(/`/g, '').trim().toLowerCase());
  const idx = normalizedColumns.indexOf('company_id');
  if (idx === -1) {
    const err = new Error('Snapshot insert is missing company_id column');
    err.status = 400;
    throw err;
  }
  const rawValue = values[idx];
  if (rawValue === undefined) {
    const err = new Error('Snapshot insert is missing company_id value');
    err.status = 400;
    throw err;
  }
  const trimmed = rawValue.trim();
  let normalized = trimmed;
  if (/^['"].*['"]$/.test(trimmed)) {
    normalized = trimmed.slice(1, -1);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed !== 0) {
    const err = new Error('Snapshot insert must target company_id 0');
    err.status = 400;
    throw err;
  }
}

export async function restoreTenantDefaultSnapshot(fileName, restoredBy = null) {
  const snapshot = await readTenantSnapshotFile(fileName, { includeSql: true });
  const sql = snapshot.sql || '';
  const statements = splitSnapshotStatements(sql);

  let tableRows;
  try {
    [tableRows] = await pool.query(
      `SELECT table_name
         FROM tenant_tables
        WHERE is_shared = 1 OR seed_on_create = 1`,
    );
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      const error = new Error('Tenant tables registry is unavailable');
      error.status = 400;
      throw error;
    }
    throw err;
  }

  const allowedTables = new Set(
    (tableRows || [])
      .map((row) => row?.table_name)
      .filter((name) => typeof name === 'string' && name.trim())
      .map((name) => name.toLowerCase()),
  );

  if (allowedTables.size === 0) {
    const err = new Error('No shared or seed-enabled tables are registered for recovery.');
    err.status = 400;
    throw err;
  }

  const summaryByTable = new Map();
  const ensureSummary = (name) => {
    if (!summaryByTable.has(name)) {
      summaryByTable.set(name, {
        tableName: name,
        deletedRows: 0,
        insertedRows: 0,
      });
    }
    return summaryByTable.get(name);
  };

  let statementsExecuted = 0;
  let totalDeleted = 0;
  let totalInserted = 0;
  const referencedTables = new Set();

  for (const info of snapshot.tables || []) {
    referencedTables.add(info.tableName.toLowerCase());
  }

  for (const tableName of referencedTables) {
    ensureAllowedTable(tableName, allowedTables);
  }

  const conn = await pool.getConnection();
  const startedAt = new Date();
  try {
    await conn.beginTransaction();
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      if (/^START\s+TRANSACTION$/i.test(trimmed)) {
        continue;
      }
      if (/^COMMIT$/i.test(trimmed)) {
        continue;
      }
      if (/^ROLLBACK$/i.test(trimmed)) {
        continue;
      }
      if (/^SET\s+/i.test(trimmed)) {
        continue;
      }

      const deleteMatch = trimmed.match(/^DELETE\s+FROM\s+`?([A-Za-z0-9_]+)`?\s+WHERE\s+(.+)$/i);
      if (deleteMatch) {
        const tableName = deleteMatch[1];
        ensureAllowedTable(tableName, allowedTables);
        const whereClause = deleteMatch[2].replace(/`/g, '');
        if (!/company_id\s*=\s*0/i.test(whereClause)) {
          const err = new Error(
            `Snapshot delete for ${tableName} must restrict to company_id = 0`,
          );
          err.status = 400;
          throw err;
        }
        const [res] = await conn.query(`${trimmed};`);
        statementsExecuted += 1;
        const affected = Number(res?.affectedRows) || 0;
        totalDeleted += affected;
        ensureSummary(tableName).deletedRows += affected;
        referencedTables.add(tableName.toLowerCase());
        continue;
      }

      const insertMatch = trimmed.match(
        /^INSERT\s+INTO\s+`?([A-Za-z0-9_]+)`?\s*\(([^)]+)\)\s*VALUES\s*\((.*)\)$/i,
      );
      if (insertMatch) {
        const tableName = insertMatch[1];
        ensureAllowedTable(tableName, allowedTables);
        const columnList = splitTopLevel(insertMatch[2]);
        const valuesList = splitTopLevel(insertMatch[3]);
        ensureCompanyIdIsZero(columnList, valuesList);
        const [res] = await conn.query(`${trimmed};`);
        statementsExecuted += 1;
        const affected = Number(res?.affectedRows) || 0;
        totalInserted += affected;
        ensureSummary(tableName).insertedRows += affected;
        referencedTables.add(tableName.toLowerCase());
        continue;
      }

      const err = new Error(`Unsupported statement in snapshot: ${trimmed.slice(0, 60)}...`);
      err.status = 400;
      throw err;
    }
    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    throw err;
  } finally {
    conn.release();
  }
  const completedAt = new Date();

  const tables = Array.from(summaryByTable.values()).sort((a, b) =>
    a.tableName.localeCompare(b.tableName),
  );

  return {
    fileName: snapshot.fileName,
    relativePath: snapshot.relativePath,
    versionName: snapshot.versionName,
    generatedAt: snapshot.generatedAt ?? snapshot.generatedAtRaw ?? null,
    requestedBy: snapshot.requestedBy ?? null,
    tableCount: tables.length,
    expectedRowCount: snapshot.rowCount ?? null,
    totalDeleted,
    totalInserted,
    statementsExecuted,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    restoredBy: restoredBy ?? null,
    tables,
  };
}

export async function seedSeedTablesForCompanies(userId = null) {
  const [companies] = await pool.query(
    `SELECT id FROM companies WHERE id > ?`,
    [GLOBAL_COMPANY_ID],
  );
  for (const { id } of companies) {
    await seedTenantTables(id, null, {}, false, userId);
  }
}

export async function zeroSharedTenantKeys(userId) {
  const summary = {
    tables: [],
    totals: {
      tablesProcessed: 0,
      totalRows: 0,
      updatedRows: 0,
      skippedRows: 0,
    },
    timestamp: new Date().toISOString(),
  };

  const [rows] = await pool.query(
    `SELECT table_name FROM tenant_tables WHERE is_shared = 1`,
  );

  for (const { table_name } of rows) {
    const cols = await getTableColumnsSafe(table_name);
    const companyCol = cols.find((c) => c.toLowerCase() === "company_id");
    if (!companyCol) continue;

    const pkCols = await getPrimaryKeyColumns(table_name);
    const companyColLower = companyCol.toLowerCase();
    const pkLower = new Set(pkCols.map((c) => c.toLowerCase()));
    const joinConditions = [];

    for (const col of pkCols) {
      const lower = col.toLowerCase();
      if (lower === companyColLower) {
        joinConditions.push(
          `tgt.${escapeIdentifier(col)} = ${GLOBAL_COMPANY_ID}`,
        );
      } else {
        joinConditions.push(
          `tgt.${escapeIdentifier(col)} <=> src.${escapeIdentifier(col)}`,
        );
      }
    }

    if (!pkLower.has(companyColLower)) {
      joinConditions.push(
        `tgt.${escapeIdentifier(companyCol)} = ${GLOBAL_COMPANY_ID}`,
      );
    }

    const joinCondition = joinConditions.length
      ? joinConditions.join(" AND ")
      : `tgt.${escapeIdentifier(companyCol)} = ${GLOBAL_COMPANY_ID}`;

    const countSql = `SELECT COUNT(*) AS cnt FROM ${escapeIdentifier(
      table_name,
    )} WHERE ${escapeIdentifier(companyCol)} <> ?`;
    const [countRows] = await pool.query(countSql, [GLOBAL_COMPANY_ID]);
    const totalRows = Number(countRows?.[0]?.cnt ?? 0);

    let skippedRecords = [];
    let updatedRows = 0;
    let skippedRows = 0;

    if (totalRows > 0) {
      const conflictSql = `
        SELECT src.*
          FROM ${escapeIdentifier(table_name)} AS src
          JOIN ${escapeIdentifier(table_name)} AS tgt
            ON ${joinCondition}
         WHERE src.${escapeIdentifier(companyCol)} <> ?
      `;
      const [conflictRaw] = await pool.query(conflictSql, [GLOBAL_COMPANY_ID]);

      const conflictMap = new Map();
      for (const row of conflictRaw || []) {
        const plain = row ? { ...row } : {};
        const keyParts = [plain[companyCol]];
        for (const col of pkCols) {
          keyParts.push(plain[col]);
        }
        const key = JSON.stringify(keyParts);
        if (!conflictMap.has(key)) {
          conflictMap.set(key, plain);
        }
      }

      skippedRecords = Array.from(conflictMap.values());

      const setClauses = [`src.${escapeIdentifier(companyCol)} = ?`];
      const params = [GLOBAL_COMPANY_ID];
      const updatedByCol = cols.find((c) => c.toLowerCase() === "updated_by");
      if (updatedByCol) {
        setClauses.push(`src.${escapeIdentifier(updatedByCol)} = ?`);
        params.push(userId ?? null);
      }
      const updatedAtCol = cols.find((c) => c.toLowerCase() === "updated_at");
      if (updatedAtCol) {
        setClauses.push(`src.${escapeIdentifier(updatedAtCol)} = NOW()`);
      }

      const updateSql = `
        UPDATE ${escapeIdentifier(table_name)} AS src
        LEFT JOIN ${escapeIdentifier(table_name)} AS tgt
          ON ${joinCondition}
        SET ${setClauses.join(", ")}
        WHERE src.${escapeIdentifier(companyCol)} <> ?
          AND tgt.${escapeIdentifier(companyCol)} IS NULL
      `;
      const [result] = await pool.query(updateSql, [
        ...params,
        GLOBAL_COMPANY_ID,
      ]);
      updatedRows = Number(result?.affectedRows ?? 0);

      const computedSkipped = totalRows - updatedRows;
      skippedRows = Math.max(skippedRecords.length, computedSkipped, 0);
    }

    const tableSummary = {
      tableName: table_name,
      companyIdColumn: companyCol,
      primaryKeyColumns: pkCols,
      totalRows,
      updatedRows,
      skippedRows,
      skippedRecords,
    };

    summary.tables.push(tableSummary);
    summary.totals.totalRows += totalRows;
    summary.totals.updatedRows += updatedRows;
    summary.totals.skippedRows += skippedRows;
  }

  summary.totals.tablesProcessed = summary.tables.length;

  return summary;
}

export async function saveStoredProcedure(sql, { allowProtected = false } = {}) {
  const cleanedSql = sql
    .replace(/^\s*DELIMITER.*$/gim, '')
    .replace(/CREATE\s+DEFINER=`[^`]+`@`[^`]+`\s+PROCEDURE/gi, 'CREATE PROCEDURE')
    .replace(/END\s*\$\$/gm, 'END;');
  const nameMatch = cleanedSql.match(/CREATE\s+PROCEDURE\s+`?([^\s`(]+)`?/i);
  const procName = nameMatch ? nameMatch[1] : null;
  if (!allowProtected && (await isProtectedProcedure(procName))) {
    const err = new Error('Procedure not allowed');
    err.status = 403;
    throw err;
  }
  const dropMatch = cleanedSql.match(/DROP\s+PROCEDURE[^;]+;/i);
  const createMatch = cleanedSql.match(/CREATE\s+PROCEDURE[\s\S]+END\s*(;|$)/i);
  if (!createMatch) {
    throw new Error('Missing CREATE PROCEDURE statement');
  }
  if (dropMatch) {
    await adminPool.query(dropMatch[0]);
  }
  await adminPool.query(createMatch[0]);
  const procs = await listReportProcedures(procName);
  if (!procs.includes(procName)) {
    throw new Error('Failed to create procedure');
  }
}

export async function saveView(sql) {
  await adminPool.query(sql);
}

export async function listReportProcedures(prefix = '') {
  const [rows] = await pool.query(
    `SELECT ROUTINE_NAME
       FROM information_schema.ROUTINES
      WHERE ROUTINE_TYPE = 'PROCEDURE'
        AND ROUTINE_SCHEMA = DATABASE()
        ${prefix ? "AND ROUTINE_NAME LIKE ?" : ''}
      ORDER BY ROUTINE_NAME`,
    prefix ? [`%${prefix}%`] : [],
  );
  return rows.map((r) => r.ROUTINE_NAME);
}

export async function deleteProcedure(name, { allowProtected = false } = {}) {
  if (!name) return;
  if (!allowProtected && (await isProtectedProcedure(name))) {
    const err = new Error('Procedure not allowed');
    err.status = 403;
    throw err;
  }
  await adminPool.query(`DROP PROCEDURE IF EXISTS \`${name}\``);
}

export async function getProcedureSql(name) {
  if (!name) return null;
  try {
    const sql = mysql.format('SHOW CREATE PROCEDURE ??', [name]);
    const [rows] = await pool.query(sql);
    const text = rows?.[0]?.['Create Procedure'];
    if (text) return text;
  } catch {}
  try {
    const [rows] = await pool.query(
      `SELECT ROUTINE_DEFINITION FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = ?`,
      [name],
    );
    return rows?.[0]?.ROUTINE_DEFINITION || null;
  } catch {
    return null;
  }
}

export async function getStoredProcedureSql(name) {
  if (!name) return null;
  try {
    const sql = mysql.format('SHOW CREATE PROCEDURE ??', [name]);
    const [rows] = await pool.query(sql);
    return rows?.[0]?.['Create Procedure'] || null;
  } catch {
    return null;
  }
}

export async function getTableColumnLabels(tableName) {
  const [rows] = await pool.query(
    'SELECT column_name, mn_label FROM table_column_labels WHERE table_name = ?',
    [tableName],
  );
  const map = {};
  rows.forEach((r) => {
    map[r.column_name] = r.mn_label;
  });
  return map;
}

export async function setTableColumnLabel(
  tableName,
  columnName,
  label,
  createdBy,
  signal,
) {
  await pool.query({
    sql: `INSERT INTO table_column_labels (table_name, column_name, mn_label, created_by, created_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE mn_label = VALUES(mn_label), updated_by = VALUES(created_by), updated_at = NOW()`,
    values: [tableName, columnName, label, createdBy],
    signal,
  });
  return { tableName, columnName, label };
}

export async function saveTableColumnLabels(
  tableName,
  labels,
  createdBy,
  signal,
) {
  for (const [col, lab] of Object.entries(labels)) {
    if (signal?.aborted) throw new Error('Aborted');
    await setTableColumnLabel(tableName, col, lab, createdBy, signal);
  }
}

export async function listTableColumnMeta(tableName, companyId = 0) {
  const [rows] = await pool.query(
    `SELECT c.COLUMN_NAME,
            c.COLUMN_KEY,
            c.EXTRA,
            c.GENERATION_EXPRESSION,
            c.COLUMN_TYPE,
            c.DATA_TYPE,
            c.COLUMN_COMMENT,
            pk.SEQ_IN_INDEX AS PRIMARY_KEY_ORDINAL
       FROM information_schema.COLUMNS c
       LEFT JOIN information_schema.STATISTICS pk
         ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA
        AND pk.TABLE_NAME = c.TABLE_NAME
        AND pk.COLUMN_NAME = c.COLUMN_NAME
        AND pk.INDEX_NAME = 'PRIMARY'
      WHERE c.TABLE_SCHEMA = DATABASE()
        AND c.TABLE_NAME = ?
      ORDER BY c.ORDINAL_POSITION`,
    [tableName],
  );
  let labels = {};
  try {
    labels = await getTableColumnLabels(tableName);
  } catch {
    labels = {};
  }
  let headerMap = {};
  try {
    const names = rows.map((r) => r.COLUMN_NAME);
    const { getMappings } = await import('../api-server/services/headerMappings.js');
    headerMap = await getMappings(names, undefined, companyId);
  } catch {
    headerMap = {};
  }
  return rows.map((r) => {
    const ordinal =
      r.PRIMARY_KEY_ORDINAL != null ? Number(r.PRIMARY_KEY_ORDINAL) : null;
    const enumValues =
      typeof r.COLUMN_TYPE === 'string' && /^enum\(/i.test(r.COLUMN_TYPE)
        ? r.COLUMN_TYPE
            .slice(5, -1)
            .split(',')
            .map((v) => v.trim().slice(1, -1))
        : [];
    return {
      name: r.COLUMN_NAME,
      key: r.COLUMN_KEY,
      extra: r.EXTRA,
      label: labels[r.COLUMN_NAME] || headerMap[r.COLUMN_NAME] || r.COLUMN_NAME,
      generationExpression: r.GENERATION_EXPRESSION ?? null,
      primaryKeyOrdinal: Number.isFinite(ordinal) ? ordinal : null,
      enumValues,
      type: r.DATA_TYPE || null,
      dataType: r.DATA_TYPE || null,
      columnType: r.COLUMN_TYPE || null,
      columnComment: r.COLUMN_COMMENT || '',
    };
  });
}

export async function getPrimaryKeyColumns(tableName) {
  const [keyRows] = await pool.query(
    `SELECT COLUMN_NAME, SEQ_IN_INDEX
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = 'PRIMARY'
      ORDER BY SEQ_IN_INDEX`,
    [tableName],
  );
  // Map primary key columns in index order to support composite keys
  let pks = keyRows
    .sort((a, b) => a.SEQ_IN_INDEX - b.SEQ_IN_INDEX)
    .map((r) => r.COLUMN_NAME);

  if (pks.length === 0) {
    const [uniqRows] = await pool.query(
      `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND NON_UNIQUE = 0
        ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [tableName],
    );
    if (uniqRows.length > 0) {
      const groups = new Map();
      for (const row of uniqRows) {
        if (!groups.has(row.INDEX_NAME)) groups.set(row.INDEX_NAME, []);
        groups.get(row.INDEX_NAME)[row.SEQ_IN_INDEX - 1] = row.COLUMN_NAME;
      }
      pks = Array.from(groups.values()).sort((a, b) => a.length - b.length)[0];
    }
  }

  if (pks.length === 0) {
    const meta = await listTableColumnMeta(tableName);
    pks = meta.filter((m) => m.key === 'PRI').map((m) => m.name);
  }

  if (pks.length === 0) {
    const columns = await getTableColumnsSafe(tableName);
    if (columns.includes('id')) pks = ['id'];
  }

  logDb(`Primary key columns for ${tableName}: ${pks.join(', ')}`);
  return pks;
}

export async function listTableRelationships(tableName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [tableName],
  );
  return rows;
}

/**
 * Get up to 50 rows from a table
 */
export async function listTableRows(
  tableName,
  {
    page = 1,
    perPage = 50,
    filters = {},
    sort = {},
    search = '',
    searchColumns = [],
    debug = false,
    includeDeleted = false,
  } = {},
  signal,
) {
  signal?.throwIfAborted();
  const columns = await getTableColumnsSafe(tableName);
  logDb(
    `listTableRows(${tableName}) page=${page} perPage=${perPage} ` +
      `filters=${JSON.stringify(filters)} search=${search} columns=${searchColumns} ` +
      `sort=${sort.column || ''}:${sort.dir || ''}`,
  );
  const offset = (Number(page) - 1) * Number(perPage);
  const filterClauses = [];
  const params = [tableName];
  for (const [field, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      if (field === 'company_id') {
        const flags = await getTenantTableFlags(tableName);
        if (!flags) continue; // global table, no scoping
        // ensure column exists when scoping
        await ensureValidColumns(tableName, columns, [field]);
        if (flags.isShared) {
          filterClauses.push('`company_id` IN (' + GLOBAL_COMPANY_ID + ', ?)');
          params.push(value);
        } else {
          filterClauses.push('`company_id` = ?');
          params.push(value);
        }
      } else {
        await ensureValidColumns(tableName, columns, [field]);
        const range = String(value).match(/^(\d{4}[-.]\d{2}[-.]\d{2})\s*-\s*(\d{4}[-.]\d{2}[-.]\d{2})$/);
        if (range) {
          filterClauses.push(`\`${field}\` BETWEEN ? AND ?`);
          params.push(range[1], range[2]);
        } else if (typeof value === 'string') {
          const hasWildcards = value.includes('%') || value.includes('_');
          if (hasWildcards) {
            filterClauses.push(`\`${field}\` LIKE ?`);
            params.push(value);
          } else {
            filterClauses.push(`\`${field}\` = ?`);
            params.push(value);
          }
        } else {
          filterClauses.push(`\`${field}\` = ?`);
          params.push(value);
        }
      }
    }
  }
  if (search && Array.isArray(searchColumns) && searchColumns.length > 0) {
    await ensureValidColumns(tableName, columns, searchColumns);
    const clause =
      '(' +
      searchColumns.map((c) => `\`${c}\` LIKE ?`).join(' OR ') +
      ')';
    filterClauses.push(clause);
    searchColumns.forEach(() => params.push(`%${search}%`));
  }
  if (!includeDeleted) {
    const softDeleteCompanyId =
      filters?.company_id !== undefined && filters?.company_id !== ''
        ? filters.company_id
        : undefined;
    const softDeleteColumn = await getSoftDeleteColumn(
      tableName,
      softDeleteCompanyId,
    );
    if (softDeleteColumn) {
      const identifier = escapeIdentifier(softDeleteColumn);
      filterClauses.push(
        `(${identifier} IS NULL OR ${identifier} IN (0,''))`,
      );
    }
  }
  const where = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : '';
  let order = '';
  if (sort.column) {
    await ensureValidColumns(tableName, columns, [sort.column]);
    const dir = sort.dir && String(sort.dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    order = `ORDER BY \`${sort.column}\` ${dir}`;
  }
  params.push(Number(perPage), offset);
  const sql = mysql.format(
    `SELECT * FROM ?? ${where} ${order} LIMIT ? OFFSET ?`,
    params,
  );
  let conn;
  const abortHandler = () => {
    conn?.destroy();
  };
  try {
    signal?.throwIfAborted();
    conn = await pool.getConnection();
    signal?.addEventListener('abort', abortHandler, { once: true });
    signal?.throwIfAborted();
    const [rows] = await conn.query(sql);
    signal?.throwIfAborted();
    const countParams = [tableName, ...params.slice(1, params.length - 2)];
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS count FROM ?? ${where}`,
      countParams,
    );
    signal?.throwIfAborted();
    const result = { rows, count: countRows[0].count };
    if (debug) result.sql = sql;
    return result;
  } catch (err) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw err;
  } finally {
    signal?.removeEventListener?.('abort', abortHandler);
    if (conn && !signal?.aborted) {
      conn.release();
    }
  }
}

/**
 * Fetch a single row by id from a table
 */
function parseCompositeRowId(rowId, expectedLength) {
  if (expectedLength <= 0) return [];
  if (Array.isArray(rowId)) {
    if (rowId.length === expectedLength) return rowId;
  } else if (rowId !== undefined && rowId !== null) {
    const raw = String(rowId);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === expectedLength) {
          return parsed;
        }
      } catch {}
      const legacyParts = raw.split('-');
      if (
        legacyParts.length === expectedLength &&
        legacyParts.every((part) => part !== '')
      ) {
        return legacyParts;
      }
    }
  }
  const err = new Error('Invalid row identifier');
  err.status = 400;
  throw err;
}

export async function getTableRowById(
  tableName,
  rowId,
  { tenantFilters = {}, includeDeleted = false, defaultCompanyId } = {},
) {
  if (!tableName) {
    const err = new Error('Table name is required');
    err.status = 400;
    throw err;
  }
  const columns = await getTableColumnsSafe(tableName);
  const pkCols = await getPrimaryKeyColumns(tableName);
  if (!Array.isArray(pkCols) || pkCols.length === 0) {
    const err = new Error(`Table ${tableName} has no primary or unique key`);
    err.status = 400;
    throw err;
  }
  await ensureValidColumns(tableName, columns, pkCols);
  const sanitizeColumnName = (value) =>
    String(value).toLowerCase().replace(/_/g, '');
  const pkLower = pkCols.map((col) => String(col).toLowerCase());
  const pkSanitized = pkCols.map((col) => sanitizeColumnName(col));
  const pkLowerSet = new Set(pkLower);
  const pkSanitizedSet = new Set(pkSanitized);
  let parts;
  if (pkCols.length === 1) {
    if (rowId === undefined || rowId === null || rowId === '') {
      const err = new Error('Invalid row identifier');
      err.status = 400;
      throw err;
    }
    parts = [rowId];
  } else {
    parts = parseCompositeRowId(rowId, pkCols.length);
  }

  const whereClauses = pkCols.map((col) => `${escapeIdentifier(col)} = ?`);
  const params = [tableName, ...parts];
  const normalizedColumns = new Map();
  for (const col of columns) {
    const lower = String(col).toLowerCase();
    const sanitized = sanitizeColumnName(col);
    normalizedColumns.set(lower, col);
    normalizedColumns.set(sanitized, col);
  }
  const resolvedFilters = new Map();

  for (const [rawKey, rawValue] of Object.entries(tenantFilters || {})) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    const lookupLower = String(rawKey).toLowerCase();
    const lookupSanitized = sanitizeColumnName(rawKey);
    const actual =
      normalizedColumns.get(lookupLower) ||
      normalizedColumns.get(lookupSanitized);
    if (!actual) continue;
    const actualLower = String(actual).toLowerCase();
    const actualSanitized = sanitizeColumnName(actual);
    if (pkLowerSet.has(actualLower) || pkSanitizedSet.has(actualSanitized))
      continue;
    resolvedFilters.set(actual, rawValue);
  }

  const companyKeySanitized = sanitizeColumnName('company_id');
  const companyColumn =
    normalizedColumns.get(companyKeySanitized) ||
    normalizedColumns.get('company_id');
  if (
    companyColumn &&
    !pkSanitizedSet.has(companyKeySanitized) &&
    !resolvedFilters.has(companyColumn) &&
    defaultCompanyId !== undefined &&
    defaultCompanyId !== null &&
    defaultCompanyId !== ''
  ) {
    resolvedFilters.set(companyColumn, defaultCompanyId);
  }

  let companyFilterValue = null;
  for (const [columnName, value] of resolvedFilters.entries()) {
    await ensureValidColumns(tableName, columns, [columnName]);
    if (sanitizeColumnName(columnName) === companyKeySanitized) {
      companyFilterValue = value;
      const flags = await getTenantTableFlags(tableName);
      if (flags?.isShared) {
        whereClauses.push('`company_id` IN (' + GLOBAL_COMPANY_ID + ', ?)');
        params.push(value);
      } else {
        whereClauses.push(`${escapeIdentifier(columnName)} = ?`);
        params.push(value);
      }
    } else {
      whereClauses.push(`${escapeIdentifier(columnName)} = ?`);
      params.push(value);
    }
  }

  if (companyFilterValue == null && companyColumn) {
    if (pkSanitizedSet.has(companyKeySanitized)) {
      const idx = pkSanitized.findIndex((value) => value === companyKeySanitized);
      companyFilterValue = parts[idx];
    } else if (
      Object.entries(tenantFilters || {}).some(([key, val]) => {
        if (sanitizeColumnName(key) !== companyKeySanitized) return false;
        if (val === undefined || val === null || val === '') return false;
        companyFilterValue = val;
        return true;
      })
    ) {
    } else if (
      defaultCompanyId !== undefined &&
      defaultCompanyId !== null &&
      defaultCompanyId !== ''
    ) {
      companyFilterValue = defaultCompanyId;
    }
  }

  if (!includeDeleted) {
    const softDeleteColumn = await getSoftDeleteColumn(
      tableName,
      companyFilterValue,
    );
    if (softDeleteColumn) {
      const identifier = escapeIdentifier(softDeleteColumn);
      whereClauses.push(`(${identifier} IS NULL OR ${identifier} IN (0,''))`);
    }
  }

  const where = whereClauses.join(' AND ');
  logDb(
    `getTableRowById(${tableName}, id=${rowId}) where=${where} params=${JSON.stringify(
      params.slice(1),
    )}`,
  );
  const [rows] = await pool.query(
    `SELECT * FROM ?? WHERE ${where} LIMIT 1`,
    params,
  );
  return rows[0] || null;
}

/**
 * Update a table row by id
 */
export async function updateTableRow(
  tableName,
  id,
  updates,
  companyId,
  conn = pool,
  options = {},
) {
  const {
    ignoreTransactionLock = false,
    mutationContext = null,
    onLockInvalidation,
  } = options ?? {};
  const columns = await getTableColumnsSafe(tableName);
  const keys = Object.keys(updates);
  await ensureValidColumns(tableName, columns, keys);
  if (keys.length === 0) return { id };
  if (!ignoreTransactionLock && tableName && tableName.startsWith('transactions_')) {
    const locked = await isTransactionLocked(
      {
        tableName,
        recordId: id,
        companyId,
      },
      conn,
    );
    if (locked) {
      const err = new Error('Transaction locked for report approval');
      err.status = 423;
      throw err;
    }
  }
  const values = Object.values(updates);
  const setClause = keys.map((k) => `\`${k}\` = ?`).join(', ');

  if (tableName === 'company_module_licenses') {
    const [companyId, moduleKey] = String(id).split('-');
    await conn.query(
      `UPDATE company_module_licenses SET ${setClause} WHERE company_id = ? AND module_key = ?`,
      [...values, companyId, moduleKey],
    );
    return { company_id: companyId, module_key: moduleKey };
  }

  const pkCols = await getPrimaryKeyColumns(tableName);
  const pkLower = pkCols.map((c) => c.toLowerCase());
  const hasCompanyId = columns.some(
    (c) => c.toLowerCase() === 'company_id',
  );
  const addCompanyFilter =
    companyId != null && hasCompanyId && !pkLower.includes('company_id');
  logDb(`updateTableRow(${tableName}, id=${id}) using keys: ${pkCols.join(', ')}`);
  if (pkCols.length === 0) {
    const err = new Error(`Table ${tableName} has no primary or unique key`);
    err.status = 400;
    throw err;
  }

  let result;
  if (pkCols.length === 1) {
    const col = pkCols[0];
    let where = col === 'id' ? 'id = ?' : `\`${col}\` = ?`;
    const whereParams = [id];
    if (addCompanyFilter) {
      where += ' AND `company_id` = ?';
      whereParams.push(companyId);
    }
    await conn.query(
      `UPDATE ?? SET ${setClause} WHERE ${where}`,
      [tableName, ...values, ...whereParams],
    );
    result = { [col]: id };
  } else {
    const parts = parseCompositeRowId(id, pkCols.length);
    let where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
    const whereParams = [...parts];
    if (addCompanyFilter) {
      where += ' AND `company_id` = ?';
      whereParams.push(companyId);
    }
    await conn.query(
      `UPDATE ?? SET ${setClause} WHERE ${where}`,
      [tableName, ...values, ...whereParams],
    );
    result = {};
    pkCols.forEach((c, i) => {
      result[c] = parts[i];
    });
  }
  if (tableName && tableName.startsWith('transactions_')) {
    const lockImpacts = await handleReportLockReapproval({
      conn,
      tableName,
      companyId,
      recordIds: [String(id)],
      changedBy:
        mutationContext?.changedBy ??
        updates?.updated_by ??
        updates?.updatedBy ??
        null,
      reason: 'update',
    });
    if (lockImpacts?.length && typeof onLockInvalidation === 'function') {
      await onLockInvalidation(lockImpacts);
    }
  }
  return result;
}

export async function insertTableRow(
  tableName,
  row,
  seedTables,
  seedRecords,
  overwrite = false,
  userId = null,
  options = {},
) {
  const { conn = pool, mutationContext = null, onLockInvalidation } =
    options ?? {};
  const columns = await getTableColumnsSafe(tableName);
  const keys = Object.keys(row);
  logDb(`insertTableRow(${tableName}) columns=${keys.join(', ')}`);
  await ensureValidColumns(tableName, columns, keys);
  if (keys.length === 0) return null;
  const values = Object.values(row);
  const cols = keys.map((k) => `\`${k}\``).join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  const performInsert = async (targetConn) => {
    const [result] = await targetConn.query(
      `INSERT INTO ?? (${cols}) VALUES (${placeholders})`,
      [tableName, ...values],
    );
    return result;
  };

  let result;
  try {
    result = await performInsert(conn);
  } catch (err) {
    if (!isDynamicSqlTriggerError(err)) {
      throw err;
    }
    console.warn('Dynamic SQL trigger error during insert, applying fallback', {
      table: tableName,
      error: err,
    });
    let fallbackConn =
      typeof conn.getConnection === 'function' ? await conn.getConnection() : conn;
    const shouldRelease =
      fallbackConn && fallbackConn !== conn && typeof fallbackConn.release === 'function';
    let skipSessionEnabled = false;
    try {
      if (fallbackConn && typeof fallbackConn.query === 'function') {
        try {
          await fallbackConn.query('SET @skip_triggers = 1;');
          skipSessionEnabled = true;
        } catch (skipErr) {
          console.error('Failed to set skip_triggers flag for fallback insert', skipErr);
        }
        try {
          result = await performInsert(fallbackConn);
        } catch (skipErr) {
          if (!isDynamicSqlTriggerError(skipErr)) {
            throw skipErr;
          }
          console.warn(
            'Dynamic SQL trigger error persisted after skip_triggers flag, falling back to direct insert',
            { table: tableName, error: skipErr },
          );
          const [fallbackResult] = await fallbackConn.query(
            `INSERT INTO \`${tableName}\` (${cols}) VALUES (${placeholders})`,
            values,
          );
          result = fallbackResult;
        }
      } else {
        throw err;
      }
    } finally {
      if (skipSessionEnabled && fallbackConn) {
        try {
          await fallbackConn.query('SET @skip_triggers = NULL;');
        } catch (cleanupErr) {
          console.error('Failed to reset skip_triggers flag after insert fallback', cleanupErr);
        }
      }
      if (shouldRelease && fallbackConn) {
        fallbackConn.release();
      }
    }
  }
  if (tableName === 'companies') {
    const hasSeedTables = seedTables !== undefined;
    const hasSeedRecords = seedRecords !== undefined;
    if (hasSeedTables || hasSeedRecords) {
      await seedTenantTables(
        result.insertId,
        seedTables,
        seedRecords,
        overwrite,
        userId,
      );
    }
  }
  const insertId = result.insertId;
  let normalizedInsertId =
    insertId && insertId !== 0 ? String(insertId) : null;
  if (!normalizedInsertId && row && row.id !== undefined && row.id !== null) {
    normalizedInsertId = String(row.id);
  }
  if (tableName && tableName.startsWith('transactions_')) {
    const companyIdValue =
      mutationContext?.companyId ??
      row?.company_id ??
      row?.companyId ??
      null;
    const changedBy =
      mutationContext?.changedBy ?? userId ?? row?.created_by ?? null;
    const lockImpacts = await handleReportLockReapproval({
      conn,
      tableName,
      companyId: companyIdValue,
      recordIds: normalizedInsertId ? [normalizedInsertId] : [],
      changedBy,
      reason: 'insert',
    });
    if (lockImpacts?.length && typeof onLockInvalidation === 'function') {
      await onLockInvalidation(lockImpacts);
    }
  }
  return { id: insertId };
}

export async function deleteTableRow(
  tableName,
  id,
  companyId,
  conn = pool,
  userId = null,
  options = {},
) {
  const {
    companyIdFilter,
    softDeleteCompanyId,
    ignoreTransactionLock = false,
    mutationContext = null,
    onLockInvalidation,
  } = options ?? {};
  const effectiveCompanyIdForFilter =
    companyIdFilter !== undefined ? companyIdFilter : companyId;
  const effectiveCompanyIdForSoftDelete =
    softDeleteCompanyId !== undefined ? softDeleteCompanyId : companyId;
  const isTransactionTable =
    tableName && tableName.startsWith('transactions_');
  if (!ignoreTransactionLock && isTransactionTable) {
    const locked = await isTransactionLocked(
      {
        tableName,
        recordId: id,
        companyId: effectiveCompanyIdForFilter ?? companyId,
      },
      conn,
    );
    if (locked) {
      const err = new Error('Transaction locked for report approval');
      err.status = 423;
      throw err;
    }
  }
  if (tableName === 'company_module_licenses') {
    const [companyId, moduleKey] = String(id).split('-');
    await conn.query(
      'DELETE FROM company_module_licenses WHERE company_id = ? AND module_key = ?',
      [companyId, moduleKey],
    );
    return { company_id: companyId, module_key: moduleKey };
  }

  let columns = await getTableColumnsSafe(tableName);
  const pkCols = await getPrimaryKeyColumns(tableName);
  const pkLower = pkCols.map((c) => c.toLowerCase());
  logDb(`deleteTableRow(${tableName}, id=${id}) using keys: ${pkCols.join(', ')}`);
  if (pkCols.length === 0) {
    const err = new Error(`Table ${tableName} has no primary or unique key`);
    err.status = 400;
    throw err;
  }

  const softCol = await getSoftDeleteColumn(
    tableName,
    effectiveCompanyIdForSoftDelete,
  );

  columns = await getTableColumnsSafe(tableName);
  const hasCompanyId = columns.some(
    (c) => c.toLowerCase() === 'company_id',
  );
  const addCompanyFilter =
    effectiveCompanyIdForFilter != null &&
    hasCompanyId &&
    !pkLower.includes('company_id');

  let result;
  if (pkCols.length === 1) {
    const col = pkCols[0];
    let where = col === 'id' ? 'id = ?' : `\`${col}\` = ?`;
    const whereParams = [id];
    if (addCompanyFilter) {
      where += ' AND `company_id` = ?';
      whereParams.push(effectiveCompanyIdForFilter);
    }
    const { clause, params: softParams, supported } =
      buildSoftDeleteUpdateClause(columns, softCol, userId);
    if (supported) {
      await conn.query(`UPDATE ?? SET ${clause} WHERE ${where}`, [
        tableName,
        ...softParams,
        ...whereParams,
      ]);
    } else {
      await conn.query(`DELETE FROM ?? WHERE ${where}`, [tableName, ...whereParams]);
    }
    result = { [col]: id };
  } else {
    const parts = parseCompositeRowId(id, pkCols.length);
    let where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
    const whereParams = [...parts];
    if (addCompanyFilter) {
      where += ' AND `company_id` = ?';
      whereParams.push(effectiveCompanyIdForFilter);
    }
    const { clause, params: softParams, supported } =
      buildSoftDeleteUpdateClause(columns, softCol, userId);
    if (supported) {
      await conn.query(`UPDATE ?? SET ${clause} WHERE ${where}`, [
        tableName,
        ...softParams,
        ...whereParams,
      ]);
    } else {
      await conn.query(`DELETE FROM ?? WHERE ${where}`, [tableName, ...whereParams]);
    }
    result = {};
    pkCols.forEach((c, i) => {
      result[c] = parts[i];
    });
  }
  if (isTransactionTable) {
    const lockImpacts = await handleReportLockReapproval({
      conn,
      tableName,
      companyId: effectiveCompanyIdForFilter ?? companyId,
      recordIds: [String(id)],
      changedBy: mutationContext?.changedBy ?? userId ?? null,
      reason: 'delete',
    });
    if (lockImpacts?.length && typeof onLockInvalidation === 'function') {
      await onLockInvalidation(lockImpacts);
    }
  }
  return result;
}

function sanitizeDefaultRowPayload(payload, { stripAudit = true } = {}) {
  const sanitized = {};
  if (!payload || typeof payload !== 'object') return sanitized;
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    const lower = String(key).toLowerCase();
    if (lower === 'company_id') continue;
    if (stripAudit && (lower.startsWith('created_') || lower.startsWith('updated_'))) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

async function ensureDefaultTableColumns(tableName) {
  const columns = await getTableColumnsSafe(tableName);
  const hasCompanyId = columns.some(
    (c) => String(c).toLowerCase() === 'company_id',
  );
  if (!hasCompanyId) {
    const err = new Error(`Table ${tableName} does not have a company_id column`);
    err.status = 400;
    throw err;
  }
  return columns;
}

async function fetchTenantDefaultRow(tableName, rowId) {
  const columns = await ensureDefaultTableColumns(tableName);
  const pkCols = await getPrimaryKeyColumns(tableName);
  if (!Array.isArray(pkCols) || pkCols.length === 0) {
    const err = new Error(`Table ${tableName} has no primary or unique key`);
    err.status = 400;
    throw err;
  }
  const parts = parseCompositeRowId(rowId, pkCols.length);
  const whereClause = pkCols.map((col) => `${escapeIdentifier(col)} = ?`).join(' AND ');
  const params = [tableName, ...parts];
  const pkLower = pkCols.map((c) => c.toLowerCase());
  let where = whereClause;
  if (!pkLower.includes('company_id')) {
    where += ' AND `company_id` = ?';
    params.push(GLOBAL_COMPANY_ID);
  }
  const [rows] = await pool.query(
    `SELECT * FROM ?? WHERE ${where} LIMIT 1`,
    params,
  );
  const row = rows[0];
  if (!row) {
    const err = new Error('Row not found');
    err.status = 404;
    throw err;
  }
  const companyVal = row.company_id ?? row.companyId;
  if (Number(companyVal) !== GLOBAL_COMPANY_ID) {
    const err = new Error('Row not found');
    err.status = 404;
    throw err;
  }
  // ensure column cache includes latest values for future comparisons
  tableColumnsCache.set(tableName, columns);
  return row;
}

export async function insertTenantDefaultRow(tableName, payload, userId = null) {
  const columns = await ensureDefaultTableColumns(tableName);
  const sanitized = sanitizeDefaultRowPayload(payload);
  const row = { ...sanitized };
  row.company_id = GLOBAL_COMPANY_ID;
  const now = formatDateForDb(new Date());
  if (columns.includes('created_by')) row.created_by = userId;
  if (columns.includes('updated_by')) row.updated_by = userId;
  if (columns.includes('created_at')) row.created_at = now;
  if (columns.includes('updated_at')) row.updated_at = now;
  const keys = Object.keys(row);
  try {
    await ensureValidColumns(tableName, columns, keys);
  } catch (err) {
    err.status = err.status || 400;
    throw err;
  }
  const result = await insertTableRow(tableName, row);
  const pkCols = await getPrimaryKeyColumns(tableName);
  if (!Array.isArray(pkCols) || pkCols.length === 0) {
    const err = new Error(`Table ${tableName} has no primary or unique key`);
    err.status = 400;
    throw err;
  }
  const idParts = pkCols.map((col) => {
    if (col === 'company_id') return GLOBAL_COMPANY_ID;
    if (row[col] !== undefined && row[col] !== null) return row[col];
    if (pkCols.length === 1 && result?.id !== undefined) return result.id;
    const err = new Error(`Missing value for primary key column ${col}`);
    err.status = 400;
    throw err;
  });
  const identifier = idParts.map((part) => String(part)).join('-');
  return fetchTenantDefaultRow(tableName, identifier);
}

export async function updateTenantDefaultRow(tableName, rowId, payload, userId) {
  const columns = await ensureDefaultTableColumns(tableName);
  await fetchTenantDefaultRow(tableName, rowId);
  const sanitized = sanitizeDefaultRowPayload(payload);
  const keys = Object.keys(sanitized);
  if (keys.length === 0) {
    return fetchTenantDefaultRow(tableName, rowId);
  }
  const updates = { ...sanitized };
  const now = formatDateForDb(new Date());
  if (columns.includes('updated_by')) updates.updated_by = userId;
  if (columns.includes('updated_at')) updates.updated_at = now;
  try {
    await ensureValidColumns(tableName, columns, Object.keys(updates));
  } catch (err) {
    err.status = err.status || 400;
    throw err;
  }
  await updateTableRow(tableName, rowId, updates, GLOBAL_COMPANY_ID);
  return fetchTenantDefaultRow(tableName, rowId);
}

export async function deleteTenantDefaultRow(tableName, rowId, userId) {
  await ensureDefaultTableColumns(tableName);
  await fetchTenantDefaultRow(tableName, rowId);
  await deleteTableRow(tableName, rowId, GLOBAL_COMPANY_ID, pool, userId);
}

export async function listRowReferences(tableName, id, conn = pool) {
  const pkCols = await getPrimaryKeyColumns(tableName);
  const parts = String(id).split('-');
  let targetRowLoaded = false;
  let targetRow;

  const normalizeValue = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return String(value);
  };

  const loadTargetRow = async () => {
    if (targetRowLoaded) return targetRow;
    targetRowLoaded = true;
    if (!pkCols.length) {
      targetRow = null;
      return targetRow;
    }
    if (pkCols.some((_, idx) => parts[idx] === undefined)) {
      targetRow = null;
      return targetRow;
    }
    const whereClause = pkCols.map(() => '?? = ?').join(' AND ');
    const params = [];
    pkCols.forEach((col, i) => {
      params.push(col, parts[i]);
    });
    const [rows] = await conn.query(
      `SELECT * FROM ?? WHERE ${whereClause} LIMIT 1`,
      [tableName, ...params],
    );
    targetRow = rows[0] || null;
    return targetRow;
  };
  const [rels] = await conn.query(
    `SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = ?
      ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
    [tableName],
  );

  // Group columns belonging to the same foreign key constraint
  const groups = new Map();
  for (const rel of rels) {
    if (!groups.has(rel.CONSTRAINT_NAME)) {
      groups.set(rel.CONSTRAINT_NAME, {
        table: rel.TABLE_NAME,
        columns: [],
        refCols: [],
      });
    }
    const g = groups.get(rel.CONSTRAINT_NAME);
    g.columns.push(rel.COLUMN_NAME);
    g.refCols.push(rel.REFERENCED_COLUMN_NAME);
  }

  const results = [];
  for (const g of groups.values()) {
    const queryVals = [];
    const resultVals = [];
    const resolvedQueryVals = [];
    const missingIndexes = [];
    g.refCols.forEach((rc, idx) => {
      const pkIdx = pkCols.indexOf(rc);
      if (pkIdx === -1) {
        queryVals[idx] = undefined;
        resultVals[idx] = undefined;
        resolvedQueryVals[idx] = undefined;
        missingIndexes.push(idx);
      } else {
        const value = parts[pkIdx];
        queryVals[idx] = value;
        resultVals[idx] = normalizeValue(value);
        resolvedQueryVals[idx] = value;
      }
    });
    if (missingIndexes.length) {
      const row = await loadTargetRow();
      if (!row) continue;
      for (const idx of missingIndexes) {
        const rc = g.refCols[idx];
        if (Object.prototype.hasOwnProperty.call(row, rc)) {
          const value = row[rc];
          queryVals[idx] = value;
          resultVals[idx] = normalizeValue(value);
          resolvedQueryVals[idx] = value;
        }
      }
    }
    if (queryVals.includes(undefined)) continue;
    const whereClause = g.columns.map(() => '?? = ?').join(' AND ');
    const params = [];
    g.columns.forEach((col, i) => {
      params.push(col, queryVals[i]);
    });
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS count FROM ?? WHERE ${whereClause}`,
      [g.table, ...params],
    );
    if (rows[0].count > 0) {
      const result = {
        table: g.table,
        columns: g.columns,
        values: resultVals,
        queryValues: resolvedQueryVals.map((v) => v),
        count: rows[0].count,
      };
      if (g.columns.length === 1) {
        result.column = g.columns[0];
        result.value = resultVals[0];
        result.queryValue = resolvedQueryVals[0];
      }
      results.push(result);
    }
  }
  return results;
}

function resolveCascadeCompanyId(context, tableName, key) {
  if (!context) return undefined;
  const map = context[key];
  if (map && Object.prototype.hasOwnProperty.call(map, tableName)) {
    return map[tableName];
  }
  return context.defaultCompanyId;
}

async function deleteCascade(conn, tableName, id, visited, context) {
  const baseCompanyId = context?.defaultCompanyId;
  const filterCompanyId = resolveCascadeCompanyId(
    context,
    tableName,
    'tableCompanyIds',
  );
  const softDeleteCompanyId = resolveCascadeCompanyId(
    context,
    tableName,
    'softDeleteCompanyIds',
  );
  const key = `${tableName}:${id}`;
  if (visited.has(key)) return;
  visited.add(key);
  const refs = await listRowReferences(tableName, id, conn);
  for (const r of refs) {
    const pkCols = await getPrimaryKeyColumns(r.table);
    const whereClause = r.columns.map(() => '?? = ?').join(' AND ');
    const whereParams = [];
    const queryVals = r.queryValues ?? r.values;
    r.columns.forEach((col, i) => whereParams.push(col, queryVals[i]));

    if (pkCols.length === 0) {
      const refSoftDeleteCompanyId = resolveCascadeCompanyId(
        context,
        r.table,
        'softDeleteCompanyIds',
      );
      const softCol = await getSoftDeleteColumn(
        r.table,
        refSoftDeleteCompanyId,
      );
      const columns = await getTableColumnsSafe(r.table);
      const { clause, params: softParams, supported } =
        buildSoftDeleteUpdateClause(
          columns,
          softCol,
          context?.deletedBy ?? null,
        );
      if (!supported) {
        logDb(
          `deleteCascade abort: ${r.table} lacks soft delete columns when referenced from ${tableName}`,
        );
        const err = new Error(
          `Table ${r.table} does not support soft delete cascading`,
        );
        err.status = 400;
        throw err;
      }
      await conn.query(`UPDATE ?? SET ${clause} WHERE ${whereClause}`, [
        r.table,
        ...softParams,
        ...whereParams,
      ]);
      continue;
    }

    const colList = pkCols.map((c) => `\`${c}\``).join(', ');
    const [rows] = await conn.query(
      `SELECT ${colList} FROM ?? WHERE ${whereClause}`,
      [r.table, ...whereParams],
    );
    for (const row of rows) {
      const refId =
        pkCols.length === 1
          ? row[pkCols[0]]
          : pkCols.map((c) => row[c]).join('-');
      await deleteCascade(conn, r.table, refId, visited, context);
    }
  }
  await deleteTableRow(tableName, id, baseCompanyId, conn, context?.deletedBy ?? null, {
    companyIdFilter: filterCompanyId,
    softDeleteCompanyId,
  });
}

export async function deleteTableRowCascade(
  tableName,
  id,
  companyId,
  options = {},
) {
  const conn = await pool.getConnection();
  const {
    beforeDelete,
    companyIdOverrides,
    tenantCompanyId,
    deletedBy = null,
  } = options ?? {};
  const tableCompanyIds = {
    ...(companyIdOverrides || options?.tableCompanyIds || {}),
  };
  if (
    tenantCompanyId !== undefined &&
    !Object.prototype.hasOwnProperty.call(tableCompanyIds, 'companies')
  ) {
    tableCompanyIds.companies = tenantCompanyId;
  }
  const context = {
    defaultCompanyId: companyId,
    tableCompanyIds,
    softDeleteCompanyIds: options?.softDeleteCompanyIds
      ? { ...options.softDeleteCompanyIds }
      : {},
    deletedBy,
  };
  try {
    await conn.beginTransaction();
    if (typeof beforeDelete === 'function') {
      await beforeDelete(conn);
    }
    await deleteCascade(conn, tableName, id, new Set(), context);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listTransactions({
  table,
  branchId,
  startDate,
  endDate,
  page = 1,
  perPage = 50,
  refCol,
  refVal,
  company_id,
} = {}) {
  if (!table || !/^[a-zA-Z0-9_]+$/.test(table)) {
    throw new Error('Invalid table');
  }
  const clauses = [];
  const params = [];
  if (company_id !== undefined && company_id !== '') {
    clauses.push('company_id = ?');
    params.push(company_id);
  }
  if (branchId !== undefined && branchId !== '') {
    clauses.push('branch_id = ?');
    params.push(branchId);
  }
  if (startDate) {
    clauses.push('transaction_date >= ?');
    params.push(startDate);
  }
  if (endDate) {
    clauses.push('transaction_date <= ?');
    params.push(endDate);
  }
  if (refCol && /^[a-zA-Z0-9_]+$/.test(refCol)) {
    clauses.push(`${refCol} = ?`);
    params.push(refVal);
  }
  const where = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM \`${table}\` ${where}`,
    params,
  );
  const count = countRows[0].count;

  let sql = `SELECT * FROM \`${table}\` ${where} ORDER BY id DESC`;
  const qParams = [...params];
  if (count > 100) {
    const limit = Math.min(Number(perPage) || 50, 500);
    const offset = (Number(page) - 1) * limit;
    sql += ' LIMIT ? OFFSET ?';
    qParams.push(limit, offset);
  }

  const [rows] = await pool.query(sql, qParams);
  const lockStatuses = [
    REPORT_TRANSACTION_LOCK_STATUS.locked,
    REPORT_TRANSACTION_LOCK_STATUS.pending,
  ];
  const lockStatusSet = new Set(
    lockStatuses.map((status) => status && status.toLowerCase()),
  );
  const recordIds = Array.from(
    new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) => row?.id)
        .filter((value) => value !== undefined && value !== null && value !== '')
        .map((value) => String(value)),
    ),
  );
  const lockMetadataMap = new Map();
  if (recordIds.length > 0) {
    const idPlaceholders = recordIds.map(() => '?').join(', ');
    const statusPlaceholders = lockStatuses.map(() => '?').join(', ');
    const paramsList = [table];
    let companyClause = '';
    if (company_id !== undefined && company_id !== null && company_id !== '') {
      companyClause = ' AND company_id = ?';
      paramsList.push(company_id);
    }
    paramsList.push(...recordIds);
    paramsList.push(...lockStatuses);
    const prioritizeLockRow = (existing, candidate) => {
      if (!existing) return candidate;
      if (!candidate) return existing;
      const normalizeStatus = (value) =>
        value === undefined || value === null
          ? null
          : String(value).trim().toLowerCase() || null;
      const priority = (status) => {
        const normalized = normalizeStatus(status);
        if (normalized === REPORT_TRANSACTION_LOCK_STATUS.locked) return 0;
        if (normalized === REPORT_TRANSACTION_LOCK_STATUS.pending) return 1;
        return 2;
      };
      const existingPriority = priority(existing.status);
      const candidatePriority = priority(candidate.status);
      if (candidatePriority < existingPriority) return candidate;
      if (existingPriority < candidatePriority) return existing;
      const extractTimestamp = (row) =>
        row?.finalized_at ||
        row?.status_changed_at ||
        row?.updated_at ||
        row?.created_at ||
        null;
      const existingTimestamp = extractTimestamp(existing);
      const candidateTimestamp = extractTimestamp(candidate);
      if (!existingTimestamp) return candidate;
      if (!candidateTimestamp) return existing;
      return new Date(candidateTimestamp).getTime() >=
        new Date(existingTimestamp).getTime()
        ? candidate
        : existing;
    };
    try {
      const [lockRows] = await pool.query(
        `SELECT *
           FROM report_transaction_locks
          WHERE table_name = ?${companyClause}
            AND record_id IN (${idPlaceholders})
            AND status IN (${statusPlaceholders})`,
        paramsList,
      );
      if (Array.isArray(lockRows)) {
        lockRows.forEach((lockRow) => {
          const recordId = lockRow?.record_id;
          if (recordId === undefined || recordId === null || recordId === '') {
            return;
          }
          const key = String(recordId);
          const existing = lockMetadataMap.get(key);
          const resolved = prioritizeLockRow(existing, lockRow);
          lockMetadataMap.set(key, resolved || null);
        });
      }
    } catch (err) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  }
  const withLocks = (Array.isArray(rows) ? rows : []).map((row) => {
    const recordId = row?.id;
    const key =
      recordId === undefined || recordId === null || recordId === ''
        ? null
        : String(recordId);
    const metadata = key ? lockMetadataMap.get(key) || null : null;
    const normalizedStatus =
      metadata?.status === undefined || metadata?.status === null
        ? null
        : String(metadata.status).trim().toLowerCase() || null;
    const lockedFromMetadata =
      normalizedStatus && lockStatusSet.has(normalizedStatus);
    return {
      ...row,
      locked: Boolean(row?.locked) || Boolean(lockedFromMetadata),
      lockMetadata: metadata,
    };
  });
  return { rows: withLocks, count };
}

const REPORT_TRANSACTION_LOCK_STATUS = {
  pending: 'pending',
  locked: 'locked',
};

export async function lockTransactionsForReport(
  {
    companyId,
    requestId,
    transactions,
    createdBy,
    status = REPORT_TRANSACTION_LOCK_STATUS.pending,
  },
  conn = pool,
) {
  if (!requestId) {
    const err = new Error('requestId required');
    err.status = 400;
    throw err;
  }
  const normalized = Array.isArray(transactions)
    ? transactions
        .map((tx) => {
          if (!tx || typeof tx !== 'object') return null;
          const table = tx.table || tx.tableName;
          const recordId =
            tx.recordId ?? tx.record_id ?? tx.id ?? tx.transactionId;
          if (!table || !/^[a-zA-Z0-9_]+$/.test(String(table))) return null;
          if (recordId === null || recordId === undefined || recordId === '')
            return null;
          return {
            tableName: String(table),
            recordId: String(recordId),
          };
        })
        .filter(Boolean)
    : [];
  await conn.query(
    'DELETE FROM report_transaction_locks WHERE request_id = ?',
    [requestId],
  );
  if (!normalized.length) {
    return [];
  }
  const values = normalized
    .map(() =>
      ' (?, ?, ?, ?, ?, ?, NULL, NULL, NOW(), NOW()) ',
    )
    .join(',');
  const params = [];
  normalized.forEach(({ tableName, recordId }) => {
    params.push(
      companyId ?? null,
      requestId,
      tableName,
      recordId,
      status,
      createdBy ?? null,
    );
  });
  await conn.query(
    `INSERT INTO report_transaction_locks (
      company_id,
      request_id,
      table_name,
      record_id,
      status,
      created_by,
      finalized_by,
      finalized_at,
      created_at,
      updated_at
    ) VALUES ${values} ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      created_by = VALUES(created_by),
      finalized_by = NULL,
      finalized_at = NULL,
      updated_at = NOW()`,
    params,
  );
  return normalized;
}

export async function activateReportTransactionLocks(
  { requestId, finalizedBy },
  conn = pool,
) {
  if (!requestId) return;
  await conn.query(
    `UPDATE report_transaction_locks
      SET status = ?, finalized_by = ?, finalized_at = NOW(), updated_at = NOW()
      WHERE request_id = ?`,
    [REPORT_TRANSACTION_LOCK_STATUS.locked, finalizedBy ?? null, requestId],
  );
}

export async function releaseReportTransactionLocks(
  { requestId },
  conn = pool,
) {
  if (!requestId) return;
  await conn.query('DELETE FROM report_transaction_locks WHERE request_id = ?', [
    requestId,
  ]);
}

export async function listLockedTransactions(
  { tableName, companyId, includePending = true } = {},
  conn = pool,
) {
  if (!tableName) return [];
  const statuses = [REPORT_TRANSACTION_LOCK_STATUS.locked];
  if (includePending) statuses.push(REPORT_TRANSACTION_LOCK_STATUS.pending);
  const placeholders = statuses.map(() => '?').join(', ');
  const params = [tableName];
  let companyClause = '';
  if (companyId !== undefined && companyId !== null && companyId !== '') {
    companyClause = ' AND company_id = ?';
    params.push(companyId);
  }
  params.push(...statuses);
  try {
    const [rows] = await conn.query(
      `SELECT record_id FROM report_transaction_locks
       WHERE table_name = ?${companyClause}
         AND status IN (${placeholders})`,
      params,
    );
    return rows.map((row) => String(row.record_id));
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

export async function isTransactionLocked(
  { tableName, recordId, companyId, includePending = true } = {},
  conn = pool,
) {
  if (!tableName || recordId === undefined || recordId === null) return false;
  const statuses = [REPORT_TRANSACTION_LOCK_STATUS.locked];
  if (includePending) statuses.push(REPORT_TRANSACTION_LOCK_STATUS.pending);
  const placeholders = statuses.map(() => '?').join(', ');
  const params = [tableName, String(recordId)];
  let companyClause = '';
  if (companyId !== undefined && companyId !== null && companyId !== '') {
    companyClause = ' AND company_id = ?';
    params.push(companyId);
  }
  params.push(...statuses);
  try {
    const [rows] = await conn.query(
      `SELECT 1 FROM report_transaction_locks
       WHERE table_name = ? AND record_id = ?${companyClause}
         AND status IN (${placeholders})
       LIMIT 1`,
      params,
    );
    return rows.length > 0;
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return false;
    throw err;
  }
}

function normalizeLockEmpId(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

let reportLockStatusColumnCache = null;

async function getReportLockStatusColumnInfo() {
  if (reportLockStatusColumnCache) return reportLockStatusColumnCache;
  try {
    const columns = await getTableColumnsSafe('report_transaction_locks');
    const lower = new Set(columns.map((c) => String(c).toLowerCase()));
    reportLockStatusColumnCache = {
      exists: true,
      changedBy: lower.has('status_changed_by'),
      changedAt: lower.has('status_changed_at'),
    };
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      reportLockStatusColumnCache = {
        exists: false,
        changedBy: false,
        changedAt: false,
      };
    } else {
      throw err;
    }
  }
  return reportLockStatusColumnCache;
}

async function setLocksPendingForRecords({
  conn,
  tableName,
  recordIds,
  companyId,
  changedBy,
  columnInfo,
}) {
  if (!Array.isArray(recordIds) || recordIds.length === 0) return [];
  const normalizedIds = recordIds
    .map((value) => (value === undefined || value === null ? null : String(value)))
    .filter((value) => value !== null && value !== '');
  if (normalizedIds.length === 0) return [];
  const placeholders = normalizedIds.map(() => '?').join(', ');
  const selectParams = [tableName, ...normalizedIds];
  let companyClause = '';
  if (companyId !== undefined && companyId !== null && companyId !== '') {
    companyClause = ' AND company_id = ?';
    selectParams.push(companyId);
  }
  selectParams.push(REPORT_TRANSACTION_LOCK_STATUS.locked);
  const [rows] = await conn.query(
    `SELECT request_id, company_id, record_id
       FROM report_transaction_locks
      WHERE table_name = ? AND record_id IN (${placeholders})${companyClause}
        AND status = ?`,
    selectParams,
  );
  if (!rows.length) return [];
  const updateAssignments = [
    'status = ?',
    'finalized_by = NULL',
    'finalized_at = NULL',
    'updated_at = NOW()',
  ];
  const updateParams = [REPORT_TRANSACTION_LOCK_STATUS.pending];
  if (columnInfo?.changedBy) {
    updateAssignments.push('status_changed_by = ?');
    updateParams.push(changedBy ?? null);
  }
  if (columnInfo?.changedAt) {
    updateAssignments.push('status_changed_at = NOW()');
  }
  const updateWhereParams = [tableName, ...normalizedIds];
  let updateCompanyClause = '';
  if (companyId !== undefined && companyId !== null && companyId !== '') {
    updateCompanyClause = ' AND `company_id` = ?';
    updateWhereParams.push(companyId);
  }
  updateWhereParams.push(REPORT_TRANSACTION_LOCK_STATUS.locked);
  await conn.query(
    `UPDATE report_transaction_locks
        SET ${updateAssignments.join(', ')}
      WHERE table_name = ? AND record_id IN (${placeholders})${updateCompanyClause}
        AND status = ?`,
    [...updateParams, ...updateWhereParams],
  );
  return rows.map((row) => ({
    requestId: row.request_id,
    companyId: row.company_id ?? companyId ?? null,
    recordId: String(row.record_id),
  }));
}

async function ensurePendingLocksForNewRecord({
  conn,
  tableName,
  recordId,
  companyId,
  changedBy,
  columnInfo,
}) {
  if (recordId === undefined || recordId === null || recordId === '') return [];
  const normalizedId = String(recordId);
  const params = [tableName];
  let companyClause = '';
  if (companyId !== undefined && companyId !== null && companyId !== '') {
    companyClause = ' AND company_id = ?';
    params.push(companyId);
  }
  params.push(REPORT_TRANSACTION_LOCK_STATUS.locked);
  const [rows] = await conn.query(
    `SELECT request_id, company_id, created_by
       FROM report_transaction_locks
      WHERE table_name = ?${companyClause}
        AND status = ?`,
    params,
  );
  if (!rows.length) return [];
  const distinct = new Map();
  rows.forEach((row) => {
    const requestId = row.request_id;
    if (!requestId || distinct.has(requestId)) return;
    distinct.set(requestId, {
      request_id: requestId,
      company_id: row.company_id ?? companyId ?? null,
      created_by: row.created_by ?? null,
    });
  });
  const entries = Array.from(distinct.values());
  if (!entries.length) return [];
  const insertColumns = [
    'company_id',
    'request_id',
    'table_name',
    'record_id',
    'status',
    'created_by',
  ];
  if (columnInfo?.changedBy) insertColumns.push('status_changed_by');
  if (columnInfo?.changedAt) insertColumns.push('status_changed_at');
  insertColumns.push('finalized_by', 'finalized_at', 'created_at', 'updated_at');
  const valueClauses = [];
  const insertParams = [];
  for (const entry of entries) {
    const parts = ['?', '?', '?', '?', '?', '?'];
    insertParams.push(
      entry.company_id ?? companyId ?? null,
      entry.request_id,
      tableName,
      normalizedId,
      REPORT_TRANSACTION_LOCK_STATUS.pending,
      entry.created_by ?? null,
    );
    if (columnInfo?.changedBy) {
      parts.push('?');
      insertParams.push(changedBy ?? null);
    }
    if (columnInfo?.changedAt) {
      parts.push('NOW()');
    }
    parts.push('NULL', 'NULL', 'NOW()', 'NOW()');
    valueClauses.push(`(${parts.join(', ')})`);
  }
  if (!valueClauses.length) return [];
  const updateAssignments = [
    'status = VALUES(status)',
    'updated_at = NOW()',
    'finalized_by = NULL',
    'finalized_at = NULL',
  ];
  if (columnInfo?.changedBy) {
    updateAssignments.push('status_changed_by = VALUES(status_changed_by)');
  }
  if (columnInfo?.changedAt) {
    updateAssignments.push('status_changed_at = NOW()');
  }
  await conn.query(
    `INSERT INTO report_transaction_locks (${insertColumns.join(', ')})
     VALUES ${valueClauses.join(', ')}
     ON DUPLICATE KEY UPDATE ${updateAssignments.join(', ')}`,
    insertParams,
  );
  return entries.map((entry) => ({
    requestId: entry.request_id,
    companyId: entry.company_id ?? companyId ?? null,
    recordId: normalizedId,
  }));
}

async function fetchReapprovalRecipients(conn, requestIds) {
  if (!Array.isArray(requestIds) || requestIds.length === 0) return [];
  const placeholders = requestIds.map(() => '?').join(', ');
  const [rows] = await conn.query(
    `SELECT pr.request_id,
            pr.company_id,
            pr.emp_id,
            pr.senior_empid,
            emp.employment_senior_plan_empid,
            emp.employment_senior_empid AS legacy_senior
       FROM pending_request pr
       LEFT JOIN tbl_employment emp
         ON emp.employment_emp_id = pr.emp_id
      WHERE pr.request_id IN (${placeholders})`,
    requestIds,
  );
  return rows.map((row) => {
    const requester = normalizeLockEmpId(row.emp_id);
    const planSenior =
      normalizeLockEmpId(row.employment_senior_plan_empid) ||
      normalizeLockEmpId(row.senior_empid) ||
      normalizeLockEmpId(row.legacy_senior);
    return {
      requestId: row.request_id,
      companyId: row.company_id,
      requester,
      planSenior,
    };
  });
}

function buildReapprovalMessage({
  requestId,
  tableName,
  recordIds,
  reason,
  changedBy,
}) {
  const action =
    reason === 'insert'
      ? 'New transaction recorded'
      : reason === 'delete'
      ? 'Transaction removed'
      : 'Transaction updated';
  const ids = Array.isArray(recordIds) ? recordIds : [];
  let recordSummary = 'records were modified';
  if (ids.length === 1) {
    recordSummary = `record ${ids[0]}`;
  } else if (ids.length > 1) {
    recordSummary = `records ${ids.join(', ')}`;
  }
  const actorSuffix = changedBy ? ` by ${changedBy}` : '';
  return `Report approval request #${requestId} requires reapproval: ${action} in ${tableName} (${recordSummary})${actorSuffix}.`;
}

export async function handleReportLockReapproval({
  conn,
  tableName,
  companyId,
  recordIds = [],
  changedBy,
  reason,
}) {
  if (!tableName || !tableName.startsWith('transactions_')) return [];
  const columnInfo = await getReportLockStatusColumnInfo();
  if (columnInfo?.exists === false) return [];
  const normalizedChangedBy = normalizeLockEmpId(changedBy);
  const normalizedCompanyId =
    companyId !== undefined && companyId !== null && companyId !== ''
      ? companyId
      : null;
  let impacted = [];
  try {
    if (reason === 'insert') {
      const targetId = Array.isArray(recordIds) ? recordIds[0] : recordIds;
      impacted = await ensurePendingLocksForNewRecord({
        conn,
        tableName,
        recordId: targetId,
        companyId: normalizedCompanyId,
        changedBy: normalizedChangedBy,
        columnInfo,
      });
    } else {
      impacted = await setLocksPendingForRecords({
        conn,
        tableName,
        recordIds,
        companyId: normalizedCompanyId,
        changedBy: normalizedChangedBy,
        columnInfo,
      });
    }
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
  if (!impacted.length) return [];
  const grouped = new Map();
  impacted.forEach((row) => {
    if (!row.requestId) return;
    const key = row.requestId;
    if (!grouped.has(key)) {
      grouped.set(key, {
        requestId: key,
        companyId: row.companyId ?? normalizedCompanyId ?? null,
        tableName,
        reason,
        recordIds: new Set(),
      });
    }
    grouped.get(key).recordIds.add(String(row.recordId));
  });
  if (grouped.size === 0) return [];
  let recipients = [];
  try {
    recipients = await fetchReapprovalRecipients(conn, Array.from(grouped.keys()));
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  const notifications = [];
  const dedupe = new Set();
  recipients.forEach((meta) => {
    const entry = grouped.get(meta.requestId);
    if (!entry) return;
    const records = Array.from(entry.recordIds);
    const message = buildReapprovalMessage({
      requestId: meta.requestId,
      tableName,
      recordIds: records,
      reason,
      changedBy: normalizedChangedBy,
    });
    const pushNotification = (recipient) => {
      const normalizedRecipient = normalizeLockEmpId(recipient);
      if (!normalizedRecipient) return;
      const dedupeKey = `${meta.requestId}:${normalizedRecipient}`;
      if (dedupe.has(dedupeKey)) return;
      dedupe.add(dedupeKey);
      notifications.push({
        companyId: meta.companyId ?? entry.companyId ?? normalizedCompanyId ?? null,
        recipient: normalizedRecipient,
        requestId: meta.requestId,
        message,
      });
    };
    pushNotification(meta.requester);
    pushNotification(meta.planSenior);
  });
  if (notifications.length) {
    const values = notifications
      .map(() => '(?, ?, \'reapproval\', ?, ?, ?)')
      .join(', ');
    const params = [];
    notifications.forEach((notification) => {
      params.push(
        notification.companyId ?? normalizedCompanyId ?? null,
        notification.recipient,
        notification.requestId,
        notification.message,
        normalizedChangedBy ?? null,
      );
    });
    await conn.query(
      `INSERT INTO notifications (company_id, recipient_empid, type, related_id, message, created_by)
       VALUES ${values}`,
      params,
    );
  }
  return Array.from(grouped.values()).map((entry) => ({
    requestId: entry.requestId,
    companyId: entry.companyId ?? normalizedCompanyId ?? null,
    tableName: entry.tableName,
    reason: entry.reason,
    recordIds: Array.from(entry.recordIds),
    changedBy: normalizedChangedBy ?? null,
  }));
}

export async function recordReportApproval(
  {
    companyId,
    requestId,
    procedureName,
    parameters,
    approvedBy,
    snapshotMeta,
  },
  conn = pool,
) {
  if (!requestId) {
    const err = new Error('requestId required');
    err.status = 400;
    throw err;
  }
  if (!procedureName) {
    const err = new Error('procedureName required');
    err.status = 400;
    throw err;
  }
  const paramsJson = JSON.stringify(parameters ?? {});
  const snapshotPath = snapshotMeta?.filePath ?? null;
  const snapshotName = snapshotMeta?.fileName ?? null;
  const snapshotMime = snapshotMeta?.mimeType ?? null;
  const snapshotSize =
    snapshotMeta?.byteSize === undefined || snapshotMeta?.byteSize === null
      ? null
      : Number(snapshotMeta.byteSize);
  const snapshotArchivedAt = normalizeDateTimeInput(snapshotMeta?.archivedAt);
  await conn.query(
    `INSERT INTO report_approvals (
      company_id,
      request_id,
      procedure_name,
      parameters_json,
      approved_by,
      approved_at,
      snapshot_file_path,
      snapshot_file_name,
      snapshot_file_mime,
      snapshot_file_size,
      snapshot_archived_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      procedure_name = VALUES(procedure_name),
      parameters_json = VALUES(parameters_json),
      approved_by = VALUES(approved_by),
      approved_at = NOW(),
      snapshot_file_path = VALUES(snapshot_file_path),
      snapshot_file_name = VALUES(snapshot_file_name),
      snapshot_file_mime = VALUES(snapshot_file_mime),
      snapshot_file_size = VALUES(snapshot_file_size),
      snapshot_archived_at = VALUES(snapshot_archived_at),
      updated_at = NOW()`,
    [
      companyId ?? null,
      requestId,
      procedureName,
      paramsJson,
      approvedBy ?? null,
      snapshotPath,
      snapshotName,
      snapshotMime,
      snapshotSize,
      snapshotArchivedAt,
    ],
  );
}

export async function getReportApprovalRecord(requestId, conn = pool) {
  if (!requestId) return null;
  const [rows] = await conn.query(
    `SELECT request_id,
            company_id,
            procedure_name,
            parameters_json,
            approved_by,
            approved_at,
            snapshot_file_path,
            snapshot_file_name,
            snapshot_file_mime,
            snapshot_file_size,
            snapshot_archived_at
       FROM report_approvals
      WHERE request_id = ?
      LIMIT 1`,
    [requestId],
  );
  if (!rows.length) return null;
  const row = rows[0];
  let params = {};
  try {
    params = row.parameters_json ? JSON.parse(row.parameters_json) : {};
  } catch {
    params = {};
  }
  return {
    requestId: row.request_id,
    companyId: row.company_id ?? null,
    procedureName: row.procedure_name || null,
    parameters: params,
    approvedBy: row.approved_by || null,
    approvedAt: row.approved_at || null,
    snapshotFilePath: row.snapshot_file_path || null,
    snapshotFileName: row.snapshot_file_name || null,
    snapshotFileMime: row.snapshot_file_mime || null,
    snapshotFileSize:
      row.snapshot_file_size === undefined || row.snapshot_file_size === null
        ? null
        : Number(row.snapshot_file_size),
    snapshotArchivedAt: row.snapshot_archived_at || null,
  };
}

export async function callStoredProcedure(name, params = [], aliases = []) {
  const conn = await pool.getConnection();
  try {
    const callParts = [];
    const callArgs = [];
    const outVars = [];

    for (let i = 0; i < params.length; i++) {
      const alias = aliases[i];
      const value = params[i];
      const cleanVal = value === '' || value === undefined ? null : value;
      if (alias) {
        const varName = `@_${name}_${i}`;
        await conn.query(`SET ${varName} = ?`, [cleanVal]);
        callParts.push(varName);
        outVars.push([alias, varName]);
      } else {
        callParts.push('?');
        callArgs.push(cleanVal);
      }
    }

    const sql = `CALL ${name}(${callParts.join(', ')})`;
    const [rows] = await conn.query(sql, callArgs);
    let first = Array.isArray(rows) ? rows[0] || {} : rows || {};

    if (outVars.length > 0) {
      const selectSql =
        'SELECT ' + outVars.map(([n, v]) => `${v} AS \`${n}\``).join(', ');
      const [outRows] = await conn.query(selectSql);
      if (Array.isArray(outRows) && outRows[0]) {
        first = { ...first, ...outRows[0] };
      }
    }

    aliases.forEach((alias) => {
      if (alias && !(alias in first)) first[alias] = null;
    });

    return first;
  } finally {
    conn.release();
  }
}

export async function getProcedureLockCandidates(
  name,
  params = [],
  aliases = [],
  options = {},
) {
  const {
    companyId,
    tenantFilters,
    resolveSnapshotRow,
    resolveAlternateSnapshotRow,
  } = options || {};
  const conn = await pool.getConnection();
  const candidates = new Map();

  const candidateVariables = [
    '@__report_lock_candidates',
    '@_report_lock_candidates',
    '@report_lock_candidates',
  ];

  const sanitizeTableName = (value) => {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    if (!str) return null;
    if (!/^[a-zA-Z0-9_]+$/.test(str)) return null;
    return str;
  };

  const normalizeRecordId = (value) => {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    return str ? str : null;
  };

  const mergeCandidateExtras = (existing, extras = {}) => {
    if (!existing) return extras;
    const merged = { ...existing };
    if (extras?.label && !merged.label) merged.label = String(extras.label);
    if (extras?.description && !merged.description)
      merged.description = String(extras.description);
    if (extras?.context && !merged.context)
      merged.context = extras.context;
    return merged;
  };

  const toDisplayString = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : null;
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    return null;
  };

  const findFieldValue = (row, tokens) => {
    if (!row || typeof row !== 'object') return null;
    const entries = Object.entries(row).map(([key, value]) => ({
      key,
      normalized: String(key || '').trim().toLowerCase(),
      value: toDisplayString(value),
    }));
    const matches = [];
    entries.forEach((entry) => {
      if (!entry.value) return;
      tokens.forEach((token, idx) => {
        const normalizedToken = token.toLowerCase();
        if (entry.normalized === normalizedToken) {
          matches.push({ entry, tokenIdx: idx, score: 0 });
        } else if (entry.normalized.endsWith(normalizedToken)) {
          matches.push({ entry, tokenIdx: idx, score: 1 });
        } else if (entry.normalized.includes(normalizedToken)) {
          matches.push({ entry, tokenIdx: idx, score: 2 });
        }
      });
    });
    if (!matches.length) return null;
    matches.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.tokenIdx !== b.tokenIdx) return a.tokenIdx - b.tokenIdx;
      return a.entry.normalized.length - b.entry.normalized.length;
    });
    return matches[0]?.entry?.value ?? null;
  };

  const deriveLabelMetadata = (row) => {
    if (!row || typeof row !== 'object') {
      return { label: null, description: null };
    }
    const primaryNameTokens = [
      'label',
      'name',
      'full_name',
      'fullname',
      'ner',
      'title',
    ];
    const secondaryNameTokens = [
      'description',
      'desc',
      'note',
      'notes',
      'detail',
      'details',
      'info',
      'information',
      'remark',
      'remarks',
    ];
    const codeTokens = [
      'code',
      'code_value',
      'codevalue',
      'registration',
      'reg',
      'serial',
      'number',
      'no',
      'reference',
      'ref',
    ];

    const nameValue = findFieldValue(row, primaryNameTokens);
    const detailValue = findFieldValue(row, secondaryNameTokens);
    const codeValue = findFieldValue(row, codeTokens);

    let label = null;
    if (nameValue && codeValue) {
      label = `${codeValue} — ${nameValue}`;
    } else if (nameValue) {
      label = nameValue;
    } else if (codeValue) {
      label = codeValue;
    }

    let description = null;
    if (detailValue && detailValue !== label) {
      description = detailValue;
    } else if (nameValue && label !== nameValue) {
      description = nameValue;
    } else if (detailValue) {
      description = detailValue;
    }

    return { label, description };
  };

  const getSnapshotRow =
    typeof resolveSnapshotRow === 'function'
      ? resolveSnapshotRow
      : (table, id, contextOptions = {}) =>
          getTableRowById(table, id, {
            defaultCompanyId: companyId,
            includeDeleted: true,
            ...contextOptions,
          });

  const getAlternateSnapshot =
    typeof resolveAlternateSnapshotRow === 'function'
      ? resolveAlternateSnapshotRow
      : (table, id, extraOptions = {}) =>
          fetchSnapshotRowByAlternateKey(table, id, {
            companyId,
            tenantFilters,
            ...extraOptions,
          });

  const upsertCandidate = (tableName, recordId, extras = {}) => {
    const table = sanitizeTableName(tableName);
    const recId = normalizeRecordId(recordId);
    if (!table || !recId) return;
    const key = `${table}#${recId}`;
    const existing = candidates.get(key);
    const mergedExtras = mergeCandidateExtras(existing, extras);
    const next = {
      tableName: table,
      recordId: recId,
      key,
    };
    if (mergedExtras.label) next.label = String(mergedExtras.label);
    if (mergedExtras.description)
      next.description = String(mergedExtras.description);
    if (mergedExtras.context) next.context = mergedExtras.context;
    candidates.set(key, next);
  };

  const toArray = (value) => {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      const parts = value
        .split(/[,;\s]+/)
        .map((part) => part.trim())
        .filter(Boolean);
      return parts;
    }
    return [value];
  };

  const parseCandidateString = (raw, extras = {}) => {
    if (typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null) {
        collectCandidateValue(parsed, extras);
        return;
      }
    } catch {}
    const delimiters = ['#', ':', '|', '@'];
    let firstIdx = -1;
    let firstDelim = null;
    for (const delim of delimiters) {
      const idx = trimmed.indexOf(delim);
      if (idx > 0 && (firstIdx === -1 || idx < firstIdx)) {
        firstIdx = idx;
        firstDelim = delim;
      }
    }
    if (firstIdx > 0 && firstDelim) {
      const tablePart = trimmed.slice(0, firstIdx).trim();
      const idPart = trimmed.slice(firstIdx + 1).trim();
      if (tablePart && idPart) {
        const tokens = toArray(idPart);
        if (tokens.length === 0) {
          upsertCandidate(tablePart, idPart, extras);
          return;
        }
        tokens.forEach((token) => {
          if (!token) return;
          if (delimiters.some((delim) => token.includes(delim))) {
            parseCandidateString(token, extras);
            return;
          }
          upsertCandidate(tablePart, token, extras);
        });
        return;
      }
    }
  };

  const collectFromObjectMap = (obj, extras = {}) => {
    if (!obj || typeof obj !== 'object') return;
    const reservedKeys = new Set([
      'table',
      'table_name',
      'tableName',
      'lock_table',
      'lockTable',
      'lock_table_name',
      'lockTableName',
      'recordId',
      'record_id',
      'lock_record_id',
      'lockRecordId',
      'recordIds',
      'record_ids',
      'lock_record_ids',
      'lockRecordIds',
      'ids',
      'records',
      'id',
      'transaction_id',
      'transactionId',
      'tx_id',
      'txId',
      'label',
      'title',
      'description',
      'note',
      'notes',
      'context',
    ]);
    for (const [key, value] of Object.entries(obj)) {
      if (reservedKeys.has(key)) continue;
      const tableCandidate = sanitizeTableName(key);
      if (!tableCandidate) continue;

      if (Array.isArray(value)) {
        const derivedExtras = { ...extras, table: extras?.table ?? tableCandidate };
        value.forEach((entry) => collectCandidateValue(entry, derivedExtras));
        continue;
      }

      if (value && typeof value === 'object') {
        const derivedExtras = { ...extras };
        if (!derivedExtras.table) derivedExtras.table = tableCandidate;
        collectCandidateValue(value, derivedExtras);
        continue;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        const looksJson =
          (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'));
        if (looksJson) {
          const derivedExtras = { ...extras, table: extras?.table ?? tableCandidate };
          collectCandidateValue(trimmed, derivedExtras);
        }
      }
    }
  };

  const collectCandidateValue = (value, extras = {}) => {
    if (value === undefined || value === null) return;
    if (Buffer.isBuffer(value)) {
      const text = value.toString('utf8');
      if (!text) return;
      collectCandidateValue(text, extras);
      return;
    }
    if (typeof value === 'string') {
      parseCandidateString(value, extras);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => collectCandidateValue(entry, extras));
      return;
    }
    if (typeof value !== 'object') {
      const recordId = normalizeRecordId(value);
      if (recordId && extras.table) {
        upsertCandidate(extras.table, recordId, extras);
      }
      return;
    }

    const derivedExtras = { ...extras };
    if (value.label ?? value.title) {
      derivedExtras.label = value.label ?? value.title;
    }
    if (value.description ?? value.note ?? value.notes) {
      derivedExtras.description =
        value.description ?? value.note ?? value.notes;
    }
    if (value.context && typeof value.context === 'object') {
      derivedExtras.context = value.context;
    }

    const explicitTableCandidates = [
      value.lock_table,
      value.lockTable,
      value.lock_table_name,
      value.lockTableName,
      value.table,
      value.table_name,
      value.tableName,
      value.source_table,
      value.transaction_table,
      value.tx_table,
    ]
      .map(sanitizeTableName)
      .filter(Boolean);

    const fallbackTable =
      explicitTableCandidates.length || !extras?.table
        ? null
        : sanitizeTableName(extras.table);
    const tableCandidates = fallbackTable
      ? [fallbackTable]
      : explicitTableCandidates;

    const recordIdCandidates = [
      value.lock_record_id,
      value.lockRecordId,
      value.record_id,
      value.recordId,
      value.transaction_id,
      value.transactionId,
      value.tx_id,
      value.txId,
      value.id,
    ]
      .map(normalizeRecordId)
      .filter(Boolean);

    if (recordIdCandidates.length && tableCandidates.length) {
      recordIdCandidates.forEach((id) => {
        tableCandidates.forEach((table) => {
          upsertCandidate(table, id, derivedExtras);
        });
      });
    }

    const listCandidates = [
      value.lock_record_ids,
      value.lockRecordIds,
      value.record_ids,
      value.recordIds,
      value.ids,
    ];
    listCandidates.forEach((list) => {
      const arr = toArray(list)
        .map(normalizeRecordId)
        .filter(Boolean);
      if (!arr.length || !tableCandidates.length) return;
      arr.forEach((id) => {
        tableCandidates.forEach((table) => {
          upsertCandidate(table, id, derivedExtras);
        });
      });
    });

    if (Array.isArray(value.records)) {
      value.records.forEach((record) => {
        if (!record || typeof record !== 'object') return;
        const recordTables = [
          record.lock_table,
          record.lockTable,
          record.table,
          record.table_name,
          record.tableName,
        ]
          .map(sanitizeTableName)
          .filter(Boolean);
        const recordIds = [
          record.lock_record_id,
          record.lockRecordId,
          record.record_id,
          record.recordId,
          record.id,
        ]
          .map(normalizeRecordId)
          .filter(Boolean);
        const tablesToUse = recordTables.length ? recordTables : tableCandidates;
        recordIds.forEach((id) => {
          tablesToUse.forEach((table) => {
            upsertCandidate(table, id, derivedExtras);
          });
        });
      });
    }

    collectFromObjectMap(value, derivedExtras);
  };

  try {
    for (const variable of candidateVariables) {
      try {
        await conn.query(`SET ${variable} = JSON_ARRAY()`);
      } catch {
        await conn.query(`SET ${variable} = '[]'`);
      }
    }

    const callParts = [];
    const callArgs = [];
    const outVars = [];

    for (let i = 0; i < params.length; i += 1) {
      const alias = aliases[i];
      const value = params[i];
      const cleanVal = value === '' || value === undefined ? null : value;
      if (alias) {
        const varName = `@_${name}_${i}`;
        await conn.query(`SET ${varName} = ?`, [cleanVal]);
        callParts.push(varName);
        outVars.push([alias, varName]);
      } else {
        callParts.push('?');
        callArgs.push(cleanVal);
      }
    }

    const sql = `CALL ${name}(${callParts.join(', ')})`;
    const [callResult] = await conn.query(sql, callArgs);

    if (outVars.length > 0) {
      const selectSql =
        'SELECT ' + outVars.map(([n, v]) => `${v} AS \`${n}\``).join(', ');
      await conn.query(selectSql);
    }

    const [varRows] = await conn.query(
      'SELECT @__report_lock_candidates AS strict, @_report_lock_candidates AS secondary, @report_lock_candidates AS legacy',
    );
    if (Array.isArray(varRows) && varRows[0]) {
      const values = [
        varRows[0].strict,
        varRows[0].secondary,
        varRows[0].legacy,
      ];
      values.forEach((val) => collectCandidateValue(val));
    }

    if (Array.isArray(callResult)) {
      callResult.forEach((resultSet) => {
        if (Array.isArray(resultSet)) {
          resultSet.forEach((row) => collectCandidateValue(row));
        } else {
          collectCandidateValue(resultSet);
        }
      });
    } else {
      collectCandidateValue(callResult);
    }

    const flatCandidates = Array.from(candidates.values());
    if (!flatCandidates.length) {
      return flatCandidates;
    }

    const bucketMap = new Map();
    flatCandidates.forEach((candidate) => {
      const table = candidate?.tableName;
      const recordId = candidate?.recordId;
      if (!table || recordId === undefined || recordId === null) return;
      if (!bucketMap.has(table)) {
        bucketMap.set(table, {
          tableName: table,
          recordIds: new Set(),
          candidates: [],
        });
      }
      const bucket = bucketMap.get(table);
      bucket.recordIds.add(String(recordId));
      bucket.candidates.push(candidate);
    });

    const statusOrder = [
      REPORT_TRANSACTION_LOCK_STATUS.locked,
      REPORT_TRANSACTION_LOCK_STATUS.pending,
    ];

    const resolveLockMetadata = (existing, nextRow) => {
      if (!existing) return nextRow;
      if (!nextRow) return existing;
      const priority = (status) => {
        if (status === REPORT_TRANSACTION_LOCK_STATUS.locked) return 0;
        if (status === REPORT_TRANSACTION_LOCK_STATUS.pending) return 1;
        return 2;
      };
      const existingPriority = priority(existing.status);
      const nextPriority = priority(nextRow.status);
      if (nextPriority < existingPriority) return nextRow;
      if (existingPriority < nextPriority) return existing;
      const existingTimestamp =
        existing.updated_at || existing.status_changed_at || existing.created_at;
      const nextTimestamp =
        nextRow.updated_at || nextRow.status_changed_at || nextRow.created_at;
      if (!existingTimestamp) return nextRow;
      if (!nextTimestamp) return existing;
      return new Date(nextTimestamp).getTime() >=
        new Date(existingTimestamp).getTime()
        ? nextRow
        : existing;
    };

    for (const bucket of bucketMap.values()) {
      const recordIds = Array.from(bucket.recordIds);
      const lockMap = new Map();

      if (recordIds.length) {
        const idPlaceholders = recordIds.map(() => '?').join(', ');
        const statusPlaceholders = statusOrder.map(() => '?').join(', ');
        const paramsList = [bucket.tableName];
        let companyClause = '';
        if (companyId !== undefined && companyId !== null && companyId !== '') {
          companyClause = ' AND company_id = ?';
          paramsList.push(companyId);
        }
        paramsList.push(...recordIds);
        paramsList.push(...statusOrder);
        try {
          const [lockRows] = await conn.query(
            `SELECT *
               FROM report_transaction_locks
              WHERE table_name = ?${companyClause}
                AND record_id IN (${idPlaceholders})
                AND status IN (${statusPlaceholders})`,
            paramsList,
          );
          if (Array.isArray(lockRows)) {
            lockRows.forEach((row) => {
              const recordId = row?.record_id;
              if (recordId === undefined || recordId === null) return;
              const key = String(recordId);
              const existing = lockMap.get(key);
              const resolved = resolveLockMetadata(existing, row);
              lockMap.set(key, resolved);
            });
          }
        } catch (err) {
          if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
        }
      }

      for (const candidate of bucket.candidates) {
        const recordId = String(candidate.recordId);
        const lockRow = lockMap.get(recordId) || null;
        const lockStatus = lockRow?.status || null;
        const locked = statusOrder.includes(lockStatus);
        const lockedBy =
          lockRow?.finalized_by ??
          lockRow?.status_changed_by ??
          lockRow?.created_by ??
          null;
        const lockedAt =
          lockRow?.finalized_at ??
          lockRow?.status_changed_at ??
          lockRow?.updated_at ??
          lockRow?.created_at ??
          null;

        candidate.locked = Boolean(locked);
        candidate.lockStatus = lockStatus;
        candidate.lockedBy = lockedBy;
        candidate.lockedAt = lockedAt;
        candidate.lockMetadata = lockRow;

        let snapshotRow = null;
        try {
          snapshotRow = await getSnapshotRow(bucket.tableName, recordId, {
            companyId,
            tenantFilters,
          });
        } catch (err) {
          if (err?.status !== 400 && err?.code !== 'ER_NO_SUCH_TABLE') {
            throw err;
          }
        }

        if (!snapshotRow) {
          snapshotRow = await getAlternateSnapshot(
            bucket.tableName,
            recordId,
            {
              companyId,
              tenantFilters,
            },
          );
        }

        if (snapshotRow && typeof snapshotRow === 'object') {
          candidate.snapshot = snapshotRow;
          candidate.snapshotColumns = Object.keys(snapshotRow);
          const { label, description } = deriveLabelMetadata(snapshotRow);
          if (!candidate.label && label) {
            candidate.label = label;
          }
          if (!candidate.description && description) {
            candidate.description = description;
          }
          if (!candidate.context || typeof candidate.context !== 'object') {
            candidate.context = {};
          }
          if (!('snapshot' in candidate.context)) {
            candidate.context.snapshot = snapshotRow;
          }
        } else {
          candidate.snapshot = null;
          candidate.snapshotColumns = [];
        }
      }
    }

    return flatCandidates;
  } finally {
    conn.release();
  }
}

export async function listStoredProcedures(prefix = '') {
  const [rows] = await pool.query(
    'SHOW PROCEDURE STATUS WHERE Db = DATABASE()'
  );
  return rows
    .map((r) => r.Name)
    .filter(
      (n) =>
        typeof n === 'string' &&
        (!prefix || n.toLowerCase().includes(prefix.toLowerCase())),
    );
}

export async function getProcedureParams(name) {
  const [rows] = await pool.query(
    `SELECT PARAMETER_NAME AS name
       FROM information_schema.parameters
      WHERE SPECIFIC_NAME = ?
        AND ROUTINE_TYPE = 'PROCEDURE'
      ORDER BY ORDINAL_POSITION`,
    [name],
  );
  return rows.map((r) => r.name).filter(Boolean);
}

export async function getProcedureRawRows(
  name,
  params = {},
  column,
  groupField,
  groupValue,
  extraConditions = [],
  sessionVars = {},
) {
  let createSql = '';
  const dbName = process.env.DB_NAME;
  try {
    const dbIdent = mysql.format('??', [dbName]);
    const procIdent = mysql.format('??', [name]);
    const showSql = `SHOW CREATE PROCEDURE ${dbIdent}.${procIdent}`;
    const [rows] = await pool.query(showSql);
    createSql = rows && rows[0] && rows[0]['Create Procedure'];
  } catch {}
  if (!createSql) {
    try {
      const [rows] = await pool.query(
        `SELECT ROUTINE_DEFINITION AS def
           FROM information_schema.routines
          WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = ?`,
        [dbName, name],
      );
      createSql = rows && rows[0] && rows[0].def;
    } catch {}
  }
  if (!createSql) {
    const file = `${name.replace(/[^a-z0-9_]/gi, '_')}_rows.sql`;
    await fs.writeFile(
      tenantConfigPath(file),
      `-- No SQL found for ${name}\n`,
    );
    return { rows: [], sql: '', original: '', file };
  }
  const bodyMatch = createSql.match(/BEGIN\s*([\s\S]*)END/i);
  const body = bodyMatch ? bodyMatch[1] : createSql;
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const firstSelectIdx = body.search(/SELECT/i);
  let sql = firstSelectIdx === -1 ? createSql : body.slice(firstSelectIdx);
  const originalSql = sql;
  let remainder = '';
  let displayFields = [];
  const firstSemi = sql.indexOf(';');
  if (firstSemi !== -1) {
    remainder = sql.slice(firstSemi);
    sql = sql.slice(0, firstSemi);
  }

  let columnWasAggregated = false;
  if (/^SELECT/i.test(sql)) {
    function filterAggregates(input, aliasToKeep) {
      const upper = input.toUpperCase();
      // find FROM at top level
      let depth = 0;
      let fromIdx = -1;
      for (let i = 0; i < upper.length; i++) {
        const ch = upper[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (depth === 0 && upper.startsWith('FROM', i)) {
          fromIdx = i;
          break;
        }
      }
      if (fromIdx === -1) return input;
      const fieldsPart = input.slice(6, fromIdx);
      const rest = input.slice(fromIdx);
      const fields = [];
      let buf = '';
      depth = 0;
      for (let i = 0; i < fieldsPart.length; i++) {
        const ch = fieldsPart[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
          fields.push(buf.trim());
          buf = '';
        } else {
          buf += ch;
        }
      }
      if (buf.trim()) fields.push(buf.trim());
      const kept = [];
      for (let field of fields) {
        const upperField = field.toUpperCase();
        if (upperField.includes('COUNT(')) {
          continue;
        }
        const sumIdx = upperField.indexOf('SUM(');
        if (sumIdx === -1) {
          kept.push(field);
          continue;
        }
        const aliasMatch = field.match(/(?:AS\s+)?`?([a-zA-Z0-9_]+)`?\s*$/i);
        const alias = aliasMatch ? aliasMatch[1] : null;
        if (alias && alias.toLowerCase() === String(aliasToKeep).toLowerCase()) {
          columnWasAggregated = true;
          let start = sumIdx + 4;
          let depth2 = 1;
          let j = start;
          while (j < field.length && depth2 > 0) {
            const ch2 = field[j];
            if (ch2 === '(') depth2++;
            else if (ch2 === ')') depth2--;
            j++;
          }
          const inner = field.slice(start, j - 1);
          field = field.slice(0, sumIdx) + inner + field.slice(j);
          kept.push(field.trim());
        }
      }
      if (!kept.length) return input;
      return 'SELECT ' + kept.join(', ') + ' ' + rest;
    }

    sql = filterAggregates(sql, column);

    sql = sql.replace(/GROUP BY[\s\S]*?(HAVING|ORDER BY|$)/i, '$1');
    sql = sql.replace(/HAVING[\s\S]*?(ORDER BY|$)/i, '$1');

    if (params && typeof params === 'object') {
      for (const [key, val] of Object.entries(params)) {
        const re = new RegExp(`\\b${escapeRegExp(key)}\\b`, 'gi');
        const rep =
          val === null || val === undefined
            ? 'NULL'
            : typeof val === 'number'
            ? String(val)
            : `'${val}'`;
        sql = sql.replace(re, rep);
      }
    }

    if (sessionVars && typeof sessionVars === 'object') {
      for (const [key, val] of Object.entries(sessionVars)) {
        const re = new RegExp(`@session_${escapeRegExp(key)}\\b`, 'gi');
        const rep =
          val === null || val === undefined
            ? 'NULL'
            : typeof val === 'number'
            ? String(val)
            : `'${val}'`;
        sql = sql.replace(re, rep);
      }
    }

    sql = sql.replace(/;\s*$/, '');

    const fromIdx = (() => {
      const upper = sql.toUpperCase();
      let depth = 0;
      for (let i = 0; i < upper.length; i++) {
        const ch = upper[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (depth === 0 && upper.startsWith('FROM', i)) return i;
      }
      return -1;
    })();
    let primaryFields = [];
    let table = '';
    if (fromIdx !== -1) {
      const fieldsPart = sql.slice(6, fromIdx);
      const rest = sql.slice(fromIdx);
      const afterFrom = rest.slice(4).trimStart();
      let alias = '';
      if (afterFrom.startsWith('(')) {
        let depth = 1;
        let i = 1;
        while (i < afterFrom.length && depth > 0) {
          const ch = afterFrom[i];
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          i++;
        }
        const sub = afterFrom.slice(1, i - 1);
        const aliasMatch = afterFrom.slice(i).match(/^\s*([a-zA-Z0-9_]+)/);
        alias = aliasMatch ? aliasMatch[1] : '';
        const tableMatch = sub.match(/FROM\s+`?([a-zA-Z0-9_]+)`?/i);
        table = tableMatch ? tableMatch[1] : '';
      } else {
        const m = afterFrom.match(/`?([a-zA-Z0-9_]+)`?(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?/i);
        if (m) {
          table = m[1];
          alias = m[2] || m[1];
        }
      }
      if (table) {
        const prefix = alias ? `${alias}.` : '';
        // Collect fields from primary table
        const fields = [];
        let buf = '';
        let depth = 0;
        for (let i = 0; i < fieldsPart.length; i++) {
          const ch = fieldsPart[i];
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          if (ch === ',' && depth === 0) {
            fields.push(buf.trim());
            buf = '';
          } else {
            buf += ch;
          }
        }
        if (buf.trim()) fields.push(buf.trim());
        for (const field of fields) {
          const cleaned = field.replace(/`/g, '').trim();
          const lower = cleaned.toLowerCase();
          if (/(?:sum|count|avg|min|max)\s*\(/i.test(lower)) continue;
          if (
            (prefix && cleaned.startsWith(prefix)) ||
            (!prefix && !cleaned.includes('.'))
          ) {
            const m = field.match(/(?:AS\s+)?`?([a-zA-Z0-9_]+)`?\s*$/i);
            const alias = m
              ? m[1]
              : cleaned.slice(prefix ? prefix.length : 0).split(/\s+/)[0];
            if (
              columnWasAggregated &&
              alias.toLowerCase() === String(column).toLowerCase()
            ) {
              continue;
            }
            primaryFields.push(alias);
          }
        }
        try {
          const { path: tfPath } = await getConfigPath('transactionForms.json');
          const txt = await fs.readFile(tfPath, 'utf8');
          const cfg = JSON.parse(txt);
          const set = new Set();

          function collect(obj) {
            if (!obj || typeof obj !== 'object') return;
            ['visibleFields', 'headerFields', 'mainFields', 'footerFields'].forEach(
              (key) => {
                if (Array.isArray(obj[key])) {
                  for (const f of obj[key]) set.add(String(f));
                }
              },
            );
            for (const val of Object.values(obj)) {
              if (val && typeof val === 'object' && !Array.isArray(val)) {
                collect(val);
              }
            }
          }

          if (cfg[table]) {
            collect(cfg[table]);
          }
          const add = [];
          for (const f of set) {
            if (!new RegExp(`\\b${escapeRegExp(f)}\\b`, 'i').test(fieldsPart)) {
              add.push(prefix + f);
            }
          }
          if (add.length) {
            const fp = fieldsPart.trim();
            const newFields = fp ? fp + ', ' + add.join(', ') : add.join(', ');
            sql = 'SELECT ' + newFields + ' ' + rest;
          }
        } catch {}
        try {
          const { path: dfPath } = await getConfigPath('tableDisplayFields.json');
          const dfTxt = await fs.readFile(dfPath, 'utf8');
          const dfCfg = JSON.parse(dfTxt);
          if (Array.isArray(dfCfg)) {
            const candidates = dfCfg.filter((cfg) => cfg?.table === table);
            const selected =
              candidates.find((cfg) => !cfg.filterColumn && !cfg.filterValue) || candidates[0];
            if (Array.isArray(selected?.displayFields)) {
              displayFields = selected.displayFields.map(String);
            }
          } else if (Array.isArray(dfCfg[table]?.displayFields)) {
            displayFields = dfCfg[table].displayFields.map(String);
          }
        } catch {}
      }
    }

    let fieldTypes = {};
    if (table) {
      try {
        const [cols] = await pool.query('SHOW COLUMNS FROM ??', [table]);
        for (const c of cols) {
          fieldTypes[c.Field.toLowerCase()] = c.Type.toLowerCase();
        }
      } catch {}
    }

    if (
      groupValue !== undefined ||
      (Array.isArray(extraConditions) && extraConditions.length)
    ) {
      const pfSet = new Set(primaryFields.map((f) => String(f).toLowerCase()));
      const clauses = [];
      function formatVal(field, val) {
        if (val === undefined || val === null || val === '') return null;
        const type = fieldTypes[String(field).toLowerCase()] || '';
        if (/int|decimal|float|double|bit|year/.test(type)) {
          const num = Number(val);
          return Number.isNaN(num) ? mysql.escape(val) : String(num);
        }
        if (/date|time|timestamp/.test(type)) {
          if (typeof val === 'string') {
            const m = val.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/);
            if (m) {
              const datePart = m[1];
              const timePart = m[2];
              if (/^time$/.test(type) || (type.includes('time') && !type.includes('date'))) {
                return mysql.escape(timePart || datePart);
              }
              if (timePart) return mysql.escape(`${datePart} ${timePart}`);
              return mysql.escape(datePart);
            }
          }
          const d = new Date(val);
          if (!Number.isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            if (/^time$/.test(type) || (type.includes('time') && !type.includes('date'))) {
              return mysql.escape(`${hh}:${mi}:${ss}`);
            }
            if (type.includes('timestamp') || type.includes('datetime')) {
              return mysql.escape(`${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`);
            }
            return mysql.escape(`${yyyy}-${mm}-${dd}`);
          }
        }
        return mysql.escape(val);
      }
      if (
        groupValue !== undefined &&
        groupValue !== null &&
        groupValue !== '' &&
        groupField
      ) {
        const gf = String(groupField).split('.').pop();
        if (pfSet.has(gf.toLowerCase())) {
          const formatted = formatVal(gf, groupValue);
          if (formatted !== null) clauses.push(`${gf} = ${formatted}`);
        }
      }
      if (Array.isArray(extraConditions)) {
        for (const { field, value } of extraConditions) {
          if (!field) continue;
          if (value === undefined || value === null || value === '') continue;
          const f = String(field).split('.').pop();
          if (!pfSet.has(f.toLowerCase())) continue;
          const formatted = formatVal(f, value);
          if (formatted !== null) clauses.push(`${f} = ${formatted}`);
        }
      }
      if (clauses.length) {
        sql = `SELECT * FROM (${sql}) AS _raw WHERE ${clauses.join(' AND ')}`;
      }
    }

    sql = sql.replace(/;\s*$/, '');
  }

  sql += remainder;
  sql = sql.replace(/;\s*$/, '');

  const file = `${name.replace(/[^a-z0-9_]/gi, '_')}_rows.sql`;
  let content = `-- Original SQL for ${name}\n${originalSql}\n`;
  if (sql && sql !== originalSql) {
    content += `\n-- Transformed SQL for ${name}\n${sql}\n`;
  }
  await fs.writeFile(tenantConfigPath(file), content);

  try {
    const [out] = await pool.query(sql);
    return { rows: out, sql, original: originalSql, file, displayFields };
  } catch {
    return { rows: [], sql, original: originalSql, file, displayFields };
  }
}

let posSessionColumnInfo = null;

async function getPosSessionColumnInfo() {
  if (posSessionColumnInfo) return posSessionColumnInfo;
  try {
    const columns = await getTableColumnsSafe("pos_session");
    const lower = new Set(columns.map((c) => String(c).toLowerCase()));
    posSessionColumnInfo = {
      exists: true,
      hasDeviceId: lower.has("device_id"),
      hasDeviceUuid: lower.has("device_uuid"),
      hasCurrentUserId: lower.has("current_user_id"),
      hasMerchantId: lower.has("merchant_id"),
      hasMerchantTin: lower.has("merchant_tin"),
      hasDepartmentId: lower.has("department_id"),
      hasWorkplaceId: lower.has("workplace_id"),
      hasSeniorId: lower.has("senior_id"),
      hasPlanSeniorId: lower.has("plan_senior_id"),
      hasPosNo: lower.has("pos_no"),
      hasPosTerminalNo: lower.has("pos_terminal_no"),
      hasDeviceMac: lower.has("device_mac"),
      hasLocation: lower.has("location"),
      hasLocationLat: lower.has("location_lat"),
      hasLocationLon: lower.has("location_lon"),
    };
  } catch (err) {
    if (err?.code === "ER_NO_SUCH_TABLE") {
      posSessionColumnInfo = {
        exists: false,
        hasDeviceId: false,
        hasDeviceUuid: false,
        hasCurrentUserId: false,
        hasMerchantId: false,
        hasMerchantTin: false,
        hasDepartmentId: false,
        hasWorkplaceId: false,
        hasSeniorId: false,
        hasPlanSeniorId: false,
        hasPosNo: false,
        hasPosTerminalNo: false,
        hasDeviceMac: false,
        hasLocation: false,
        hasLocationLat: false,
        hasLocationLon: false,
      };
    } else {
      throw err;
    }
  }
  return posSessionColumnInfo;
}

function normalizePosSessionLocation(location) {
  if (location === undefined || location === null) return {};
  if (typeof location === "string") {
    try {
      const parsed = JSON.parse(location);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return { raw: location };
    }
  }
  if (typeof location === "object") {
    return Array.isArray(location) ? { points: location } : location;
  }
  return { value: location };
}

function normalizePosSessionCoordinates(location, explicitCoords = {}) {
  const normalized = normalizePosSessionLocation(location);
  const coerceNumber = (value) => {
    if (value === undefined || value === null) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const arrayCandidate = Array.isArray(location) ? location : null;
  const latCandidates = [
    explicitCoords.locationLat,
    normalized.lat,
    normalized.latitude,
    normalized.lat_deg,
    normalized.latDeg,
    normalized.coords?.lat,
    normalized.coords?.latitude,
    arrayCandidate?.[0],
  ];
  const lonCandidates = [
    explicitCoords.locationLon,
    normalized.lon,
    normalized.lng,
    normalized.long,
    normalized.longitude,
    normalized.coords?.lon,
    normalized.coords?.lng,
    normalized.coords?.longitude,
    arrayCandidate?.[1],
  ];
  const lat = latCandidates.map(coerceNumber).find((v) => v !== null) ?? null;
  const lon = lonCandidates.map(coerceNumber).find((v) => v !== null) ?? null;
  const normalizedLocation = { ...normalized };
  if (lat !== null && normalizedLocation.lat === undefined) {
    normalizedLocation.lat = lat;
  }
  if (lon !== null && (normalizedLocation.lon === undefined && normalizedLocation.lng === undefined)) {
    normalizedLocation.lon = lon;
  }
  return { lat, lon, normalizedLocation };
}

function normalizeDeviceMac(value) {
  if (value === undefined || value === null) return "unknown";
  const trimmed = String(value).trim();
  return trimmed || "unknown";
}

export async function logPosSessionStart(
  {
    sessionUuid,
    companyId,
    branchId,
    departmentId = null,
    workplaceId = null,
    merchantId = null,
    merchantTin = null,
    posTerminalNo,
    posNo,
    deviceMac,
    deviceId,
    deviceUuid = null,
    location = {},
    locationLat = null,
    locationLon = null,
    startedAt = new Date(),
    currentUserId = null,
    seniorId = null,
    planSeniorId = null,
  } = {},
  conn = pool,
) {
  const info = await getPosSessionColumnInfo();
  if (!info.exists || !sessionUuid) return null;
  const cols = ["session_uuid", "company_id", "branch_id"];
  const params = [sessionUuid, companyId ?? 0, branchId ?? 0];
  if (info.hasDepartmentId) {
    cols.push("department_id");
    params.push(departmentId ?? null);
  }
  if (info.hasWorkplaceId) {
    cols.push("workplace_id");
    params.push(workplaceId ?? null);
  }
  if (info.hasMerchantId) {
    cols.push("merchant_id");
    params.push(merchantId ?? null);
  }
  if (info.hasMerchantTin) {
    cols.push("merchant_tin");
    params.push(merchantTin ?? null);
  }
  const normalizePosField = (value) =>
    value === undefined || value === null ? null : String(value).trim() || null;
  if (info.hasPosTerminalNo) {
    cols.push("pos_terminal_no");
    params.push(normalizePosField(posTerminalNo ?? posNo));
  } else if (info.hasPosNo) {
    cols.push("pos_no");
    params.push(normalizePosField(posNo ?? posTerminalNo));
  }
  if (info.hasDeviceId) {
    cols.push("device_id");
    params.push(deviceId ?? deviceUuid ?? null);
  } else if (info.hasDeviceUuid) {
    cols.push("device_uuid");
    params.push(deviceUuid ?? deviceId ?? null);
  }
  if (info.hasDeviceMac) {
    cols.push("device_mac");
    params.push(normalizeDeviceMac(deviceMac));
  }
  const { lat, lon, normalizedLocation } = normalizePosSessionCoordinates(
    location,
    { locationLat, locationLon },
  );
  if (info.hasLocationLat) {
    cols.push("location_lat");
    params.push(lat);
  }
  if (info.hasLocationLon) {
    cols.push("location_lon");
    params.push(lon);
  }
  if (info.hasLocation) {
    cols.push("location");
    params.push(JSON.stringify(normalizedLocation));
  }
  cols.push("started_at");
  params.push(normalizeDateTimeInput(startedAt) ?? new Date());
  if (info.hasCurrentUserId) {
    cols.push("current_user_id");
    params.push(currentUserId ?? null);
  }
  if (info.hasSeniorId) {
    cols.push("senior_id");
    params.push(seniorId ?? null);
  }
  if (info.hasPlanSeniorId) {
    cols.push("plan_senior_id");
    params.push(planSeniorId ?? null);
  }

  const placeholders = cols.map(() => "?").join(", ");
  const updateCols = [
    "company_id = VALUES(company_id)",
    "branch_id = VALUES(branch_id)",
    "started_at = VALUES(started_at)",
    "ended_at = NULL",
  ];
  if (info.hasDepartmentId) {
    updateCols.push("department_id = VALUES(department_id)");
  }
  if (info.hasWorkplaceId) {
    updateCols.push("workplace_id = VALUES(workplace_id)");
  }
  if (info.hasMerchantId) {
    updateCols.push("merchant_id = VALUES(merchant_id)");
  }
  if (info.hasMerchantTin) {
    updateCols.push("merchant_tin = VALUES(merchant_tin)");
  }
  if (info.hasPosTerminalNo) {
    updateCols.push("pos_terminal_no = VALUES(pos_terminal_no)");
  } else if (info.hasPosNo) {
    updateCols.push("pos_no = VALUES(pos_no)");
  }
  if (info.hasDeviceId) {
    updateCols.push("device_id = VALUES(device_id)");
  } else if (info.hasDeviceUuid) {
    updateCols.push("device_uuid = VALUES(device_uuid)");
  }
  if (info.hasDeviceMac) {
    updateCols.push("device_mac = VALUES(device_mac)");
  }
  if (info.hasLocationLat) {
    updateCols.push("location_lat = VALUES(location_lat)");
  }
  if (info.hasLocationLon) {
    updateCols.push("location_lon = VALUES(location_lon)");
  }
  if (info.hasLocation) {
    updateCols.push("location = VALUES(location)");
  }
  if (info.hasCurrentUserId) {
    updateCols.push("current_user_id = VALUES(current_user_id)");
  }
  if (info.hasSeniorId) {
    updateCols.push("senior_id = VALUES(senior_id)");
  }
  if (info.hasPlanSeniorId) {
    updateCols.push("plan_senior_id = VALUES(plan_senior_id)");
  }
  const sql = `INSERT INTO pos_session (${cols.join(
    ", ",
  )}) VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE ${updateCols.join(", ")}`;
  await conn.query(sql, params);
  return sessionUuid;
}

export async function closePosSession(
  sessionUuid,
  endedAt = new Date(),
  conn = pool,
) {
  const info = await getPosSessionColumnInfo();
  if (!info.exists || !sessionUuid) return false;
  const endedValue = normalizeDateTimeInput(endedAt) ?? new Date();
  await conn.query(
    "UPDATE pos_session SET ended_at = ? WHERE session_uuid = ?",
    [endedValue, sessionUuid],
  );
  return true;
}
