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
    escape(val) {
      return typeof val === 'string' ? `'${val}'` : String(val);
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
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDisplayFields as getDisplayCfg } from "../api-server/services/displayFieldConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const actionsPath = (() => {
  const cwdPath = path.resolve(process.cwd(), "configs/permissionActions.json");
  if (existsSync(cwdPath)) return cwdPath;
  return path.resolve(__dirname, "../configs/permissionActions.json");
})();

function buildDisplayExpr(alias, cfg, fallback) {
  const fields = (cfg?.displayFields || []).map((f) => `${alias}.${f}`);
  if (fields.length) {
    return `TRIM(CONCAT_WS(' ', ${fields.join(', ')}))`;
  }
  return fallback;
}

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
  multipleStatements: true,
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
    branch_id,
    department_id,
    position_id,
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
  return {
    company_id,
    branch_id,
    department_id,
    position_id,
    ...rest,
    permissions,
  };
}

/**
 * List all employment sessions for an employee
 */
export async function getEmploymentSessions(empid) {
  const [companyCfg, branchCfg, deptCfg, empCfg] = await Promise.all([
    getDisplayCfg("companies"),
    getDisplayCfg("code_branches"),
    getDisplayCfg("code_department"),
    getDisplayCfg("tbl_employee"),
  ]);

  const companyName = buildDisplayExpr("c", companyCfg, "c.name");
  const branchName = buildDisplayExpr("b", branchCfg, "b.name");
  const deptName = buildDisplayExpr("d", deptCfg, "d.name");
  const deptIdCol = deptCfg?.idField || "id";
  const empName = buildDisplayExpr(
    "emp",
    empCfg,
    "CONCAT_WS(' ', emp.emp_fname, emp.emp_lname)",
  );

  const [rows] = await pool.query(
    `SELECT
        e.employment_company_id AS company_id,
        ${companyName} AS company_name,
        e.employment_branch_id AS branch_id,
        ${branchName} AS branch_name,
        e.employment_department_id AS department_id,
        ${deptName} AS department_name,
        e.employment_position_id AS position_id,
        ${empName} AS employee_name,
        e.employment_user_level AS user_level,
        ul.name AS user_level_name,
        GROUP_CONCAT(DISTINCT up.action_key) AS permission_list
     FROM tbl_employment e
     LEFT JOIN companies c ON e.employment_company_id = c.id
     LEFT JOIN code_branches b ON e.employment_branch_id = b.id
     LEFT JOIN code_department d ON e.employment_department_id = d.${deptIdCol}
     LEFT JOIN tbl_employee emp ON e.employment_emp_id = emp.emp_id
     LEFT JOIN user_levels ul ON e.employment_user_level = ul.userlevel_id
     LEFT JOIN user_level_permissions up ON up.userlevel_id = ul.userlevel_id AND up.action = 'permission'
     WHERE e.employment_emp_id = ?
     GROUP BY e.employment_company_id, company_name,
              e.employment_branch_id, branch_name,
              e.employment_department_id, department_name,
              e.employment_position_id,
              employee_name, e.employment_user_level, ul.name
     ORDER BY company_name, department_name, branch_name, user_level_name`,
    [empid],
  );
  return rows.map(mapEmploymentRow);
}

/**
 * Fetch employment session info and permission flags for an employee.
 * Optionally filter by company ID.
 */
export async function getEmploymentSession(empid, companyId) {
  if (companyId) {
    const [companyCfg, branchCfg, deptCfg, empCfg] = await Promise.all([
      getDisplayCfg("companies"),
      getDisplayCfg("code_branches"),
      getDisplayCfg("code_department"),
      getDisplayCfg("tbl_employee"),
    ]);

    const companyName = buildDisplayExpr("c", companyCfg, "c.name");
    const branchName = buildDisplayExpr("b", branchCfg, "b.name");
    const deptName = buildDisplayExpr("d", deptCfg, "d.name");
    const deptIdCol = deptCfg?.idField || "id";
    const empName = buildDisplayExpr(
      "emp",
      empCfg,
      "CONCAT_WS(' ', emp.emp_fname, emp.emp_lname)",
    );

    const [rows] = await pool.query(
      `SELECT
          e.employment_company_id AS company_id,
          ${companyName} AS company_name,
          e.employment_branch_id AS branch_id,
          ${branchName} AS branch_name,
          e.employment_department_id AS department_id,
          ${deptName} AS department_name,
          e.employment_position_id AS position_id,
          ${empName} AS employee_name,
          e.employment_user_level AS user_level,
          ul.name AS user_level_name,
          GROUP_CONCAT(DISTINCT up.action_key) AS permission_list
       FROM tbl_employment e
       LEFT JOIN companies c ON e.employment_company_id = c.id
       LEFT JOIN code_branches b ON e.employment_branch_id = b.id
       LEFT JOIN code_department d ON e.employment_department_id = d.${deptIdCol}
       LEFT JOIN tbl_employee emp ON e.employment_emp_id = emp.emp_id
       LEFT JOIN user_levels ul ON e.employment_user_level = ul.userlevel_id
       LEFT JOIN user_level_permissions up ON up.userlevel_id = ul.userlevel_id AND up.action = 'permission'
       WHERE e.employment_emp_id = ? AND e.employment_company_id = ?
       GROUP BY e.employment_company_id, company_name,
                e.employment_branch_id, branch_name,
                e.employment_department_id, department_name,
                e.employment_position_id,
                employee_name, e.employment_user_level, ul.name
       ORDER BY company_name, department_name, branch_name, user_level_name
       LIMIT 1`,
      [empid, companyId],
    );
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

export async function getUserLevelActions(userLevelId) {
  if (Number(userLevelId) === 1) {
    const perms = {};
    const [mods] = await pool.query(
      'SELECT module_key FROM modules',
    );
    for (const { module_key } of mods) perms[module_key] = true;
    try {
      const raw = await fs.readFile(actionsPath, 'utf8');
      const registry = JSON.parse(raw);
      const forms = registry.forms || {};
      if (Object.keys(forms).length) {
        perms.buttons = {};
        perms.functions = {};
        perms.api = {};
        for (const form of Object.values(forms)) {
          form.buttons?.forEach((b) => (perms.buttons[b] = true));
          form.functions?.forEach((f) => (perms.functions[f] = true));
          form.api?.forEach((a) => {
            const key = typeof a === 'string' ? a : a.key;
            perms.api[key] = true;
          });
        }
      }
    } catch {}
    return perms;
  }
  const [rows] = await pool.query(
    `SELECT action, action_key
       FROM user_level_permissions
       WHERE userlevel_id = ? AND action IS NOT NULL`,
    [userLevelId],
  );
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
    }
  }
  return perms;
}

