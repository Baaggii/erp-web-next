START TRANSACTION;

-- Phase 2: Extend existing dynamic transaction + notification + module layers.

ALTER TABLE code_transaction
  ADD COLUMN IF NOT EXISTS module_key VARCHAR(100) NULL AFTER table_name,
  ADD COLUMN IF NOT EXISTS transaction_domain VARCHAR(50) NULL AFTER module_key,
  ADD COLUMN IF NOT EXISTS business_object_code VARCHAR(100) NULL AFTER transaction_domain,
  ADD COLUMN IF NOT EXISTS rule_group_code VARCHAR(50) NULL AFTER business_object_code,
  ADD COLUMN IF NOT EXISTS workflow_code VARCHAR(100) NULL AFTER rule_group_code,
  ADD COLUMN IF NOT EXISTS default_status_code VARCHAR(50) NULL AFTER workflow_code,
  ADD COLUMN IF NOT EXISTS supports_approval TINYINT(1) NOT NULL DEFAULT 0 AFTER default_status_code,
  ADD COLUMN IF NOT EXISTS supports_budget_check TINYINT(1) NOT NULL DEFAULT 0 AFTER supports_approval,
  ADD COLUMN IF NOT EXISTS supports_plan_link TINYINT(1) NOT NULL DEFAULT 0 AFTER supports_budget_check,
  ADD COLUMN IF NOT EXISTS supports_ai_assist TINYINT(1) NOT NULL DEFAULT 0 AFTER supports_plan_link,
  ADD COLUMN IF NOT EXISTS supports_notification TINYINT(1) NOT NULL DEFAULT 1 AFTER supports_ai_assist,
  ADD COLUMN IF NOT EXISTS target_table_name VARCHAR(100) NULL AFTER supports_notification;

ALTER TABLE code_transaction
  ADD INDEX IF NOT EXISTS idx_code_transaction_domain (company_id, transaction_domain),
  ADD INDEX IF NOT EXISTS idx_code_transaction_module_key (company_id, module_key),
  ADD INDEX IF NOT EXISTS idx_code_transaction_rule_group (company_id, rule_group_code),
  ADD INDEX IF NOT EXISTS idx_code_transaction_target_table (company_id, target_table_name);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS plan_id BIGINT NULL AFTER related_id,
  ADD COLUMN IF NOT EXISTS budget_id BIGINT NULL AFTER plan_id,
  ADD COLUMN IF NOT EXISTS rule_id BIGINT NULL AFTER budget_id,
  ADD COLUMN IF NOT EXISTS severity_code VARCHAR(50) NULL AFTER rule_id,
  ADD COLUMN IF NOT EXISTS risk_score DECIMAL(8,4) NULL AFTER severity_code,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT NULL AFTER risk_score,
  ADD COLUMN IF NOT EXISTS escalation_status_code VARCHAR(50) NULL AFTER ai_summary;

ALTER TABLE notifications
  ADD INDEX IF NOT EXISTS idx_notifications_recipient_read_created (company_id, recipient_empid, is_read, created_at),
  ADD INDEX IF NOT EXISTS idx_notifications_severity_created (company_id, severity_code, created_at),
  ADD INDEX IF NOT EXISTS idx_notifications_plan_id (plan_id),
  ADD INDEX IF NOT EXISTS idx_notifications_budget_id (budget_id),
  ADD INDEX IF NOT EXISTS idx_notifications_rule_id (rule_id);

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_plan FOREIGN KEY (plan_id) REFERENCES plan_header(id),
  ADD CONSTRAINT fk_notifications_budget FOREIGN KEY (budget_id) REFERENCES budget_header(id),
  ADD CONSTRAINT fk_notifications_rule FOREIGN KEY (rule_id) REFERENCES business_rule_header(id);

INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header, company_id)
SELECT 'planning_transactions', 'Planning Transactions', NULL, 1, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE company_id = 0 AND module_key = 'planning_transactions');

INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header, company_id)
SELECT 'budgeting_transactions', 'Budgeting Transactions', NULL, 1, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE company_id = 0 AND module_key = 'budgeting_transactions');

INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header, company_id)
SELECT 'planning_reports', 'Planning Reports', 'planning_transactions', 1, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE company_id = 0 AND module_key = 'planning_reports');

INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header, company_id)
SELECT 'budgeting_reports', 'Budgeting Reports', 'budgeting_transactions', 1, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE company_id = 0 AND module_key = 'budgeting_reports');

INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header, company_id)
SELECT 'business_rules', 'Business Rules', NULL, 1, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE company_id = 0 AND module_key = 'business_rules');

INSERT INTO modules (module_key, label, parent_key, show_in_sidebar, show_in_header, company_id)
SELECT 'ai_assistance', 'AI Assistance', NULL, 1, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE company_id = 0 AND module_key = 'ai_assistance');

CREATE TABLE IF NOT EXISTS dashboard_plan_budget_metrics (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  metric_key VARCHAR(100) NOT NULL,
  metric_label VARCHAR(255) NOT NULL,
  metric_value DECIMAL(18,4) NOT NULL DEFAULT 0,
  measured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  context_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dashboard_plan_budget_metrics_company_metric (company_id, metric_key),
  KEY idx_dashboard_plan_budget_metrics_company_measured (company_id, measured_at),
  KEY idx_dashboard_plan_budget_metrics_metric_key (metric_key)
);

COMMIT;

-- Phase 3: Stored procedure orchestration layer.

DROP PROCEDURE IF EXISTS sp_rule_evaluate_transaction;
DELIMITER $$
CREATE PROCEDURE sp_rule_evaluate_transaction (
  IN p_company_id INT,
  IN p_source_table VARCHAR(100),
  IN p_source_record_id BIGINT,
  IN p_trigger_event VARCHAR(50),
  IN p_created_by VARCHAR(50)
)
BEGIN
  INSERT INTO rule_execution_log (
    company_id,
    rule_id,
    source_table,
    source_record_id,
    trigger_event,
    matched_flag,
    execution_status,
    message,
    started_at,
    finished_at,
    created_by
  )
  SELECT
    h.company_id,
    h.id,
    p_source_table,
    p_source_record_id,
    p_trigger_event,
    1,
    'matched',
    CONCAT('Matched rule ', h.rule_code, ' / action=', h.target_action_code),
    NOW(),
    NOW(),
    p_created_by
  FROM business_rule_header h
  WHERE h.company_id = p_company_id
    AND h.is_active = 1
    AND h.trigger_event = p_trigger_event
    AND (h.source_table IS NULL OR h.source_table = p_source_table)
    AND (h.effective_from IS NULL OR h.effective_from <= NOW())
    AND (h.effective_to IS NULL OR h.effective_to >= NOW())
  ORDER BY h.priority_no ASC;

  IF ROW_COUNT() = 0 THEN
    INSERT INTO rule_execution_log (
      company_id,
      rule_id,
      source_table,
      source_record_id,
      trigger_event,
      matched_flag,
      execution_status,
      message,
      started_at,
      finished_at,
      created_by
    )
    SELECT
      p_company_id,
      h.id,
      p_source_table,
      p_source_record_id,
      p_trigger_event,
      0,
      'no_match',
      'No active matching rule found',
      NOW(),
      NOW(),
      p_created_by
    FROM business_rule_header h
    WHERE h.company_id = p_company_id
    ORDER BY h.id ASC
    LIMIT 1;
  END IF;

  SELECT *
  FROM rule_execution_log
  WHERE company_id = p_company_id
    AND source_table = p_source_table
    AND source_record_id = p_source_record_id
    AND trigger_event = p_trigger_event
  ORDER BY started_at DESC, id DESC;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_budget_validate_transaction;
DELIMITER $$
CREATE PROCEDURE sp_budget_validate_transaction (
  IN p_company_id INT,
  IN p_budget_id BIGINT,
  IN p_budget_line_id BIGINT,
  IN p_period_key VARCHAR(20),
  IN p_amount DECIMAL(18,2),
  IN p_quantity DECIMAL(18,4)
)
BEGIN
  DECLARE v_budgeted_amount DECIMAL(18,2) DEFAULT 0;
  DECLARE v_budgeted_qty DECIMAL(18,4) DEFAULT 0;
  DECLARE v_consumed_amount DECIMAL(18,2) DEFAULT 0;
  DECLARE v_consumed_qty DECIMAL(18,4) DEFAULT 0;

  SELECT COALESCE(bl.amount, 0), COALESCE(bl.quantity, 0)
    INTO v_budgeted_amount, v_budgeted_qty
  FROM budget_line bl
  WHERE bl.company_id = p_company_id
    AND bl.budget_id = p_budget_id
    AND (p_budget_line_id IS NULL OR bl.id = p_budget_line_id)
    AND bl.period_key = p_period_key
  ORDER BY bl.id ASC
  LIMIT 1;

  SELECT COALESCE(SUM(bc.amount_consumed), 0), COALESCE(SUM(bc.quantity_consumed), 0)
    INTO v_consumed_amount, v_consumed_qty
  FROM budget_consumption bc
  WHERE bc.company_id = p_company_id
    AND bc.budget_id = p_budget_id
    AND (p_budget_line_id IS NULL OR bc.budget_line_id = p_budget_line_id)
    AND bc.period_key = p_period_key;

  SELECT
    v_budgeted_amount AS budgeted_amount,
    v_consumed_amount AS consumed_amount,
    p_amount AS requested_amount,
    (v_budgeted_amount - v_consumed_amount) AS available_amount,
    CASE WHEN (v_consumed_amount + p_amount) <= v_budgeted_amount THEN 1 ELSE 0 END AS is_amount_allowed,
    v_budgeted_qty AS budgeted_quantity,
    v_consumed_qty AS consumed_quantity,
    p_quantity AS requested_quantity,
    (v_budgeted_qty - v_consumed_qty) AS available_quantity,
    CASE
      WHEN p_quantity IS NULL THEN 1
      WHEN (v_consumed_qty + p_quantity) <= v_budgeted_qty THEN 1
      ELSE 0
    END AS is_quantity_allowed;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_plan_rollup_status;
