ALTER TABLE core_events
  ADD COLUMN next_retry_at DATETIME NULL AFTER retry_count,
  ADD COLUMN max_retry_count INT NOT NULL DEFAULT 5 AFTER next_retry_at;

CREATE TABLE IF NOT EXISTS core_event_action_dedup (
  dedup_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id INT NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  event_id BIGINT NULL,
  policy_id BIGINT NULL,
  action_index INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_action_dedup_company_key (company_id, idempotency_key),
  INDEX idx_event_action_dedup_event_policy (event_id, policy_id)
);
