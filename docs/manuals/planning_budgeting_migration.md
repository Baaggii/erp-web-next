# Planning & Budgeting Migration (Config-Driven ERP Integration)

This document tracks implementation of the planning and budgeting migration plan in a way that preserves ERP-wide dynamic behavior (transactions, reporting, rules, notifications, dashboards) and avoids hardcoded business event logic.

## Implemented in this repo

## Phase 1

Migration: `db/migrations/2026-03-10_planning_budgeting_phase1_tables.sql`

Created tables:
- `plan_header`
- `plan_line`
- `plan_assignment`
- `plan_resource_allocation`
- `plan_completion`
- `budget_header`
- `budget_line`
- `budget_consumption`
- `business_rule_header`
- `business_rule_condition`
- `business_rule_action`
- `business_dimension_map`
- `rule_execution_log`

## Phase 1 alignment

Migration: `db/migrations/2026-03-10_planning_budgeting_phase1_constraint_alignment.sql`

- Aligns natural key uniqueness to tenant scope:
  - `plan_header`: unique (`company_id`, `plan_no`)
  - `budget_header`: unique (`company_id`, `budget_no`)
  - `business_rule_header`: unique (`company_id`, `rule_code`)

## Phase 2 + 3

Migration: `db/migrations/2026-03-10_planning_budgeting_phase2_phase3.sql`

### Existing table extensions

- `code_transaction`
  - Added fields for dynamic domain/rule/workflow support:
    `module_key`, `transaction_domain`, `business_object_code`, `rule_group_code`,
    `workflow_code`, `default_status_code`, `supports_approval`,
    `supports_budget_check`, `supports_plan_link`, `supports_ai_assist`,
    `supports_notification`, `target_table_name`.

- `notifications`
  - Added planning/budget/rule context and risk escalation metadata:
    `plan_id`, `budget_id`, `rule_id`, `severity_code`, `risk_score`,
    `ai_summary`, `escalation_status_code`.

- `modules`
  - Seeded module keys:
    `planning_transactions`, `budgeting_transactions`, `planning_reports`,
    `budgeting_reports`, `business_rules`, `ai_assistance`.

### Dashboard support

- Added `dashboard_plan_budget_metrics` table for computed widget source metrics.

### Stored procedures

- `sp_rule_evaluate_transaction`
- `sp_budget_validate_transaction`
- `sp_plan_rollup_status`
- `sp_plan_resource_validate`
- `sp_plan_generate_followup`
- `sp_budget_consume_from_transaction`
- `sp_dashboard_refresh_plan_budget_metrics`

## Configuration-first rule pattern

- Any transaction type can trigger outcomes through `business_rule_header` + condition/action rows.
- Conditions are field/table/expression driven through `business_rule_condition`.
- Actions route through `business_rule_action` and can call generic procedures or create downstream records.
- Semantic dimensions map to physical sources via `business_dimension_map`.

## Suggested transaction types to configure

### Planning
- `plan_strategic_create`
- `plan_strategic_update`
- `plan_strategic_approve`
- `plan_strategic_close`
- `plan_operational_create`
- `plan_operational_update`
- `plan_operational_assign`
- `plan_operational_revise`
- `plan_operational_close`
- `plan_task_create`
- `plan_task_assign`
- `plan_task_progress`
- `plan_task_complete`
- `plan_task_verify`
- `plan_investigation_create`
- `plan_incident_response_create`
- `plan_shortage_investigation_create`
- `plan_damage_investigation_create`
- `plan_resource_request`
- `plan_resource_allocate`
- `plan_resource_release`
- `plan_resource_reallocate`
- `plan_resource_consume`

### Budgeting
- `budget_create`
- `budget_import`
- `budget_submit`
- `budget_approve`
- `budget_lock`
- `budget_revise`
- `budget_close`
- `budget_transfer`
- `budget_reserve`
- `budget_release`
- `budget_adjust`
- `budget_forecast_create`
- `budget_forecast_revise`
- `budget_variance_review`

### Rule-generated follow-ups
- `rule_generated_plan_create`
- `rule_generated_budget_check`
- `rule_generated_notification`
- `rule_generated_ai_review`
- `rule_generated_approval_request`

## Codex implementation task template

```text
Task: Implement planning/budgeting migration phase <X>

Context:
- Reuse dynamic transaction engine
- Reuse report/procedure engine
- Reuse notification engine
- Keep business logic config-driven
- No hardcoded business-specific transaction assumptions

Deliverables:
1. MySQL migration files
2. Updated schema.sql if used
3. Backend services/routes changes
4. JSON config examples
5. Tests
6. Documentation markdown in repo

Required tables:
- <list>

Required columns:
- <full definitions>

Required foreign keys:
- <full list>

Required indexes:
- <full list>

Required procedures:
- <list>

Rules:
- Any transaction type can trigger planning/budgeting outcomes through rule tables.
- Dimensions must be physical-table/field-driven.
- Do not hardcode business cases like damaged asset, shortage, purchase request, etc.
- Implement generic rule evaluation.
```