DELIMITER $$
CREATE PROCEDURE sp_plan_rollup_status (
  IN p_company_id INT,
  IN p_plan_id BIGINT,
  IN p_updated_by VARCHAR(50)
)
BEGIN
  DECLARE v_avg_completion DECIMAL(8,4) DEFAULT 0;

  SELECT COALESCE(AVG(COALESCE(completion_pct, 0)), 0)
    INTO v_avg_completion
  FROM plan_line
  WHERE company_id = p_company_id
    AND plan_id = p_plan_id
    AND deleted_at IS NULL;

  UPDATE plan_header
  SET status_code = CASE
      WHEN v_avg_completion >= 100 THEN 'completed'
      WHEN v_avg_completion > 0 THEN 'in_progress'
      ELSE 'not_started'
    END,
    updated_by = p_updated_by,
    updated_at = NOW()
  WHERE company_id = p_company_id
    AND id = p_plan_id;

  SELECT id AS plan_id, status_code, updated_at
  FROM plan_header
  WHERE company_id = p_company_id
    AND id = p_plan_id;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_plan_resource_validate;
DELIMITER $$
CREATE PROCEDURE sp_plan_resource_validate (
  IN p_company_id INT,
  IN p_plan_id BIGINT,
  IN p_plan_line_id BIGINT
)
BEGIN
  SELECT
    resource_type,
    resource_table,
    resource_record_id,
    COALESCE(SUM(quantity_planned), 0) AS total_qty_planned,
    COALESCE(SUM(quantity_allocated), 0) AS total_qty_allocated,
    COALESCE(SUM(quantity_used), 0) AS total_qty_used,
    COALESCE(SUM(amount_planned), 0) AS total_amt_planned,
    COALESCE(SUM(amount_allocated), 0) AS total_amt_allocated,
    COALESCE(SUM(amount_used), 0) AS total_amt_used,
    CASE WHEN COALESCE(SUM(quantity_allocated), 0) > COALESCE(SUM(quantity_planned), 0) THEN 1 ELSE 0 END AS qty_overflow,
    CASE WHEN COALESCE(SUM(amount_allocated), 0) > COALESCE(SUM(amount_planned), 0) THEN 1 ELSE 0 END AS amount_overflow
  FROM plan_resource_allocation
  WHERE company_id = p_company_id
    AND plan_id = p_plan_id
    AND (p_plan_line_id IS NULL OR plan_line_id = p_plan_line_id)
    AND deleted_at IS NULL
  GROUP BY resource_type, resource_table, resource_record_id;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_plan_generate_followup;
DELIMITER $$
CREATE PROCEDURE sp_plan_generate_followup (
  IN p_company_id INT,
  IN p_parent_plan_id BIGINT,
  IN p_plan_type_code VARCHAR(50),
  IN p_status_code VARCHAR(50),
  IN p_title VARCHAR(500),
  IN p_created_by VARCHAR(50)
)
BEGIN
  INSERT INTO plan_header (
    company_id,
    plan_no,
    plan_type_code,
    parent_plan_id,
    title,
    strategic_level,
    status_code,
    version_no,
    is_template,
    is_active,
    created_by,
    created_at,
    updated_by,
    updated_at
  )
  VALUES (
    p_company_id,
    CONCAT('PLN-', DATE_FORMAT(NOW(), '%Y%m%d%H%i%s'), '-', FLOOR(RAND() * 1000)),
    p_plan_type_code,
    p_parent_plan_id,
    p_title,
    'task',
    p_status_code,
    1,
    0,
    1,
    p_created_by,
    NOW(),
    p_created_by,
    NOW()
  );

  SELECT LAST_INSERT_ID() AS generated_plan_id;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_budget_consume_from_transaction;
