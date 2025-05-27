// File: api-server/routes/auth.js
import express  from 'express';
import bcrypt   from 'bcrypt';
import jwt      from 'jsonwebtoken';
const router   = express.Router();

// POST /erp/api/login
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ message: 'ID or email, and password are required' });
  }

  const pool = req.app.get('erpPool');
  // look up by empid OR by email
  const [[user]] = await pool.query(
    `SELECT id, empid, email, name, company, role, password
       FROM users
      WHERE empid = ? OR email = ?`,
    [identifier, identifier]
  );

  if (!user) {
    return res.status(401).json({ message: 'Auth failed' });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({ message: 'Auth failed' });
  }

  // generate token
  const token = jwt.sign(
    { id: user.id, empid: user.empid },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    path: '/erp',
    maxAge: 2 * 60 * 60 * 1000,
  });

  delete user.password;
  res.json({ user });
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
  res.clearCookie('token');
  res.json({ message:'Logged out' });
});

export default router;
