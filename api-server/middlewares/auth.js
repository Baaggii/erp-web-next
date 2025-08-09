// api-server/middlewares/auth.js
import * as jwtService from '../services/jwtService.js';
import { getCookieName, getRefreshCookieName } from '../utils/cookieNames.js';

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
    let refreshed = false;
    if (err.name === 'TokenExpiredError') {
      const rToken = req.cookies?.[getRefreshCookieName()];
      if (rToken) {
        try {
          const rPayload = jwtService.verifyRefresh(rToken);
          const newAccess = jwtService.sign({
            id: rPayload.id,
            empid: rPayload.empid,
            role: rPayload.role,
          });
          const newRefresh = jwtService.signRefresh({
            id: rPayload.id,
            empid: rPayload.empid,
            role: rPayload.role,
          });
          res.cookie(getCookieName(), newAccess, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: jwtService.getExpiryMillis(),
          });
          res.cookie(getRefreshCookieName(), newRefresh, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: jwtService.getRefreshExpiryMillis(),
          });
          req.user = jwtService.verify(newAccess);
          refreshed = true;
        } catch {}
      }
    }
    if (refreshed) return next();

    console.error('JWT verification failed:', err);
    const opts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    };
    res.clearCookie(getCookieName(), opts);
    res.clearCookie(getRefreshCookieName(), opts);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
