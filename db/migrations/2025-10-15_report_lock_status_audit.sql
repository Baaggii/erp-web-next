ALTER TABLE report_transaction_locks
  ADD COLUMN IF NOT EXISTS status_changed_by VARCHAR(32) NULL AFTER created_by,
  ADD COLUMN IF NOT EXISTS status_changed_at DATETIME NULL AFTER status_changed_by;
