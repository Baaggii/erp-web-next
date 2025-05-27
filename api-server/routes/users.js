// File: api-server/routes/users.js
import express from 'express';
import bcrypt  from 'bcrypt';
const router = express.Router();

// GET /erp/api/users/me
router.get('/me', async (req, res) => {
  const { id, empid, name, company, role } = req.user;
  res.json({ empid, name, company, role, id });
});

// GET /erp/api/users
router.get('/', async (req, res) => {
  const [all] = await req.app
    .get('erpPool')
    .query('SELECT id, empid, name, company, role FROM users');
  res.json(all);
});

// POST /erp/api/users
router.post('/', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message:'Forbidden' });
  }
  const { empid, name, company, role, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const [result] = await req.app
    .get('erpPool')
    .execute(
      `INSERT INTO users
         (empid,name,company,role,password,created_by)
       VALUES (?,?,?,?,?,?)`,
      [empid, name, company, role, hash, req.user.empid]
    );
  const [[newUser]] = await req.app
    .get('erpPool')
    .query(
      'SELECT id, empid, name, company, role FROM users WHERE id=?',
      [result.insertId]
    );
  res.json({ message:'User created', user:newUser });
});

// PUT /erp/api/users/:id
router.put('/:id', async (req, res) => {
  const uid = +req.params.id;
  const { role: myRole, id: myId } = req.user;

  // Only admin or self
  if (myRole!=='admin' && myId!==uid) {
    return res.status(403).json({ message:'Forbidden' });
  }

  const changes = { ...req.body };
  // Password change flow:
  if (changes.password) {
    if (!changes.oldPassword) {
      return res.status(400).json({ message:'Old password required' });
    }
    const [[u]] = await req.app
      .get('erpPool')
      .query('SELECT password FROM users WHERE id=?', [uid]);
    const ok = await bcrypt.compare(changes.oldPassword, u.password);
    if (!ok) {
      return res.status(401).json({ message:'Bad old password' });
    }
    changes.password = await bcrypt.hash(changes.password, 10);
    delete changes.oldPassword;
  }

  const keys = Object.keys(changes);
  if (keys.length === 0) {
    return res.json({ message:'No changes' });
  }
  const vals = keys.map(k => changes[k]);
  const setClause = keys.map(k => `\`${k}\`=?`).join(', ');
  await req.app
    .get('erpPool')
    .execute(
      `UPDATE users SET ${setClause} WHERE id=?`,
      [...vals, uid]
    );

  res.json({ message:'Updated' });
});

// DELETE /erp/api/users/:id
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message:'Forbidden' });
  }
  await req.app
    .get('erpPool')
    .execute('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ message:'Deleted' });
});

export default router;
