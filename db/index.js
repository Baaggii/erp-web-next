import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

// Create a connection pool
export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Test database connection
 */
export async function testConnection() {
  try {
    await pool.query('SELECT 1');
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
    'SELECT * FROM users WHERE email = ? OR empid = ? LIMIT 1',
    [emailOrEmpId, emailOrEmpId]
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
    'SELECT id, empid, email, name, role, created_at FROM users'
  );
  return rows;
}

/**
 * Get a single user by ID
 */
export async function getUserById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

/**
 * Create a new user
 */
export async function createUser({ empid, email, name, password, role, created_by }) {
  const hashed = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (empid, email, name, password, role, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [empid, email, name, hashed, role, created_by]
  );
  return { id: result.insertId };
}

/**
 * Update an existing user
 */
export async function updateUser(id, { name, email, role }) {
  await pool.query(
    'UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?',
    [name, email, role, id]
  );
  return { id };
}

/**
 * Delete a user by ID
 */
export async function deleteUserById(id) {
  const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
  return result;
}

/**
 * Assign a user to a company with a specific role
 */
export async function assignCompanyToUser(empid, companyId, role) {
  const [result] = await pool.query(
    'INSERT INTO user_companies (empid, company_id, role) VALUES (?, ?, ?)',
    [empid, companyId, role]
  );
  return { id: result.insertId };
}

/**
 * List company assignments for a given user
 */
export async function listUserCompanies(empid) {
  const [rows] = await pool.query(
    'SELECT uc.empid, uc.company_id, c.name AS company_name, uc.role FROM user_companies uc JOIN companies c ON uc.company_id = c.id WHERE uc.empid = ?',
    [empid]
  );
  return rows;
}

/**
 * Remove a user-company assignment
 */
export async function removeCompanyAssignment(empid, companyId) {
  const [result] = await pool.query(
    'DELETE FROM user_companies WHERE empid = ? AND company_id = ?',
    [empid, companyId]
  );
  return result;
}

/**
 * Update a user's company assignment role
 */
export async function updateCompanyAssignment(empid, companyId, role) {
  const [result] = await pool.query(
    'UPDATE user_companies SET role = ? WHERE empid = ? AND company_id = ?',
    [role, empid, companyId]
  );
  return result;
}

/**
 * List all user-company assignments
 */
export async function listAllUserCompanies() {
  const [rows] = await pool.query(
    'SELECT uc.empid, uc.company_id, c.name AS company_name, uc.role FROM user_companies uc JOIN companies c ON uc.company_id = c.id'
  );
  return rows;
}

/**
 * List all companies
 */
export async function listCompanies() {
  const [rows] = await pool.query(
    'SELECT id, name, created_at FROM companies'
  );
  return rows;
}

/**
 * Fetch report data by report ID
 */
export async function fetchReportData(reportId, params = {}) {
  const [rows] = await pool.query(
    'SELECT * FROM report_data WHERE report_id = ?',
    [reportId]
  );
  return rows;
}

/**
 * Get application settings
 */
export async function getSettings() {
  const [rows] = await pool.query('SELECT * FROM settings LIMIT 1');
  return rows[0] || {};
}

/**
 * Update application settings
 */
export async function updateSettings(updates) {
  const keys = Object.keys(updates);
  const values = Object.values(updates);
  const setClause = keys.map(k => `\`${k}\` = ?`).join(', ');
  await pool.query(`UPDATE settings SET ${setClause}`, values);
  return getSettings();
}

/**
 * Get tenant-specific feature flags
 */
export async function getTenantFlags(companyId) {
  const [rows] = await pool.query(
    'SELECT flag_key, flag_value FROM tenant_feature_flags WHERE company_id = ?',
    [companyId]
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
      'INSERT INTO tenant_feature_flags (company_id, flag_key, flag_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE flag_value = ?',
      [companyId, key, value ? 1 : 0, value ? 1 : 0]
    );
  }
  return getTenantFlags(companyId);
}
