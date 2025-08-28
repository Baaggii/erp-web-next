-- Create forms table for dynamic modal forms
CREATE TABLE IF NOT EXISTS forms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  schema_json JSON NOT NULL,
  company_id INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_forms_company_id (company_id),
  CONSTRAINT fk_forms_company FOREIGN KEY (company_id) REFERENCES companies(id)
);