DELIMITER $$
CREATE PROCEDURE sp_budget_consume_from_transaction (
  IN p_company_id INT,
  IN p_budget_id BIGINT,
  IN p_budget_line_id BIGINT,
  IN p_source_table VARCHAR(100),
  IN p_source_record_id BIGINT,
  IN p_journal_id BIGINT,
  IN p_period_key VARCHAR(20),
  IN p_amount_consumed DECIMAL(18,2),
  IN p_quantity_consumed DECIMAL(18,4),
  IN p_created_by VARCHAR(50)
)
BEGIN
  INSERT INTO budget_consumption (
    company_id,
    budget_id,
    budget_line_id,
    source_table,
    source_record_id,
    journal_id,
    period_key,
    amount_consumed,
    quantity_consumed,
    consumed_at,
    created_by,
    created_at
  )
  VALUES (
    p_company_id,
    p_budget_id,
    p_budget_line_id,
    p_source_table,
    p_source_record_id,
    p_journal_id,
    p_period_key,
    COALESCE(p_amount_consumed, 0),
    p_quantity_consumed,
    NOW(),
    p_created_by,
    NOW()
  );

  SELECT LAST_INSERT_ID() AS budget_consumption_id;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_dashboard_refresh_plan_budget_metrics;
DELIMITER $$
CREATE PROCEDURE sp_dashboard_refresh_plan_budget_metrics (
  IN p_company_id INT
)
BEGIN
  DELETE FROM dashboard_plan_budget_metrics
  WHERE company_id = p_company_id;

  INSERT INTO dashboard_plan_budget_metrics (company_id, metric_key, metric_label, metric_value, measured_at)
  SELECT p_company_id, 'plan_overdue_count', 'Plan Overdue Count', COUNT(*), NOW()
  FROM plan_header
  WHERE company_id = p_company_id
    AND deleted_at IS NULL
    AND end_date IS NOT NULL
    AND end_date < CURDATE()
    AND status_code NOT IN ('completed', 'closed');

  INSERT INTO dashboard_plan_budget_metrics (company_id, metric_key, metric_label, metric_value, measured_at)
  SELECT p_company_id, 'plan_completion_percent', 'Plan Completion Percent',
         COALESCE(AVG(COALESCE(pl.completion_pct, 0)), 0), NOW()
  FROM plan_line pl
  WHERE pl.company_id = p_company_id
    AND pl.deleted_at IS NULL;

  INSERT INTO dashboard_plan_budget_metrics (company_id, metric_key, metric_label, metric_value, measured_at)
  SELECT p_company_id, 'budget_utilization_percent', 'Budget Utilization Percent',
         CASE
           WHEN COALESCE(SUM(bl.amount), 0) = 0 THEN 0
           ELSE (COALESCE(SUM(bc.amount_consumed), 0) / COALESCE(SUM(bl.amount), 0)) * 100
         END,
         NOW()
  FROM budget_line bl
  LEFT JOIN budget_consumption bc
    ON bc.company_id = bl.company_id
   AND bc.budget_line_id = bl.id
  WHERE bl.company_id = p_company_id
    AND bl.deleted_at IS NULL;

  INSERT INTO dashboard_plan_budget_metrics (company_id, metric_key, metric_label, metric_value, measured_at)
  SELECT p_company_id, 'rule_violations_count', 'Rule Violations Count', COUNT(*), NOW()
  FROM rule_execution_log
  WHERE company_id = p_company_id
    AND execution_status IN ('blocked', 'failed', 'error')
    AND started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY);

  INSERT INTO dashboard_plan_budget_metrics (company_id, metric_key, metric_label, metric_value, measured_at)
  SELECT p_company_id, 'escalated_risk_notifications', 'Escalated Risk Notifications', COUNT(*), NOW()
  FROM notifications
  WHERE company_id = p_company_id
    AND escalation_status_code = 'escalated'
    AND deleted_at IS NULL;

  SELECT metric_key, metric_label, metric_value, measured_at
  FROM dashboard_plan_budget_metrics
  WHERE company_id = p_company_id
  ORDER BY metric_key;
END$$
DELIMITER ;
