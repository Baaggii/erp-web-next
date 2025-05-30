import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
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
 * Fetch a user by email (or employee ID) from the users table
 * @param {string} emailOrEmpId
 * @returns {Promise<Object|null>}
 */
export async function getUserByEmail(emailOrEmpId) {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ? OR empid = ? LIMIT 1',
    [emailOrEmpId, emailOrEmpId]
  );
  if (rows.length === 0) return null;
  // Map DB row to user instance with verifyPassword
  const user = rows[0];
  user.verifyPassword = async (plain) => {
    // Import bcryptjs here or elsewhere
    const bcrypt = await import('bcryptjs');
    return bcrypt.compare(plain, user.password);
  };
  return user;
}

// You can add more repository functions here:
// export async function listUsers() { ... }
// export async function getCompanyLicenses(companyId) { ... }