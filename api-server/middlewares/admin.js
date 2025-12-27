import { isAdmin } from '../utils/isAdmin.js';

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (!isAdmin(req.user)) {
    return res.status(403).json({ message: 'Admin privileges required' });
  }
  return next();
}
