// File: api-server/routes/user_companies.js
import express from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

// GET /erp/api/user_companies — list all assignments (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const pool = req.app.get('erpPool');
  const [rows] = await pool.query(`
    SELECT empid, company_id AS company, role, created_at
      FROM user_companies
  `);
  res.json(rows);
});

// POST /erp/api/user_companies — assign a user to a company (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { empid, company, role } = req.body;
  const pool = req.app.get('erpPool');
  await pool.execute(
    `INSERT INTO user_companies (empid, company_id, role, created_at)
     VALUES (?, ?, ?, NOW())`,
    [empid, company, role]
  );
  res.status(201).json({ message: 'Assigned' });
});

// PUT /erp/api/user_companies/:empid/:company — change role (admin only)
router.put('/:empid/:company', requireAuth, requireAdmin, async (req, res) => {
  const { empid, company } = req.params;
  const { role }           = req.body;
  const pool = req.app.get('erpPool');
  await pool.execute(
    `UPDATE user_companies
        SET role = ?
      WHERE empid = ? AND company_id = ?`,
    [role, empid, company]
  );
  res.json({ message: 'Updated' });
});

// DELETE /erp/api/user_companies/:empid/:company — unassign (admin only)
router.delete('/:empid/:company', requireAuth, requireAdmin, async (req, res) => {
  const { empid, company } = req.params;
  const pool = req.app.get('erpPool');
  await pool.execute(
    `DELETE FROM user_companies
      WHERE empid = ? AND company_id = ?`,
    [empid, company]
  );
  res.json({ message: 'Deleted' });
});

export default router;
