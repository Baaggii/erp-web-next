-- Add companies and user_companies tables

CREATE TABLE IF NOT EXISTS companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_companies (
  empid      VARCHAR(50) NOT NULL,
  company_id INT NOT NULL,
  role       ENUM('user','admin') NOT NULL DEFAULT 'user',
  PRIMARY KEY (empid, company_id),
  FOREIGN KEY (empid)     REFERENCES users(empid),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

