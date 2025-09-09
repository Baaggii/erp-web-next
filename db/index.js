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
import path from "path";
import { tenantConfigPath, getConfigPath } from "../api-server/utils/configPaths.js";
import { getDisplayFields as getDisplayCfg } from "../api-server/services/displayFieldConfig.js";
import { GLOBAL_COMPANY_ID } from "../config/0/constants.js";
import { formatDateForDb } from "../api-server/utils/formatDate.js";

const PROTECTED_PROCEDURE_PREFIXES = ["dynrep_"];

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
const SOFT_DELETE_CANDIDATES = [
  "is_deleted",
  "deleted",
  "deleted_at",
  "isDeleted",
  "deletedAt",
];

async function getSoftDeleteColumn(tableName, companyId = GLOBAL_COMPANY_ID) {
  const softDeleteConfig = await loadSoftDeleteConfig(companyId);
  const cfgVal = softDeleteConfig[tableName];
  if (cfgVal === undefined) return null;
  const columns = await getTableColumnsSafe(tableName);
  const lower = columns.map((c) => c.toLowerCase());
  if (typeof cfgVal === "string") {
    const idx = lower.indexOf(cfgVal.toLowerCase());
    return idx !== -1 ? columns[idx] : null;
  }
  for (const cand of SOFT_DELETE_CANDIDATES) {
    const idx = lower.indexOf(cand.toLowerCase());
    if (idx !== -1) return columns[idx];
  }
  return null;
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
    senior_empid,
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
    senior_empid,
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
        e.employment_senior_empid AS senior_empid,
        ${empName} AS employee_name,
        e.employment_user_level AS user_level,
        ul.name AS user_level_name,
        GROUP_CONCAT(DISTINCT up.action_key) AS permission_list
     FROM tbl_employment e
     LEFT JOIN companies c ON e.employment_company_id = c.id
     LEFT JOIN code_branches b ON e.employment_branch_id = b.branch_id AND b.company_id = e.employment_company_id
    LEFT JOIN code_department d ON e.employment_department_id = d.${deptIdCol} AND d.company_id IN (${GLOBAL_COMPANY_ID}, e.employment_company_id)
     LEFT JOIN tbl_employee emp ON e.employment_emp_id = emp.emp_id
     LEFT JOIN user_levels ul ON e.employment_user_level = ul.userlevel_id
    LEFT JOIN user_level_permissions up ON up.userlevel_id = ul.userlevel_id AND up.action = 'permission' AND up.company_id IN (${GLOBAL_COMPANY_ID}, e.employment_company_id)
     WHERE e.employment_emp_id = ?
    GROUP BY e.employment_company_id, company_name,
              e.employment_branch_id, branch_name,
              e.employment_department_id, department_name,
              e.employment_position_id,
              e.employment_senior_empid,
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
  if (companyId !== undefined && companyId !== null) {
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
          e.employment_senior_empid AS senior_empid,
          ${empName} AS employee_name,
          e.employment_user_level AS user_level,
          ul.name AS user_level_name,
          GROUP_CONCAT(DISTINCT up.action_key) AS permission_list
       FROM tbl_employment e
       LEFT JOIN companies c ON e.employment_company_id = c.id
       LEFT JOIN code_branches b ON e.employment_branch_id = b.branch_id AND b.company_id = e.employment_company_id
       LEFT JOIN code_department d ON e.employment_department_id = d.${deptIdCol} AND d.company_id IN (${GLOBAL_COMPANY_ID}, e.employment_company_id)
       LEFT JOIN tbl_employee emp ON e.employment_emp_id = emp.emp_id
       LEFT JOIN user_levels ul ON e.employment_user_level = ul.userlevel_id
       LEFT JOIN user_level_permissions up ON up.userlevel_id = ul.userlevel_id AND up.action = 'permission' AND up.company_id IN (${GLOBAL_COMPANY_ID}, e.employment_company_id)
       WHERE e.employment_emp_id = ? AND e.employment_company_id = ?
       GROUP BY e.employment_company_id, company_name,
                e.employment_branch_id, branch_name,
                e.employment_department_id, department_name,
                e.employment_position_id,
                e.employment_senior_empid,
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
export async function deleteUserById(id) {
  const [result] = await pool.query("DELETE FROM users WHERE id = ?", [id]);
  return result;
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
    `INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       parent_key = VALUES(parent_key),
       show_in_sidebar = VALUES(show_in_sidebar),
       show_in_header = VALUES(show_in_header),
       updated_by = VALUES(updated_by),
       updated_at = VALUES(updated_at)`,
    [moduleKey, label, parentKey, showInSidebar ? 1 : 0, showInHeader ? 1 : 0, empid, now],
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
      null,
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
  await pool.query(
    `INSERT INTO tenant_tables (table_name, is_shared, seed_on_create, created_by, created_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       is_shared = VALUES(is_shared),
       seed_on_create = VALUES(seed_on_create),
       updated_by = VALUES(created_by),
       updated_at = NOW()`,
    [tableName, isShared ? 1 : 0, seedOnCreate ? 1 : 0, userId],
  );
  return { tableName, isShared: !!isShared, seedOnCreate: !!seedOnCreate };
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

export async function seedTenantTables(
  companyId,
  selectedTables = null,
  recordMap = {},
  overwrite = false,
  createdBy = null,
  updatedBy = createdBy,
) {
  let tables;
  if (Array.isArray(selectedTables)) {
    if (selectedTables.length === 0) return;
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
  for (const { table_name, is_shared } of tables) {
    if (is_shared) continue;
    const [[{ cnt }]] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?',
      [table_name, companyId],
    );
    if (cnt > 0) {
      if (!overwrite) {
        const err = new Error(`Table ${table_name} already contains data`);
        err.status = 400;
        throw err;
      }
      await pool.query('DELETE FROM ?? WHERE company_id = ?', [
        table_name,
        companyId,
      ]);
    }

    const meta = await listTableColumnMeta(table_name);
    const columns = meta.map((c) => c.name);
    const otherCols = meta
      .filter(
        (c) =>
          c.name !== 'company_id' &&
          !/auto_increment/i.test(c.extra),
      )
      .map((c) => c.name);

    const records = recordMap?.[table_name];

    if (Array.isArray(records) && records.length > 0 && typeof records[0] === 'object' && records[0] !== null) {
      for (const row of records) {
        const rowCols = Object.keys(row).filter((c) => c !== 'company_id');
        await ensureValidColumns(table_name, columns, rowCols);
        const colNames = ['company_id', ...rowCols];
        const colsClause = colNames.map((c) => `\`${c}\``).join(', ');
        const placeholders = colNames.map(() => '?').join(', ');
        const params = [table_name, ...colNames.map((c) => (c === 'company_id' ? companyId : row[c]))];
        await pool.query(`INSERT INTO ?? (${colsClause}) VALUES (${placeholders})`, params);
      }
      continue;
    }

    const colsClause = ['company_id', ...otherCols]
      .map((c) => `\`${c}\``)
      .join(', ');
    const selectParts = ['? AS company_id'];
    const params = [table_name, companyId];
    for (const col of otherCols) {
      if (col === 'created_by') {
        selectParts.push('?');
        params.push(createdBy);
      } else if (col === 'updated_by') {
        selectParts.push('?');
        params.push(updatedBy ?? createdBy);
      } else if (col === 'created_at' || col === 'updated_at') {
        selectParts.push('NOW()');
      } else {
        selectParts.push(`\`${col}\``);
      }
    }
    const selectClause = selectParts.join(', ');
    let sql =
      `INSERT INTO ?? (${colsClause}) SELECT ${selectClause} FROM ?? WHERE company_id = ${GLOBAL_COMPANY_ID}`;
    params.push(table_name);

    const ids = Array.isArray(records) ? records : null;
    if (Array.isArray(ids) && ids.length > 0) {
      const pkCols = meta.filter((m) => m.key === 'PRI').map((m) => m.name);
      if (pkCols.length === 1) {
        const placeholders = ids.map(() => '?').join(', ');
        sql += ` AND \`${pkCols[0]}\` IN (${placeholders})`;
        params.push(...ids);
      }
    }

    await pool.query(sql, params);
  }

  await pool.query(
    `INSERT INTO user_level_permissions (company_id, userlevel_id, action, action_key, created_by, created_at)
     SELECT ?, userlevel_id, action, action_key, ?, NOW()
       FROM user_level_permissions
       WHERE company_id = ${GLOBAL_COMPANY_ID}
     ON DUPLICATE KEY UPDATE action = VALUES(action)`,
    [companyId, createdBy],
  );
}

export async function seedDefaultsForSeedTables(userId) {
  const [rows] = await pool.query(
    `SELECT table_name FROM tenant_tables WHERE seed_on_create = 1`,
  );
  for (const { table_name } of rows) {
    const cols = await getTableColumnsSafe(table_name);
    const sets = ["company_id = ?"];
    const params = [table_name, GLOBAL_COMPANY_ID];
    if (cols.some((c) => c.toLowerCase() === "updated_by")) {
      sets.push("updated_by = ?");
      params.push(userId);
    }
    if (cols.some((c) => c.toLowerCase() === "updated_at")) {
      sets.push("updated_at = NOW()");
    }
    await pool.query(`UPDATE ?? SET ${sets.join(", ")}`, params);
  }
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
  const [rows] = await pool.query(
    `SELECT table_name FROM tenant_tables WHERE is_shared = 1`,
  );
  for (const { table_name } of rows) {
    const cols = await getTableColumnsSafe(table_name);
    if (cols.some((c) => c.toLowerCase() === "company_id")) {
      const sets = ["company_id = ?"];
      const params = [table_name, GLOBAL_COMPANY_ID];
      if (cols.some((c) => c.toLowerCase() === "updated_by")) {
        sets.push("updated_by = ?");
        params.push(userId);
      }
      if (cols.some((c) => c.toLowerCase() === "updated_at")) {
        sets.push("updated_at = NOW()");
      }
      await pool.query(`UPDATE ?? SET ${sets.join(", ")}`, params);
    }
  }
}

export async function saveStoredProcedure(sql) {
  const cleaned = sql
    .replace(/^DELIMITER \$\$/gm, '')
    .replace(/^DELIMITER ;/gm, '')
    .replace(/END\s*\$\$/gm, 'END;');
  const nameMatch = cleaned.match(/CREATE\s+PROCEDURE\s+`?([^\s`(]+)`?/i);
  const procName = nameMatch ? nameMatch[1] : null;
  if (await isProtectedProcedure(procName)) {
    const err = new Error('Procedure not allowed');
    err.status = 403;
    throw err;
  }
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
  if (await isProtectedProcedure(name)) {
    const err = new Error('Procedure not allowed');
    err.status = 403;
    throw err;
  }
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
          filterClauses.push(`\`${field}\` LIKE ?`);
          params.push(`%${value}%`);
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
 * Update a table row by id
 */
export async function updateTableRow(
  tableName,
  id,
  updates,
  companyId,
  conn = pool,
) {
  const columns = await getTableColumnsSafe(tableName);
  const keys = Object.keys(updates);
  await ensureValidColumns(tableName, columns, keys);
  if (keys.length === 0) return { id };
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
    return { [col]: id };
  }

  const parts = String(id).split('-');
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
  const result = {};
  pkCols.forEach((c, i) => {
    result[c] = parts[i];
  });
  return result;
}

export async function insertTableRow(
  tableName,
  row,
  seedTables = [],
  seedRecords = null,
  overwrite = false,
  userId = null,
) {
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
  if (tableName === 'companies') {
    await seedTenantTables(
      result.insertId,
      seedTables,
      seedRecords,
      overwrite,
      userId,
    );
  }
  return { id: result.insertId };
}

export async function deleteTableRow(
  tableName,
  id,
  companyId,
  conn = pool,
  userId = null,
) {
  if (tableName === 'company_module_licenses') {
    const [companyId, moduleKey] = String(id).split('-');
    await conn.query(
      'DELETE FROM company_module_licenses WHERE company_id = ? AND module_key = ?',
      [companyId, moduleKey],
    );
    return { company_id: companyId, module_key: moduleKey };
  }

  const columns = await getTableColumnsSafe(tableName);
  const pkCols = await getPrimaryKeyColumns(tableName);
  const pkLower = pkCols.map((c) => c.toLowerCase());
  const hasCompanyId = columns.some(
    (c) => c.toLowerCase() === 'company_id',
  );
  const addCompanyFilter =
    companyId != null && hasCompanyId && !pkLower.includes('company_id');
  logDb(`deleteTableRow(${tableName}, id=${id}) using keys: ${pkCols.join(', ')}`);
  if (pkCols.length === 0) {
    const err = new Error(`Table ${tableName} has no primary or unique key`);
    err.status = 400;
    throw err;
  }

  const softCol = await getSoftDeleteColumn(tableName, companyId);
  const now = formatDateForDb(new Date());

  if (pkCols.length === 1) {
    const col = pkCols[0];
    let where = col === 'id' ? 'id = ?' : `\`${col}\` = ?`;
    const whereParams = [id];
    if (addCompanyFilter) {
      where += ' AND `company_id` = ?';
      whereParams.push(companyId);
    }
    if (softCol) {
      await conn.query(
        `UPDATE ?? SET \`${softCol}\` = 1, \`deleted_by\` = ?, \`deleted_at\` = ? WHERE ${where}`,
        [tableName, userId, now, ...whereParams],
      );
    } else {
      await conn.query(`DELETE FROM ?? WHERE ${where}`, [tableName, ...whereParams]);
    }
    return { [col]: id };
  }

  const parts = String(id).split('-');
  let where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
  const whereParams = [...parts];
  if (addCompanyFilter) {
    where += ' AND `company_id` = ?';
    whereParams.push(companyId);
  }
  if (softCol) {
    await conn.query(
      `UPDATE ?? SET \`${softCol}\` = 1, \`deleted_by\` = ?, \`deleted_at\` = ? WHERE ${where}`,
      [tableName, userId, now, ...whereParams],
    );
  } else {
    await conn.query(`DELETE FROM ?? WHERE ${where}`, [tableName, ...whereParams]);
  }
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
    const vals = g.refCols.map((rc) => {
      const idx = pkCols.indexOf(rc);
      return idx === -1 ? undefined : parts[idx];
    });
    if (vals.includes(undefined)) continue;
    const whereClause = g.columns.map(() => '?? = ?').join(' AND ');
    const params = [];
    g.columns.forEach((col, i) => {
      params.push(col, vals[i]);
    });
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS count FROM ?? WHERE ${whereClause}`,
      [g.table, ...params],
    );
    if (rows[0].count > 0) {
      const result = {
        table: g.table,
        columns: g.columns,
        values: vals,
        count: rows[0].count,
      };
      if (g.columns.length === 1) {
        result.column = g.columns[0];
        result.value = vals[0];
      }
      results.push(result);
    }
  }
  return results;
}

async function deleteCascade(conn, tableName, id, visited, companyId) {
  const key = `${tableName}:${id}`;
  if (visited.has(key)) return;
  visited.add(key);
  const refs = await listRowReferences(tableName, id, conn);
  for (const r of refs) {
    const pkCols = await getPrimaryKeyColumns(r.table);
    const whereClause = r.columns.map(() => '?? = ?').join(' AND ');
    const params = [];
    r.columns.forEach((col, i) => params.push(col, r.values[i]));

    if (pkCols.length === 0) {
      const softCol = await getSoftDeleteColumn(r.table, companyId);
      if (softCol) {
        await conn.query(
          `UPDATE ?? SET \`${softCol}\` = 1 WHERE ${whereClause}`,
          [r.table, ...params],
        );
      } else {
        await conn.query(
          `DELETE FROM ?? WHERE ${whereClause}`,
          [r.table, ...params],
        );
      }
      continue;
    }

    const colList = pkCols.map((c) => `\`${c}\``).join(', ');
    const [rows] = await conn.query(
      `SELECT ${colList} FROM ?? WHERE ${whereClause}`,
      [r.table, ...params],
    );
    for (const row of rows) {
      const refId =
        pkCols.length === 1
          ? row[pkCols[0]]
          : pkCols.map((c) => row[c]).join('-');
      await deleteCascade(conn, r.table, refId, visited, companyId);
    }
  }
  await deleteTableRow(tableName, id, companyId, conn);
}
 
export async function deleteTableRowCascade(tableName, id, companyId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await deleteCascade(conn, tableName, id, new Set(), companyId);
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
          if (Array.isArray(dfCfg[table]?.displayFields)) {
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
