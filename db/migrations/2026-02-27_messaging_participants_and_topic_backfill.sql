START TRANSACTION;

ALTER TABLE erp_messages
  MODIFY COLUMN message_class ENUM('general', 'private', 'financial', 'hr_sensitive', 'legal') NOT NULL DEFAULT 'general';

CREATE TABLE IF NOT EXISTS erp_conversation_participants (
  company_id BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  empid VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, conversation_id, empid),
  KEY idx_erp_conversation_participants_empid (company_id, empid, conversation_id),
  CONSTRAINT fk_erp_conversation_participants_conversation
    FOREIGN KEY (conversation_id) REFERENCES erp_conversations(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS erp_message_participants (
  company_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  empid VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, message_id, empid),
  KEY idx_erp_message_participants_empid (company_id, empid, message_id),
  CONSTRAINT fk_erp_message_participants_message
    FOREIGN KEY (message_id) REFERENCES erp_messages(id)
    ON DELETE CASCADE
);

INSERT IGNORE INTO erp_conversation_participants (company_id, conversation_id, empid)
SELECT c.company_id, c.id, jt.empid
FROM erp_conversations c
JOIN JSON_TABLE(
  CONCAT('["', REPLACE(REPLACE(COALESCE(c.visibility_empid, ''), ' ', ''), ',', '","'), '"]'),
  '$[*]' COLUMNS (empid VARCHAR(64) PATH '$')
) jt
WHERE c.visibility_scope = 'private'
  AND COALESCE(TRIM(c.visibility_empid), '') <> ''
  AND COALESCE(TRIM(jt.empid), '') <> '';

INSERT IGNORE INTO erp_message_participants (company_id, message_id, empid)
SELECT m.company_id, m.id, jt.empid
FROM erp_messages m
JOIN JSON_TABLE(
  CONCAT('["', REPLACE(REPLACE(COALESCE(m.visibility_empid, ''), ' ', ''), ',', '","'), '"]'),
  '$[*]' COLUMNS (empid VARCHAR(64) PATH '$')
) jt
WHERE m.visibility_scope = 'private'
  AND COALESCE(TRIM(m.visibility_empid), '') <> ''
  AND COALESCE(TRIM(jt.empid), '') <> '';

UPDATE erp_messages
SET topic = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(body, ']', 1), '[', -1)),
    body = LTRIM(SUBSTRING(body, LOCATE(']', body) + 1))
WHERE (topic IS NULL OR topic = '')
  AND body REGEXP '^\\[[^]]{1,120}\\][[:space:]]+';

COMMIT;
