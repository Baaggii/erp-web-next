-- Ensure user_activity_log.details can store large payloads
ALTER TABLE user_activity_log
  MODIFY COLUMN details JSON NULL;
