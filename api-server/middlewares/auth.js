// api-server/middlewares/auth.js
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  // Read from req.cookies (not req.signedCookies) because we didn't sign it
  const token = req.cookies?.[process.env.COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Verify the JWT
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, empid, email, iat, exp }
    next();
  } catch (err) {
    console.error('JWT verification failed:', err);
    res.clearCookie(process.env.COOKIE_NAME);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
