CREATE TABLE IF NOT EXISTS security_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event VARCHAR(120) NOT NULL,
  user_id VARCHAR(64) NULL,
  company_id BIGINT UNSIGNED NULL,
  `timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details JSON NULL,
  PRIMARY KEY (id),
  KEY idx_security_audit_events_company_timestamp (company_id, `timestamp`),
  KEY idx_security_audit_events_user_timestamp (user_id, `timestamp`),
  KEY idx_security_audit_events_event_timestamp (event, `timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
