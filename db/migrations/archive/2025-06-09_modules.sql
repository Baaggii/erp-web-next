-- Define modules table and link permissions

CREATE TABLE IF NOT EXISTS modules (
  module_key VARCHAR(50) PRIMARY KEY,
  label VARCHAR(100) NOT NULL
);

INSERT INTO modules (module_key, label) VALUES
  ('dashboard', 'Dashboard'),
  ('forms', 'Forms'),
  ('reports', 'Reports'),
  ('settings', 'Settings'),
  ('users', 'Users'),
  ('user_companies', 'User Companies'),
  ('role_permissions', 'Role Permissions'),
  ('change_password', 'Change Password'),
  ('gl', 'General Ledger'),
  ('po', 'Purchase Orders'),
  ('sales', 'Sales Dashboard')
ON DUPLICATE KEY UPDATE label = VALUES(label);

ALTER TABLE role_module_permissions
  ADD CONSTRAINT fk_rmp_module FOREIGN KEY (module_key)
    REFERENCES modules(module_key);
