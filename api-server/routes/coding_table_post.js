import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { postCodingTableRows } from '../services/codingTablePost.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.on('close', onClose);
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { table, rows } = req.body || {};
    if (!table || !Array.isArray(rows)) {
      return res.status(400).json({ message: 'table and rows required' });
    }
    if (!/^[A-Za-z0-9_]+$/.test(table)) {
      return res.status(400).json({ message: 'invalid table name' });
    }
    const result = await postCodingTableRows(
      table,
      rows,
      req.user,
      companyId,
      controller.signal,
    );
    res.json(result);
  } catch (err) {
    if (err?.name === 'AbortError') {
      return res.status(499).json({ message: 'Request aborted' });
    }
    next(err);
  } finally {
    req.off('close', onClose);
  }
});

export default router;
