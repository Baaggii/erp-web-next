-- Add company scoping to role_default_modules
ALTER TABLE role_default_modules
  ADD COLUMN company_id INT NOT NULL DEFAULT 0;

-- Backfill existing rows with company_id = 0
UPDATE role_default_modules
  SET company_id = 0
  WHERE company_id IS NULL;

ALTER TABLE role_default_modules
  ADD KEY idx_role_default_modules_company_id (company_id);

ALTER TABLE role_default_modules
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (company_id, role_id, module_key),
  ADD CONSTRAINT fk_rdm_company FOREIGN KEY (company_id) REFERENCES companies(id);
