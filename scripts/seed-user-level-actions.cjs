require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  try {
    const configPath = path.join(process.cwd(), 'config', 'userLevelActions.json');
    const raw = await fs.readFile(configPath, 'utf8');
    const actions = JSON.parse(raw);

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
          `INSERT INTO user_level_permissions (userlevel_id, action, action_key)
           SELECT ul.userlevel_id, ?, ?
             FROM user_levels ul
             WHERE NOT EXISTS (
               SELECT 1 FROM user_level_permissions up
                WHERE up.userlevel_id = ul.userlevel_id
                  AND up.action = ?
                  AND up.action_key = ?
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
