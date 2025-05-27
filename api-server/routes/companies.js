// File: api-server/routes/user_companies.js
import express from 'express';
import { requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

// GET /erp/api/user_companies
// ──── List all assignments (admin only)
router.get('/', requireAdmin, async (req, res) => {
  const pool = req.app.get('erpPool');
  const [rows] = await pool.query(
    'SELECT empid, company_id, role, created_by, created_at FROM user_companies'
  );
  res.json(rows);
});

// POST /erp/api/user_companies
// ──── Assign a user to a company (admin)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { empid, company_id, role, created_by } = req.body;
    const pool = req.app.get('erpPool');
    await pool.execute(
      `INSERT INTO user_companies
         (empid, company_id, role, created_by, created_at)
       VALUES (?,?,?,?,NOW())`,
      [empid, company_id, role, created_by]
    );
    res.json({ message: 'Assigned' });
  } catch (err) {
    console.error('Assign error:', err);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /erp/api/user_companies/:empid/:company_id
// ──── Unassign (admin only)
router.delete('/:empid/:company_id', requireAdmin, async (req, res) => {
  try {
    const { empid, company_id } = req.params;
    const pool = req.app.get('erpPool');
    await pool.execute(
      'DELETE FROM user_companies WHERE empid=? AND company_id=?',
      [empid, company_id]
    );
    res.json({ message: 'Unassigned' });
  } catch (err) {
    console.error('Unassign error:', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
