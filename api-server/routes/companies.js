import express from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

// ▶ Assign or re-assign a user to a company (ADMIN only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { empid, company_id, role } = req.body;
  await req.app.get('erpPool').execute(`
    REPLACE INTO user_companies (empid, company_id, role)
    VALUES (?, ?, ?)`,
    [empid, company_id, role]
  );
  res.json({ message: 'Assigned' });
});

// ▶ Remove a user from a company (ADMIN only)
router.delete('/:empid/:company_id', requireAuth, requireAdmin, async (req, res) => {
  await req.app.get('erpPool').execute(
    `DELETE FROM user_companies WHERE empid=? AND company_id=?`,
    [req.params.empid, req.params.company_id]
  );
  res.json({ message: 'Unassigned' });
});

export default router;
