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

const tenantTableKeyConfigCache = new Map();

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

function escapeIdentifier(name) {
  return `\`${String(name).replace(/`/g, "``")}\``;
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
    const [[{ cnt }]] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?',
      [table_name, companyId],
    );
    const existingCount = Number(cnt) || 0;
    if (existingCount > 0 && !overwrite) {
      const err = new Error(`Table ${table_name} already contains data`);
      err.status = 400;
      throw err;
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

    const records = normalizedRecordMap?.[table_name];
    const pkCols = meta.filter((m) => m.key === 'PRI').map((m) => m.name);
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
      manualRecords,
      ids,
      existingCount,
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
      manualRecords,
      ids,
      existingCount,
    } = info;

    if (existingCount > 0) {
      await pool.query('DELETE FROM ?? WHERE company_id = ?', [
        tableName,
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
        const params = [
          tableName,
          ...colNames.map((c) => (c === 'company_id' ? companyId : row[c])),
        ];
        const [result] = await pool.query(
          `INSERT INTO ?? (${colsClause}) VALUES (${placeholders})`,
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
    const selectParts = ['? AS company_id'];
    const params = [tableName, companyId];
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
    params.push(tableName);

    const idList = Array.isArray(ids) ? ids : [];
    if (idList.length > 0 && pkCols.length === 1) {
      const placeholders = idList.map(() => '?').join(', ');
      sql += ` AND \`${pkCols[0]}\` IN (${placeholders})`;
      params.push(...idList);
    }

    const [result] = await pool.query(sql, params);
    const inserted = Number(result?.affectedRows);
    if (Number.isFinite(inserted)) {
      tableSummary.count += inserted;
    }
    if (idList.length > 0) {
      tableSummary.ids = [...idList];
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
    await pool.query(dropMatch[0]);
  }
  await pool.query(createMatch[0]);
  const procs = await listReportProcedures(procName);
  if (!procs.includes(procName)) {
    throw new Error('Failed to create procedure');
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

export async function deleteProcedure(name, { allowProtected = false } = {}) {
  if (!name) return;
  if (!allowProtected && (await isProtectedProcedure(name))) {
    const err = new Error('Procedure not allowed');
    err.status = 403;
    throw err;
  }
  await pool.query(`DROP PROCEDURE IF EXISTS \`${name}\``);
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
  seedTables,
  seedRecords,
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
  const parts = String(rowId ?? '').split('-');
  if (parts.length !== pkCols.length || parts.some((part) => part === '')) {
    const err = new Error('Invalid row identifier');
    err.status = 400;
    throw err;
  }
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

async function deleteCascade(conn, tableName, id, visited, companyId) {
  const key = `${tableName}:${id}`;
  if (visited.has(key)) return;
  visited.add(key);
  const refs = await listRowReferences(tableName, id, conn);
  for (const r of refs) {
    const pkCols = await getPrimaryKeyColumns(r.table);
    const whereClause = r.columns.map(() => '?? = ?').join(' AND ');
    const params = [];
    const queryVals = r.queryValues ?? r.values;
    r.columns.forEach((col, i) => params.push(col, queryVals[i]));

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
 
export async function deleteTableRowCascade(
  tableName,
  id,
  companyId,
  options = {},
) {
  const conn = await pool.getConnection();
  const { beforeDelete } = options ?? {};
  try {
    await conn.beginTransaction();
    if (typeof beforeDelete === 'function') {
      await beforeDelete(conn);
    }
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
