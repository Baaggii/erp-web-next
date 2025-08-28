-- Rename role_id to position_id in role_module_permissions
ALTER TABLE role_module_permissions
  RENAME COLUMN role_id TO position_id;
