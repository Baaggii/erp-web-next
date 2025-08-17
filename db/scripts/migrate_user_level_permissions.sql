-- Populate action entries in user_level_permissions based on existing settings
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
SELECT DISTINCT p.userlevel_id, s.action,
       COALESCE(s.ul_module_key, s.function_name) AS action_key
FROM code_userlevel_settings s
JOIN user_level_permissions p ON (
  (s.new_records = 1 AND p.action = 'permission' AND p.action_key = 'new_records') OR
  (s.edit_delete_request = 1 AND p.action = 'permission' AND p.action_key = 'edit_delete_request') OR
  (s.edit_records = 1 AND p.action = 'permission' AND p.action_key = 'edit_records') OR
  (s.delete_records = 1 AND p.action = 'permission' AND p.action_key = 'delete_records') OR
  (s.image_handler = 1 AND p.action = 'permission' AND p.action_key = 'image_handler') OR
  (s.audition = 1 AND p.action = 'permission' AND p.action_key = 'audition') OR
  (s.supervisor = 1 AND p.action = 'permission' AND p.action_key = 'supervisor') OR
  (s.companywide = 1 AND p.action = 'permission' AND p.action_key = 'companywide') OR
  (s.branchwide = 1 AND p.action = 'permission' AND p.action_key = 'branchwide') OR
  (s.departmentwide = 1 AND p.action = 'permission' AND p.action_key = 'departmentwide') OR
  (s.developer = 1 AND p.action = 'permission' AND p.action_key = 'developer') OR
  (s.common_settings = 1 AND p.action = 'permission' AND p.action_key = 'common_settings') OR
  (s.system_settings = 1 AND p.action = 'permission' AND p.action_key = 'system_settings') OR
  (s.license_settings = 1 AND p.action = 'permission' AND p.action_key = 'license_settings') OR
  (s.ai = 1 AND p.action = 'permission' AND p.action_key = 'ai') OR
  (s.dashboard = 1 AND p.action = 'permission' AND p.action_key = 'dashboard') OR
  (s.ai_dashboard = 1 AND p.action = 'permission' AND p.action_key = 'ai_dashboard')
);

-- Remove legacy settings table
DROP TABLE code_userlevel_settings;
