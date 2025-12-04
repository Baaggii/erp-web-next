# Contract receivables trigger review

## Issue recap
- Promotions hit a BEFORE INSERT trigger that calls `resolve_contract_receivables`. The temporary save path avoids the trigger entirely, which is why the error appears only during promotion/posting.
- MariaDB/MySQL forbids **dynamic SQL** inside code that executes in a trigger context. Any `PREPARE/EXECUTE` or `DROP/CREATE` assembled via dynamic strings inside the called routine causes `ERROR 1422 (HY000): Dynamic SQL is not allowed in stored function or trigger`.
- The current procedure builds temp tables via helper routines and uses session variables, so if any helper uses dynamic SQL (for temp-table creation or tenant scoping) the trigger will fail during promotion.

## Recommended changes
### 1) Keep the trigger thin and deterministic
Use a small trigger that only forwards validated inputs to the procedure, keeping all calculations inside the procedure and avoiding session variables:

```sql
CREATE OR REPLACE TRIGGER trg_contract_order_bi
BEFORE INSERT ON transactions_contract_order
FOR EACH ROW
BEGIN
  DECLARE v_receivables DECIMAL(18,2);
  DECLARE v_penalty DECIMAL(18,2);
  DECLARE v_receivables_with_penalty DECIMAL(18,2);

  CALL resolve_contract_receivables(
    NEW.or_g_id,
    NEW.or_date,
    v_receivables,
    v_penalty,
    v_receivables_with_penalty
  );

  SET NEW.sp_curr_receivables            = v_receivables;
  SET NEW.sp_curr_penalty                = v_penalty;
  SET NEW.sp_curr_receivableswithpenalty = v_receivables_with_penalty;
END;
```

### 2) Replace helper-driven temp-table logic with static derived tables
Re-implement `resolve_contract_receivables` with **only static SQL** so the trigger never executes dynamic SQL. The outline below computes the same three values directly from monthly aggregates without calling dynamic helpers or using session variables:

```sql
CREATE OR REPLACE PROCEDURE resolve_contract_receivables(
    IN  p_g_id  VARCHAR(255),
    IN  p_or_date DATE,
    OUT o_curr_receivables            DECIMAL(18,2),
    OUT o_curr_penalty                DECIMAL(18,2),
    OUT o_curr_receivableswithpenalty DECIMAL(18,2)
)
BEGIN
  DECLARE v_year INT;
  DECLARE v_month INT;
  DECLARE v_company_id INT;
  DECLARE v_base_rent DECIMAL(18,2) DEFAULT 0;
  DECLARE v_total_util DECIMAL(18,2) DEFAULT 0;
  DECLARE v_penalty_raw DECIMAL(18,2) DEFAULT 0;
  DECLARE v_income_total DECIMAL(18,2) DEFAULT 0;

  IF p_g_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contract ID cannot be NULL';
  END IF;
  IF p_or_date IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'or_date cannot be NULL';
  END IF;

  SET v_year  = YEAR(p_or_date);
  SET v_month = MONTH(p_or_date);

  SELECT company_id
    INTO v_company_id
    FROM transactions_contract
   WHERE g_id = p_g_id
   LIMIT 1;

  IF v_company_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No company_id found for given g_id';
  END IF;

  /* Inline, deterministic aggregates scoped by tenant/year/month */
  SELECT
    COALESCE(CEIL(MAX(r.base_final_rent)/10.0)*10, 0),
    COALESCE(CEIL(MAX(ug.total_util)/10.0)*10, 0),
    COALESCE(MAX(ps.total_penalty), 0),
    COALESCE(MAX(itg.income_total), 0)
  INTO
    v_base_rent,
    v_total_util,
    v_penalty_raw,
    v_income_total
  FROM contract_info ci
  LEFT JOIN rent_grouped r
    ON r.g_id = ci.g_id
   AND r.period_year = v_year
   AND r.period_month = v_month
  LEFT JOIN util_grouped ug
    ON ug.g_id = ci.g_id
   AND ug.period_year = v_year
   AND ug.period_month = v_month
  LEFT JOIN penalty_summary ps
    ON ps.g_id = ci.g_id
   AND ps.period_year = v_year
   AND ps.period_month = v_month
  LEFT JOIN income_total_grouped itg
    ON itg.g_id = ci.g_id
   AND itg.period_year = v_year
   AND itg.period_month = v_month
  WHERE ci.g_id = p_g_id
  LIMIT 1;

  SET o_curr_receivables = CEIL((v_base_rent + v_total_util)/10.0)*10;
  SET o_curr_penalty = CEIL(v_penalty_raw/10.0)*10;
  SET o_curr_receivableswithpenalty = CEIL((v_base_rent + v_total_util + v_penalty_raw - v_income_total)/10.0)*10;
END;
```

Key characteristics of this version:
- **No `PREPARE`/`EXECUTE` or dynamic SQL**; every query is static.
- **No helper calls** inside the trigger path, so promotion inserts avoid dynamic behavior entirely.
- Uses local variables instead of session-level user variables to keep trigger execution isolated.

### 3) Deployment checklist
- Drop or replace the existing trigger and procedure with the static versions above.
- Ensure `contract_info`, `rent_grouped`, `util_grouped`, `penalty_summary`, and `income_total_grouped` (or their real equivalents) expose tenant/year/month columns so the static joins stay deterministic. If the production schema uses different tables/views, adjust the join targets accordingly while keeping the queries static.
- Re-run promotion posting in a staging database to confirm the trigger no longer raises `ERROR 1422`.

## FAQ: chaining procedures from a trigger
Yes, you can safely chain multiple stored procedures even when the last procedure is invoked from a trigger. The database only forbids **dynamic SQL inside routines reached by the trigger**; it does not block routine-to-routine calls. To keep the chain trigger-safe:

- Keep every routine in the chain deterministic: no `PREPARE/EXECUTE`, no dynamic `DROP/CREATE`, and no temp-table helpers that rely on those constructs.
- If you need intermediate setup steps, place them in earlier procedures, but ensure they use static SQL as well (e.g., straightforward `INSERT ... SELECT`, `UPDATE`, or aggregations with fixed tables/columns).
- The last procedure called by the trigger should accept all required inputs, compute outputs with static queries, and **avoid `DROP TABLE`** calls; use derived tables or existing persistent tables instead.
- If a temp-table pattern is unavoidable, create and drop the tables outside the trigger path (e.g., in the application layer or a one-time prep job) so the trigger-executed procedures stay free of dynamic SQL and `DROP` operations.

With these guardrails, you can structure three consecutive procedures (A → B → C) where `C` is called from the trigger and contains only static SQL, ensuring promotions run without the dynamic SQL restriction.
