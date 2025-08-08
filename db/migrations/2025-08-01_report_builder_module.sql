-- Add Report Builder module under Report Management
INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header)
VALUES ('report_builder', 'Тайлангийн бүтээгч', 'report_management', 1, 0)
ON DUPLICATE KEY UPDATE
  label=VALUES(label),
  parent_key=VALUES(parent_key),
  show_in_sidebar=VALUES(show_in_sidebar),
  show_in_header=VALUES(show_in_header);

-- Default permissions for the new module
INSERT IGNORE INTO role_default_modules (role_id, module_key, allowed) VALUES
  (1, 'report_builder', 1),
  (2, 'report_builder', 1);

INSERT IGNORE INTO role_module_permissions (company_id, role_id, module_key, allowed)
SELECT c.id, rdm.role_id, rdm.module_key, rdm.allowed
  FROM companies c
  JOIN role_default_modules rdm ON rdm.module_key = 'report_builder';

-- License the Report Builder module for all companies
INSERT INTO company_module_licenses (company_id, module_key, licensed)
SELECT c.id, 'report_builder', 1
  FROM companies c
ON DUPLICATE KEY UPDATE licensed = VALUES(licensed);
