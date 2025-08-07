let mysql;
try {
  mysql = await import("mysql2/promise");
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
    format(sql, params) {
      if (!params) return sql;
      let i = 0;
      return sql.replace(/\?/g, () => {
        const val = params[i++];
        return typeof val === 'string' ? `'${val}'` : String(val);
      });
    },
  };
}
let dotenv;
try {
  dotenv = await import("dotenv");
} catch {
  dotenv = { config: () => {} };
}
let bcrypt;
try {
  const mod = await import("bcryptjs");
  bcrypt = mod.default || mod;
} catch {
  bcrypt = { hash: async (s) => s, compare: async () => false };
}
import defaultModules from "./defaultModules.js";
import { logDb } from "./debugLog.js";

const tableColumnsCache = new Map();

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

dotenv.config();

// Create a connection pool
export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

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
    `SELECT u.*, r.name AS role
     FROM users u
     JOIN user_roles r ON u.role_id = r.id
     WHERE u.empid = ?
     LIMIT 1`,
    [empid],
  );
  if (rows.length === 0) return null;
  const user = rows[0];
  user.verifyPassword = async (plain) => bcrypt.compare(plain, user.password);
  return user;
}

/**
 * List all users
 */
export async function listUsers() {
  const [rows] = await pool.query(
    `SELECT u.id, u.empid, u.role_id, r.name AS role, u.created_at
     FROM users u
     JOIN user_roles r ON u.role_id = r.id`,
  );
  return rows;
}

export async function listUsersByCompany(companyId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.empid, uc.role_id, r.name AS role, u.created_at
       FROM users u
       JOIN user_companies uc ON u.empid = uc.empid
       JOIN user_roles r ON uc.role_id = r.id
      WHERE uc.company_id = ?`,
    [companyId],
  );
  return rows;
}

/**
 * Get a single user by ID
 */
export async function getUserById(id) {
  const [rows] = await pool.query(
    `SELECT u.*, r.name AS role
     FROM users u
     JOIN user_roles r ON u.role_id = r.id
     WHERE u.id = ?`,
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
  role_id,
  created_by,
}) {
  const hashed = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    "INSERT INTO users (empid, password, role_id, created_by) VALUES (?, ?, ?, ?)",
    [empid, hashed, role_id, created_by],
  );
  return { id: result.insertId };
}

/**
 * Update an existing user
 */
export async function updateUser(id, { role_id }) {
  await pool.query(
    "UPDATE users SET role_id = ? WHERE id = ?",
    [role_id, id],
  );
  return { id };
}

export async function updateUserPassword(id, hashedPassword) {
  await pool.query("UPDATE users SET password = ? WHERE id = ?", [
    hashedPassword,
    id,
  ]);
  return { id };
}

/**
 * Delete a user by ID
 */
export async function deleteUserById(id) {
  const [result] = await pool.query("DELETE FROM users WHERE id = ?", [id]);
  return result;
}

/**
 * Assign a user to a company with a specific role
 */
export async function assignCompanyToUser(
  empid,
  companyId,
  role_id,
  branchId,
  createdBy,
) {
  const [result] = await pool.query(
    `INSERT INTO user_companies (empid, company_id, role_id, branch_id, created_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), branch_id = VALUES(branch_id)`,
    [empid, companyId, role_id, branchId, createdBy],
  );
  return { affectedRows: result.affectedRows };
}

/**
 * List company assignments for a given user
 */
export async function listUserCompanies(empid) {
  const [rows] = await pool.query(
    `SELECT uc.empid, uc.company_id, c.name AS company_name, uc.role_id, r.name AS role,
            uc.branch_id, b.name AS branch_name
     FROM user_companies uc
     JOIN companies c ON uc.company_id = c.id
     JOIN user_roles r ON uc.role_id = r.id
    LEFT JOIN code_branches b ON uc.branch_id = b.id
     WHERE uc.empid = ?`,
    [empid],
  );
  return rows;
}

/**
 * Remove a user-company assignment
 */
export async function removeCompanyAssignment(empid, companyId) {
  const [result] = await pool.query(
    "DELETE FROM user_companies WHERE empid = ? AND company_id = ?",
    [empid, companyId],
  );
  return result;
}

/**
 * Update a user's company assignment role
 */
export async function updateCompanyAssignment(empid, companyId, role_id, branchId) {
  const [result] = await pool.query(
    "UPDATE user_companies SET role_id = ?, branch_id = ? WHERE empid = ? AND company_id = ?",
    [role_id, branchId, empid, companyId],
  );
  return result;
}

/**
 * List all user-company assignments
 */
export async function listAllUserCompanies(companyId) {
  const params = [];
  let where = '';
  if (companyId) {
    where = 'WHERE uc.company_id = ?';
    params.push(companyId);
  }
  const [rows] = await pool.query(
    `SELECT uc.empid, uc.company_id, c.name AS company_name, uc.role_id, r.name AS role,
            uc.branch_id, b.name AS branch_name
     FROM user_companies uc
     JOIN companies c ON uc.company_id = c.id
     JOIN user_roles r ON uc.role_id = r.id
     LEFT JOIN code_branches b ON uc.branch_id = b.id
     ${where}`,
    params,
  );
  return rows;
}

/**
 * List all companies
 */
export async function listCompanies() {
  const [rows] = await pool.query("SELECT id, name, created_at FROM companies");
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
export async function updateSettings(updates) {
  const keys = Object.keys(updates);
  const values = Object.values(updates);
  const setClause = keys.map((k) => `\`${k}\` = ?`).join(", ");
  await pool.query(`UPDATE settings SET ${setClause}`, values);
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
export async function setTenantFlags(companyId, flags) {
  for (const [key, value] of Object.entries(flags)) {
    await pool.query(
      "INSERT INTO tenant_feature_flags (company_id, flag_key, flag_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE flag_value = ?",
      [companyId, key, value ? 1 : 0, value ? 1 : 0],
    );
  }
  return getTenantFlags(companyId);
}

