# Operational Twin Tables

These tables hold **current operational state** for low-latency management views.

## Tables
- `twin_plan_state`: plan status, completion, budget usage, risk level.
- `twin_budget_state`: budget/committed/actual/available/variance by period.
- `twin_resource_state`: capacity/reserved/used/available resource snapshot.
- `twin_risk_state`: active risks by entity.
- `twin_task_load`: employee workload and overdue/high-priority counts.

## Update pattern
- Policies handle `update_twin` actions.
- `upsertTwinState` performs key-based upserts.
- `last_event_id` tracks causation to canonical events.

## Querying
APIs:
- `GET /api/twin/plan`
- `GET /api/twin/budget`
- `GET /api/twin/risk`
- `GET /api/twin/task-load`
- `GET /api/twin/resource`

All queries are company-scoped.
