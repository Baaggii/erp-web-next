import mysql from 'mysql2/promise';
import fs from 'fs';
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

export async function findUserByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
}
export async function findUserById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0];
}
export async function findAllUsers() {
  const [rows] = await pool.query('SELECT * FROM users');
  return rows;
}
export async function insertUser(data) {
  const [result] = await pool.query('INSERT INTO users SET ?', data);
  return { id: result.insertId, ...data };
}
export async function modifyUser(id, data) {
  await pool.query('UPDATE users SET ? WHERE id = ?', [data, id]);
  return findUserById(id);
}
export async function deleteUserById(id) {
  await pool.query('DELETE FROM users WHERE id = ?', [id]);
}
export async function fetchAssignments() {
  const [rows] = await pool.query('SELECT * FROM user_companies');
  return rows;
}
export async function addAssignment(data) {
  const [res] = await pool.query('INSERT INTO user_companies SET ?', data);
  return { id: res.insertId, ...data };
}
export async function removeAssignmentById(id) {
  await pool.query('DELETE FROM user_companies WHERE id = ?', [id]);
}
export async function findAllCompanies() {
  const [rows] = await pool.query('SELECT * FROM companies');
  return rows;
}
export async function testConnection() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
export async function fetchReportData(reportId) {
  // dynamic SQL based on reportId
  const [rows] = await pool.query('SELECT * FROM reports WHERE id = ?', [reportId]);
  return rows;
}
export async function getTenantFlags(companyId) {
  const [rows] = await pool.query('SELECT flags FROM settings WHERE company_id = ?', [companyId]);
  return rows[0]?.flags;
}
export async function setTenantFlags(companyId, flags) {
  await pool.query('UPDATE settings SET flags = ? WHERE company_id = ?', [flags, companyId]);
  return getTenantFlags(companyId);
}