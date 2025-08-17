-- Backfill module_key permissions for all user levels
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
SELECT ul.userlevel_id, 'module_key', m.module_key
  FROM user_levels ul
  CROSS JOIN modules m
  WHERE NOT EXISTS (
    SELECT 1 FROM user_level_permissions up
     WHERE up.userlevel_id = ul.userlevel_id
       AND up.action = 'module_key'
       AND up.action_key = m.module_key
  );
