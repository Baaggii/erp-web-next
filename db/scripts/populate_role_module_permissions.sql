-- Populate role_module_permissions from role_default_modules
INSERT INTO role_module_permissions (company_id, role_id, module_key, allowed)
SELECT c.id, rdm.role_id, rdm.module_key, rdm.allowed
FROM companies c
CROSS JOIN role_default_modules rdm
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed);
