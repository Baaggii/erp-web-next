CREATE TABLE tenant_tables (
  table_name VARCHAR(100) PRIMARY KEY,
  is_shared BOOLEAN DEFAULT 0,
  seed_on_create BOOLEAN DEFAULT 0
);
