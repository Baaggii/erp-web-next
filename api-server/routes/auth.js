import express from 'express';
import bcrypt  from 'bcryptjs';
import jwt     from 'jsonwebtoken';
const router = express.Router();

router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  // allow login by email OR empid
  const [[user]] = await req.app
    .get('erpPool')
    .query(
      `SELECT * FROM users WHERE email = ? OR empid = ?`,
      [identifier, identifier]
    );

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Auth failed' });
  }

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
  // 3) scope the cookie under /erp
  res.cookie('token', token, { httpOnly: true, path: '/erp' });
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

router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/erp' });
  res.json({ message: 'Logged out' });
});

export default router;
