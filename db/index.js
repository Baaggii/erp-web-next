import mysql from "mysql2/promise";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import defaultModules from "./defaultModules.js";

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
 * Fetch a user by email (or employee ID)
 */
export async function getUserByEmail(emailOrEmpId) {
  const [rows] = await pool.query(
    `SELECT u.*, r.name AS role
     FROM users u
     JOIN user_roles r ON u.role_id = r.id
     WHERE u.email = ? OR u.empid = ?
     LIMIT 1`,
    [emailOrEmpId, emailOrEmpId],
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
    `SELECT u.id, u.empid, u.email, u.name, u.role_id, r.name AS role, u.created_at
     FROM users u
     JOIN user_roles r ON u.role_id = r.id`,
  );
  return rows;
}

export async function listUsersByCompany(companyId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.empid, u.email, u.name, uc.role_id, r.name AS role, u.created_at
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
  email,
  name,
  password,
  role_id,
  created_by,
}) {
  const hashed = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    "INSERT INTO users (empid, email, name, password, role_id, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    [empid, email, name, hashed, role_id, created_by],
  );
  return { id: result.insertId };
}

/**
 * Update an existing user
 */
export async function updateUser(id, { name, email, role_id }) {
  await pool.query(
    "UPDATE users SET name = ?, email = ?, role_id = ? WHERE id = ?",
    [name, email, role_id, id],
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
  createdBy,
) {
  const [result] = await pool.query(
    `INSERT INTO user_companies (empid, company_id, role_id, created_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
    [empid, companyId, role_id, createdBy],
  );
  return { affectedRows: result.affectedRows };
}

/**
 * List company assignments for a given user
 */
export async function listUserCompanies(empid) {
  const [rows] = await pool.query(
    `SELECT uc.empid, uc.company_id, c.name AS company_name, uc.role_id, r.name AS role
     FROM user_companies uc
     JOIN companies c ON uc.company_id = c.id
     JOIN user_roles r ON uc.role_id = r.id
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
export async function updateCompanyAssignment(empid, companyId, role_id) {
  const [result] = await pool.query(
    "UPDATE user_companies SET role_id = ? WHERE empid = ? AND company_id = ?",
    [role_id, empid, companyId],
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
    `SELECT uc.empid, uc.company_id, c.name AS company_name, uc.role_id, r.name AS role
     FROM user_companies uc
     JOIN companies c ON uc.company_id = c.id
     JOIN user_roles r ON uc.role_id = r.id
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
 * List available user roles
 */
export async function listUserRoles() {
  const [rows] = await pool.query(
    'SELECT id, name FROM user_roles ORDER BY id'
  );
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

/**
 * Get up to 50 rows from a table
 */
export async function listTableRows(
  tableName,
  { page = 1, perPage = 50, filters = {}, sort = {} } = {},
) {
  const offset = (Number(page) - 1) * Number(perPage);
  const filterClauses = [];
  const params = [tableName];
  for (const [field, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      filterClauses.push(`\`${field}\` LIKE ?`);
      params.push(`%${value}%`);
    }
  }
  const where = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : '';
  let order = '';
  if (sort.column) {
    const dir = sort.dir && String(sort.dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    order = `ORDER BY \`${sort.column}\` ${dir}`;
  }
  params.push(Number(perPage), offset);
  const [rows] = await pool.query(
    `SELECT * FROM ?? ${where} ${order} LIMIT ? OFFSET ?`,
    params,
  );
  const countParams = [tableName, ...params.slice(1, params.length - 2)];
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM ?? ${where}`,
    countParams,
  );
  return { rows, count: countRows[0].count };
}

/**
 * Update a table row by id
 */
export async function updateTableRow(tableName, id, updates) {
  const keys = Object.keys(updates);
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

  await pool.query(`UPDATE ?? SET ${setClause} WHERE id = ?`, [tableName, ...values, id]);
  return { id };
}

export async function insertTableRow(tableName, row) {
  const keys = Object.keys(row);
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

export async function deleteTableRow(tableName, id) {
  if (tableName === 'company_module_licenses') {
    const [companyId, moduleKey] = String(id).split('-');
    await pool.query(
      'DELETE FROM company_module_licenses WHERE company_id = ? AND module_key = ?',
      [companyId, moduleKey],
    );
    return { company_id: companyId, module_key: moduleKey };
  }

  if (tableName === 'role_module_permissions') {
    const [companyId, roleId, moduleKey] = String(id).split('-');
    await pool.query(
      'DELETE FROM role_module_permissions WHERE company_id = ? AND role_id = ? AND module_key = ?',
      [companyId, roleId, moduleKey],
    );
    return { company_id: companyId, role_id: roleId, module_key: moduleKey };
  }

  if (tableName === 'user_companies') {
    const [empId, companyId] = String(id).split('-');
    await pool.query(
      'DELETE FROM user_companies WHERE empid = ? AND company_id = ?',
      [empId, companyId],
    );
    return { empid: empId, company_id: companyId };
  }

  await pool.query('DELETE FROM ?? WHERE id = ?', [tableName, id]);
  return { id };
}
