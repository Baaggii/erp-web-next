CREATE TABLE IF NOT EXISTS event_scenarios (
  scenario_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scenario_key VARCHAR(100) NOT NULL,
  scenario_name VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  default_condition_json JSON NOT NULL,
  default_action_json JSON NOT NULL,
  default_policy_name VARCHAR(255) DEFAULT NULL,
  default_policy_key VARCHAR(120) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  company_id BIGINT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (scenario_id),
  UNIQUE KEY uq_event_scenarios_scope_key (scenario_key, company_id),
  KEY idx_event_scenarios_scope_active (company_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO event_scenarios (
  scenario_key,
  scenario_name,
  event_type,
  default_condition_json,
  default_action_json,
  default_policy_name,
  default_policy_key,
  sort_order,
  is_active,
  company_id
) VALUES
(
  'inventory_shortage',
  'Inventory shortage',
  'inventory.shortage.detected',
  JSON_OBJECT('logic', 'and', 'rules', JSON_ARRAY(JSON_OBJECT('field', 'payload.shortageQty', 'operator', '>', 'value', 10))),
  JSON_OBJECT('actions', JSON_ARRAY(
    JSON_OBJECT('type', 'create_transaction', 'transactionType', 'investigation_plan', 'mapping', JSON_OBJECT('source_event_id', 'event.eventId', 'source_record_id', 'source.recordId', 'created_at', 'system.now')),
    JSON_OBJECT('type', 'notify', 'message', 'Inventory shortage investigation started', 'target', JSON_OBJECT('mode', 'empids', 'values', JSON_ARRAY('WAREHOUSE_MANAGER'))),
    JSON_OBJECT('type', 'update_twin', 'twin', 'risk_state', 'mapping', JSON_OBJECT('risk_code', 'payload.riskCode', 'severity', 'payload.severity', 'updated_at', 'system.now'))
  )),
  'Inventory shortage investigation',
  'inventory_shortage_investigation',
  10,
  1,
  NULL
),
(
  'budget_overrun',
  'Budget exceeded',
  'journal.posted',
  JSON_OBJECT('logic', 'and', 'rules', JSON_ARRAY(JSON_OBJECT('field', 'payload.overrunAmount', 'operator', '>', 'value', 0))),
  JSON_OBJECT('actions', JSON_ARRAY(
    JSON_OBJECT('type', 'notify', 'message', 'Budget limit exceeded', 'target', JSON_OBJECT('mode', 'empids', 'values', JSON_ARRAY('FINANCE_MANAGER'))),
    JSON_OBJECT('type', 'update_twin', 'twin', 'budget_state', 'mapping', JSON_OBJECT('ledger_code', 'payload.ledgerCode', 'variance', 'payload.overrunAmount', 'updated_at', 'system.now'))
  )),
  'Budget limit exceeded',
  'budget_limit_exceeded',
  20,
  1,
  NULL
),
(
  'task_overdue',
  'Task overdue',
  'task.overdue',
  JSON_OBJECT('logic', 'and', 'rules', JSON_ARRAY(JSON_OBJECT('field', 'payload.daysOverdue', 'operator', '>=', 'value', 1))),
  JSON_OBJECT('actions', JSON_ARRAY(
    JSON_OBJECT('type', 'notify', 'message', 'Task escalation is required', 'target', JSON_OBJECT('mode', 'empids', 'values', JSON_ARRAY('TASK_OWNER', 'TEAM_LEAD'))),
    JSON_OBJECT('type', 'update_twin', 'twin', 'task_load', 'mapping', JSON_OBJECT('task_id', 'payload.taskId', 'priority', 'payload.priority', 'updated_at', 'system.now'))
  )),
  'Task escalation',
  'task_escalation',
  30,
  1,
  NULL
),
(
  'asset_damage',
  'Asset damaged',
  'asset.damaged',
  JSON_OBJECT('logic', 'and', 'rules', JSON_ARRAY(JSON_OBJECT('field', 'payload.damageSeverity', 'operator', '>=', 'value', 2))),
  JSON_OBJECT('actions', JSON_ARRAY(
    JSON_OBJECT('type', 'create_transaction', 'transactionType', 'asset_damage_report', 'mapping', JSON_OBJECT('asset_id', 'payload.assetId', 'damage_severity', 'payload.damageSeverity', 'reported_at', 'system.now')),
    JSON_OBJECT('type', 'notify', 'message', 'Asset damage reported', 'target', JSON_OBJECT('mode', 'empids', 'values', JSON_ARRAY('MAINTENANCE_MANAGER')))
  )),
  'Asset damage response',
  'asset_damage_response',
  40,
  1,
  NULL
),
(
  'customer_complaint',
  'Customer complaint',
  'customer.complaint',
  JSON_OBJECT('logic', 'and', 'rules', JSON_ARRAY(JSON_OBJECT('field', 'payload.priority', 'operator', 'in', 'value', JSON_ARRAY('high', 'critical')))),
  JSON_OBJECT('actions', JSON_ARRAY(
    JSON_OBJECT('type', 'create_transaction', 'transactionType', 'customer_case', 'mapping', JSON_OBJECT('customer_id', 'payload.customerId', 'case_type', 'payload.category', 'created_at', 'system.now')),
    JSON_OBJECT('type', 'notify', 'message', 'Customer complaint requires attention', 'target', JSON_OBJECT('mode', 'empids', 'values', JSON_ARRAY('CUSTOMER_SUPPORT_LEAD')))
  )),
  'Customer complaint escalation',
  'customer_complaint_escalation',
  50,
  1,
  NULL
)
ON DUPLICATE KEY UPDATE
  scenario_name = VALUES(scenario_name),
  event_type = VALUES(event_type),
  default_condition_json = VALUES(default_condition_json),
  default_action_json = VALUES(default_action_json),
  default_policy_name = VALUES(default_policy_name),
  default_policy_key = VALUES(default_policy_key),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;
