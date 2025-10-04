ALTER TABLE report_approvals
  ADD COLUMN snapshot_file_path VARCHAR(255) NULL AFTER approved_at,
  ADD COLUMN snapshot_file_name VARCHAR(191) NULL AFTER snapshot_file_path,
  ADD COLUMN snapshot_file_mime VARCHAR(64) NULL AFTER snapshot_file_name,
  ADD COLUMN snapshot_file_size BIGINT NULL AFTER snapshot_file_mime,
  ADD COLUMN snapshot_archived_at DATETIME NULL AFTER snapshot_file_size;
