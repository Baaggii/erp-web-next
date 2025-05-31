// api-server/middlewares/auth.js
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  // Since we did `res.cookie(process.env.COOKIE_NAME, token, { httpOnly: true })`,
  // the cookie is not “signed.” So use req.cookies, not req.signedCookies.
  const token = req.cookies?.[process.env.COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.error('JWT verification failed', err);
    res.clearCookie(process.env.COOKIE_NAME);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
