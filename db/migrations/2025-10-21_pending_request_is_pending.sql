-- Replace status column in pending_request unique index with generated is_pending flag
ALTER TABLE pending_request
  DROP INDEX idx_pending_unique,
  ADD COLUMN is_pending TINYINT(1)
    GENERATED ALWAYS AS (CASE WHEN status = 'pending' THEN 1 ELSE NULL END) STORED,
  ADD UNIQUE KEY idx_pending_unique (table_name, record_id, emp_id, request_type, is_pending);
