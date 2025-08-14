// api-server/middlewares/auth.js
import * as jwtService from '../services/jwtService.js';
import { getCookieName, getRefreshCookieName } from '../utils/cookieNames.js';

export function requireAuth(req, res, next) {
  // Read from req.cookies (not req.signedCookies) because we didn't sign it
  const token = req.cookies?.[getCookieName()];
  const rToken = req.cookies?.[getRefreshCookieName()];

  function clearCookies() {
    const opts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    };
    res.clearCookie(getCookieName(), opts);
    res.clearCookie(getRefreshCookieName(), opts);
  }

  function issueTokens(payload) {
    const base = {
      id: payload.id,
      empid: payload.empid,
      companyId: payload.companyId,
    };
    const newAccess = jwtService.sign(base);
    const newRefresh = jwtService.signRefresh(base);
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
  }

  if (!token) {
    if (rToken) {
      try {
        const payload = jwtService.verifyRefresh(rToken);
        issueTokens(payload);
        return next();
      } catch {
        clearCookies();
      }
    }
    clearCookies();
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Verify the JWT
    const payload = jwtService.verify(token);
    req.user = payload; // { id, empid, companyId, iat, exp }
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError' && rToken) {
      try {
        const payload = jwtService.verifyRefresh(rToken);
        issueTokens(payload);
        return next();
      } catch {
        clearCookies();
      }
    }

    console.error('JWT verification failed:', err);
    clearCookies();
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