/**
 * List available modules
 */
export async function listModules() {
  const [rows] = await pool.query(
    `SELECT module_key, label, parent_key, show_in_sidebar, show_in_header
       FROM modules
      ORDER BY module_key`,
  );
  return rows;
}

export async function upsertModule(
  moduleKey,
  label,
  parentKey = null,
  showInSidebar = true,
  showInHeader = false,
) {
  logDb(
    `upsertModule ${moduleKey} label=${label} parent=${parentKey} sidebar=${showInSidebar} header=${showInHeader}`,
  );
  await pool.query(
    `INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       parent_key = VALUES(parent_key),
       show_in_sidebar = VALUES(show_in_sidebar),
       show_in_header = VALUES(show_in_header)`,
    [moduleKey, label, parentKey, showInSidebar ? 1 : 0, showInHeader ? 1 : 0],
  );
  return { moduleKey, label, parentKey, showInSidebar, showInHeader };
}

export async function deleteModule(moduleKey) {
  logDb(`deleteModule ${moduleKey}`);
  await pool.query('DELETE FROM modules WHERE module_key = ?', [moduleKey]);
  return { moduleKey };
}

export async function populateDefaultModules() {
  for (const m of defaultModules) {
    await upsertModule(
      m.moduleKey,
      m.label,
      m.parentKey,
      m.showInSidebar,
      m.showInHeader,
    );
  }
}

export async function populateRoleDefaultModules() {
  const modules = await listModules();

  const map = {};
  modules.forEach((m) => {
    map[m.module_key] = m;
  });

  function rootKey(key) {
    let cur = map[key];
    let last = cur;
    while (cur && cur.parent_key) {
      last = cur;
      cur = map[cur.parent_key];
    }
    if (!cur && last) return last.module_key;
    return cur ? cur.module_key : null;
  }

  const adminOnly = modules
    .filter((m) => {
      const root = rootKey(m.module_key);
      return (
        ["settings", "developer"].includes(root) && m.module_key !== "change_password"
      );
    })
    .map((m) => m.module_key);

  const inList = adminOnly.map((k) => pool.escape(k)).join(", ");

  await pool.query(
    `INSERT INTO role_default_modules (role_id, module_key, allowed)
     SELECT * FROM (
       SELECT ur.id AS role_id, m.module_key AS module_key,
              CASE
                WHEN ur.name = 'admin' THEN 1
                WHEN m.module_key IN (${inList}) THEN 0
                ELSE 1
              END AS allowed
         FROM user_roles ur
         CROSS JOIN modules m
     ) AS vals
     ON DUPLICATE KEY UPDATE allowed = vals.allowed`,
  );
}

