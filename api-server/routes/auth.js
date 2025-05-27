// File: api-server/routes/auth.js
import express from 'express';
import bcrypt  from 'bcryptjs';
import jwt     from 'jsonwebtoken';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  // numeric → empid, else → email
  const isNum = /^\d+$/.test(identifier);
  const sql   = isNum
    ? 'SELECT * FROM users WHERE empid = ?'
    : 'SELECT * FROM users WHERE email = ?';

  const [[user]] = await req.app.get('erpPool').query(sql, [identifier]);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Auth failed' });
  }

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
  res.cookie('token', token, { httpOnly: true });
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

export default router;
