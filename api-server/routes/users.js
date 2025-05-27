// File: api-server/routes/users.js
import express    from 'express';
import bcrypt     from 'bcrypt';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

// — GET ALL USERS (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const pool = req.app.get('erpPool');
  const [rows] = await pool.query(
    'SELECT empid, name, company, role FROM users'
  );
  res.json(rows);
});

// — GET MY PROFILE
router.get('/me', requireAuth, async (req, res) => {
  const pool  = req.app.get('erpPool');
  const empid = req.user.empid;
  const [[u]] = await pool.query(
    'SELECT empid, name, company, role FROM users WHERE empid=?',
    [empid]
  );
  if (!u) return res.status(404).json({ message: 'Not found' });
  res.json(u);
});

// — CREATE (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { empid, name, password, company, role } = req.body;
  const pool = req.app.get('erpPool');
  const hash = await bcrypt.hash(password, 10);
  await pool.execute(
    'INSERT INTO users (empid,name,password,company,role) VALUES (?,?,?,?,?)',
    [empid, name, hash, company, role]
  );
  res.json({ message: 'User created', user: { empid, name, company, role } });
});

// — UPDATE (self or admin)
router.put('/:empid', requireAuth, async (req, res) => {
  const target   = req.params.empid;
  const me       = req.user.empid;
  const amIAdmin = req.user.role === 'admin';
  const pool     = req.app.get('erpPool');
  // only admins or yourself:
  if (!amIAdmin && target !== me) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // admin can update name/company/role, self only password:
  const { name, company, role, password } = req.body;
  const sets = [], vals = [];
  if (amIAdmin) {
    if (name   ) { sets.push('name=?');    vals.push(name);    }
    if (company) { sets.push('company=?'); vals.push(company); }
    if (role   ) { sets.push('role=?');    vals.push(role);    }
  }
  if (password) {
    const h = await bcrypt.hash(password, 10);
    sets.push('password=?');
    vals.push(h);
  }
  if (sets.length === 0) {
    return res.status(400).json({ message: 'No changes' });
  }

  await pool.execute(
    `UPDATE users SET ${sets.join(',')} WHERE empid=?`,
    [...vals, target]
  );
  res.json({ message: 'Updated' });
});

// — DELETE (admin only)
router.delete('/:empid', requireAuth, requireAdmin, async (req, res) => {
  const pool = req.app.get('erpPool');
  await pool.execute('DELETE FROM users WHERE empid=?', [req.params.empid]);
  res.json({ message: 'Deleted' });
});

export default router;
