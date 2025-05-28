// File: api-server/routes/user_companies.js
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = Router();

// list assignments
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  const [rows] = await _req.app.get('erpPool')
    .query('SELECT empid, company_id AS companyId, role FROM user_companies');
  res.json(rows);
});

// assign user⇒company
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { empid, companyId, role } = req.body;
  await req.app.get('erpPool')
    .query('INSERT INTO user_companies (empid,company_id,role,created_at) VALUES (?,?,?,NOW())',
           [empid, companyId, role]);
  res.json({ message: 'Assigned' });
});

// update assignment
router.put('/:empid/:companyId', requireAuth, requireAdmin, async (req, res) => {
  const { empid, companyId } = req.params;
  const { role } = req.body;
  await req.app.get('erpPool')
    .query('UPDATE user_companies SET role=? WHERE empid=? AND company_id=?',
           [role, empid, companyId]);
  res.json({ message: 'Updated' });
});

// remove assignment
router.delete('/:empid/:companyId', requireAuth, requireAdmin, async (req, res) => {
  const { empid, companyId } = req.params;
  await req.app.get('erpPool')
    .query('DELETE FROM user_companies WHERE empid=? AND company_id=?',
           [empid, companyId]);
  res.json({ message: 'Removed' });
});

export default router;
