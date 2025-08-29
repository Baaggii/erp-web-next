import { pool } from '../../db/index.js';
import { GLOBAL_COMPANY_ID } from '../../config/constants.js';

export async function logUserAction(
  {
    emp_id,
    table_name,
    record_id,
    action,
    details = null,
    request_id = null,
    company_id = GLOBAL_COMPANY_ID,
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
    `INSERT INTO user_activity_log (company_id, emp_id, table_name, record_id, action, details, request_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      company_id,
      emp_id,
      table_name,
      record_id,
      action,
      formattedDetails,
      request_id,
        emp_id,
      ],
  );
}
