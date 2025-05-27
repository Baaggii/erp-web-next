// File: api-server/routes/auth.js
import express  from 'express';
import bcrypt   from 'bcryptjs';
import jwt      from 'jsonwebtoken';
const router   = express.Router();

// POST /erp/api/login
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  const isNum = /^\d+$/.test(identifier);
  const sql   = isNum
    ? 'SELECT * FROM users WHERE empid = ?'
    : 'SELECT * FROM users WHERE email = ?';

  const [[user]] = await req.app.get('erpPool').query(sql, [identifier]);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message:'Auth failed' });
  }

  const token = jwt.sign({ id:user.id }, process.env.JWT_SECRET, { expiresIn:'2h' });
  res.cookie('token', token, { httpOnly:true });
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
  res.clearCookie('token');
  res.json({ message:'Logged out' });
});

export default router;
