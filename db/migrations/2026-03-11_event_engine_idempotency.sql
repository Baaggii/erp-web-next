ALTER TABLE core_events
  ADD COLUMN IF NOT EXISTS next_retry_at DATETIME NULL AFTER retry_count,
  ADD INDEX IF NOT EXISTS idx_core_events_retry_schedule (status, next_retry_at, retry_count);

CREATE TABLE IF NOT EXISTS core_event_action_dedup (
  dedup_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  idempotency_key VARCHAR(255) NOT NULL,
  event_id BIGINT NULL,
  policy_id BIGINT NULL,
  action_type VARCHAR(80) NOT NULL,
  action_index INT NOT NULL,
  company_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_action_idempotency_key (idempotency_key),
  INDEX idx_event_action_company (company_id, created_at)
);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) NULL,
  ADD UNIQUE KEY IF NOT EXISTS uq_notifications_idempotency_key (idempotency_key);
