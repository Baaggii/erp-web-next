-- Expand user_activity_log.action enum to support report approval workflow actions.
-- Existing values remain unchanged; the ALTER appends the new verbs.

ALTER TABLE `user_activity_log`
  MODIFY `action` ENUM(
    'create',
    'update',
    'delete',
    'request_edit',
    'request_delete',
    'approve',
    'decline',
    'request_report_approval',
    'approve_report',
    'decline_report'
  ) NOT NULL;