export async function listActionGroups() {
  const [rows] = await pool.query(
    `SELECT action, COALESCE(ul_module_key, function_name) AS action_key
       FROM code_userlevel_settings
       WHERE action IS NOT NULL`,
  );
  const groups = { modules: new Set(), buttons: new Set(), functions: new Set(), api: new Set() };
  for (const { action, action_key: key } of rows) {
    if (action === 'module_key' && key) groups.modules.add(key);
    else if (action === 'button' && key) groups.buttons.add(key);
    else if (action === 'function' && key) groups.functions.add(key);
    else if (action === 'API' && key) groups.api.add(key);
  }
  return {
    modules: Array.from(groups.modules),
    buttons: Array.from(groups.buttons),
    functions: Array.from(groups.functions),
    api: Array.from(groups.api),
  };
}

export async function setUserLevelActions(userLevelId, { modules = [], buttons = [], functions = [], api = [] }) {
  if (Number(userLevelId) === 1) return;
  await pool.query(
    'DELETE FROM user_level_permissions WHERE userlevel_id = ? AND action IS NOT NULL',
    [userLevelId],
  );
  const values = [];
  const params = [];
  for (const m of modules) {
    values.push('(?,\'module_key\',?)');
    params.push(userLevelId, m);
  }
  for (const b of buttons) {
    values.push('(?,\'button\',?)');
    params.push(userLevelId, b);
  }
  for (const f of functions) {
    values.push('(?,\'function\',?)');
    params.push(userLevelId, f);
  }
  for (const a of api) {
    values.push('(?,\'API\',?)');
    params.push(userLevelId, a);
  }
  if (values.length) {
    const sql =
      'INSERT INTO user_level_permissions (userlevel_id, action, action_key) VALUES ' +
      values.join(',');
    await pool.query(sql, params);
  }
}

