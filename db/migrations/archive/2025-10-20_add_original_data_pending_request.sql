-- Add original_data column to pending_request
ALTER TABLE pending_request
  ADD COLUMN original_data JSON NULL AFTER proposed_data;
