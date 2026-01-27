import express from 'express';
import { fetchTempReportDetail } from '../../db/index.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.post('/tmp-detail', requireAuth, async (req, res, next) => {
  try {
    const { table, pk, ids } = req.body || {};
    const rows = await fetchTempReportDetail({ table, pk, ids });
    res.json(rows);
  } catch (err) {
    if (err?.message?.startsWith('Invalid')) {
      return res.status(400).json({ message: err.message });
    }
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(404).json({ message: 'Temp table not found.' });
    }
    return next(err);
  }
});

export default router;
