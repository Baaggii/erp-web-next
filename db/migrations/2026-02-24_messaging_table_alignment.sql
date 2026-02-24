START TRANSACTION;

-- Align legacy messaging table dumps with runtime expectations in messagingService.

ALTER TABLE erp_messages
  ADD COLUMN IF NOT EXISTS linked_type VARCHAR(32) NULL AFTER parent_message_id,
  ADD COLUMN IF NOT EXISTS linked_id VARCHAR(128) NULL AFTER linked_type,
  ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(16) NOT NULL DEFAULT 'company' AFTER linked_id,
  ADD COLUMN IF NOT EXISTS visibility_department_id BIGINT UNSIGNED NULL AFTER visibility_scope,
  ADD COLUMN IF NOT EXISTS visibility_empid VARCHAR(255) NULL AFTER visibility_department_id,
  ADD COLUMN IF NOT EXISTS body_ciphertext MEDIUMTEXT NULL AFTER body,
  ADD COLUMN IF NOT EXISTS body_iv VARCHAR(32) NULL AFTER body_ciphertext,
  ADD COLUMN IF NOT EXISTS body_auth_tag VARCHAR(64) NULL AFTER body_iv,
  ADD COLUMN IF NOT EXISTS deleted_by_empid VARCHAR(64) NULL AFTER deleted_at,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(64) NULL AFTER deleted_by_empid,
  ADD COLUMN IF NOT EXISTS depth INT NOT NULL DEFAULT 0 AFTER parent_message_id;

ALTER TABLE erp_messages
  ADD INDEX IF NOT EXISTS idx_messages_visibility (company_id, visibility_scope, visibility_department_id, visibility_empid),
  ADD INDEX IF NOT EXISTS idx_messages_linked (company_id, linked_type, linked_id);

ALTER TABLE erp_message_idempotency
  ADD COLUMN IF NOT EXISTS request_hash CHAR(64) NULL AFTER message_id,
  ADD COLUMN IF NOT EXISTS expires_at DATETIME NULL AFTER request_hash,
  ADD INDEX IF NOT EXISTS idx_erp_message_idempotency_expires_at (expires_at);

ALTER TABLE erp_message_receipts
  MODIFY COLUMN company_id BIGINT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE erp_message_recipients
  MODIFY COLUMN company_id BIGINT UNSIGNED NOT NULL DEFAULT 0;

COMMIT;
