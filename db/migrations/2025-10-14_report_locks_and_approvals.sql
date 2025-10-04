CREATE TABLE IF NOT EXISTS report_transaction_locks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id INT NULL,
  request_id BIGINT NOT NULL,
  table_name VARCHAR(128) NOT NULL,
  record_id VARCHAR(191) NOT NULL,
  status ENUM('pending', 'locked') NOT NULL DEFAULT 'pending',
  created_by VARCHAR(64) NULL,
  status_changed_by VARCHAR(64) NULL,
  status_changed_at DATETIME NULL,
  finalized_by VARCHAR(64) NULL,
  finalized_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_report_locks_request_record (request_id, table_name, record_id),
  KEY idx_report_locks_request (request_id),
  KEY idx_report_locks_table (table_name),
  KEY idx_report_locks_company (company_id),
  KEY idx_report_locks_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS report_approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id INT NULL,
  request_id BIGINT NOT NULL,
  procedure_name VARCHAR(191) NOT NULL,
  parameters_json JSON NOT NULL,
  approved_by VARCHAR(64) NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_report_approvals_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
