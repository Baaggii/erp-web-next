-- Populate role_module_permissions from role_default_modules
INSERT INTO role_module_permissions (role_id, module_key, allowed)
SELECT rdm.role_id, rdm.module_key, rdm.allowed
FROM role_default_modules rdm
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed);
