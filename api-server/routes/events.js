import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { pool } from '../../db/index.js';
import { processPendingEvents } from '../services/eventProcessorService.js';

const router = express.Router();

function requireSystemSettings(req, res) {
  if (!req.user?.permissions?.system_settings) {
    res.sendStatus(403);
    return false;
  }
  return true;
}

router.get('/list', requireAuth, async (req, res, next) => {
  try {
    if (!requireSystemSettings(req, res)) return;
    const [rows] = await pool.query(
      `SELECT DISTINCT event_type, source_transaction_type, source_table
       FROM core_events
       WHERE company_id = ?
       ORDER BY event_type ASC`,
      [req.user.companyId],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const [rows] = await pool.query(
      `SELECT * FROM core_events WHERE company_id = ? AND deleted_at IS NULL ORDER BY occurred_at DESC LIMIT ?`,
      [req.user.companyId, limit],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM core_events WHERE event_id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1`,
      [req.params.id, req.user.companyId],
    );
    if (!rows.length) return res.sendStatus(404);
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post('/process', requireAuth, async (req, res, next) => {
  try {
    const result = await processPendingEvents({ companyId: req.user.companyId, limit: Number(req.body?.limit || 50) });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/replay/:id', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user?.position_id === 1 || req.user?.isAdmin;
    if (!isAdmin) return res.sendStatus(403);
    await pool.query(
      `UPDATE core_events SET status='pending', retry_count = 0, error_message = NULL, processed_at = NULL, updated_at = NOW()
       WHERE event_id = ? AND company_id = ?`,
      [req.params.id, req.user.companyId],
    );
    const result = await processPendingEvents({ companyId: req.user.companyId, eventId: req.params.id, limit: 1 });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
