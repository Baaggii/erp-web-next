// File: api-server/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// public health check (used by your front‐end AuthProvider)
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// who am I?
router.get('/me', requireAuth, async (req, res) => {
  // req.userId is set by requireAuth()
  const pool = req.app.get('erpPool');
  const [[user]] = await pool.query('SELECT id, empid, email, name, role FROM users WHERE id=?', [req.userId]);
  res.json({ user });
});

// POST /erp/api/login
 router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  const pool = req.app.get('erpPool');
  const [[user]] = await pool.query(
    'SELECT * FROM users WHERE empid=? OR email=?',
    [ identifier, identifier ]
  );
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message:'Auth failed' });
  }

  const token = jwt.sign({ id:user.id }, process.env.JWT_SECRET, { expiresIn:'2h' });
    res.cookie('token', token, { httpOnly: true, path: '/erp' });
  // return empid as well so client can display it
  res.json({
    user: {
      id:    user.id,
      empid: user.empid,
      email: user.email,
      name:  user.name,
      role:  user.role
    }
  });
});

// GET /erp/api/dbtest
router.get('/dbtest', async (req, res) => {
  try {
    const [rows] = await req.app.get('erpPool').query('SELECT NOW() AS now');
    res.json({ ok:true, time:rows[0].now });
  } catch (err) {
    console.error('DB test failed', err);
    res.status(500).json({ ok:false, error:err.message });
  }
});

// POST /erp/api/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token', { path: '/erp' }).json({ message: 'Logged out' });
});

export default router;
