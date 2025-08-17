-- Create normalized user level tables

-- Rename existing code_userlevel table to user_levels
RENAME TABLE code_userlevel TO user_levels;

-- Create table to hold permissions per user level
CREATE TABLE user_level_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userlevel_id INT NOT NULL,
  action VARCHAR(20) DEFAULT NULL,
  action_key VARCHAR(255) DEFAULT NULL,
  FOREIGN KEY (userlevel_id) REFERENCES user_levels(userlevel_id)
);

-- Move flag columns into user_level_permissions
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'new_records' FROM user_levels WHERE new_records = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'edit_delete_request' FROM user_levels WHERE edit_delete_request = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'edit_records' FROM user_levels WHERE edit_records = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'delete_records' FROM user_levels WHERE delete_records = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'image_handler' FROM user_levels WHERE image_handler = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'audition' FROM user_levels WHERE audition = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'supervisor' FROM user_levels WHERE supervisor = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'companywide' FROM user_levels WHERE companywide = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'branchwide' FROM user_levels WHERE branchwide = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'departmentwide' FROM user_levels WHERE departmentwide = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'developer' FROM user_levels WHERE developer = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'common_settings' FROM user_levels WHERE common_settings = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'system_settings' FROM user_levels WHERE system_settings = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'license_settings' FROM user_levels WHERE license_settings = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'ai' FROM user_levels WHERE ai = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'dashboard' FROM user_levels WHERE dashboard = 1;
INSERT INTO user_level_permissions (userlevel_id, action, action_key)
  SELECT userlevel_id, 'permission', 'ai_dashboard' FROM user_levels WHERE ai_dashboard = 1;

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
