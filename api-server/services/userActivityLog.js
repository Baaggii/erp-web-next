import { pool } from '../../db/index.js';

export async function logUserAction(
  { emp_id, table_name, record_id, action, details = null, request_id = null },
  conn = pool,
) {
  await conn.query(
    `INSERT INTO user_activity_log (emp_id, table_name, record_id, action, details, request_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [emp_id, table_name, record_id, action, details ? JSON.stringify(details) : null, request_id]
  );
}
