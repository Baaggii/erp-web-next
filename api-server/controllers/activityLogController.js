import {
  pool,
  getPrimaryKeyColumns,
  listTableColumns,
} from '../../db/index.js';
import { logUserAction } from '../services/userActivityLog.js';
import { queryWithTenantScope } from '../services/tenantScope.js';

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
    let sql = 'SELECT * FROM {{table}}';
    if (where.length) {
      sql += ' WHERE ' + where.join(' AND ');
    }
    sql += ' ORDER BY timestamp DESC LIMIT 200';
    const [rows] = await queryWithTenantScope(
      pool,
      'user_activity_log',
      req.user.companyId,
      sql,
      params,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function restoreLogEntry(req, res, next) {
  try {
    const { id } = req.params;
    const [logs] = await queryWithTenantScope(
      pool,
      'user_activity_log',
      req.user.companyId,
      'SELECT * FROM {{table}} WHERE log_id = ? LIMIT 1',
      [id],
    );
    const entry = logs[0];
    if (!entry) return res.sendStatus(404);

    const [rows] = await queryWithTenantScope(
      pool,
      'tbl_employment',
      entry.company_id,
      'SELECT employment_senior_empid FROM {{table}} WHERE employment_emp_id = ? LIMIT 1',
      [entry.emp_id],
    );
    const senior = rows[0]?.employment_senior_empid;
    if (senior !== req.user.empid) return res.sendStatus(403);

    const data = entry.details ? JSON.parse(entry.details) : null;
    if (!data) return res.status(400).json({ message: 'No details to restore' });
    const table = entry.table_name;
    const pkCols = await getPrimaryKeyColumns(table);
    const tableCols = await listTableColumns(table);
    const lowerCols = tableCols.map((c) => c.toLowerCase());

    if (entry.action === 'delete') {
      const colNames = [];
      const placeholders = [];
      const values = [];

      for (const c of Object.keys(data)) {
        colNames.push(`\`${c}\``);
        placeholders.push('?');
        values.push(data[c]);
      }

      if (lowerCols.includes('created_by') && data.created_by === undefined) {
        colNames.push('`created_by`');
        placeholders.push('?');
        values.push(req.user.empid);
      }
      if (lowerCols.includes('created_at') && data.created_at === undefined) {
        colNames.push('`created_at`');
        placeholders.push('NOW()');
      }

      const sql = `INSERT INTO \`${table}\` (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})`;
      await pool.query(sql, values);
    } else if (entry.action === 'update') {
      if (!pkCols.length)
        return res.status(400).json({ message: 'No primary key for table' });

      const setParts = [];
      const values = [];

      for (const c of Object.keys(data)) {
        if (pkCols.includes(c)) continue;
        const lower = c.toLowerCase();
        if (lower === 'updated_by' || lower === 'updated_at') continue;
        setParts.push(`\`${c}\` = ?`);
        values.push(data[c]);
      }

      if (lowerCols.includes('updated_by')) {
        setParts.push('`updated_by` = ?');
        values.push(req.user.empid);
      }
      if (lowerCols.includes('updated_at')) {
        setParts.push('`updated_at` = NOW()');
      }

      const whereSql = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
      await pool.query(
        `UPDATE \`${table}\` SET ${setParts.join(', ')} WHERE ${whereSql}`,
        [...values, ...pkCols.map((c) => data[c])],
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
