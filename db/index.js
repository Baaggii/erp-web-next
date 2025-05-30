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
export async function assignCompanyToUser(userId, companyId, role, createdBy) {
  const [result] = await pool.query(
    'INSERT INTO user_companies (empid, company_id, role, created_by) VALUES (?, ?, ?, ?)',
    [userId, companyId, role, createdBy]
  );
  return { id: result.insertId };
}

/**
 * List company assignments for a given user
 */
export async function listUserCompanies(userId) {
  const [rows] = await pool.query(
    'SELECT uc.company_id, c.name, uc.role FROM user_companies uc JOIN companies c ON uc.company_id = c.id WHERE uc.empid = ?',
    [userId]
  );
  return rows;
}

/**
 * Remove a user-company assignment
 */
export async function removeCompanyAssignment(userId, companyId) {
  const [result] = await pool.query(
    'DELETE FROM user_companies WHERE empid = ? AND company_id = ?',
    [userId, companyId]
  );
  return result;
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
