-- Add CNC Processing module under Developer
INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header)
VALUES ('cnc_processing', 'CNC Processing', 'developer', 1, 0)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  parent_key = VALUES(parent_key),
  show_in_sidebar = VALUES(show_in_sidebar),
  show_in_header = VALUES(show_in_header);

-- Default permissions for the new module
INSERT IGNORE INTO role_default_modules (role_id, module_key, allowed) VALUES
  (1, 'cnc_processing', 1),
  (2, 'cnc_processing', 0);

INSERT IGNORE INTO role_module_permissions (company_id, position_id, module_key, allowed)
SELECT c.id, rdm.role_id, rdm.module_key, rdm.allowed
  FROM companies c
  JOIN role_default_modules rdm ON rdm.module_key = 'cnc_processing';
