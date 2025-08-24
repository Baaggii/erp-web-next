-- Prevent duplicate pending requests for the same record
ALTER TABLE pending_request
  ADD UNIQUE KEY idx_pending_unique (table_name, record_id, emp_id, request_type, status);
