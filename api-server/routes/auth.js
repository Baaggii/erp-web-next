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

  // grab the user by empid
  const [[user]] = await req.app
    .get('erpPool')
    .query(
      `SELECT 
         id, empid, name, company, role, password 
       FROM users 
       WHERE empid = ?`,
      [empid]
    );

  if (!user) {
    return res.status(401).json({ message: 'Auth failed' });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return res.status(401).json({ message: 'Auth failed' });
  }

  // sign JWT
  const token = jwt.sign(
    { id: user.id, empid: user.empid },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  // set it as an HTTP-only cookie under /erp
  res.cookie('token', token, {
    httpOnly: true,
    path: '/erp'
  });

  // don’t send password back
  delete user.password;

  res.json({ user });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/erp' });
  res.json({ message: 'Logged out' });
});

export default router;
