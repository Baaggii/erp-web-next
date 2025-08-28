import { pool } from '../../db/index.js';

export async function logUserAction(
  {
    emp_id,
    table_name,
    record_id,
    action,
    details = null,
    request_id = null,
    company_id = 0,
  },
  conn = pool,
) {
  const formattedDetails =
    details == null
      ? null
      : typeof details === 'string'
      ? details
      : JSON.stringify(details);

  await conn.query(
    `INSERT INTO user_activity_log (company_id, emp_id, table_name, record_id, action, details, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      company_id,
      emp_id,
      table_name,
      record_id,
      action,
      formattedDetails,
      request_id,
    ],
  );
}
