import { pool, getPrimaryKeyColumns } from '../../db/index.js';
import { logUserAction } from '../services/userActivityLog.js';

export async function listActivityLogs(req, res, next) {
  try {
    const { emp_id, record_id } = req.query;
    const params = [];
    const where = [];
    if (emp_id) {
      where.push('emp_id = ?');
      params.push(emp_id);
    }
    if (record_id) {
      where.push('record_id = ?');
      params.push(record_id);
    }
    let sql = 'SELECT * FROM user_activity_log';
    if (where.length) {
      sql += ' WHERE ' + where.join(' AND ');
    }
    sql += ' ORDER BY timestamp DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function restoreLogEntry(req, res, next) {
  try {
    const { id } = req.params;
    const [logs] = await pool.query(
      'SELECT * FROM user_activity_log WHERE log_id = ? LIMIT 1',
      [id],
    );
    const entry = logs[0];
    if (!entry) return res.sendStatus(404);

    const [rows] = await pool.query(
      'SELECT senior_empid FROM tbl_employment WHERE employment_emp_id = ? LIMIT 1',
      [entry.emp_id],
    );
    const senior = rows[0]?.senior_empid;
    if (senior !== req.user.empid) return res.sendStatus(403);

    const data = entry.details ? JSON.parse(entry.details) : null;
    if (!data) return res.status(400).json({ message: 'No details to restore' });
    const table = entry.table_name;
    const pkCols = await getPrimaryKeyColumns(table);

    if (entry.action === 'delete') {
      const cols = Object.keys(data);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO \`${table}\` (${cols
        .map((c) => `\`${c}\``)
        .join(', ')}) VALUES (${placeholders})`;
      await pool.query(sql, cols.map((c) => data[c]));
    } else if (entry.action === 'update') {
      if (!pkCols.length)
        return res.status(400).json({ message: 'No primary key for table' });
      const setCols = Object.keys(data).filter((c) => !pkCols.includes(c));
      const setSql = setCols.map((c) => `\`${c}\` = ?`).join(', ');
      const whereSql = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
      await pool.query(
        `UPDATE \`${table}\` SET ${setSql} WHERE ${whereSql}`,
        [...setCols.map((c) => data[c]), ...pkCols.map((c) => data[c])],
      );
    } else {
      return res.status(400).json({ message: 'Unsupported action' });
    }

    await logUserAction({
      emp_id: req.user.empid,
      table_name: table,
      record_id: entry.record_id,
      action: 'restore',
      details: data,
    });

    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}
