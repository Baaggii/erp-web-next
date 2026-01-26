import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getReportSessionConnection } from '../services/reportSessionConnections.js';

const router = express.Router();

const ID_COLUMN_CANDIDATES = ['record_id', 'recordid', 'id', 'row_id', 'rowid'];

function normalizeIds(ids) {
  return String(ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const tableName = String(req.query.table ?? '').trim();
    if (!tableName) {
      return res.status(400).json({ message: 'table is required' });
    }
    const ids = normalizeIds(req.query.ids);
    if (!ids.length) {
      return res.status(400).json({ message: 'ids is required' });
    }
    const connection = await getReportSessionConnection(req);
    let columns = [];
    try {
      const [colRows] = await connection.query('SHOW COLUMNS FROM ??', [tableName]);
      columns = Array.isArray(colRows)
        ? colRows.map((col) => String(col.Field ?? '').trim())
        : [];
    } catch (err) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(404).json({ message: 'Detail table not found' });
      }
      throw err;
    }
    const columnLookup = new Map(
      columns.map((name) => [String(name).toLowerCase(), name]),
    );
    const idColumn =
      ID_COLUMN_CANDIDATES.map((candidate) =>
        columnLookup.get(candidate),
      ).find(Boolean) ?? null;
    if (!idColumn) {
      return res.status(400).json({
        message: 'Unable to resolve a record id column for detail table',
      });
    }
    const [rows] = await connection.query(
      'SELECT * FROM ?? WHERE ?? IN (?)',
      [tableName, idColumn, ids],
    );
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

export default router;
