-- Populate role_default_modules with any new modules
INSERT INTO role_default_modules (role_id, module_key, allowed)
SELECT * FROM (
  SELECT ur.id AS role_id, m.module_key AS module_key,
         CASE
           WHEN ur.name = 'admin' THEN 1
           WHEN m.module_key IN (
             'settings', 'users', 'user_companies', 'role_permissions',
             'company_licenses', 'tables_management', 'forms_management',
             'report_management'
           ) THEN 0
           ELSE 1
         END AS allowed
  FROM user_roles ur
  CROSS JOIN modules m
) AS vals
ON DUPLICATE KEY UPDATE allowed = vals.allowed;

-- Populate role_module_permissions using the defaults, but keep existing rows
INSERT IGNORE INTO role_module_permissions (company_id, role_id, module_key, allowed)
SELECT c.id, rdm.role_id, rdm.module_key, rdm.allowed
FROM companies c
CROSS JOIN role_default_modules rdm;
