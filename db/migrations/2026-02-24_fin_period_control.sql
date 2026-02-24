CREATE TABLE IF NOT EXISTS fin_period_control (
  company_id INT NOT NULL,
  fiscal_year INT NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  is_closed TINYINT DEFAULT 0,
  closed_at DATETIME,
  closed_by VARCHAR(50),
  PRIMARY KEY (company_id, fiscal_year),
  CONSTRAINT chk_fin_period_control_range CHECK (period_from <= period_to),
  CONSTRAINT chk_fin_period_control_closed CHECK (is_closed IN (0, 1))
);
