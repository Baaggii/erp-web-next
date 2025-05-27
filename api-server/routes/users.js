// File: api-server/routes/users.js
import express from 'express';
import bcrypt  from 'bcrypt';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

/**
 * GET /erp/api/users/me
 *   → always returns the logged-in user’s record
 */
router.get('/me', requireAuth, async (req, res) => {
  const pool = req.app.get('erpPool');
  const [[me]] = await pool.query(
    `SELECT empid, name, company, role
       FROM users
      WHERE id = ?`,
    [req.user.id]
  );
  res.json(me);
});


/**
 * GET /erp/api/users
 *   → admin only: list all users
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const pool = req.app.get('erpPool');
  const [users] = await pool.query(
    `SELECT id, empid, name, company, role
       FROM users
    ORDER BY empid`
  );
  res.json(users);
});


/**
 * POST /erp/api/users
 *   → admin only: create a new user
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { empid, name, company, role, password } = req.body;
  if (!empid || !name || !password) {
    return res.status(400).json({ message: 'EmpID, name & password required' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const pool  = req.app.get('erpPool');
  try {
    const [result] = await pool.query(
      `INSERT INTO users (empid, name, company, role, password, created_by)
        VALUES (?,?,?,?,?,?)`,
      [empid, name, company, role||'user', hashed, req.user.empid]
    );
    // fetch back the new user
    const [[user]] = await pool.query(
      `SELECT id, empid, name, company, role FROM users WHERE id = ?`,
      [result.insertId]
    );
    res.json({ user, message: 'User created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Insert failed', error: err.sqlMessage });
  }
});


/**
 * PUT /erp/api/users/:empid
 *   → admin can update any, user can only update their own password
 */
router.put('/:empid', requireAuth, async (req, res) => {
  const { empid } = req.params;
  const pool      = req.app.get('erpPool');

  // if non-admin, they may only change _their_ own password
  if (!req.user.isAdmin && req.user.empid !== empid) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const fields = [];
  const params = [];

  if (req.body.password) {
    // must supply oldPassword, newPassword twice
    const { oldPassword, newPassword, confirmPassword } = req.body;
    if (!oldPassword || !newPassword || newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Password validation failed' });
    }
    // verify old
    const [[u]] = await pool.query(
      `SELECT password FROM users WHERE empid = ?`,
      [empid]
    );
    if (!u || !(await bcrypt.compare(oldPassword, u.password))) {
      return res.status(401).json({ message: 'Old password incorrect' });
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    fields.push('password = ?');
    params.push(hashed);
  }

  // admin-only updatable fields
  if (req.user.isAdmin) {
    ['name','company','role'].forEach(key => {
      if (req.body[key] != null) {
        fields.push(`${key} = ?`);
        params.push(req.body[key]);
      }
    });
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  params.push(empid);
  try {
    await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE empid = ?`,
      params
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Update failed', error: err.sqlMessage });
  }
});


/**
 * DELETE /erp/api/users/:empid
 *   → admin only
 */
router.delete('/:empid', requireAuth, requireAdmin, async (req, res) => {
  const { empid } = req.params;
  const pool      = req.app.get('erpPool');
  try {
    await pool.query(`DELETE FROM users WHERE empid = ?`, [empid]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Delete failed', error: err.sqlMessage });
  }
});


export default router;
