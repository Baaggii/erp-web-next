CREATE TABLE IF NOT EXISTS policy_drafts (
  policy_draft_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id INT NOT NULL,
  policy_name VARCHAR(255) NOT NULL,
  policy_key VARCHAR(120) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  module_key VARCHAR(80) NULL,
  priority INT NOT NULL DEFAULT 100,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  condition_json JSON NOT NULL,
  action_json JSON NOT NULL,
  created_by VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(50) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_policy_drafts_company_key (company_id, policy_key),
  INDEX idx_policy_drafts_company_updated (company_id, updated_at)
);

CREATE TABLE IF NOT EXISTS policy_versions (
  version_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  policy_id BIGINT NOT NULL,
  company_id INT NOT NULL,
  condition_json JSON NOT NULL,
  action_json JSON NOT NULL,
  version_number INT NOT NULL,
  created_by VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_policy_versions_policy_version (policy_id, version_number),
  INDEX idx_policy_versions_company_policy (company_id, policy_id, created_at)
);
