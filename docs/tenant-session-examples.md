# Tenant-aware stored procedure and trigger examples

This example shows how tenant identifiers are injected from the application session and consumed by a stored procedure plus a trigger. The UI pre-fills tenant columns on add (e.g., `company_id`, `branch_id`, `department_id`, `created_by`) so neither the end user nor the database session has to set them manually.

## Table
```sql
CREATE TABLE transactions_income (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    branch_id INT NULL,
    department_id INT NULL,
    created_by INT NULL,
    or_date DATE NOT NULL,
    or_g_id INT NOT NULL,
    sp_curr_receivables DECIMAL(18,2) NULL,
    sp_curr_penalty DECIMAL(18,2) NULL,
    sp_curr_receivableswithpenalty DECIMAL(18,2) NULL
);
```

## Stored procedure
The procedure accepts the tenant ID and other fields as parameters. The application fills `company_id` (and any other tenant fields) before submitting the insert, so the caller just passes `NEW.company_id` from the trigger.

```sql
DELIMITER $$
CREATE PROCEDURE resolve_contract_receivables (
    IN p_company_id INT,
    IN p_or_group_id INT,
    IN p_year INT,
    IN p_month INT,
    OUT p_curr_rec DECIMAL(18,2),
    OUT p_curr_pen DECIMAL(18,2),
    OUT p_curr_rec_with_pen DECIMAL(18,2)
)
BEGIN
    /* Use tenant ID in lookups/filters */
    SELECT SUM(amount), SUM(penalty), SUM(amount + penalty)
      INTO p_curr_rec, p_curr_pen, p_curr_rec_with_pen
      FROM receivable_lines
     WHERE company_id = p_company_id
       AND or_group_id = p_or_group_id
       AND YEAR(or_date) = p_year
       AND MONTH(or_date) = p_month;
END$$
DELIMITER ;
```

## Trigger
The trigger consumes the tenant columns that were auto-filled by the UI. No manual input is required; it simply ensures the values exist and forwards them to the procedure.

```sql
DELIMITER $$
CREATE TRIGGER trg_resolve_contract_receivables
BEFORE INSERT ON transactions_income
FOR EACH ROW
BEGIN
    DECLARE v_year INT;
    DECLARE v_month INT;
    DECLARE v_curr_rec DECIMAL(18,2);
    DECLARE v_curr_pen DECIMAL(18,2);
    DECLARE v_curr_rec_with_pen DECIMAL(18,2);

    /* Tenant IDs are already set by the app (autoFillSession) */
    IF NEW.company_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Tenant company cannot be NULL';
    END IF;

    SET v_year  = YEAR(NEW.or_date);
    SET v_month = MONTH(NEW.or_date);

    CALL resolve_contract_receivables(
        NEW.company_id,
        NEW.or_g_id,
        v_year,
        v_month,
        v_curr_rec,
        v_curr_pen,
        v_curr_rec_with_pen
    );

    SET NEW.sp_curr_receivables            = v_curr_rec;
    SET NEW.sp_curr_penalty                = v_curr_pen;
    SET NEW.sp_curr_receivableswithpenalty = v_curr_rec_with_pen;
END$$
DELIMITER ;
```

## Why no manual tenant input is needed
- The application pre-fills the tenant columns on add using session data (company/branch/department/user). The trigger receives those values in `NEW.*`.
- The procedure receives the tenant ID as a parameter from the trigger, so it can filter and compute in the correct tenant scope.
- If a tenant column is missing, the trigger blocks the insert with an explicit error message, preventing cross-tenant leakage.
