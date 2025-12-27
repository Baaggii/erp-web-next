// Centralized admin utilities to keep high-risk endpoints consistent.
// Admin-only routes protect operations like schema changes or trigger management
// so DB-altering actions never run under normal ERP runtime users.
export function isAdminUser(user) {
  return Boolean(user?.role === 'admin' || user?.isAdmin === true);
}

export function assertAdminUser(user) {
  if (!isAdminUser(user)) {
    const err = new Error('Admin privileges required');
    err.status = 403;
    throw err;
  }
}

export function ensureAdminResponse(req, res) {
  if (!isAdminUser(req?.user)) {
    res.status(403).json({ message: 'Admin privileges required' });
    return false;
  }
  return true;
}

export function requireAdmin(req, res, next) {
  if (ensureAdminResponse(req, res)) {
    next();
  }
}
