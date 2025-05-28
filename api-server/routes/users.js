// File: api-server/routes/users.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = Router();

// get current user
router.get('/me', requireAuth, async (req, res) => {
  const pool = req.app.get('erpPool');
  const [[u]] = await pool.query('SELECT id, empid, email, name, role FROM users WHERE id=?', [req.userId]);
  res.json(u);
});

// list all users (admin only)
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  const pool = _req.app.get('erpPool');
  const [rows] = await pool.query('SELECT id, empid, email, name, role FROM users');
  res.json(rows);
});

// create user (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { empid, email, name, password, role } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const pool = req.app.get('erpPool');
  const [result] = await pool.query(
    'INSERT INTO users (empid,email,name,password,role) VALUES (?,?,?,?,?)',
    [ empid, email||null, name, hashed, role ]
  );
  res.json({ user: { id: result.insertId, empid, email, name, role }, message: 'User created' });
});

// update user (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { empid, email, name, role } = req.body;
  const pool = req.app.get('erpPool');
  await pool.query(
    'UPDATE users SET empid=?, email=?, name=?, role=? WHERE id=?',
    [ empid, email||null, name, role, id ]
  );
  res.json({ message: 'User updated' });
});

// change password (self or admin)
router.put('/:id/password', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (req.userId !== +id && !req.userRole === 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const { oldPassword, newPassword } = req.body;
  const pool = req.app.get('erpPool');
  const [[u]] = await pool.query('SELECT password FROM users WHERE id=?', [id]);
  if (req.userId === +id && !await bcrypt.compare(oldPassword, u.password)) {
    return res.status(400).json({ message: 'Old password incorrect' });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password=? WHERE id=?', [hash, id]);
  res.json({ message: 'Password updated' });
});

// delete user (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  await req.app.get('erpPool').query('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

export default router;
