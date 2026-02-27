START TRANSACTION;

ALTER TABLE erp_conversations
  ADD INDEX idx_erp_conversations_visibility_scope (company_id, visibility_scope),
  ADD INDEX idx_erp_conversations_visibility_empid (company_id, visibility_empid(128));

CREATE TABLE IF NOT EXISTS erp_conversation_participants (
  conversation_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  empid VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, empid),
  KEY idx_erp_conversation_participants_company (company_id, empid, conversation_id),
  CONSTRAINT fk_erp_conversation_participants_conversation
    FOREIGN KEY (conversation_id) REFERENCES erp_conversations(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_message_participants (
  message_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  empid VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, empid),
  KEY idx_erp_message_participants_company (company_id, empid, message_id),
  CONSTRAINT fk_erp_message_participants_message
    FOREIGN KEY (message_id) REFERENCES erp_messages(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE erp_conversations
SET visibility_scope = 'private'
WHERE visibility_scope = 'company'
  AND visibility_empid IS NOT NULL
  AND TRIM(visibility_empid) <> '';

INSERT IGNORE INTO erp_conversation_participants (conversation_id, company_id, empid)
SELECT c.id,
       c.company_id,
       jt.empid
FROM erp_conversations c
JOIN JSON_TABLE(
  CONCAT('["', REPLACE(REPLACE(IFNULL(c.visibility_empid, ''), ' ', ''), ',', '","'), '"]'),
  '$[*]' COLUMNS (empid VARCHAR(64) PATH '$')
) jt
WHERE c.visibility_scope = 'private'
  AND jt.empid IS NOT NULL
  AND jt.empid <> '';

INSERT IGNORE INTO erp_message_participants (message_id, company_id, empid)
SELECT m.id,
       m.company_id,
       jt.empid
FROM erp_messages m
JOIN JSON_TABLE(
  CONCAT('["', REPLACE(REPLACE(IFNULL(m.visibility_empid, ''), ' ', ''), ',', '","'), '"]'),
  '$[*]' COLUMNS (empid VARCHAR(64) PATH '$')
) jt
WHERE m.visibility_scope = 'private'
  AND jt.empid IS NOT NULL
  AND jt.empid <> '';

COMMIT;
