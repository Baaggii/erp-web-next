// File: api-server/routes/auth.js
import express from 'express';
import bcrypt  from 'bcrypt';
import jwt     from 'jsonwebtoken';
const router = express.Router();

router.post('/login', async (req, res) => {
  console.log('↪︎ Login attempt:', req.body);
  const { empid, password } = req.body;            // ← grab empid not email
  const pool = req.app.get('erpPool');

  // find user by empid
  const [[user]] = await pool.query(
    'SELECT * FROM users WHERE empid = ?', [empid]
  );

  console.log('↪︎ User record from DB:', user);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Auth failed' });
  }

  const token = jwt.sign({ empid: user.empid }, process.env.JWT_SECRET, {
    expiresIn: '2h'
  });
  res.cookie('token', token, { httpOnly: true });
  // return whatever fields your front‐end needs:
  res.json({
    user: {
      empid: user.empid,
      name:  user.name,
      role:  user.role,
      company: user.company
    }
  });
});

export default router;
