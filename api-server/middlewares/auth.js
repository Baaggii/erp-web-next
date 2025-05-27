// File: api-server/middlewares/auth.js
import jwt from 'jsonwebtoken';

export async function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;  // { id: … }
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

export async function requireAdmin(req, res, next) {
  const pool = req.app.get('erpPool');
  const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
  if (rows[0]?.role === 'admin') return next();
  return res.status(403).json({ message: 'Forbidden' });
}
