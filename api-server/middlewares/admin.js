import { ADMIN_EMPLOYMENT_LEVEL } from '../../config/0/constants.js';

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  const level = Number(
    req.user.employment_user_level ?? req.user.employmentUserLevel ?? req.user.userLevel,
  );
  if (level !== ADMIN_EMPLOYMENT_LEVEL) {
    return res.status(403).json({ message: 'Admin privileges required' });
  }
  return next();
}
