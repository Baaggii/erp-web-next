// File: api-server/routes/auth.js
import { Router } from 'express';
import bcrypt  from 'bcryptjs';
import jwt     from 'jsonwebtoken';
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status:'ok', time:new Date().toISOString() });
});

router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  // allow login by empid OR email
  const [rows] = await req.app.get('erpPool')
    .query(
      `SELECT * FROM users WHERE empid=? OR email=?`,
      [identifier, identifier]
    );
  const user = rows[0];
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ message:'Auth failed' });
  }
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn:'2h' });
  res.cookie('token', token, { httpOnly:true, path:'/erp' });
  res.json({ user: {
    id: user.id,
    empid: user.empid,
    email: user.email,
    name: user.name,
    role: user.role
  }});
});

// protect all further routes:
router.use((req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message:'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message:'Invalid token' });
  }
});

router.get('/me', (_req, res) => {
  res.json({ id:req.user.id });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token',{ path:'/erp' });
  res.json({ message:'Logged out' });
});

export default router;
