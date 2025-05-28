// File: api-server/routes/users.js
import express from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Helper to get the DB pool
function pool(req) {
  return req.app.get('erpPool');
}

//  GET /api/users        ← list all users (admin only)
router.get('/', async (req, res) => {
  const [rows] = await pool(req).query(
    'SELECT id, email, name, role, created_at FROM users'
  );
  res.json(rows);
});

//  GET /api/users/me     ← current user's own profile
router.get('/me', async (req, res) => {
  const userId = req.user.id;
  const [[user]] = await pool(req).query(
    'SELECT id, email, name, role, created_at FROM users WHERE id = ?',
    [userId]
  );
  res.json(user);
});

//  POST /api/users       ← create new user (admin only)
router.post('/', async (req, res) => {
  const { email, password, name, role = 'user' } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  await pool(req).execute(
    `INSERT INTO users (email, password, name, role)
     VALUES (?, ?, ?, ?, ?)`,
    [email, hashed, name, role]
  );
  res.status(201).json({ message: 'User created' });
});

//  PUT /api/users/:id    ← update any user (admin) or self
router.put('/:id', async (req, res) => {
  const targetId = Number(req.params.id);
  const me = req.user;
  // only admin or self
  if (me.role !== 'admin' && me.id !== targetId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const fields = [];
  const values = [];

  if (req.body.name) {
    fields.push('name = ?');
    values.push(req.body.name);
  }
  if (req.body.password) {
    const hash = await bcrypt.hash(req.body.password, 10);
    fields.push('password = ?');
    values.push(hash);
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  values.push(targetId);
  await pool(req).execute(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  res.json({ message: 'Updated' });
});

//  DELETE /api/users/:id ← remove a user (admin only)
router.delete('/:id', async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ message: 'Cannot delete self' });
  }
  await pool(req).execute(`DELETE FROM users WHERE id = ?`, [targetId]);
  res.json({ message: 'Deleted' });
});

// **Public**: get the logged-in user’s profile
router.get('/me', requireAuth, async (req, res) => {
  // req.user was set by requireAuth
  res.json(req.user);
});

export default router;
