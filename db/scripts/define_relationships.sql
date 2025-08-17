-- Define relationships between key tables

-- 1. Map employees to users using emp_id if present, else emp_num
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

-- 2. role_default_modules.role_id references code_position.position_id
ALTER TABLE role_default_modules
  ADD CONSTRAINT fk_rdm_role
  FOREIGN KEY (role_id) REFERENCES code_position(position_id);

-- 3. role_module_permissions.position_id references code_position.position_id
ALTER TABLE role_module_permissions
  ADD CONSTRAINT fk_rmp_role
  FOREIGN KEY (position_id) REFERENCES code_position(position_id);
