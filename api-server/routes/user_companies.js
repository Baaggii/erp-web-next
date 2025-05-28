import express from 'express';
import { pool }   from '../utils/db.js';        // or inline req.app.get('erpPool')
import { requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

// GET /erp/api/user_companies     ← list all assignments (admin)
router.get('/', requireAdmin, async (req, res) => {
  const [rows] = await req.app.get('erpPool')
    .query(`SELECT empid, company_id, role, created_at
            FROM user_companies`);
  res.json(rows);
});

// POST /erp/api/user_companies    ← assign user → company (admin)
router.post('/', requireAdmin, async (req, res) => {
  const { empid, company_id, role } = req.body;
  await req.app.get('erpPool').execute(
    `INSERT INTO user_companies (empid, company_id, role, created_at)
     VALUES (?, ?, ?, NOW())`,
    [empid, company_id, role]
  );
  res.status(201).json({ message:'Assigned' });
});

// PUT /erp/api/user_companies/:empid/:company_id   ← update role (admin)
router.put('/:empid/:company_id', requireAdmin, async (req, res) => {
  const { empid, company_id } = req.params;
  const { role }             = req.body;
  await req.app.get('erpPool').execute(
    `UPDATE user_companies SET role=? WHERE empid=? AND company_id=?`,
    [role, empid, company_id]
  );
  res.json({ message:'Updated' });
});

// DELETE /erp/api/user_companies/:empid/:company_id  ← unassign (admin)
router.delete('/:empid/:company_id', requireAdmin, async (req, res) => {
  const { empid, company_id } = req.params;
  await req.app.get('erpPool').execute(
    `DELETE FROM user_companies WHERE empid=? AND company_id=?`,
    [empid, company_id]
  );
  res.json({ message:'Deleted' });
});

export default router;
