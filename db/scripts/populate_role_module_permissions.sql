-- Populate role_default_modules with any new modules
-- Determine each module's root parent to decide default access
WITH RECURSIVE rooted AS (
  SELECT module_key, parent_key, module_key AS root
    FROM modules
   WHERE parent_key IS NULL
  UNION ALL
  SELECT m.module_key, m.parent_key, r.root
    FROM modules m
    JOIN rooted r ON m.parent_key = r.module_key
),
module_hierarchy AS (
  SELECT m.module_key,
         COALESCE(r.root, m.module_key) AS root
    FROM modules m
    LEFT JOIN rooted r ON m.module_key = r.module_key
)
INSERT INTO role_default_modules (role_id, module_key, allowed)
SELECT * FROM (
  SELECT ur.id AS role_id, h.module_key,
         CASE
           WHEN ur.name = 'admin' THEN 1
           WHEN h.root IN ('settings', 'developer')
                AND h.module_key <> 'change_password' THEN 0
           ELSE 1
         END AS allowed
    FROM user_roles ur
    CROSS JOIN module_hierarchy h
) AS vals
ON DUPLICATE KEY UPDATE allowed = vals.allowed;

-- Populate role_module_permissions using the defaults, but keep existing rows
INSERT IGNORE INTO role_module_permissions (company_id, role_id, module_key, allowed)
SELECT c.id, rdm.role_id, rdm.module_key, rdm.allowed
FROM companies c
CROSS JOIN role_default_modules rdm;
