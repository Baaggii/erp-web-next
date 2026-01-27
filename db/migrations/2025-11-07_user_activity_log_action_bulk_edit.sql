-- Expand user_activity_log.action enum to support bulk edit workflow actions.
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
    'decline_report',
    'request_bulk_edit',
    'approve_bulk_edit',
    'decline_bulk_edit'
  ) NOT NULL;
