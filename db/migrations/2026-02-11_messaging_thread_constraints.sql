START TRANSACTION;

-- Enforce tenant + thread integrity for messaging tables.

DROP PROCEDURE IF EXISTS sp_apply_company_id_not_null;
DELIMITER $$
CREATE PROCEDURE sp_apply_company_id_not_null()
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

CALL sp_apply_company_id_not_null();
DROP PROCEDURE sp_apply_company_id_not_null;


DROP PROCEDURE IF EXISTS sp_drop_linked_context_check;
DELIMITER $$
CREATE PROCEDURE sp_drop_linked_context_check()
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
END$$
DELIMITER ;

CALL sp_drop_linked_context_check();
DROP PROCEDURE sp_drop_linked_context_check;

-- linked_type and linked_id must be both present or both NULL.
-- Restrict linked_type to the supported domain when set.
ALTER TABLE erp_messages
  ADD CONSTRAINT chk_erp_messages_linked_context
  CHECK (
    (linked_type IS NULL AND linked_id IS NULL)
    OR (
      linked_type IN ('transaction', 'plan', 'topic')
      AND linked_id IS NOT NULL
    )
  );

-- Prevent unbounded thread depth on insert.
DROP TRIGGER IF EXISTS trg_erp_messages_depth_guard;
DELIMITER $$
CREATE TRIGGER trg_erp_messages_depth_guard
BEFORE INSERT ON erp_messages
FOR EACH ROW
BEGIN
  DECLARE v_parent_id BIGINT UNSIGNED;
  DECLARE v_next_parent_id BIGINT UNSIGNED;
  DECLARE v_depth INT DEFAULT 0;

  SET v_parent_id = NEW.parent_message_id;

  WHILE v_parent_id IS NOT NULL DO
    SET v_depth = v_depth + 1;

    IF v_depth > 3 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'message thread depth cannot exceed 3';
    END IF;

    SELECT parent_message_id
      INTO v_next_parent_id
    FROM erp_messages
    WHERE id = v_parent_id
    LIMIT 1;

    IF v_next_parent_id IS NULL THEN
      -- Break when parent is root OR parent does not exist.
      -- Distinguish missing-parent by checking existence.
      IF NOT EXISTS (
        SELECT 1
        FROM erp_messages
        WHERE id = v_parent_id
        LIMIT 1
      ) THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'parent message does not exist';
      END IF;
    END IF;

    SET v_parent_id = v_next_parent_id;
  END WHILE;
END$$
DELIMITER ;

COMMIT;
