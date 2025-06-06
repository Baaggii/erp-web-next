-- Define default modules per role used for initialization
CREATE TABLE role_default_modules (
  role_id INT NOT NULL,
  module_key VARCHAR(50) NOT NULL,
  allowed TINYINT(1) DEFAULT 1,
  PRIMARY KEY (role_id, module_key),
  FOREIGN KEY (role_id) REFERENCES user_roles(id),
  FOREIGN KEY (module_key) REFERENCES modules(module_key)
);

-- Seed defaults mirroring initial permissions
INSERT INTO role_default_modules (role_id, module_key, allowed) VALUES
  (1, 'dashboard', 1),
  (1, 'forms', 1),
  (1, 'reports', 1),
  (1, 'settings', 1),
  (1, 'users', 1),
  (1, 'user_companies', 1),
  (1, 'role_permissions', 1),
  (1, 'change_password', 1),
  (1, 'gl', 1),
  (1, 'po', 1),
  (1, 'sales', 1),
  (2, 'dashboard', 1),
  (2, 'forms', 1),
  (2, 'reports', 1),
  (2, 'settings', 0),
  (2, 'users', 0),
  (2, 'user_companies', 0),
  (2, 'role_permissions', 0),
  (2, 'change_password', 1),
  (2, 'gl', 1),
  (2, 'po', 1),
  (2, 'sales', 1)
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed);
