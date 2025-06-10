-- Define relationships between key tables

-- 1. users.role_id references user_roles.id
ALTER TABLE users
  ADD CONSTRAINT fk_users_role
  FOREIGN KEY (role_id) REFERENCES user_roles(id);

-- 2. user_companies.role_id references user_roles.id
ALTER TABLE user_companies
  ADD CONSTRAINT fk_user_companies_role
  FOREIGN KEY (role_id) REFERENCES user_roles(id);

-- 3. Map employees to users using emp_id if present, else emp_num
--    This view joins employees to users based on the available column
CREATE OR REPLACE VIEW employee_user_view AS
SELECT e.*, u.*
  FROM employee e
  JOIN users u
    ON u.id = CASE
                WHEN e.emp_id IS NOT NULL AND e.emp_id <> ''
                THEN e.emp_id
                ELSE e.emp_num
              END;

-- 4. role_default_modules.role_id references user_roles.id
ALTER TABLE role_default_modules
  ADD CONSTRAINT fk_rdm_role
  FOREIGN KEY (role_id) REFERENCES user_roles(id);

-- 5. role_module_permissions.role_id references user_roles.id
ALTER TABLE role_module_permissions
  ADD CONSTRAINT fk_rmp_role
  FOREIGN KEY (role_id) REFERENCES user_roles(id);
