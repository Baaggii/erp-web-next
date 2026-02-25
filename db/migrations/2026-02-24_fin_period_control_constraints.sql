CREATE TABLE IF NOT EXISTS fin_period_control (
  company_id INT NOT NULL,
  fiscal_year INT NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  is_closed TINYINT DEFAULT 0,
  closed_at DATETIME,
  closed_by VARCHAR(50),
  PRIMARY KEY (company_id, fiscal_year)
);

ALTER TABLE fin_period_control
  ADD INDEX idx_fin_period_control_company_closed (company_id, is_closed);

ALTER TABLE fin_period_control
  ADD INDEX idx_fin_period_control_range (company_id, period_from, period_to);

ALTER TABLE fin_period_control
  ADD CONSTRAINT fk_fin_period_control_company
  FOREIGN KEY (company_id) REFERENCES companies(id)
  ON UPDATE CASCADE
  ON DELETE CASCADE;
