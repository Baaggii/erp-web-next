import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getReportSessionConnection } from '../services/reportSessionConnections.js';

const router = express.Router();

const ID_COLUMN_CANDIDATES = ['record_id', 'recordid', 'id', 'row_id', 'rowid'];

function normalizeIds(ids) {
  if (Array.isArray(ids)) {
    return ids
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);
  }
  return String(ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

async function resolveDetailRows({ req, res, next, tableName, ids, pk }) {
  try {
    if (!tableName) {
      return res.status(400).json({ message: 'table is required' });
    }
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
    let idColumn = null;
    const requestedPk = String(pk ?? '').trim();
    if (requestedPk) {
      idColumn = columnLookup.get(requestedPk.toLowerCase()) ?? null;
      if (!idColumn) {
        return res.status(400).json({
          message: 'Invalid primary key column for detail table',
        });
      }
    } else {
      idColumn =
        ID_COLUMN_CANDIDATES.map((candidate) =>
          columnLookup.get(candidate),
        ).find(Boolean) ?? null;
    }
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
}

router.get('/', requireAuth, async (req, res, next) => {
  const tableName = String(req.query.table ?? '').trim();
  const ids = normalizeIds(req.query.ids);
  await resolveDetailRows({ req, res, next, tableName, ids });
});

router.post('/', requireAuth, async (req, res, next) => {
  const tableName = String(req.body?.table ?? '').trim();
  const ids = normalizeIds(req.body?.ids);
  const pk = String(req.body?.pk ?? '').trim();
  if (!pk) {
    return res.status(400).json({ message: 'pk is required' });
  }
  await resolveDetailRows({ req, res, next, tableName, ids, pk });
});

export default router;
