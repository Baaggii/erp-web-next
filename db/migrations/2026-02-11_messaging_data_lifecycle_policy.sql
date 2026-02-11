-- Messaging data lifecycle policy (retention, legal hold, purge workflow, defensible deletion)
-- Multi-tenant safe: every policy + workflow row is scoped by company_id.

CREATE TABLE IF NOT EXISTS erp_message_retention_policies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  message_class ENUM('general', 'financial', 'hr_sensitive', 'legal') NOT NULL,
  retention_days INT UNSIGNED NOT NULL,
  purge_mode ENUM('soft_delete', 'hard_delete') NOT NULL DEFAULT 'soft_delete',
  requires_dual_approval TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version_no INT UNSIGNED NOT NULL DEFAULT 1,
  notes VARCHAR(500) NULL,
  created_by VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(64) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_erp_retention_company_class_active (company_id, message_class, is_active),
  KEY idx_erp_retention_company (company_id),
  KEY idx_erp_retention_class (message_class)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_legal_holds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  hold_name VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('draft', 'active', 'released', 'cancelled') NOT NULL DEFAULT 'draft',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  created_by VARCHAR(64) NOT NULL,
  approved_by VARCHAR(64) NULL,
  approved_at DATETIME NULL,
  released_by VARCHAR(64) NULL,
  released_at DATETIME NULL,
  release_reason TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_erp_legal_holds_company_status (company_id, status),
  KEY idx_erp_legal_holds_active_window (starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_legal_hold_scopes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_hold_id BIGINT UNSIGNED NOT NULL,
  scope_type ENUM('user', 'conversation', 'linked_entity', 'company') NOT NULL,
  target_company_id BIGINT UNSIGNED NULL,
  target_user_empid VARCHAR(64) NULL,
  target_conversation_id VARCHAR(128) NULL,
  linked_entity_type ENUM('transaction', 'plan', 'topic', 'other') NULL,
  linked_entity_id VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_erp_hold_scopes_hold (legal_hold_id),
  KEY idx_erp_hold_scopes_user (target_user_empid),
  KEY idx_erp_hold_scopes_conversation (target_conversation_id),
  KEY idx_erp_hold_scopes_linked (linked_entity_type, linked_entity_id),
  CONSTRAINT fk_erp_hold_scopes_hold
    FOREIGN KEY (legal_hold_id) REFERENCES erp_legal_holds(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_message_purge_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  mode ENUM('dry_run', 'execute') NOT NULL,
  status ENUM('queued', 'awaiting_approval', 'approved', 'running', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'queued',
  requested_by VARCHAR(64) NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by VARCHAR(64) NULL,
  approved_at DATETIME NULL,
  executed_by VARCHAR(64) NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  rollback_token CHAR(36) NULL,
  summary_json JSON NULL,
  failure_reason TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_erp_purge_runs_company_status (company_id, status),
  KEY idx_erp_purge_runs_requested_at (requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_message_purge_candidates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purge_run_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  message_class ENUM('general', 'financial', 'hr_sensitive', 'legal') NOT NULL,
  retention_deadline DATETIME NOT NULL,
  hold_blocked TINYINT(1) NOT NULL DEFAULT 0,
  hold_id BIGINT UNSIGNED NULL,
  decision ENUM('eligible', 'blocked_hold', 'blocked_policy', 'error') NOT NULL,
  decision_reason VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_erp_purge_candidate_run_message (purge_run_id, message_id),
  KEY idx_erp_purge_candidate_run (purge_run_id),
  KEY idx_erp_purge_candidate_message (message_id),
  CONSTRAINT fk_erp_purge_candidate_run
    FOREIGN KEY (purge_run_id) REFERENCES erp_message_purge_runs(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_erp_purge_candidate_hold
    FOREIGN KEY (hold_id) REFERENCES erp_legal_holds(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_message_purge_approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purge_run_id BIGINT UNSIGNED NOT NULL,
  approver_empid VARCHAR(64) NOT NULL,
  decision ENUM('approve', 'reject') NOT NULL,
  comment VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_erp_purge_approval_once (purge_run_id, approver_empid),
  KEY idx_erp_purge_approval_run (purge_run_id),
  CONSTRAINT fk_erp_purge_approval_run
    FOREIGN KEY (purge_run_id) REFERENCES erp_message_purge_runs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_message_chain_of_custody (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purge_run_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  action ENUM('identified', 'approved', 'deleted', 'certificate_issued') NOT NULL,
  actor_empid VARCHAR(64) NOT NULL,
  evidence_json JSON NULL,
  previous_hash CHAR(64) NULL,
  record_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_erp_chain_run (purge_run_id),
  KEY idx_erp_chain_company (company_id),
  KEY idx_erp_chain_message (message_id),
  KEY idx_erp_chain_hash (record_hash),
  CONSTRAINT fk_erp_chain_run
    FOREIGN KEY (purge_run_id) REFERENCES erp_message_purge_runs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_message_deletion_certificates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  purge_run_id BIGINT UNSIGNED NOT NULL,
  certificate_no VARCHAR(64) NOT NULL,
  generated_by VARCHAR(64) NOT NULL,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json JSON NOT NULL,
  signature_hash CHAR(64) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_erp_deletion_certificate_no (certificate_no),
  UNIQUE KEY uq_erp_deletion_certificate_run (purge_run_id),
  KEY idx_erp_deletion_certificate_company (company_id),
  CONSTRAINT fk_erp_deletion_certificate_run
    FOREIGN KEY (purge_run_id) REFERENCES erp_message_purge_runs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE erp_messages
  ADD COLUMN IF NOT EXISTS message_class ENUM('general', 'financial', 'hr_sensitive', 'legal') NOT NULL DEFAULT 'general' AFTER body,
  ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(128) NULL AFTER parent_message_id,
  ADD COLUMN IF NOT EXISTS linked_entity_type ENUM('transaction', 'plan', 'topic', 'other') NULL AFTER plan_id,
  ADD COLUMN IF NOT EXISTS purge_deleted_at DATETIME NULL AFTER deleted_at,
  ADD KEY idx_erp_messages_company_class_created (company_id, message_class, created_at),
  ADD KEY idx_erp_messages_conversation (conversation_id),
  ADD KEY idx_erp_messages_linked_entity (linked_entity_type, transaction_id, plan_id);
