-- Create audit table for POSAPI informational endpoint lookups
CREATE TABLE IF NOT EXISTS `posapi_info_audit` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `endpoint_id` varchar(191) NOT NULL,
  `company_id` bigint unsigned DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `table_name` varchar(191) DEFAULT NULL,
  `form_name` varchar(191) DEFAULT NULL,
  `record_id` varchar(191) DEFAULT NULL,
  `request_params` json DEFAULT NULL,
  `response_body` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_posapi_info_audit_endpoint` (`endpoint_id`),
  KEY `idx_posapi_info_audit_company_created` (`company_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
