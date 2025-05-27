// File: api-server/routes/dbtest.js
import express from 'express';
const router = express.Router();

router.get('/', async (_req, res) => {
  const pool = _req.app.get('erpPool');
  const [rows] = await pool.query('SELECT NOW() AS now');
  res.json({ ok: true, time: rows[0].now });
});

export default router;