export async function populateRoleModulePermissions() {
  await populateRoleDefaultModules();
  await pool.query(
    `INSERT IGNORE INTO role_module_permissions (company_id, role_id, module_key, allowed)
     SELECT c.id, rdm.role_id, rdm.module_key, rdm.allowed
       FROM companies c
       CROSS JOIN role_default_modules rdm`,
  );
}

export async function populateCompanyModuleLicenses() {
  await pool.query(
    `INSERT IGNORE INTO company_module_licenses (company_id, module_key, licensed)
     SELECT c.id AS company_id, m.module_key, 0
       FROM companies c
       CROSS JOIN modules m`,
  );
}

/**
 * List module permissions for roles
 */
export async function listRoleModulePermissions(roleId, companyId) {
  const params = [];
  let where = '';

  // Company module licenses are filtered in higher-level queries, so no join here
  if (companyId) {
    where = 'WHERE rmp.company_id = ?';
    params.push(companyId);
  }

  if (roleId) {
    where += where ? ' AND rmp.role_id = ?' : 'WHERE rmp.role_id = ?';
    params.push(roleId);
  }

  const [rows] = await pool.query(
    `SELECT rmp.role_id, ur.name AS role, rmp.module_key, m.label, rmp.allowed
       FROM role_module_permissions rmp
       JOIN user_roles ur ON rmp.role_id = ur.id
       JOIN modules m ON rmp.module_key = m.module_key
       ${where}`,
    params,
  );
  return rows;
}

/**
 * Set a role's module permission
 */
export async function setRoleModulePermission(companyId, roleId, moduleKey, allowed) {
  await pool.query(
    `INSERT INTO role_module_permissions (company_id, role_id, module_key, allowed)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE allowed = VALUES(allowed)`,
    [companyId, roleId, moduleKey, allowed],
  );
  return { companyId, roleId, moduleKey, allowed };
}

/**
 * List module licenses for a company. If companyId is omitted, list for all companies.
 */
