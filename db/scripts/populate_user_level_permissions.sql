SET collation_connection = 'utf8mb4_unicode_ci';
SET @json = LOAD_FILE('configs/permissionActions.json');

-- Ensure system admin remains unrestricted
DELETE FROM user_level_permissions WHERE userlevel_id = 1;

INSERT INTO user_level_permissions (userlevel_id, action, action_key)
VALUES (1, 'permission', 'system_settings');

INSERT INTO user_level_permissions (userlevel_id, action, action_key)
SELECT ul.userlevel_id, a.action, a.action_key
  FROM user_levels ul
  JOIN (
    SELECT 'module_key' AS action, m.module_key AS action_key
    FROM modules m
    UNION ALL
    SELECT 'button' AS action, jt.action_key
    FROM JSON_TABLE(@json, '$.forms.*.buttons[*]' COLUMNS(action_key VARCHAR(255) PATH '$.key')) jt
    UNION ALL
    SELECT 'function' AS action, jt.action_key
    FROM JSON_TABLE(@json, '$.forms.*.functions[*]' COLUMNS(action_key VARCHAR(255) PATH '$')) jt
    UNION ALL
    SELECT 'API' AS action, jt.action_key
    FROM JSON_TABLE(@json, '$.forms.*.api[*]' COLUMNS(action_key VARCHAR(255) PATH '$.key')) jt
  ) AS a
  LEFT JOIN user_level_permissions up
    ON up.userlevel_id = ul.userlevel_id
   AND up.action = a.action
   AND up.action_key = a.action_key
 WHERE up.userlevel_id IS NULL
   AND ul.userlevel_id <> 1;
