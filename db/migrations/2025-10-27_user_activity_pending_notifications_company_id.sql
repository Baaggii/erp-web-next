-- Add company_id to user_activity_log, pending_request, and notifications with proper indexing and FKs

-- 1. user_activity_log
ALTER TABLE user_activity_log
  ADD COLUMN company_id INT NOT NULL DEFAULT 0 AFTER log_id,
  ADD KEY idx_user_activity_log_company_id (company_id),
  ADD CONSTRAINT fk_user_activity_log_company FOREIGN KEY (company_id) REFERENCES companies(id);

-- Drop and recreate FK to pending_request with company_id
ALTER TABLE user_activity_log
  DROP FOREIGN KEY fk_activity_request,
  ADD CONSTRAINT fk_activity_request FOREIGN KEY (company_id, request_id)
    REFERENCES pending_request (company_id, request_id);

-- 2. pending_request
ALTER TABLE pending_request
  ADD COLUMN company_id INT NOT NULL DEFAULT 0 AFTER request_id,
  ADD KEY idx_pending_request_company_id (company_id),
  ADD UNIQUE KEY u_pending_request_company_request (company_id, request_id),
  ADD CONSTRAINT fk_pending_request_company FOREIGN KEY (company_id) REFERENCES companies(id);

-- 3. notifications
ALTER TABLE notifications
  ADD COLUMN company_id INT NOT NULL DEFAULT 0 AFTER notification_id,
  ADD KEY idx_notifications_company_id (company_id),
  ADD KEY idx_notifications_company_request (company_id, related_id),
  ADD CONSTRAINT fk_notifications_company FOREIGN KEY (company_id) REFERENCES companies(id);

-- Drop and recreate FK to pending_request with company_id
ALTER TABLE notifications
  DROP FOREIGN KEY fk_notifications_request,
  ADD CONSTRAINT fk_notifications_request FOREIGN KEY (company_id, related_id)
    REFERENCES pending_request (company_id, request_id);
