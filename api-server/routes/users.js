// File: api-server/routes/users.js
import express from 'express';
import bcrypt  from 'bcryptjs';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
const router = express.Router();

// GET /api/users/me
router.get('/me', requireAuth, async (req, res) => {
  const pool = req.app.get('erpPool');
  const [rows] = await pool.query(
    'SELECT id, empid, email, name, role FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json(rows[0]);
});

// GET /api/users
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  const pool = _req.app.get('erpPool');
  const [rows] = await pool.query(
    'SELECT id, empid, name, role FROM users'
  );
  res.json(rows);
});

// POST /api/users
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { empid, name, password, role } = req.body;
  const pool = req.app.get('erpPool');
  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    `INSERT INTO users (empid, name, password, role, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [empid, name, hash, role, req.user.id]
  );
  res.status(201).json({
    message: 'User created',
    user: { id: result.insertId, empid, name, role }
  });
});

// PUT /api/users/:id
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, role } = req.body;
  const pool = req.app.get('erpPool');
  await pool.query(
    'UPDATE users SET name=?, role=? WHERE id=?',
    [name, role, req.params.id]
  );
  res.json({ message: 'User updated' });
});

// PUT /api/users/:id/password
router.put('/:id/password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword, confirm } = req.body;
  if (newPassword !== confirm) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }
  const pool = req.app.get('erpPool');

  // only self or admin
  if (parseInt(req.params.id) !== req.user.id) {
    const [[u]] = await pool.query('SELECT role FROM users WHERE id=?', [req.user.id]);
    if (u.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  // if self, verify old password
  if (parseInt(req.params.id) === req.user.id) {
    const [[row]] = await pool.query('SELECT password FROM users WHERE id=?', [req.user.id]);
    if (!(await bcrypt.compare(oldPassword, row.password))) {
      return res.status(400).json({ message: 'Old password incorrect' });
    }
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password=? WHERE id=?', [hash, req.params.id]);
  res.json({ message: 'Password updated' });
});

// DELETE /api/users/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const pool = req.app.get('erpPool');
  await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ message: 'User deleted' });
});

export default router;
