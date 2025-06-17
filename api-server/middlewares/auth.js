// api-server/middlewares/auth.js
import * as jwtService from '../services/jwtService.js';
import { getCookieName } from '../utils/cookieNames.js';

export function requireAuth(req, res, next) {
  // Read from req.cookies (not req.signedCookies) because we didn't sign it
  const token = req.cookies?.[getCookieName()];
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Verify the JWT
    const payload = jwtService.verify(token);
    req.user = payload; // { id, empid, role, iat, exp }
    next();
  } catch (err) {
    console.error('JWT verification failed:', err);
    res.clearCookie(getCookieName());
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
