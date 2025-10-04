-- Update record_id columns to support string identifiers

-- Ensure the user activity FK is dropped before altering columns when present
SET @drop_fk_activity_request = (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE `user_activity_log` DROP FOREIGN KEY `fk_activity_request`;',
    'SELECT 1'
  )
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_activity_log'
    AND CONSTRAINT_NAME = 'fk_activity_request'
);
PREPARE stmt FROM @drop_fk_activity_request;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE pending_request
  DROP INDEX idx_pending_unique;

-- 2. Alter record_id column types
ALTER TABLE pending_request
  MODIFY record_id varchar(191) NOT NULL;

ALTER TABLE user_activity_log
  MODIFY record_id varchar(191) NOT NULL;

ALTER TABLE pending_request
  ADD UNIQUE KEY idx_pending_unique (table_name, record_id, emp_id, request_type, is_pending);

ALTER TABLE user_activity_log
  ADD CONSTRAINT fk_activity_request FOREIGN KEY (request_id)
    REFERENCES pending_request (request_id);
