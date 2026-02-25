START TRANSACTION;

CREATE TABLE IF NOT EXISTS erp_message_conversation_backfill_report (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  parent_message_id BIGINT UNSIGNED NULL,
  issue_code VARCHAR(64) NOT NULL,
  issue_details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_message_backfill_company (company_id, created_at),
  KEY idx_message_backfill_message (message_id)
);

ALTER TABLE erp_messages
  ADD COLUMN IF NOT EXISTS conversation_id BIGINT UNSIGNED NULL AFTER parent_message_id;

UPDATE erp_messages
SET conversation_id = id
WHERE parent_message_id IS NULL
  AND conversation_id IS NULL;

DROP PROCEDURE IF EXISTS sp_backfill_message_conversation_id;
DELIMITER $$
CREATE PROCEDURE sp_backfill_message_conversation_id()
BEGIN
  DECLARE v_rows INT DEFAULT 1;

  WHILE v_rows > 0 DO
    UPDATE erp_messages child
    JOIN erp_messages parent ON parent.id = child.parent_message_id
    SET child.conversation_id = parent.conversation_id
    WHERE child.conversation_id IS NULL
      AND parent.conversation_id IS NOT NULL;

    SET v_rows = ROW_COUNT();
  END WHILE;

  INSERT INTO erp_message_conversation_backfill_report (company_id, message_id, parent_message_id, issue_code, issue_details)
  SELECT
    m.company_id,
    m.id,
    m.parent_message_id,
    CASE
      WHEN m.parent_message_id IS NOT NULL AND p.id IS NULL THEN 'PARENT_NOT_FOUND'
      ELSE 'AMBIGUOUS_CONVERSATION'
    END,
    JSON_OBJECT('fallback_conversation_id', m.id)
  FROM erp_messages m
  LEFT JOIN erp_messages p ON p.id = m.parent_message_id
  WHERE m.conversation_id IS NULL;

  UPDATE erp_messages
  SET conversation_id = id
  WHERE conversation_id IS NULL;
END$$
DELIMITER ;

CALL sp_backfill_message_conversation_id();
DROP PROCEDURE sp_backfill_message_conversation_id;

ALTER TABLE erp_messages
  MODIFY COLUMN conversation_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE erp_messages
  ADD INDEX IF NOT EXISTS idx_erp_messages_conversation (company_id, conversation_id),
  ADD INDEX IF NOT EXISTS idx_erp_messages_parent_conversation (parent_message_id, conversation_id);

DROP PROCEDURE IF EXISTS sp_replace_conversation_fk;
DELIMITER $$
CREATE PROCEDURE sp_replace_conversation_fk()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'erp_messages'
      AND CONSTRAINT_NAME = 'fk_erp_messages_conversation'
  ) THEN
    ALTER TABLE erp_messages DROP FOREIGN KEY fk_erp_messages_conversation;
  END IF;

  ALTER TABLE erp_messages
    ADD CONSTRAINT fk_erp_messages_conversation
      FOREIGN KEY (conversation_id) REFERENCES erp_messages(id)
      ON DELETE CASCADE;
END$$
DELIMITER ;

CALL sp_replace_conversation_fk();
DROP PROCEDURE sp_replace_conversation_fk;

DROP TRIGGER IF EXISTS trg_erp_messages_conversation_guard_insert;
DELIMITER $$
CREATE TRIGGER trg_erp_messages_conversation_guard_insert
BEFORE INSERT ON erp_messages
FOR EACH ROW
BEGIN
  DECLARE v_parent_conversation_id BIGINT UNSIGNED;
  DECLARE v_parent_company_id BIGINT UNSIGNED;

  IF NEW.parent_message_id IS NULL THEN
    IF NEW.conversation_id IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ROOT_CONVERSATION_REQUIRED';
    END IF;
  ELSE
    SELECT conversation_id, company_id
      INTO v_parent_conversation_id, v_parent_company_id
    FROM erp_messages
    WHERE id = NEW.parent_message_id
    LIMIT 1;

    IF v_parent_conversation_id IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'PARENT_NOT_FOUND';
    END IF;

    IF v_parent_company_id <> NEW.company_id THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'PARENT_COMPANY_MISMATCH';
    END IF;

    IF NEW.conversation_id IS NULL OR NEW.conversation_id <> v_parent_conversation_id THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'REPLY_CONVERSATION_MISMATCH';
    END IF;
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_erp_messages_conversation_guard_update;
DELIMITER $$
CREATE TRIGGER trg_erp_messages_conversation_guard_update
BEFORE UPDATE ON erp_messages
FOR EACH ROW
BEGIN
  IF OLD.conversation_id <> NEW.conversation_id THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'CONVERSATION_IMMUTABLE';
  END IF;
END$$
DELIMITER ;

COMMIT;
