START TRANSACTION;

-- Align natural keys to be tenant-scoped in multi-company deployments.

ALTER TABLE plan_header
  DROP INDEX uq_plan_header_plan_no,
  ADD UNIQUE KEY uq_plan_header_company_plan_no (company_id, plan_no);

ALTER TABLE budget_header
  DROP INDEX uq_budget_header_budget_no,
  ADD UNIQUE KEY uq_budget_header_company_budget_no (company_id, budget_no);

ALTER TABLE business_rule_header
  DROP INDEX uq_business_rule_header_rule_code,
  ADD UNIQUE KEY uq_business_rule_header_company_rule_code (company_id, rule_code);

COMMIT;
