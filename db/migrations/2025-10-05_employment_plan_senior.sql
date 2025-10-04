-- Add employment_senior_plan_empid column mirroring employment_senior_empid
-- so report approval workflows can route to a different supervisor.

ALTER TABLE tbl_employment
  ADD COLUMN employment_senior_plan_empid VARCHAR(10) NULL AFTER employment_senior_empid;

ALTER TABLE tbl_employment
  ADD KEY tbl_employment_ibfk_7 (employment_senior_plan_empid);

ALTER TABLE tbl_employment
  ADD CONSTRAINT tbl_employment_ibfk_7 FOREIGN KEY (employment_senior_plan_empid)
    REFERENCES tbl_employee (emp_id) ON DELETE RESTRICT ON UPDATE RESTRICT;

UPDATE tbl_employment
   SET employment_senior_plan_empid = employment_senior_empid
 WHERE employment_senior_plan_empid IS NULL;
