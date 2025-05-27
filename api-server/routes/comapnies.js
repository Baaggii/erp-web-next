// File: api-server/routes/companies.js
import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const pool = req.app.get('erpPool');
  const [rows] = await pool.query('SELECT id, name FROM companies');
  res.json(rows);
});

export default router;