export async function listCompanyModuleLicenses(companyId) {
  const params = [];
  let where = '';
  if (companyId) {
    where = 'WHERE c.id = ?';
    params.push(companyId);
  }
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
export async function setCompanyModuleLicense(companyId, moduleKey, licensed) {
  await pool.query(
    `INSERT INTO company_module_licenses (company_id, module_key, licensed)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE licensed = VALUES(licensed)`,
    [companyId, moduleKey, licensed ? 1 : 0],
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

export async function listDatabaseViews() {
  const [rows] = await pool.query(
    "SHOW FULL TABLES WHERE TABLE_TYPE = 'VIEW'",
  );
  return rows.map((r) => Object.values(r)[0]);
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

export async function setTableColumnLabel(tableName, columnName, label) {
  await pool.query(
    `INSERT INTO table_column_labels (table_name, column_name, mn_label)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE mn_label = VALUES(mn_label)`,
    [tableName, columnName, label],
  );
  return { tableName, columnName, label };
}

export async function saveTableColumnLabels(tableName, labels) {
  for (const [col, lab] of Object.entries(labels)) {
    await setTableColumnLabel(tableName, col, lab);
  }
}

export async function listTableColumnMeta(tableName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_KEY, EXTRA
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
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
    headerMap = await getMappings(names);
  } catch {
    headerMap = {};
  }
  return rows.map((r) => ({
    name: r.COLUMN_NAME,
    key: r.COLUMN_KEY,
    extra: r.EXTRA,
    label: labels[r.COLUMN_NAME] || headerMap[r.COLUMN_NAME] || r.COLUMN_NAME,
  }));
}

export async function getPrimaryKeyColumns(tableName) {
  const [keyRows] = await pool.query(
    'SHOW KEYS FROM ?? WHERE Key_name = "PRIMARY"',
    [tableName],
  );
  let pks = keyRows.map((r) => r.Column_name);

  if (pks.length === 0) {
    const [uniqRows] = await pool.query(
      'SHOW INDEX FROM ?? WHERE Non_unique = 0 ORDER BY Seq_in_index',
      [tableName],
    );
    if (uniqRows.length > 0) {
      const groups = new Map();
      for (const row of uniqRows) {
        if (!groups.has(row.Key_name)) groups.set(row.Key_name, []);
        groups.get(row.Key_name)[row.Seq_in_index - 1] = row.Column_name;
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
  } = {},
) {
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
      await ensureValidColumns(tableName, columns, [field]);
      const range = String(value).match(/^(\d{4}[-.]\d{2}[-.]\d{2})\s*-\s*(\d{4}[-.]\d{2}[-.]\d{2})$/);
      if (range) {
        filterClauses.push(`\`${field}\` BETWEEN ? AND ?`);
        params.push(range[1], range[2]);
      } else {
        filterClauses.push(`\`${field}\` LIKE ?`);
        params.push(`%${value}%`);
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
  const [rows] = await pool.query(sql);
  const countParams = [tableName, ...params.slice(1, params.length - 2)];
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM ?? ${where}`,
    countParams,
  );
  const result = { rows, count: countRows[0].count };
  if (debug) result.sql = sql;
  return result;
}

/**
 * Update a table row by id
 */
export async function updateTableRow(tableName, id, updates) {
  const columns = await getTableColumnsSafe(tableName);
  const keys = Object.keys(updates);
  await ensureValidColumns(tableName, columns, keys);
  if (keys.length === 0) return { id };
  const values = Object.values(updates);
  const setClause = keys.map((k) => `\`${k}\` = ?`).join(', ');

  if (tableName === 'company_module_licenses') {
    const [companyId, moduleKey] = String(id).split('-');
    await pool.query(
      `UPDATE company_module_licenses SET ${setClause} WHERE company_id = ? AND module_key = ?`,
      [...values, companyId, moduleKey],
    );
    return { company_id: companyId, module_key: moduleKey };
  }

  if (tableName === 'role_module_permissions') {
    const [companyId, roleId, moduleKey] = String(id).split('-');
    await pool.query(
      `UPDATE role_module_permissions SET ${setClause} WHERE company_id = ? AND role_id = ? AND module_key = ?`,
      [...values, companyId, roleId, moduleKey],
    );
    return { company_id: companyId, role_id: roleId, module_key: moduleKey };
  }

  if (tableName === 'user_companies') {
    const [empId, companyId] = String(id).split('-');
    await pool.query(
      `UPDATE user_companies SET ${setClause} WHERE empid = ? AND company_id = ?`,
      [...values, empId, companyId],
    );
    return { empid: empId, company_id: companyId };
  }

  const pkCols = await getPrimaryKeyColumns(tableName);
  logDb(`updateTableRow(${tableName}, id=${id}) using keys: ${pkCols.join(', ')}`);
  if (pkCols.length === 0) {
    const err = new Error(`Table ${tableName} has no primary or unique key`);
    err.status = 400;
    throw err;
  }

  if (pkCols.length === 1) {
    const col = pkCols[0];
    const where = col === 'id' ? 'id = ?' : `\`${col}\` = ?`;
    await pool.query(
      `UPDATE ?? SET ${setClause} WHERE ${where}`,
      [tableName, ...values, id],
    );
    return { [col]: id };
  }

  const parts = String(id).split('-');
  const where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
  await pool.query(
    `UPDATE ?? SET ${setClause} WHERE ${where}`,
    [tableName, ...values, ...parts],
  );
  const result = {};
  pkCols.forEach((c, i) => {
    result[c] = parts[i];
  });
  return result;
}

export async function insertTableRow(tableName, row) {
  const columns = await getTableColumnsSafe(tableName);
  const keys = Object.keys(row);
  logDb(`insertTableRow(${tableName}) columns=${keys.join(', ')}`);
  await ensureValidColumns(tableName, columns, keys);
  if (keys.length === 0) return null;
  const values = Object.values(row);
  const cols = keys.map((k) => `\`${k}\``).join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  const [result] = await pool.query(
    `INSERT INTO ?? (${cols}) VALUES (${placeholders})`,
    [tableName, ...values],
  );
  return { id: result.insertId };
}

export async function deleteTableRow(tableName, id, conn = pool) {
  if (tableName === 'company_module_licenses') {
    const [companyId, moduleKey] = String(id).split('-');
    await conn.query(
      'DELETE FROM company_module_licenses WHERE company_id = ? AND module_key = ?',
      [companyId, moduleKey],
    );
    return { company_id: companyId, module_key: moduleKey };
  }

  if (tableName === 'role_module_permissions') {
    const [companyId, roleId, moduleKey] = String(id).split('-');
    await conn.query(
      'DELETE FROM role_module_permissions WHERE company_id = ? AND role_id = ? AND module_key = ?',
      [companyId, roleId, moduleKey],
    );
    return { company_id: companyId, role_id: roleId, module_key: moduleKey };
  }

  if (tableName === 'user_companies') {
    const [empId, companyId] = String(id).split('-');
    await conn.query(
      'DELETE FROM user_companies WHERE empid = ? AND company_id = ?',
      [empId, companyId],
    );
    return { empid: empId, company_id: companyId };
  }

  const pkCols = await getPrimaryKeyColumns(tableName);
  logDb(`deleteTableRow(${tableName}, id=${id}) using keys: ${pkCols.join(', ')}`);
  if (pkCols.length === 0) {
    const err = new Error(`Table ${tableName} has no primary or unique key`);
    err.status = 400;
    throw err;
  }

  if (pkCols.length === 1) {
    const col = pkCols[0];
    const where = col === 'id' ? 'id = ?' : `\`${col}\` = ?`;
    await conn.query(`DELETE FROM ?? WHERE ${where}`, [tableName, id]);
    return { [col]: id };
  }

  const parts = String(id).split('-');
  const where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
  await conn.query(`DELETE FROM ?? WHERE ${where}`, [tableName, ...parts]);
  const result = {};
  pkCols.forEach((c, i) => {
    result[c] = parts[i];
  });
  return result;
}

export async function listRowReferences(tableName, id, conn = pool) {
  const pkCols = await getPrimaryKeyColumns(tableName);
  const parts = String(id).split('-');
  const [rels] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = ?`,
    [tableName],
  );
  const results = [];
  for (const rel of rels) {
    const idx = pkCols.indexOf(rel.REFERENCED_COLUMN_NAME);
    if (idx === -1) continue;
    const val = parts[idx];
    const [rows] = await conn.query(
      'SELECT COUNT(*) AS count FROM ?? WHERE ?? = ?',
      [rel.TABLE_NAME, rel.COLUMN_NAME, val],
    );
    if (rows[0].count > 0) {
      results.push({
        table: rel.TABLE_NAME,
        column: rel.COLUMN_NAME,
        value: val,
        count: rows[0].count,
      });
    }
  }
  return results;
}

async function deleteCascade(conn, tableName, id, visited) {
  const key = `${tableName}:${id}`;
  if (visited.has(key)) return;
  visited.add(key);
  const refs = await listRowReferences(tableName, id, conn);
  for (const r of refs) {
    const pkCols = await getPrimaryKeyColumns(r.table);
    if (pkCols.length === 0) {
      await conn.query('DELETE FROM ?? WHERE ?? = ?', [r.table, r.column, r.value]);
      continue;
    }
    const colList = pkCols.map((c) => `\`${c}\``).join(', ');
    const [rows] = await conn.query(
      `SELECT ${colList} FROM ?? WHERE ?? = ?`,
      [r.table, r.column, r.value],
    );
    for (const row of rows) {
      const refId =
        pkCols.length === 1
          ? row[pkCols[0]]
          : pkCols.map((c) => row[c]).join('-');
      await deleteCascade(conn, r.table, refId, visited);
    }
  }
  await deleteTableRow(tableName, id, conn);
}

export async function deleteTableRowCascade(tableName, id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await deleteCascade(conn, tableName, id, new Set());
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listInventoryTransactions({
  branchId,
  startDate,
  endDate,
  page = 1,
  perPage = 50,
  refCol,
  refVal,
} = {}) {
  const clauses = [];
  const params = [];
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
    `SELECT COUNT(*) AS count FROM inventory_transactions ${where}`,
    params,
  );
  const count = countRows[0].count;

  let sql = `SELECT * FROM inventory_transactions ${where} ORDER BY id DESC`;
  const qParams = [...params];
  if (count > 100) {
    const limit = Math.min(Number(perPage) || 50, 500);
    const offset = (Number(page) - 1) * limit;
    sql += ' LIMIT ? OFFSET ?';
    qParams.push(limit, offset);
  }

  const [rows] = await pool.query(sql, qParams);
  return { rows, count };
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

export async function listStoredProcedures() {
  const [rows] = await pool.query(
    'SHOW PROCEDURE STATUS WHERE Db = DATABASE()'
  );
  return rows
    .map((r) => r.Name)
    .filter((n) => typeof n === 'string' && n.toLowerCase().includes('report'));
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
