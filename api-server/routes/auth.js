import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [[user]] = await req.app.get('erpPool').query(
      'SELECT * FROM users WHERE email = ? OR id = ?',
      [email, email]
    );
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Authentication failed' });
    }
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'Lax' });
    delete user.password;
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

export default router;
