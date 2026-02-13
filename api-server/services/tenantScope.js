// Tenant scope helper module:
// - Creates tenant-scoped temp tables via create_tenant_temp_table.
// - Provides query wrapper that rewrites source table references to temp tables.
// - Excludes system tables from visibility filtering by default.

import crypto from 'crypto';

const SYSTEM_TABLES = new Set([
  'users',
  'login',
  'authentication',
  'tenant_tables',
  'system_schema_version',
]);

/**
 * @typedef {Object} TenantScopeResult
 * @property {string} sourceTable - Original business table name.
 * @property {string} tempTableName - Generated temporary table name.
 * @property {boolean} scoped - Whether tenant visibility scoping was applied.
 */

/**
 * @typedef {Object} TempTableCreationOptions
 * @property {string} [tmpTableName] - Optional temp table name override.
 * @property {boolean} [force=false] - Force temp-table creation for system tables.
 */

/**
 * @typedef {Object} TenantEngineConfig
 * @property {Set<string>} [excludedSystemTables] - System tables excluded from tenant temp-table scoping.
 * @property {string} [procedureName='create_tenant_temp_table'] - Stored procedure name used for tenant visibility.
 */

/** @type {TenantEngineConfig} */
const defaultEngineConfig = {
  excludedSystemTables: SYSTEM_TABLES,
  procedureName: 'create_tenant_temp_table',
};


async function withScopedConnection(connectionLike, handler) {
  if (connectionLike && typeof connectionLike.getConnection === 'function') {
    const scopedConn = await connectionLike.getConnection();
    try {
      return await handler(scopedConn);
    } finally {
      scopedConn.release();
    }
  }
  return handler(connectionLike);
}

function normalizeIdentifier(input = '') {
  const value = String(input || '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${input}`);
  }
  return value;
}

/**
 * Returns whether a table should be tenant-scoped through the visibility engine.
 * @param {string} tableName - Source table name.
 * @param {TenantEngineConfig} [config] - Optional engine configuration.
 * @returns {boolean}
 */
export function shouldTenantScopeTable(tableName, config = defaultEngineConfig) {
  const safeName = normalizeIdentifier(tableName).toLowerCase();
  const excluded = config?.excludedSystemTables ?? SYSTEM_TABLES;
  return !excluded.has(safeName);
}

/**
 * Creates a tenant-scoped temporary table via `create_tenant_temp_table`.
 * @param {import('mysql2/promise').PoolConnection} connection - Active DB connection.
 * @param {string} tableName - Source business table.
 * @param {number|string} companyId - Tenant/company identifier.
 * @param {TempTableCreationOptions} [options] - Temp table creation options.
 * @returns {Promise<TenantScopeResult>}
 */
export async function createTmpBusinessTable(connection, tableName, companyId, options = {}) {
  const safeTable = normalizeIdentifier(tableName);
  const scoped = shouldTenantScopeTable(safeTable) || Boolean(options.force);
  if (!scoped) {
    return {
      sourceTable: safeTable,
      tempTableName: safeTable,
      scoped: false,
    };
  }

  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const tmpTableName = normalizeIdentifier(
    options.tmpTableName || `tmp_${safeTable}_${process.pid}_${randomSuffix}`,
  );
  await connection.query('CALL create_tenant_temp_table(?, ?, ?)', [
    safeTable,
    tmpTableName,
    Number(companyId) || 0,
  ]);

  return {
    sourceTable: safeTable,
    tempTableName: tmpTableName,
    scoped: true,
  };
}

/**
 * Runs a query using a tenant-scoped temporary table generated from the source table.
 *
 * Use `{{table}}` in `originalQuery` as a placeholder for the scoped table name.
 * If absent, direct occurrences of the source table are replaced.
 *
 * @param {import('mysql2/promise').PoolConnection} connection - Active DB connection.
 * @param {string} tableName - Source table that should be scoped.
 * @param {number|string} companyId - Tenant/company identifier.
 * @param {string} originalQuery - Query text to execute.
 * @param {Array<unknown>} [params=[]] - Parameter values.
 * @returns {Promise<[any, any]>}
 */
export async function queryWithTenantScope(
  connection,
  tableName,
  companyId,
  originalQuery,
  params = [],
) {
  return withScopedConnection(connection, async (scopedConn) => {
    const scope = await createTmpBusinessTable(scopedConn, tableName, companyId);
    const escapedSource = scope.sourceTable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sourceRegex = new RegExp(`\\b${escapedSource}\\b`, 'g');
    const scopedQuery = originalQuery.includes('{{table}}')
      ? originalQuery.replaceAll('{{table}}', scope.tempTableName)
      : originalQuery.replace(sourceRegex, scope.tempTableName);

    return scopedConn.query(scopedQuery, params);
  });
}
