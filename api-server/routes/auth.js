// File: api-server/routes/auth.js
import express from 'express';
import bcrypt  from 'bcrypt';
import jwt     from 'jsonwebtoken';

const router = express.Router();

// POST /erp/api/login
router.post('/login', async (req, res) => {
  const { empid, password } = req.body;
  if (!empid || !password) {
    return res.status(400).json({ message: 'Employee ID and password required' });
  }

  const pool = req.app.get('erpPool');
  const [[user]] = await pool.query(
    `SELECT id, empid, name, company, role, password
       FROM users
      WHERE empid = ?`,
    [empid]
  );

  if (!user) {
    return res.status(401).json({ message: 'Auth failed' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ message: 'Auth failed' });
  }

  const token = jwt.sign(
    { id: user.id, empid: user.empid },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  // cookie only for /erp routes
  res.cookie('token', token, {
    httpOnly: true,
    path: '/erp',
    maxAge: 2 * 60 * 60 * 1000, // 2h
  });

  // don’t send password
  delete user.password;
  res.json({ user });
});

// POST /erp/api/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token', { path: '/erp' });
  res.json({ message: 'Logged out' });
});

export default router;
