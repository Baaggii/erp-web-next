-- Introduce user_roles table and switch role columns to role_id

CREATE TABLE IF NOT EXISTS user_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO user_roles (name) VALUES ('admin'), ('user');

ALTER TABLE users
  ADD COLUMN role_id INT NOT NULL DEFAULT 2,
  ADD FOREIGN KEY (role_id) REFERENCES user_roles(id);

ALTER TABLE users DROP COLUMN role;

ALTER TABLE user_companies
  ADD COLUMN role_id INT NOT NULL DEFAULT 2,
  ADD FOREIGN KEY (role_id) REFERENCES user_roles(id);

ALTER TABLE user_companies DROP COLUMN role;
