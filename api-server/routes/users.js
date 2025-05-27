// api-server/routes/users.js
import express from 'express';
import bcrypt  from 'bcrypt';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

// GET all users (admin)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await req.app.get('erpPool')
    .query('SELECT id, empid, name, company, role FROM users');
  res.json(rows);
});

// GET my profile
router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await req.app.get('erpPool')
    .query('SELECT id, empid, name, company, role FROM users WHERE id = ?', [req.user.id]);
  res.json(rows[0]);
});

// CREATE new user (admin)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { empid, password, name, company, role } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const [result] = await req.app.get('erpPool')
    .execute(
      'INSERT INTO users (empid, password, name, company, role) VALUES (?,?,?,?,?)',
      [empid, hashed, name, company, role]
    );
  res.json({
    user: {
      id:      result.insertId,
      empid, name, company, role
    },
    message: 'User created'
  });
});

// UPDATE user (admin can update name/company/role)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, company, role } = req.body;
  await req.app.get('erpPool')
    .execute(
      'UPDATE users SET name=?, company=?, role=? WHERE id=?',
      [name, company, role, req.params.id]
    );
  res.json({ message: 'Updated' });
});

// CHANGE password (self)
router.put('/:id/password', requireAuth, async (req, res) => {
  if (parseInt(req.params.id,10) !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const { oldPassword, newPassword } = req.body;
  // verify
  const [[u]] = await req.app.get('erpPool')
    .query('SELECT password FROM users WHERE id=?', [req.user.id]);
  if (!u || !(await bcrypt.compare(oldPassword, u.password))) {
    return res.status(401).json({ message: 'Old password incorrect' });
  }
  const hashed = await bcrypt.hash(newPassword, 10);
  await req.app.get('erpPool')
    .execute('UPDATE users SET password=? WHERE id=?', [hashed, req.user.id]);
  res.json({ message: 'Password changed' });
});

// DELETE user (admin)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  await req.app.get('erpPool')
    .execute('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

export default router;
