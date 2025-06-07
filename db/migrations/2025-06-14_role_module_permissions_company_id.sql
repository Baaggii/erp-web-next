-- Add company_id to role_module_permissions for per-company defaults
ALTER TABLE role_module_permissions
  ADD COLUMN company_id INT NOT NULL DEFAULT 1;

UPDATE role_module_permissions SET company_id = 1 WHERE company_id IS NULL;

ALTER TABLE role_module_permissions
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (company_id, role_id, module_key),
  ADD CONSTRAINT fk_rmp_company FOREIGN KEY (company_id) REFERENCES companies(id);
