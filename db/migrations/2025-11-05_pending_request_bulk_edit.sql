-- Expand pending_request.request_type enum to support bulk edits.
ALTER TABLE `pending_request`
  MODIFY COLUMN `request_type` enum('edit','delete','report_approval','bulk_edit') NOT NULL;
