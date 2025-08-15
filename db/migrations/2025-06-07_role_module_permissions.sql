-- Manage module access per role
CREATE TABLE role_module_permissions (
  position_id INT NOT NULL,
  module_key VARCHAR(50) NOT NULL,
  allowed TINYINT(1) DEFAULT 1,
  PRIMARY KEY (position_id, module_key),
  FOREIGN KEY (position_id) REFERENCES code_position(position_id)
);

-- Seed example permissions for initial roles
INSERT INTO role_module_permissions (position_id, module_key, allowed) VALUES
  (1, 'users', 1),
  (1, 'user_companies', 1),
  (1, 'settings', 1),
  (2, 'users', 0),
  (2, 'user_companies', 0),
  (2, 'settings', 0);
