CREATE TABLE company_module_licenses (
  company_id INT NOT NULL,
  module_key VARCHAR(50) NOT NULL,
  licensed TINYINT(1) DEFAULT 0,
  PRIMARY KEY (company_id, module_key),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
