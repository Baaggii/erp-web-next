// File: api-server/routes/user_companies.js
import express              from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
const router = express.Router();
const pool   = req => req.app.get('erpPool');

// [GET]    /erp/api/user_companies      ← admin only
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await pool(req).query(
    'SELECT id, empid, company_id AS company, role FROM user_companies'
  );
  res.json(rows);
});

// [POST]   /erp/api/user_companies      ← admin only
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { empid, company, role = 'user' } = req.body;
  await pool(req).execute(
    'INSERT INTO user_companies (empid, company_id, role, created_at) VALUES (?, ?, ?, NOW())',
    [empid, company, role]
  );
  const [[row]] = await pool(req).query(
    'SELECT id, empid, company_id AS company, role FROM user_companies WHERE empid = ? AND company_id = ?',
    [empid, company]
  );
  res.status(201).json({ assignment: row });
});

// [PUT]    /erp/api/user_companies/:id  ← admin only
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await pool(req).execute(
    'UPDATE user_companies SET role = ? WHERE id = ?',
    [req.body.role, id]
  );
  res.json({ message: 'Updated' });
});

// [DELETE] /erp/api/user_companies/:id  ← admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await pool(req).execute('DELETE FROM user_companies WHERE id = ?', [id]);
  res.json({ message: 'Removed' });
});

export default router;
