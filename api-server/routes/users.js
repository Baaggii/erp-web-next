// File: api-server/routes/users.js
import { Router } from 'express';
import bcrypt       from 'bcryptjs';
const router = Router();

// GET /erp/api/users            → list (admin-only)
router.get('/', async (req, res) => {
  // you would check req.user.role==='admin' here
  const [users] = await req.app.get('erpPool').query(
    'SELECT id, empid, email, name, role FROM users'
  );
  res.json(users);
});

// GET /erp/api/users/me         → your profile
router.get('/me', async (req, res) => {
  const [[me]] = await req.app.get('erpPool').query(
    'SELECT id, empid, email, name, company, role FROM users WHERE id=?',
    [req.user.id]
  );
  if (!me) return res.status(404).json({ message:'Not found' });
  res.json(me);
});

// POST /erp/api/users           → create (admin-only)
router.post('/', async (req, res) => {
  const { empid, email, name, password, role } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const [result] = await req.app.get('erpPool').query(
    `INSERT INTO users(empid,email,name,password,role,created_by)
     VALUES(?,?,?,?,?,?)`,
    [empid, email||null, name, hash, role, req.user.id]
  );
  res.json({ message:'User created', user:{ id: result.insertId, empid, email, name, role } });
});

// PUT /erp/api/users/:id        → update (admin edits other, or user edits own)
router.put('/:id', async (req, res) => {
  const id = +req.params.id;
  const changes = req.body;
  // if updating password, handle separately (see below)
  delete changes.password;
  await req.app.get('erpPool').query(
    `UPDATE users SET ? WHERE id=?`,
    [changes, id]
  );
  res.json({ message:'Updated' });
});

// PUT /erp/api/users/:id/password
router.put('/:id/password', async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  // verify old password
  const [[u]] = await req.app.get('erpPool').query(
    'SELECT password FROM users WHERE id=?',
    [req.user.id]  // only allow self
  );
  if (!await bcrypt.compare(oldPassword, u.password)) {
    return res.status(401).json({ message:'Old password mismatch' });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await req.app.get('erpPool').query(
    'UPDATE users SET password=? WHERE id=?',
    [hash, req.user.id]
  );
  res.json({ message:'Password changed' });
});

// DELETE /erp/api/users/:id
router.delete('/:id', async (req, res) => {
  await req.app.get('erpPool').query(
    'DELETE FROM users WHERE id=?',
    [req.params.id]
  );
  res.json({ message:'Deleted' });
});

export default router;
