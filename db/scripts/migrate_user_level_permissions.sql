-- Populate action entries in user_level_permissions based on existing settings
INSERT INTO user_level_permissions (user_level_id, action, ul_module_key, function_name)
SELECT DISTINCT p.user_level_id, s.action, s.ul_module_key, s.function_name
FROM code_userlevel_settings s
JOIN user_level_permissions p ON (
  (s.new_records = 1 AND p.permission = 'new_records') OR
  (s.edit_delete_request = 1 AND p.permission = 'edit_delete_request') OR
  (s.edit_records = 1 AND p.permission = 'edit_records') OR
  (s.delete_records = 1 AND p.permission = 'delete_records') OR
  (s.image_handler = 1 AND p.permission = 'image_handler') OR
  (s.audition = 1 AND p.permission = 'audition') OR
  (s.supervisor = 1 AND p.permission = 'supervisor') OR
  (s.companywide = 1 AND p.permission = 'companywide') OR
  (s.branchwide = 1 AND p.permission = 'branchwide') OR
  (s.departmentwide = 1 AND p.permission = 'departmentwide') OR
  (s.developer = 1 AND p.permission = 'developer') OR
  (s.common_settings = 1 AND p.permission = 'common_settings') OR
  (s.system_settings = 1 AND p.permission = 'system_settings') OR
  (s.license_settings = 1 AND p.permission = 'license_settings') OR
  (s.ai = 1 AND p.permission = 'ai') OR
  (s.dashboard = 1 AND p.permission = 'dashboard') OR
  (s.ai_dashboard = 1 AND p.permission = 'ai_dashboard')
);

-- Remove legacy settings table
DROP TABLE code_userlevel_settings;
