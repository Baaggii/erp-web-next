START TRANSACTION;

ALTER TABLE erp_message_idempotency
  ADD COLUMN IF NOT EXISTS request_hash CHAR(64) NULL AFTER message_id,
  ADD COLUMN IF NOT EXISTS expires_at DATETIME NULL AFTER request_hash;

ALTER TABLE erp_message_idempotency
  ADD INDEX IF NOT EXISTS idx_erp_message_idempotency_expires_at (expires_at);

COMMIT;
