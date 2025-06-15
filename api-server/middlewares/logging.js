import jwt from 'jsonwebtoken';
import { logActivity } from '../utils/activityLog.js';

export function logger(req, res, next) {
  let user = 'anonymous';
  if (req.user) {
    user = req.user.empid || req.user.email || req.user.id;
  } else if (req.cookies?.[process.env.COOKIE_NAME]) {
    try {
      const payload = jwt.verify(
        req.cookies[process.env.COOKIE_NAME],
        process.env.JWT_SECRET
      );
      user = payload.empid || payload.email || payload.id;
    } catch {}
  }
  const msg = `${req.method} ${req.url} by ${user}`;
  console.log(`[${new Date().toISOString()}] ${msg}`);
  logActivity(msg);
  next();
}
