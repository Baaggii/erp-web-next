-- Insert missing user level permission rows based on configs/permissionActions.json
-- Requires MySQL 8.0+ for JSON_TABLE and access to the JSON file via LOAD_FILE
-- Ensure string literals use the same collation as user_level_permissions table
SET collation_connection = 'utf8mb4_unicode_ci';
SET @json = LOAD_FILE('configs/permissionActions.json');

INSERT INTO user_level_permissions (userlevel_id, action, action_key)
SELECT ul.userlevel_id, a.action, a.action_key
  FROM user_levels ul
  JOIN (
    SELECT 'module_key' AS action, jt.action_key
    FROM JSON_TABLE(@json, '$.modules[*]' COLUMNS(action_key VARCHAR(255) PATH '$')) jt
    UNION ALL
    SELECT 'button' AS action, jt.action_key
    FROM JSON_TABLE(@json, '$.buttons[*]' COLUMNS(action_key VARCHAR(255) PATH '$')) jt
    UNION ALL
    SELECT 'function' AS action, jt.action_key
    FROM JSON_TABLE(@json, '$.functions[*]' COLUMNS(action_key VARCHAR(255) PATH '$')) jt
    UNION ALL
    SELECT 'API' AS action, jt.action_key
    FROM JSON_TABLE(@json, '$.api[*]' COLUMNS(action_key VARCHAR(255) PATH '$')) jt
  ) AS a
  LEFT JOIN user_level_permissions up
    ON up.userlevel_id = ul.userlevel_id
   AND up.action = a.action
   AND up.action_key = a.action_key
 WHERE up.userlevel_id IS NULL;
