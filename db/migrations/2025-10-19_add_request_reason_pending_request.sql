-- Add request_reason column to pending_request
ALTER TABLE pending_request
  ADD COLUMN request_reason TEXT NOT NULL AFTER request_type;
