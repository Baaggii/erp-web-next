-- Conversation/message participant tables for conversation-scoped messaging

CREATE TABLE IF NOT EXISTS erp_conversation_participants (
  conversation_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  empid VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, empid),
  KEY idx_erp_conversation_participants_company_emp (company_id, empid),
  CONSTRAINT fk_erp_conversation_participants_conversation
    FOREIGN KEY (conversation_id) REFERENCES erp_conversations(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_message_participants (
  message_id BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  empid VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, empid),
  KEY idx_erp_message_participants_conversation (conversation_id, company_id, empid),
  CONSTRAINT fk_erp_message_participants_message
    FOREIGN KEY (message_id) REFERENCES erp_messages(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_erp_message_participants_conversation
    FOREIGN KEY (conversation_id) REFERENCES erp_conversations(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Existing private conversations that were incorrectly marked company become private.
UPDATE erp_conversations
SET visibility_scope = 'private'
WHERE visibility_scope = 'company'
  AND visibility_empid IS NOT NULL
  AND TRIM(visibility_empid) <> '';

WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 32
)
INSERT INTO erp_conversation_participants (conversation_id, company_id, empid)
SELECT DISTINCT c.id, c.company_id,
       TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(c.visibility_empid, ',', seq.n), ',', -1)) AS empid
FROM erp_conversations c
JOIN seq
  ON seq.n <= 1 + LENGTH(c.visibility_empid) - LENGTH(REPLACE(c.visibility_empid, ',', ''))
WHERE c.visibility_scope = 'private'
  AND c.visibility_empid IS NOT NULL
  AND TRIM(c.visibility_empid) <> ''
  AND TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(c.visibility_empid, ',', seq.n), ',', -1)) <> ''
ON DUPLICATE KEY UPDATE empid = VALUES(empid);

WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 32
)
INSERT INTO erp_message_participants (message_id, conversation_id, company_id, empid)
SELECT DISTINCT m.id, m.conversation_id, m.company_id,
       TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(m.visibility_empid, ',', seq.n), ',', -1)) AS empid
FROM erp_messages m
JOIN seq
  ON seq.n <= 1 + LENGTH(m.visibility_empid) - LENGTH(REPLACE(m.visibility_empid, ',', ''))
WHERE m.visibility_scope = 'private'
  AND m.conversation_id IS NOT NULL
  AND m.visibility_empid IS NOT NULL
  AND TRIM(m.visibility_empid) <> ''
  AND TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(m.visibility_empid, ',', seq.n), ',', -1)) <> ''
ON DUPLICATE KEY UPDATE empid = VALUES(empid);
