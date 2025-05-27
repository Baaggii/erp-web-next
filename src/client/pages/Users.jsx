import express from 'express';
import bcrypt  from 'bcrypt';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

// ▶ List all users (ADMIN only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const [all] = await req.app.get('erpPool')
    .query(`SELECT u.empid, u.name, u.email, u.created_by, 
                   uc.company_id, uc.role
            FROM users u
            JOIN user_companies uc ON uc.empid = u.empid`);
  res.json(all);
});

// ▶ Create new user (ADMIN only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { empid, email, password, name, created_by } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const conn = req.app.get('erpPool');

  // 1) insert into users
  await conn.execute(
    `INSERT INTO users (empid, email, password, name, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [empid, email, hash, name, req.auth.uid]
  );

  // 2) optionally assign them to a company + role
  if (req.body.company_id) {
    await conn.execute(
      `INSERT INTO user_companies (empid, company_id, role)
       VALUES (?, ?, ?)`,
      [empid, req.body.company_id, req.body.role || 'user']
    );
  }

  res.json({ message: 'User created', user:{ empid, email, name } });
});

// ▶ Update user’s own profile or ADMIN editing
router.put('/:empid', requireAuth, async (req, res) => {
  const isSelf  = req.params.empid === req.auth.empid;
  const isAdmin = req.auth.role === 'admin';
  if (!isSelf && !isAdmin) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const fields = [];
  const vals   = [];
  if (req.body.name) {
    fields.push('name = ?');
    vals.push(req.body.name);
  }
  if (req.body.email && isAdmin) {
    fields.push('email = ?');
    vals.push(req.body.email);
  }
  if (req.body.password) {
    // require password change via old/new verification...
    const [[urow]] = await req.app.get('erpPool')
      .query('SELECT password FROM users WHERE empid = ?', [req.params.empid]);
    // validate old password
    if (!(await bcrypt.compare(req.body.oldPassword, urow.password))) {
      return res.status(400).json({ message: 'Bad current password' });
    }
    if (req.body.newPassword !== req.body.confirmPassword) {
      return res.status(400).json({ message: 'Password mismatch' });
    }
    fields.push('password = ?');
    vals.push( await bcrypt.hash(req.body.newPassword, 10) );
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  vals.push(req.params.empid);
  await req.app.get('erpPool')
    .query(
      `UPDATE users SET ${fields.join(', ')} WHERE empid = ?`,
      vals
    );

  res.json({ message: 'Updated' });
});

// ▶ Delete user (ADMIN only)
router.delete('/:empid', requireAuth, requireAdmin, async (req, res) => {
  const emp = req.params.empid;
  // cascade delete user_companies first
  await req.app.get('erpPool')
    .execute('DELETE FROM user_companies WHERE empid = ?', [emp]);
  // then users
  await req.app.get('erpPool')
    .execute('DELETE FROM users WHERE empid = ?', [emp]);
  res.json({ message: 'Deleted' });
});

export default router;
