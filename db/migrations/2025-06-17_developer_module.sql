-- Add Developer submenu and reparent management modules
INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header)
VALUES ('developer', 'Хөгжүүлэгч', 'settings', 1, 0)
ON DUPLICATE KEY UPDATE
  label=VALUES(label),
  parent_key=VALUES(parent_key),
  show_in_sidebar=VALUES(show_in_sidebar),
  show_in_header=VALUES(show_in_header);

-- Move existing management modules under Developer
UPDATE modules
  SET parent_key='developer'
  WHERE module_key IN ('modules','tables_management','forms_management','report_management');

-- Default permissions for the new module
INSERT IGNORE INTO role_default_modules (role_id, module_key, allowed) VALUES
  (1, 'developer', 1),
  (2, 'developer', 0);

INSERT IGNORE INTO role_module_permissions (company_id, position_id, module_key, allowed)
SELECT c.id, rdm.role_id, rdm.module_key, rdm.allowed
  FROM companies c
  JOIN role_default_modules rdm ON rdm.module_key = 'developer';
