-- Backfill module_key permissions for all user levels
INSERT INTO user_level_permissions (user_level_id, action, ul_module_key)
SELECT ul.userlevel_id, 'module_key', m.module_key
  FROM user_levels ul
  CROSS JOIN modules m
  WHERE NOT EXISTS (
    SELECT 1 FROM user_level_permissions up
     WHERE up.user_level_id = ul.userlevel_id
       AND up.action = 'module_key'
       AND up.ul_module_key = m.module_key
  );
