ALTER TABLE core_events
  ADD COLUMN IF NOT EXISTS next_retry_at DATETIME NULL AFTER retry_count,
  ADD INDEX idx_core_events_retry_schedule (status, next_retry_at);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) NULL AFTER created_by,
  ADD UNIQUE KEY uq_notifications_idempotency (company_id, idempotency_key);

CREATE TABLE IF NOT EXISTS core_event_action_dedup (
  dedup_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id BIGINT NOT NULL,
  policy_id BIGINT NOT NULL,
  action_type VARCHAR(80) NOT NULL,
  action_index INT NOT NULL,
  action_key VARCHAR(255) NOT NULL,
  company_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_action_key (company_id, action_key),
  INDEX idx_event_action_lookup (event_id, policy_id, action_type, action_index)
);
