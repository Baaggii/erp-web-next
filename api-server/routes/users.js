// File: api-server/routes/users.js
import express from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import bcrypt from 'bcrypt';

const router = express.Router();

// Helper to get the DB pool
function pool(req) {
  return req.app.get('erpPool');
}

// GET /erp/api/users
// ──── List all users (only admin)
router.get('/', requireAdmin, async (req, res) => {
  const pool = req.app.get('erpPool');
  const [rows] = await pool.query(
    'SELECT empid, name, created_by FROM users ORDER BY empid'
  );
  res.json(rows);
});

//  GET /api/users/me     ← current user's own profile
router.get('/me', async (req, res) => {
  const userId = req.user.id;
  const [[user]] = await pool(req).query(
    'SELECT id, email, name, company, role, created_at FROM users WHERE id = ?',
    [userId]
  );
  res.json(user);
});

// POST /erp/api/users
// ──── Create a new user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { empid, name, password, created_by } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const pool = req.app.get('erpPool');
    await pool.execute(
      'INSERT INTO users (empid, name, password, created_by, created_at) VALUES (?,?,?,?,NOW())',
      [empid, name, hash, created_by]
    );
    res.json({ user: { empid, name, created_by } });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ message: err.message });
  }
});

// PUT /erp/api/users/:empid
// ──── Update user’s name (admin only)
router.put('/:empid', requireAdmin, async (req, res) => {
  try {
    const { empid } = req.params;
    const { name }  = req.body;
    const pool = req.app.get('erpPool');
    await pool.execute(
      'UPDATE users SET name=? WHERE empid=?',
      [name, empid]
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ message: err.message });
  }
});

// PUT /erp/api/users/:empid/password
// ──── Change password (self only)
router.put('/:empid/password', async (req, res) => {
  try {
    const { empid } = req.params;
    const { oldPassword, newPassword } = req.body;

    // only allow yourself
    if (req.user.empid !== empid) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const pool = req.app.get('erpPool');
    const [[u]] = await pool.query(
      'SELECT password FROM users WHERE empid=?',
      [empid]
    );
    if (!u) return res.status(404).json({ message: 'User not found' });

    const match = await bcrypt.compare(oldPassword, u.password);
    if (!match) return res.status(401).json({ message: 'Wrong old password' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      'UPDATE users SET password=? WHERE empid=?',
      [hash, empid]
    );
    res.json({ message: 'Password changed' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /erp/api/users/:empid
// ──── Delete a user (admin only)
router.delete('/:empid', requireAdmin, async (req, res) => {
  try {
    const pool = req.app.get('erpPool');
    await pool.execute(
      'DELETE FROM users WHERE empid=?',
      [req.params.empid]
    );
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ message: err.message });
  }
});

// **Public**: get the logged-in user’s profile
router.get('/me', requireAuth, async (req, res) => {
  // req.user was set by requireAuth
  res.json(req.user);
});

export default router;
