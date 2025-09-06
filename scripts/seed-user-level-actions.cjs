require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  try {
    const companyId = process.env.COMPANY_ID || 0;
    const tenantPath = path.join(
      process.cwd(),
      'config',
      String(companyId),
      'userLevelActions.json',
    );
    let raw;
    try {
      raw = await fs.readFile(tenantPath, 'utf8');
    } catch {
      raw = await fs.readFile(
        path.join(process.cwd(), 'config', '0', 'userLevelActions.json'),
        'utf8',
      );
    }
    const actions = JSON.parse(raw);
    const { GLOBAL_COMPANY_ID } = await import('../config/0/constants.js');

    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });

    async function insert(type, keys) {
      for (const key of keys) {
        await pool.query(
          `INSERT INTO user_level_permissions (company_id, userlevel_id, action, action_key)
           SELECT ${GLOBAL_COMPANY_ID}, ul.userlevel_id, ?, ?
             FROM user_levels ul
             WHERE NOT EXISTS (
               SELECT 1 FROM user_level_permissions up
                WHERE up.userlevel_id = ul.userlevel_id
                  AND up.action = ?
                  AND up.action_key = ?
                  AND up.company_id = ${GLOBAL_COMPANY_ID}
             )`,
          [type, key, type, key]
        );
      }
    }

    await insert('button', actions.buttons || []);
    await insert('function', actions.functions || []);
    await insert('API', actions.api || []);

    await pool.end();
    console.log('User level permissions seeding complete');
  } catch (err) {
    console.error('Failed to seed user level permissions:', err);
    process.exit(1);
  }
})();
