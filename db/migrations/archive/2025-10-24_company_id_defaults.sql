-- Ensure company_id columns are non-null with default and indexed

-- SOrlogo
SELECT COUNT(*) AS total_before, SUM(company_id IS NULL) AS null_before FROM SOrlogo;
UPDATE SOrlogo so
LEFT JOIN user_companies uc ON uc.empid = so.userid
SET so.company_id = COALESCE(uc.company_id, 0)
WHERE so.company_id IS NULL;
SELECT COUNT(*) AS total_after,
       SUM(company_id = 0) AS global_rows,
       SUM(company_id > 0) AS company_rows
  FROM SOrlogo;
ALTER TABLE SOrlogo
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_SOrlogo_company_id ON SOrlogo(company_id);

-- SZardal
SELECT COUNT(*) AS total_before, SUM(company_id IS NULL) AS null_before FROM SZardal;
UPDATE SZardal sz
LEFT JOIN user_companies uc ON uc.empid = sz.userid
SET sz.company_id = COALESCE(uc.company_id, 0)
WHERE sz.company_id IS NULL;
SELECT COUNT(*) AS total_after,
       SUM(company_id = 0) AS global_rows,
       SUM(company_id > 0) AS company_rows
  FROM SZardal;
ALTER TABLE SZardal
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_SZardal_company_id ON SZardal(company_id);

-- tusuv
SELECT COUNT(*) AS total_before, SUM(company_id IS NULL) AS null_before FROM tusuv;
UPDATE tusuv t
LEFT JOIN user_companies uc ON uc.empid = t.userid
SET t.company_id = COALESCE(uc.company_id, 0)
WHERE t.company_id IS NULL;
SELECT COUNT(*) AS total_after,
       SUM(company_id = 0) AS global_rows,
       SUM(company_id > 0) AS company_rows
  FROM tusuv;
ALTER TABLE tusuv
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_tusuv_company_id ON tusuv(company_id);

-- BMBurtgel
SELECT COUNT(*) AS total_before, SUM(company_id IS NULL) AS null_before FROM BMBurtgel;
UPDATE BMBurtgel b
LEFT JOIN user_companies uc ON uc.empid = b.userid
SET b.company_id = COALESCE(uc.company_id, 0)
WHERE b.company_id IS NULL;
SELECT COUNT(*) AS total_after,
       SUM(company_id = 0) AS global_rows,
       SUM(company_id > 0) AS company_rows
  FROM BMBurtgel;
ALTER TABLE BMBurtgel
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_BMBurtgel_company_id ON BMBurtgel(company_id);

-- MMorder
SELECT COUNT(*) AS total_before, SUM(company_id IS NULL) AS null_before FROM MMorder;
UPDATE MMorder m
LEFT JOIN user_companies uc ON uc.empid = m.userid
SET m.company_id = COALESCE(uc.company_id, 0)
WHERE m.company_id IS NULL;
SELECT COUNT(*) AS total_after,
       SUM(company_id = 0) AS global_rows,
       SUM(company_id > 0) AS company_rows
  FROM MMorder;
ALTER TABLE MMorder
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_MMorder_company_id ON MMorder(company_id);

-- SGereeJ
SELECT COUNT(*) AS total_before, SUM(company_id IS NULL) AS null_before FROM SGereeJ;
UPDATE SGereeJ s
LEFT JOIN user_companies uc ON uc.empid = s.userid
SET s.company_id = COALESCE(uc.company_id, 0)
WHERE s.company_id IS NULL;
SELECT COUNT(*) AS total_after,
       SUM(company_id = 0) AS global_rows,
       SUM(company_id > 0) AS company_rows
  FROM SGereeJ;
ALTER TABLE SGereeJ
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_SGereeJ_company_id ON SGereeJ(company_id);

-- form_submissions
SELECT COUNT(*) AS total_before, SUM(company_id IS NULL) AS null_before FROM form_submissions;
UPDATE form_submissions
SET company_id = 0
WHERE company_id IS NULL;
SELECT COUNT(*) AS total_after,
       SUM(company_id = 0) AS global_rows
  FROM form_submissions;
ALTER TABLE form_submissions
  MODIFY COLUMN company_id INT NOT NULL DEFAULT 0;
CREATE INDEX idx_form_submissions_company_id ON form_submissions(company_id);
