START TRANSACTION;

CREATE TABLE IF NOT EXISTS erp_conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  linked_type VARCHAR(64) NULL,
  linked_id VARCHAR(128) NULL,
  visibility_scope ENUM('company','department','private') NOT NULL DEFAULT 'company',
  visibility_department_id BIGINT UNSIGNED NULL,
  visibility_empid VARCHAR(255) NULL,
  created_by_empid VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_id BIGINT UNSIGNED NULL,
  last_message_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by_empid VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY idx_erp_conversations_company_activity (company_id, last_message_at DESC, id DESC),
  KEY idx_erp_conversations_linked (company_id, linked_type, linked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_message_conversation_repair_report (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  parent_message_id BIGINT UNSIGNED NULL,
  issue_code VARCHAR(64) NOT NULL,
  issue_details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_message_repair_company (company_id, created_at),
  KEY idx_message_repair_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO erp_conversations (
  company_id, linked_type, linked_id, visibility_scope, visibility_department_id, visibility_empid, created_by_empid, created_at, last_message_id, last_message_at
)
SELECT
  m.company_id,
  m.linked_type,
  m.linked_id,
  COALESCE(m.visibility_scope, 'company'),
  m.visibility_department_id,
  m.visibility_empid,
  COALESCE(NULLIF(m.author_empid, ''), 'system'),
  COALESCE(m.created_at, CURRENT_TIMESTAMP),
  NULL,
  COALESCE(m.created_at, CURRENT_TIMESTAMP)
FROM erp_messages m
LEFT JOIN erp_conversations existing
  ON existing.company_id = m.company_id
 AND existing.linked_type <=> m.linked_type
 AND existing.linked_id <=> m.linked_id
 AND existing.created_at = COALESCE(m.created_at, CURRENT_TIMESTAMP)
WHERE m.parent_message_id IS NULL
  AND existing.id IS NULL;

UPDATE erp_messages root
JOIN erp_conversations c
  ON c.company_id = root.company_id
 AND c.linked_type <=> root.linked_type
 AND c.linked_id <=> root.linked_id
 AND c.created_at = COALESCE(root.created_at, CURRENT_TIMESTAMP)
SET root.conversation_id = c.id
WHERE root.parent_message_id IS NULL
  AND (root.conversation_id IS NULL OR root.conversation_id = root.id);

DROP PROCEDURE IF EXISTS sp_backfill_conversation_ids_from_parent;
DELIMITER $$
CREATE PROCEDURE sp_backfill_conversation_ids_from_parent()
BEGIN
  DECLARE v_rows INT DEFAULT 1;

  WHILE v_rows > 0 DO
    UPDATE erp_messages child
    JOIN erp_messages parent ON parent.id = child.parent_message_id AND parent.company_id = child.company_id
    SET child.conversation_id = parent.conversation_id
    WHERE child.conversation_id IS NULL
      AND parent.conversation_id IS NOT NULL;
    SET v_rows = ROW_COUNT();
  END WHILE;
END$$
DELIMITER ;

CALL sp_backfill_conversation_ids_from_parent();
DROP PROCEDURE sp_backfill_conversation_ids_from_parent;

INSERT INTO erp_message_conversation_repair_report (company_id, message_id, parent_message_id, issue_code, issue_details)
SELECT m.company_id, m.id, m.parent_message_id, 'UNRESOLVED_LEGACY_THREAD',
       JSON_OBJECT('reason', 'unable_to_resolve_conversation_id')
FROM erp_messages m
WHERE m.conversation_id IS NULL;

ALTER TABLE erp_messages
  MODIFY COLUMN conversation_id BIGINT UNSIGNED NOT NULL,
  ADD INDEX idx_erp_messages_company_conversation_id_desc (company_id, conversation_id, id DESC);

ALTER TABLE erp_messages
  DROP FOREIGN KEY fk_erp_messages_conversation;

ALTER TABLE erp_messages
  ADD CONSTRAINT fk_erp_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES erp_conversations(id)
    ON DELETE RESTRICT;

ALTER TABLE erp_conversations
  ADD CONSTRAINT fk_erp_conversations_last_message
    FOREIGN KEY (last_message_id) REFERENCES erp_messages(id)
    ON DELETE SET NULL;

UPDATE erp_conversations c
JOIN (
  SELECT m.conversation_id, MAX(m.id) AS last_message_id, MAX(m.created_at) AS last_message_at
  FROM erp_messages m
  WHERE m.deleted_at IS NULL
  GROUP BY m.conversation_id
) agg ON agg.conversation_id = c.id
SET c.last_message_id = agg.last_message_id,
    c.last_message_at = agg.last_message_at;

DROP TRIGGER IF EXISTS trg_erp_messages_parent_same_conversation;
DELIMITER $$
CREATE TRIGGER trg_erp_messages_parent_same_conversation
BEFORE INSERT ON erp_messages
FOR EACH ROW
BEGIN
  DECLARE v_parent_conversation_id BIGINT UNSIGNED;
  DECLARE v_parent_company_id BIGINT UNSIGNED;

  IF NEW.parent_message_id IS NOT NULL THEN
    SELECT conversation_id, company_id
      INTO v_parent_conversation_id, v_parent_company_id
    FROM erp_messages
    WHERE id = NEW.parent_message_id
    LIMIT 1;

    IF v_parent_conversation_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PARENT_MESSAGE_NOT_FOUND';
    END IF;

    IF v_parent_company_id <> NEW.company_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PARENT_COMPANY_MISMATCH';
    END IF;

    IF NEW.conversation_id <> v_parent_conversation_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CONVERSATION_MISMATCH';
    END IF;
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_erp_messages_conversation_id_immutable;
DELIMITER $$
CREATE TRIGGER trg_erp_messages_conversation_id_immutable
BEFORE UPDATE ON erp_messages
FOR EACH ROW
BEGIN
  IF OLD.conversation_id <> NEW.conversation_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CONVERSATION_IMMUTABLE';
  END IF;
END$$
DELIMITER ;

COMMIT;
