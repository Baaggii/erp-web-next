CREATE TABLE IF NOT EXISTS core_events (
  event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_type VARCHAR(120) NOT NULL,
  source_transaction_type VARCHAR(120) NULL,
  source_table VARCHAR(120) NULL,
  source_record_id VARCHAR(120) NULL,
  source_action VARCHAR(40) NULL,
  company_id INT NOT NULL,
  branch_id INT NULL,
  department_id INT NULL,
  workplace_id INT NULL,
  actor_empid VARCHAR(40) NULL,
  correlation_id VARCHAR(120) NULL,
  causation_id VARCHAR(120) NULL,
  payload_json JSON NOT NULL,
  status ENUM('pending','processing','processed','failed','ignored') NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  INDEX idx_core_events_company_type_status_occurred (company_id, event_type, status, occurred_at),
  INDEX idx_core_events_source (source_table, source_record_id),
  INDEX idx_core_events_correlation (correlation_id),
  INDEX idx_core_events_causation (causation_id)
);

CREATE TABLE IF NOT EXISTS core_event_policies (
  policy_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  policy_key VARCHAR(120) NOT NULL,
  policy_name VARCHAR(255) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  module_key VARCHAR(80) NULL,
  priority INT NOT NULL DEFAULT 100,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  stop_on_match TINYINT(1) NOT NULL DEFAULT 0,
  condition_json JSON NOT NULL,
  action_json JSON NOT NULL,
  ai_policy_json JSON NULL,
  company_id INT NOT NULL,
  created_by VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(50) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_policy_key_company (policy_key, company_id),
  INDEX idx_event_type_company_active_priority (event_type, company_id, is_active, priority)
);

CREATE TABLE IF NOT EXISTS core_event_policy_runs (
  run_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id BIGINT NOT NULL,
  policy_id BIGINT NOT NULL,
  run_status ENUM('matched','skipped','completed','failed') NOT NULL,
  condition_result_json JSON NULL,
  action_result_json JSON NULL,
  error_message TEXT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  company_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_policy_runs_event (event_id),
  INDEX idx_policy_runs_policy (policy_id),
  INDEX idx_policy_runs_company_status (company_id, run_status, created_at)
);

CREATE TABLE IF NOT EXISTS core_event_dead_letters (
  dead_letter_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id BIGINT NOT NULL,
  company_id INT NOT NULL,
  failure_stage VARCHAR(120) NULL,
  error_message TEXT NULL,
  event_snapshot_json JSON NULL,
  retry_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dead_letters_company_created (company_id, created_at)
);

CREATE TABLE IF NOT EXISTS twin_plan_state (
  plan_state_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  plan_ref_type VARCHAR(120) NOT NULL,
  plan_ref_id VARCHAR(120) NOT NULL,
  parent_plan_ref_id VARCHAR(120) NULL,
  state_code VARCHAR(60) NOT NULL,
  completion_percent DECIMAL(7,2) NULL,
  budget_total DECIMAL(18,2) NULL,
  budget_used DECIMAL(18,2) NULL,
  resource_summary_json JSON NULL,
  risk_level VARCHAR(40) NULL,
  last_event_id BIGINT NULL,
  company_id INT NOT NULL,
  branch_id INT NULL,
  department_id INT NULL,
  owner_empid VARCHAR(40) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_plan_ref (company_id, plan_ref_type, plan_ref_id),
  INDEX idx_twin_plan_company_state (company_id, state_code)
);

CREATE TABLE IF NOT EXISTS twin_budget_state (
  budget_state_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  budget_ref_type VARCHAR(120) NOT NULL,
  budget_ref_id VARCHAR(120) NOT NULL,
  period_key VARCHAR(40) NOT NULL,
  dimension_json JSON NULL,
  budget_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  committed_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  actual_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  available_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  variance_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  status_code VARCHAR(40) NULL,
  last_event_id BIGINT NULL,
  company_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_budget_ref_period (company_id, budget_ref_type, budget_ref_id, period_key),
  INDEX idx_twin_budget_company_period (company_id, period_key)
);

CREATE TABLE IF NOT EXISTS twin_resource_state (
  resource_state_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  resource_type VARCHAR(80) NOT NULL,
  resource_ref_id VARCHAR(120) NOT NULL,
  capacity_qty DECIMAL(18,4) NULL,
  reserved_qty DECIMAL(18,4) NULL,
  used_qty DECIMAL(18,4) NULL,
  available_qty DECIMAL(18,4) NULL,
  status_code VARCHAR(40) NULL,
  last_event_id BIGINT NULL,
  company_id INT NOT NULL,
  branch_id INT NULL,
  department_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_resource_ref (company_id, resource_type, resource_ref_id),
  INDEX idx_twin_resource_company_status (company_id, status_code)
);

CREATE TABLE IF NOT EXISTS twin_risk_state (
  risk_state_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  risk_key VARCHAR(120) NOT NULL,
  entity_type VARCHAR(120) NOT NULL,
  entity_ref_id VARCHAR(120) NOT NULL,
  severity VARCHAR(40) NOT NULL,
  status_code VARCHAR(40) NOT NULL,
  risk_payload_json JSON NULL,
  assigned_to VARCHAR(40) NULL,
  last_event_id BIGINT NULL,
  company_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_risk_entity (company_id, risk_key, entity_type, entity_ref_id),
  INDEX idx_twin_risk_company_status (company_id, status_code, severity)
);

CREATE TABLE IF NOT EXISTS twin_task_load (
  task_load_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  empid VARCHAR(40) NOT NULL,
  open_task_count INT NOT NULL DEFAULT 0,
  overdue_task_count INT NOT NULL DEFAULT 0,
  high_priority_count INT NOT NULL DEFAULT 0,
  completion_percent DECIMAL(7,2) NULL,
  last_event_id BIGINT NULL,
  company_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_task_load_emp (company_id, empid),
  INDEX idx_twin_task_load_company (company_id)
);
