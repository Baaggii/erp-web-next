START TRANSACTION;

-- Enforce linked context consistency, tenant requirements, and bounded thread depth.

DROP PROCEDURE IF EXISTS sp_messaging_company_not_null;
DELIMITER $$
CREATE PROCEDURE sp_messaging_company_not_null()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'erp_messages'
      AND COLUMN_NAME = 'company_id'
      AND IS_NULLABLE = 'YES'
  ) THEN
    ALTER TABLE erp_messages
      MODIFY COLUMN company_id BIGINT UNSIGNED NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'erp_message_threads'
      AND COLUMN_NAME = 'company_id'
      AND IS_NULLABLE = 'YES'
  ) THEN
    ALTER TABLE erp_message_threads
      MODIFY COLUMN company_id BIGINT UNSIGNED NOT NULL;
  END IF;
END$$
DELIMITER ;

CALL sp_messaging_company_not_null();
DROP PROCEDURE sp_messaging_company_not_null;

ALTER TABLE erp_messages
  ADD COLUMN IF NOT EXISTS depth INT NOT NULL DEFAULT 0 AFTER parent_message_id;

DROP PROCEDURE IF EXISTS sp_replace_linked_context_check;
DELIMITER $$
CREATE PROCEDURE sp_replace_linked_context_check()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'erp_messages'
      AND CONSTRAINT_NAME = 'chk_erp_messages_linked_context'
      AND CONSTRAINT_TYPE = 'CHECK'
  ) THEN
    ALTER TABLE erp_messages
      DROP CHECK chk_erp_messages_linked_context;
  END IF;

  ALTER TABLE erp_messages
    ADD CONSTRAINT chk_erp_messages_linked_context
    CHECK (
      (linked_type IS NULL AND linked_id IS NULL)
      OR
      (linked_type IS NOT NULL AND linked_id IS NOT NULL)
    );
END$$
DELIMITER ;

CALL sp_replace_linked_context_check();
DROP PROCEDURE sp_replace_linked_context_check;

DROP TRIGGER IF EXISTS trg_erp_messages_depth_guard;
DELIMITER $$
CREATE TRIGGER trg_erp_messages_depth_guard
BEFORE INSERT ON erp_messages
FOR EACH ROW
BEGIN
  DECLARE v_parent_id BIGINT UNSIGNED;
  DECLARE v_next_parent_id BIGINT UNSIGNED;
  DECLARE v_depth INT DEFAULT 0;
  DECLARE v_max_depth INT DEFAULT 3;

  SET v_parent_id = NEW.parent_message_id;

  WHILE v_parent_id IS NOT NULL DO
    SET v_depth = v_depth + 1;

    IF v_depth > v_max_depth THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'message thread depth cannot exceed 3';
    END IF;

    SELECT parent_message_id
      INTO v_next_parent_id
    FROM erp_messages
    WHERE id = v_parent_id
    LIMIT 1;

    IF v_next_parent_id IS NULL AND NOT EXISTS (
      SELECT 1
      FROM erp_messages
      WHERE id = v_parent_id
      LIMIT 1
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'parent message does not exist';
    END IF;

    SET v_parent_id = v_next_parent_id;
  END WHILE;

  SET NEW.depth = v_depth;
END$$
DELIMITER ;

COMMIT;
