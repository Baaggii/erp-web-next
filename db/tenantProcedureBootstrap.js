// Optional startup self-healing strategy:
// - Recreates create_tenant_temp_table when missing.
// - Recreates missing report procedures from SQL definition files.

import fs from 'fs/promises';
import path from 'path';

/**
 * Checks whether a stored procedure exists in the current database.
 * @param {import('mysql2/promise').PoolConnection | import('mysql2/promise').Pool} connection
 * @param {string} procedureName
 * @returns {Promise<boolean>}
 */
async function procedureExists(connection, procedureName) {
  const [rows] = await connection.query(
    `SELECT ROUTINE_NAME
       FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA = DATABASE()
        AND ROUTINE_TYPE = 'PROCEDURE'
        AND ROUTINE_NAME = ?
      LIMIT 1`,
    [procedureName],
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Recreates tenant/reporting procedures from SQL files when missing.
 * Designed for startup/migration hooks to self-heal procedure drift.
 *
 * @param {import('mysql2/promise').PoolConnection | import('mysql2/promise').Pool} connection
 * @param {{reportProcedureDir?: string}} [options]
 * @returns {Promise<{recreated: string[]}>}
 */
export async function ensureTenantVisibilityProcedures(connection, options = {}) {
  const recreated = [];

  const tenantProcName = 'create_tenant_temp_table';
  const tenantProcPath = path.join(process.cwd(), 'db', 'procedures', `${tenantProcName}.sql`);
  const hasTenantProc = await procedureExists(connection, tenantProcName);
  if (!hasTenantProc) {
    const sql = await fs.readFile(tenantProcPath, 'utf8');
    await connection.query(sql);
    recreated.push(tenantProcName);
  }

  const reportDir =
    options.reportProcedureDir ||
    path.join(process.cwd(), 'config', '0', 'report_builder', 'procedures');

  let files = [];
  try {
    files = await fs.readdir(reportDir);
  } catch {
    return { recreated };
  }

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const procedureName = file.replace(/\.sql$/i, '');
    const exists = await procedureExists(connection, procedureName);
    if (exists) continue;

    const sql = await fs.readFile(path.join(reportDir, file), 'utf8');
    await connection.query(sql);
    recreated.push(procedureName);
  }

  return { recreated };
}
