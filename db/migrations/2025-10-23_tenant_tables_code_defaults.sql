-- Mark code tables as shared so global rows are visible to all tenants
INSERT INTO tenant_tables (table_name, is_shared, seed_on_create)
VALUES
  ('code_position', 1, 0),
  ('code_branches', 1, 0),
  ('code_department', 1, 0)
ON DUPLICATE KEY UPDATE
  is_shared = VALUES(is_shared),
  seed_on_create = VALUES(seed_on_create);
