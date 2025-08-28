-- Restructure user_level_permissions to use action_key and userlevel_id
ALTER TABLE user_level_permissions
  RENAME COLUMN user_level_id TO userlevel_id;
ALTER TABLE user_level_permissions
  ADD COLUMN action_key VARCHAR(255) DEFAULT NULL;
UPDATE user_level_permissions
  SET action_key = CASE
    WHEN action = 'module_key' THEN ul_module_key
    WHEN action IN ('button', 'function', 'API') THEN function_name
    ELSE permission
  END,
  action = CASE
    WHEN permission IS NOT NULL AND action IS NULL THEN 'permission'
    ELSE action
  END;
ALTER TABLE user_level_permissions
  DROP COLUMN permission,
  DROP COLUMN ul_module_key,
  DROP COLUMN function_name;