export async function populateMissingPermissions(allow = false) {
  if (!allow) return;
  const raw = await fs.readFile(actionsPath, 'utf8');
  const registry = JSON.parse(raw);
  const actions = [];
  const [mods] = await pool.query('SELECT module_key FROM modules');
  for (const { module_key } of mods) actions.push(['module_key', module_key]);
  const forms = registry.forms || {};
  for (const form of Object.values(forms)) {
    form.buttons?.forEach((b) => actions.push(['button', b]));
    form.functions?.forEach((f) => actions.push(['function', f]));
    form.api?.forEach((a) => {
      const key = typeof a === 'string' ? a : a.key;
      actions.push(['API', key]);
    });
  }
  for (const [action, key] of actions) {
    await pool.query(
      `INSERT INTO user_level_permissions (userlevel_id, action, action_key)
       SELECT ul.userlevel_id, ?, ?
         FROM user_levels ul
         WHERE ul.userlevel_id <> 1
           AND NOT EXISTS (
             SELECT 1 FROM user_level_permissions up
              WHERE up.userlevel_id = ul.userlevel_id
                AND up.action = ?
                AND up.action_key = ?
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
         SELECT t1.employment_emp_id, t1.employment_position_id
           FROM tbl_employment t1
           JOIN (
             SELECT employment_emp_id, MAX(id) AS max_id
               FROM tbl_employment
               GROUP BY employment_emp_id
           ) t2 ON t1.employment_emp_id = t2.employment_emp_id AND t1.id = t2.max_id
       ) e ON u.empid = e.employment_emp_id`,
  );
  return rows;
}

export async function listUsersByCompany(companyId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.empid, uc.position_id, u.created_at
       FROM users u
       JOIN user_companies uc ON u.empid = uc.empid
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
  position_id,
  branchId,
  createdBy,
) {
  const [result] = await pool.query(
    `INSERT INTO user_companies (empid, company_id, position_id, branch_id, created_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE position_id = VALUES(position_id), branch_id = VALUES(branch_id)`,
    [empid, companyId, position_id, branchId, createdBy],
  );
  return { affectedRows: result.affectedRows };
}

/**
 * List company assignments for a given user
 */
export async function listUserCompanies(empid) {
  const [rows] = await pool.query(
    `SELECT uc.empid, uc.company_id, c.name AS company_name, uc.position_id,
            uc.branch_id, b.name AS branch_name
     FROM user_companies uc
     JOIN companies c ON uc.company_id = c.id
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
export async function updateCompanyAssignment(empid, companyId, position_id, branchId) {
  const [result] = await pool.query(
    "UPDATE user_companies SET position_id = ?, branch_id = ? WHERE empid = ? AND company_id = ?",
    [position_id, branchId, empid, companyId],
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
    `SELECT uc.empid, uc.company_id, c.name AS company_name, uc.position_id,
            uc.branch_id, b.name AS branch_name
     FROM user_companies uc
     JOIN companies c ON uc.company_id = c.id
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
  await pool.query(
    `INSERT INTO user_level_permissions (userlevel_id, action, action_key)
     SELECT ul.userlevel_id, 'module_key', ?
       FROM user_levels ul
       WHERE NOT EXISTS (
         SELECT 1 FROM user_level_permissions up
          WHERE up.userlevel_id = ul.userlevel_id
            AND up.action = 'module_key'
            AND up.action_key = ?
       )`,
    [moduleKey, moduleKey],
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


export async function populateCompanyModuleLicenses() {
  await pool.query(
    `INSERT IGNORE INTO company_module_licenses (company_id, module_key, licensed)
     SELECT c.id AS company_id, m.module_key, 0
       FROM companies c
       CROSS JOIN modules m`,
  );
}

export async function populateUserLevelModulePermissions() {
  await pool.query(
    `INSERT INTO user_level_permissions (userlevel_id, action, action_key)
     SELECT ul.userlevel_id, 'module_key', m.module_key
       FROM user_levels ul
       CROSS JOIN modules m
       WHERE m.module_key NOT LIKE 'transactions\\_%'
         AND NOT EXISTS (
           SELECT 1 FROM user_level_permissions up
            WHERE up.userlevel_id = ul.userlevel_id
              AND up.action = 'module_key'
              AND up.action_key = m.module_key
         )`,
  );
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
    `SELECT COLUMN_NAME, COLUMN_TYPE, DATA_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [tableName],
  );
  return rows.map((r) => ({
    name: r.COLUMN_NAME,
    type: r.DATA_TYPE,
    enumValues: /^enum\(/i.test(r.COLUMN_TYPE)
      ? r.COLUMN_TYPE
          .slice(5, -1)
          .split(',')
          .map((v) => v.trim().slice(1, -1))
      : [],
  }));
}

export async function saveStoredProcedure(sql) {
  const cleaned = sql
    .replace(/^DELIMITER \$\$/gm, '')
    .replace(/^DELIMITER ;/gm, '')
    .replace(/END\s*\$\$/gm, 'END;');
  const dropMatch = cleaned.match(/DROP\s+PROCEDURE[^;]+;/i);
  const createMatch = cleaned.match(/CREATE\s+PROCEDURE[\s\S]+END;/i);
  if (dropMatch) {
    await pool.query(dropMatch[0]);
  }
  if (createMatch) {
    await pool.query(createMatch[0]);
  }
}

export async function saveView(sql) {
  await pool.query(sql);
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

export async function deleteProcedure(name) {
  if (!name) return;
  await pool.query(`DROP PROCEDURE IF EXISTS \`${name}\``);
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
        filterClauses.push(`\`${field}\` = ?`);
        params.push(value);
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

export async function listTransactions({
  table,
  branchId,
  startDate,
  endDate,
  page = 1,
  perPage = 50,
  refCol,
  refVal,
} = {}) {
  if (!table || !/^[a-zA-Z0-9_]+$/.test(table)) {
    throw new Error('Invalid table');
  }
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
      path.join(process.cwd(), 'config', file),
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
          const txt = await fs.readFile(
            path.join(process.cwd(), 'config', 'transactionForms.json'),
            'utf8',
          );
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
          const dfTxt = await fs.readFile(
            path.join(process.cwd(), 'config', 'tableDisplayFields.json'),
            'utf8',
          );
          const dfCfg = JSON.parse(dfTxt);
          if (dfCfg[table] && Array.isArray(dfCfg[table].displayFields)) {
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
  await fs.writeFile(path.join(process.cwd(), 'config', file), content);

  try {
    const [out] = await pool.query(sql);
    return { rows: out, sql, original: originalSql, file, displayFields };
  } catch {
    return { rows: [], sql, original: originalSql, file, displayFields };
  }
}
