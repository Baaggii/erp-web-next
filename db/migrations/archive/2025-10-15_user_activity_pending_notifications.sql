-- Add tables for user activity log and pending edit/delete workflow

-- 1. Activity log for all data‑modifying operations
CREATE TABLE IF NOT EXISTS user_activity_log (
  log_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  emp_id          VARCHAR(10) NOT NULL,
  table_name      VARCHAR(100) NOT NULL,
  record_id       BIGINT NOT NULL,
  action          ENUM('create','update','delete','request_edit','request_delete','approve','decline') NOT NULL,
  details         JSON NULL,
  request_id      BIGINT NULL,
  timestamp       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_activity_emp (emp_id),
  KEY idx_user_activity_request (request_id)
);

-- 2. Pending edit/delete requests awaiting approval
CREATE TABLE IF NOT EXISTS pending_request (
  request_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name      VARCHAR(100) NOT NULL,
  record_id       BIGINT NOT NULL,
  emp_id          VARCHAR(10) NOT NULL,
  senior_empid    VARCHAR(10) NOT NULL,
  request_type    ENUM('edit','delete') NOT NULL,
  proposed_data   JSON NULL,
  status          ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at    TIMESTAMP NULL,
  response_empid  VARCHAR(10) NULL,
  response_notes  TEXT NULL,
  KEY idx_pending_status_senior (status, senior_empid),
  KEY idx_pending_emp (emp_id),
  CONSTRAINT fk_pending_emp FOREIGN KEY (emp_id) REFERENCES tbl_employment(employment_emp_id),
  CONSTRAINT fk_pending_senior FOREIGN KEY (senior_empid) REFERENCES tbl_employment(employment_emp_id)
);

-- 3. Notifications table for dashboard alerts
CREATE TABLE IF NOT EXISTS notifications (
  notification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  recipient_empid VARCHAR(10) NOT NULL,
  type            ENUM('request','response') NOT NULL,
  related_id      BIGINT NOT NULL,
  message         TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notifications_recipient (recipient_empid)
);

-- Foreign key from activity log to pending requests
ALTER TABLE user_activity_log
  ADD CONSTRAINT fk_activity_request FOREIGN KEY (request_id) REFERENCES pending_request(request_id);
