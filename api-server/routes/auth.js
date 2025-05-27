// File: api-server/routes/auth.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';
const router = express.Router();

router.post('/login', async (req, res) => {
  console.log('↪ Login attempt:', req.body);
  const { identifier, password } = req.body;
  const pool = req.app.get('erpPool');

  // find by email OR empid
  const [rows] = await pool.query(
    `SELECT * FROM users
     WHERE email = ? OR empid = ?
     LIMIT 1`,
    [identifier, identifier]
  );
  const user = rows[0];
  console.log('↪ User record:', user);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Auth failed' });
  }

  // sign & set cookie
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
  res.cookie('token', token, { httpOnly: true });

  // return user profile
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

// simple health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

export default router;
