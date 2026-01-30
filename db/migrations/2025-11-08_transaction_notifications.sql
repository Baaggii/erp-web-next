-- Add transaction notification support and async job queue

CREATE TABLE IF NOT EXISTS notification_jobs (
  id bigint NOT NULL AUTO_INCREMENT,
  table_name varchar(100) NOT NULL,
  record_id varchar(191) NOT NULL,
  company_id int NOT NULL,
  action enum('create','update') NOT NULL,
  created_by_empid varchar(50) DEFAULT NULL,
  status enum('queued','processing','done','failed') NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  last_error text DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notification_jobs_status (status, created_at),
  KEY idx_notification_jobs_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE notifications
  MODIFY type enum('request','response','transaction') NOT NULL,
  ADD COLUMN transaction_name varchar(255) DEFAULT NULL AFTER message,
  ADD COLUMN transaction_table varchar(100) DEFAULT NULL AFTER transaction_name,
  ADD COLUMN transaction_record_id varchar(191) DEFAULT NULL AFTER transaction_table,
  ADD COLUMN action enum('create','update') DEFAULT NULL AFTER transaction_record_id,
  ADD COLUMN summary text DEFAULT NULL AFTER action;
