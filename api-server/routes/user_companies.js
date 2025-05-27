// File: api-server/routes/user_companies.js
import express from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
const router = express.Router();

// GET /api/user_companies
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  const pool = _req.app.get('erpPool');
  const [rows] = await pool.query(
    'SELECT empid, company_id, role FROM user_companies'
  );
  res.json(rows);
});

// POST /api/user_companies
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { empid, company_id, role } = req.body;
  const pool = req.app.get('erpPool');
  await pool.query(
    `INSERT INTO user_companies (empid, company_id, role, created_by)
     VALUES (?, ?, ?, ?)`,
    [empid, company_id, role, req.user.id]
  );
  res.status(201).json({ message: 'Assigned' });
});

// PUT /api/user_companies/:empid/:cid
router.put('/:empid/:cid', requireAuth, requireAdmin, async (req, res) => {
  const { role } = req.body;
  const pool = req.app.get('erpPool');
  await pool.query(
    'UPDATE user_companies SET role=? WHERE empid=? AND company_id=?',
    [role, req.params.empid, req.params.cid]
  );
  res.json({ message: 'Updated' });
});

// DELETE /api/user_companies/:empid/:cid
router.delete('/:empid/:cid', requireAuth, requireAdmin, async (req, res) => {
  const pool = req.app.get('erpPool');
  await pool.query(
    'DELETE FROM user_companies WHERE empid=? AND company_id=?',
    [req.params.empid, req.params.cid]
  );
  res.json({ message: 'Deleted' });
});

export default router;
