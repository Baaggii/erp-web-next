import * as jwtService from '../services/jwtService.js';
import { logActivity } from '../utils/activityLog.js';
import { getCookieName } from '../utils/cookieNames.js';

export function logger(req, res, next) {
  let user = 'anonymous';
  if (req.user) {
    user = req.user.empid || req.user.id;
  } else if (req.cookies?.[getCookieName()]) {
    try {
      const payload = jwtService.verify(req.cookies[getCookieName()]);
      user = payload.empid || payload.id;
    } catch {}
  }
  const msg = `${req.method} ${req.url} by ${user}`;
  console.log(`[${new Date().toISOString()}] ${msg}`);
  logActivity(msg);
  next();
}
