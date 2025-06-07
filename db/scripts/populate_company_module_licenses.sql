-- Insert missing module license rows for each company
-- Adds a row for every company/module pair that doesn't already exist
-- Default licensed value is 0 so admins can enable as needed
INSERT IGNORE INTO company_module_licenses (company_id, module_key, licensed)
SELECT c.id AS company_id, m.module_key, 0 AS licensed
FROM companies c
CROSS JOIN modules m;
