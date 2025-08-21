import { pool } from '../../db/index.js';

export async function getUnreadResponseNotifications(empid) {
  const [rows] = await pool.query(
    `SELECT n.notification_id, n.related_id AS request_id, n.message, pr.status, n.created_at
     FROM notifications n
     JOIN pending_request pr ON pr.request_id = n.related_id
     WHERE n.recipient_empid = ? AND n.type = 'response' AND n.is_read = 0
     ORDER BY n.created_at DESC`,
    [empid]
  );
  return rows;
}

export async function markNotificationsRead(empid, ids = []) {
  if (ids.length === 0) {
    await pool.query(
      `UPDATE notifications SET is_read = 1
       WHERE recipient_empid = ? AND type = 'response' AND is_read = 0`,
      [empid]
    );
  } else {
    await pool.query(
      `UPDATE notifications SET is_read = 1
       WHERE recipient_empid = ? AND notification_id IN (?)`,
      [empid, ids]
    );
  }
}
