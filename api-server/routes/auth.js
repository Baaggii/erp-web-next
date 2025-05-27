// File: api-server/routes/auth.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
const router = express.Router();

// POST /erp/api/login
router.post('/login', async (req, res) => {
  console.log('↪︎ Login attempt:', req.body);
  const { email, password } = req.body;
  const [[user]] = await req.app.get('erpPool')
    .query('SELECT * FROM users WHERE email = ?', [email]);
  console.log('↪︎ User record from DB:', user);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Auth failed' });
  }
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
  res.cookie('token', token, { httpOnly: true });
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
});

// GET /erp/api/dbtest
router.get('/dbtest', async (req, res) => {
  try {
    const pool = req.app.get('erpPool');
    const [rows] = await pool.query('SELECT NOW() AS now');
    return res.json({ ok: true, time: rows[0].now });
  } catch (err) {
    console.error('DB test error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /erp/api/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

export default router;
