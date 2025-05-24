import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
const router = express.Router();
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const [[user]] = await req.app.get('erpPool').query('SELECT * FROM users WHERE email=?',[email]);
  if(!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Auth failed' });
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn:'2h' });
  res.cookie('token', token, { httpOnly:true });
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
});
router.post('/logout', (req, res) => { res.clearCookie('token'); res.json({ message:'Logged out' }); });
export default router;