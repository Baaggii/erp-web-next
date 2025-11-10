CREATE TABLE IF NOT EXISTS posapi_info_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT NULL,
  user_id BIGINT NULL,
  table_name VARCHAR(191) NULL,
  form_name VARCHAR(191) NULL,
  endpoint_id VARCHAR(191) NOT NULL,
  request_method VARCHAR(16) NOT NULL,
  request_path VARCHAR(255) NOT NULL,
  request_query JSON NULL,
  request_body JSON NULL,
  response_status INT NULL,
  response_body JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_posapi_info_company_created_at (company_id, created_at),
  KEY idx_posapi_info_endpoint_created_at (endpoint_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
