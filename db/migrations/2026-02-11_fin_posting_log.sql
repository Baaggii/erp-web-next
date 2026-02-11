CREATE TABLE IF NOT EXISTS fin_posting_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_table VARCHAR(128) NOT NULL,
  source_id BIGINT NOT NULL,
  status ENUM('SUCCESS', 'FAILED') NOT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fin_posting_log_source (source_table, source_id),
  KEY idx_fin_posting_log_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
