-- Seed permissions for all current modules
INSERT INTO role_module_permissions (role_id, module_key, allowed) VALUES
  (1, 'dashboard', 1),
  (1, 'forms', 1),
  (1, 'reports', 1),
  (1, 'settings', 1),
  (1, 'users', 1),
  (1, 'user_companies', 1),
  (1, 'role_permissions', 1),
  (1, 'change_password', 1),
  (2, 'dashboard', 1),
  (2, 'forms', 1),
  (2, 'reports', 1),
  (2, 'settings', 0),
  (2, 'users', 0),
  (2, 'user_companies', 0),
  (2, 'role_permissions', 0),
  (2, 'change_password', 1)
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed);
