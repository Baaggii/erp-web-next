// scripts/db-check.cjs
require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.ERP_DB_HOST,
      user: process.env.ERP_DB_USER,
      password: process.env.ERP_DB_PASSWORD,
      database: process.env.ERP_DB_NAME,
      waitForConnections: true,
      connectionLimit: 2,
    });
    const [rows] = await pool.query('SELECT NOW() AS now');
    console.log('✅ DB connection OK, server time is', rows[0].now);
    await pool.end();
  } catch (err) {
    console.error('❌ DB connection failed:', err);
    process.exit(1);
  }
})();
