// File: api-server/routes/auth.js
import express  from 'express';
import bcrypt   from 'bcrypt';
import jwt      from 'jsonwebtoken';
const router   = express.Router();

// POST /erp/api/login
router.post('/login', async (req, res) => {
  console.log('↪︎ Login attempt:', req.body);
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ message: 'ID/email and password required' });
  }

  const pool = req.app.get('erpPool');
  const [[user]] = await pool.query(
    `SELECT id, empid, email, name, password, role
       FROM users
      WHERE empid = ? OR email = ?`,
    [identifier, identifier]
  );
  console.log('↪︎ User record from DB:', user);

  if (!user) {
    return res.status(401).json({ message: 'Auth failed' });
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ message: 'Auth failed' });
  }

  // sign JWT
  const token = jwt.sign({ id: user.id, empid: user.empid }, process.env.JWT_SECRET, {
    expiresIn: '2h'
  });

  // set cookie scoped to /erp
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
