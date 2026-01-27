import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middlewares/auth.js';
import {
  getReportTempSession,
  getReportTempSessionKey,
} from '../services/reportTempTableSession.js';

const router = express.Router();

const tmpDetailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/tmp-detail', tmpDetailLimiter, requireAuth, async (req, res, next) => {
  try {
    const table = typeof req.body?.table === 'string' ? req.body.table.trim() : '';
    const pk = typeof req.body?.pk === 'string' ? req.body.pk.trim() : 'id';
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

    if (!table) {
      return res.status(400).json({ message: 'table required' });
    }
    if (!/^tmp_[a-zA-Z0-9_]+$/.test(table)) {
      return res.status(400).json({ message: 'Invalid table name' });
    }
    if (!pk || !/^[a-zA-Z0-9_]+$/.test(pk)) {
      return res.status(400).json({ message: 'Invalid primary key column' });
    }

    const normalizedIds = ids
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);
    if (!normalizedIds.length) {
      return res.json([]);
    }

    const sessionKey = getReportTempSessionKey(req);
    const connection = getReportTempSession(sessionKey);
    if (!connection) {
      return res.status(404).json({ message: 'Report session not found' });
    }

    const placeholders = normalizedIds.map(() => '?').join(', ');
    const sql = `SELECT * FROM \`${table}\` WHERE \`${pk}\` IN (${placeholders})`;
    const [rows] = await connection.query(sql, normalizedIds);
    return res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
