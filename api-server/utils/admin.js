// Centralized admin utilities to keep high-risk endpoints consistent.
// Admin-only routes protect operations like schema changes or trigger management
// so DB-altering actions never run under normal ERP runtime users.
export function isAdminUser(user, sessionPermissions) {
  return Boolean(
    user?.role === 'admin' ||
      user?.isAdmin === true ||
      sessionPermissions?.system_settings === true,
  );
}

export function assertAdminUser(user, sessionPermissions) {
  if (!isAdminUser(user, sessionPermissions)) {
    const err = new Error('Admin privileges required');
    err.status = 403;
    throw err;
  }
}

export function ensureAdminResponse(req, res, options = {}) {
  const sessionPermissions =
    options.sessionPermissions || req.session?.permissions || null;
  if (!isAdminUser(req?.user, sessionPermissions)) {
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
