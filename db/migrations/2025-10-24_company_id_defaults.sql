-- Ensure company_id columns are non-null with default and indexed

-- SOrlogo
UPDATE SOrlogo SET company_id = 0 WHERE company_id IS NULL;
ALTER TABLE SOrlogo
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_SOrlogo_company_id ON SOrlogo(company_id);

-- SZardal
UPDATE SZardal SET company_id = 0 WHERE company_id IS NULL;
ALTER TABLE SZardal
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_SZardal_company_id ON SZardal(company_id);

-- tusuv
UPDATE tusuv SET company_id = 0 WHERE company_id IS NULL;
ALTER TABLE tusuv
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_tusuv_company_id ON tusuv(company_id);

-- BMBurtgel
UPDATE BMBurtgel SET company_id = 0 WHERE company_id IS NULL;
ALTER TABLE BMBurtgel
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_BMBurtgel_company_id ON BMBurtgel(company_id);

-- MMorder
UPDATE MMorder SET company_id = 0 WHERE company_id IS NULL;
ALTER TABLE MMorder
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_MMorder_company_id ON MMorder(company_id);

-- SGereeJ
UPDATE SGereeJ SET company_id = 0 WHERE company_id IS NULL;
ALTER TABLE SGereeJ
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_SGereeJ_company_id ON SGereeJ(company_id);

-- form_submissions
UPDATE form_submissions SET company_id = 0 WHERE company_id IS NULL;
ALTER TABLE form_submissions
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_form_submissions_company_id ON form_submissions(company_id);
