-- Create normalized user level tables

-- Rename existing code_userlevel table to user_levels
RENAME TABLE code_userlevel TO user_levels;

-- Create table to hold permissions per user level
CREATE TABLE user_level_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_level_id INT NOT NULL,
  permission VARCHAR(50) DEFAULT NULL,
  action VARCHAR(20) DEFAULT NULL,
  ul_module_key VARCHAR(50) DEFAULT NULL,
  function_name VARCHAR(255) DEFAULT NULL,
  FOREIGN KEY (user_level_id) REFERENCES user_levels(userlevel_id)
);

-- Move flag columns into user_level_permissions
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'new_records' FROM user_levels WHERE new_records = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'edit_delete_request' FROM user_levels WHERE edit_delete_request = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'edit_records' FROM user_levels WHERE edit_records = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'delete_records' FROM user_levels WHERE delete_records = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'image_handler' FROM user_levels WHERE image_handler = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'audition' FROM user_levels WHERE audition = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'supervisor' FROM user_levels WHERE supervisor = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'companywide' FROM user_levels WHERE companywide = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'branchwide' FROM user_levels WHERE branchwide = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'departmentwide' FROM user_levels WHERE departmentwide = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'developer' FROM user_levels WHERE developer = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'common_settings' FROM user_levels WHERE common_settings = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'system_settings' FROM user_levels WHERE system_settings = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'license_settings' FROM user_levels WHERE license_settings = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'ai' FROM user_levels WHERE ai = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'dashboard' FROM user_levels WHERE dashboard = 1;
INSERT INTO user_level_permissions (user_level_id, permission)
  SELECT userlevel_id, 'ai_dashboard' FROM user_levels WHERE ai_dashboard = 1;

-- Remove deprecated boolean columns from user_levels
ALTER TABLE user_levels
  DROP COLUMN new_records,
  DROP COLUMN edit_delete_request,
  DROP COLUMN edit_records,
  DROP COLUMN delete_records,
  DROP COLUMN image_handler,
  DROP COLUMN audition,
  DROP COLUMN supervisor,
  DROP COLUMN companywide,
  DROP COLUMN branchwide,
  DROP COLUMN departmentwide,
  DROP COLUMN developer,
  DROP COLUMN common_settings,
  DROP COLUMN system_settings,
  DROP COLUMN license_settings,
  DROP COLUMN ai,
  DROP COLUMN dashboard,
  DROP COLUMN ai_dashboard;
