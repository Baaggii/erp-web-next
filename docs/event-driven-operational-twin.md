# Event-Driven Operational Twin Architecture

## Overview
This repository now extends the existing configuration-driven ERP engines with an **event-driven operational twin** layer.

Flow:

`dynamic transaction -> canonical event -> policy orchestration -> twin state update -> reporting/dashboard/notification/AI/action`

## Why this exists
- Preserve dynamic transaction CRUD while decoupling downstream effects.
- Keep stored-procedure reporting and financial posting as legal truth sources.
- Add real-time management truth using twin state tables.
- Keep AI optional and policy-gated.

## Core components
- `core_events`: canonical event ledger (replay/audit source).
- `core_event_policies`: tenant-scoped event subscription policies.
- `core_event_policy_runs`: execution trace per policy/event.
- `core_event_dead_letters`: failed processing audit/recovery queue.
- twin tables (`twin_plan_state`, `twin_budget_state`, `twin_resource_state`, `twin_risk_state`, `twin_task_load`).

## Integration with existing engines
- Dynamic transaction mutations now emit `transaction.created|updated|deleted` events for `transactions_*` tables.
- Journal posting emits `journal.posted` events.
- Notification engine continues existing queue behavior, and policies can now create notifications.
- Dashboard/reporting can query twin tables for management snapshots while ledger procedures remain for statutory truth.

## Safe defaults
- Tenant/company scoping required on all event/twin operations.
- Policy-driven procedure calls are allow-list validated.
- Replay endpoint is admin-only.
- Event policy execution is logged for auditability.

## Suggested next step
Run event processing from a cron/worker by calling `POST /api/events/process` on an interval.
