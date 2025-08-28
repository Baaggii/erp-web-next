-- Correct company_id default for existing deployments
ALTER TABLE role_module_permissions
  ALTER COLUMN company_id SET DEFAULT 0;

UPDATE role_module_permissions
SET company_id = 0
WHERE company_id = 1;
