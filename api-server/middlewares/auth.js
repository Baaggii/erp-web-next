// in middlewares/auth.js
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const token = req.signedCookies[process.env.COOKIE_NAME];
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;     // e.g. { id: 3, email: "admin@modmarket.mn", iat: ..., exp: ... }
    return next();
  } catch (err) {
    console.error('JWT verification failed', err);
    res.clearCookie(process.env.COOKIE_NAME);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
