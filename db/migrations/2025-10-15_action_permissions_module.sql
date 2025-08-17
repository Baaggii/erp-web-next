-- Add Action Permissions module under Settings
INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header)
VALUES ('action_permissions', 'Action Permissions', 'settings', 1, 0)
ON DUPLICATE KEY UPDATE
  label=VALUES(label),
  parent_key=VALUES(parent_key),
  show_in_sidebar=VALUES(show_in_sidebar),
  show_in_header=VALUES(show_in_header);

-- Default module access for roles
INSERT IGNORE INTO role_default_modules (role_id, module_key, allowed) VALUES
  (1, 'action_permissions', 1),
  (2, 'action_permissions', 0);

-- Ensure all user levels have permission rows for the module
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
SELECT ul.userlevel_id, 'module_key', 'action_permissions'
  FROM user_levels ul
  WHERE NOT EXISTS (
    SELECT 1 FROM user_level_permissions up
     WHERE up.userlevel_id = ul.userlevel_id
       AND up.action = 'module_key'
       AND up.action_key = 'action_permissions'
  );
