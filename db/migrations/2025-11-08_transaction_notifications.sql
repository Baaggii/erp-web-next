-- Add transaction notifications support
ALTER TABLE notifications
  MODIFY type ENUM('request','response','transaction') NOT NULL,
  ADD COLUMN transaction_name VARCHAR(191) DEFAULT NULL AFTER message,
  ADD COLUMN transaction_table VARCHAR(191) DEFAULT NULL AFTER transaction_name,
  ADD COLUMN record_id VARCHAR(191) DEFAULT NULL AFTER transaction_table,
  ADD COLUMN action VARCHAR(20) DEFAULT NULL AFTER record_id,
  ADD KEY idx_notifications_recipient (recipient_empid),
  ADD KEY idx_notifications_is_read (is_read),
  ADD KEY idx_notifications_created_at (created_at),
  ADD KEY idx_notifications_transaction_name (transaction_name);
