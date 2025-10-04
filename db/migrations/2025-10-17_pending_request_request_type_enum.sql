-- Expand pending_request.request_type enum to support report approvals.
-- Existing values remain valid; the ALTER simply appends the new enum member.

ALTER TABLE `pending_request`
  MODIFY `request_type` ENUM('edit','delete','report_approval') NOT NULL;
