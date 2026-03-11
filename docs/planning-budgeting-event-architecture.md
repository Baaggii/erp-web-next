# Planning + Budgeting Event Architecture

Planning and budgeting remain configuration-driven transaction domains, now orchestrated by event policies.

## Reference examples
1. **Shortage -> investigation plan**
   - Trigger: `inventory.shortage.detected`
   - Actions: `create_transaction` (plan investigation), `notify`, `update_twin(risk_state)`

2. **Budget exceeded from posting**
   - Trigger: `journal.posted`
   - Condition: actual > available
   - Actions: `update_twin(budget_state)`, `notify`, optional `enqueue_ai_review`

3. **Overdue task escalation**
   - Trigger: `task.overdue`
   - Actions: `update_twin(task_load)`, `notify`, optional escalation policy chain

## Reporting guidance
- Statutory/legal: keep stored procedures over journal + raw transaction tables.
- Operational/dashboard: use twin tables for near-real-time snapshots.

## Policy-first extension
No domain case is hardcoded in architecture. New industries/modules should add policies + mappings, not service rewrites.
