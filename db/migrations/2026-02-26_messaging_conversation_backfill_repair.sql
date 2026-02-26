-- Messaging conversation backfill and repair
-- Enforces canonical conversation identity for legacy rows.

CREATE TABLE IF NOT EXISTS erp_message_conversation_repair_report (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  issue_code VARCHAR(64) NOT NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_repair_report_message (message_id),
  KEY idx_repair_report_issue (issue_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1) Ensure roots always self-reference conversation id.
UPDATE erp_messages
SET conversation_id = id
WHERE parent_message_id IS NULL
  AND (conversation_id IS NULL OR conversation_id <> id);

-- 2) Backfill missing conversation_id for replies from ancestor chain.
WITH RECURSIVE ancestry AS (
  SELECT id, company_id, parent_message_id, conversation_id, id AS walk_id
  FROM erp_messages
  WHERE conversation_id IS NULL
  UNION ALL
  SELECT a.id, a.company_id, p.parent_message_id, p.conversation_id, p.id AS walk_id
  FROM ancestry a
  JOIN erp_messages p ON p.id = a.parent_message_id AND p.company_id = a.company_id
  WHERE a.conversation_id IS NULL
)
UPDATE erp_messages m
JOIN (
  SELECT id, MAX(conversation_id) AS resolved_conversation_id
  FROM ancestry
  WHERE conversation_id IS NOT NULL
  GROUP BY id
) resolved ON resolved.id = m.id
SET m.conversation_id = resolved.resolved_conversation_id
WHERE m.conversation_id IS NULL;

-- 3) Align replies to parent's conversation.
UPDATE erp_messages child
JOIN erp_messages parent
  ON parent.id = child.parent_message_id
 AND parent.company_id = child.company_id
SET child.conversation_id = parent.conversation_id
WHERE child.parent_message_id IS NOT NULL
  AND (child.conversation_id IS NULL OR child.conversation_id <> parent.conversation_id);

-- 4) Report unresolved rows for manual correction.
INSERT INTO erp_message_conversation_repair_report (message_id, company_id, issue_code, details)
SELECT m.id, m.company_id, 'UNRESOLVED_CONVERSATION_ID',
       JSON_OBJECT('parent_message_id', m.parent_message_id)
FROM erp_messages m
WHERE m.conversation_id IS NULL;

INSERT INTO erp_message_conversation_repair_report (message_id, company_id, issue_code, details)
SELECT child.id, child.company_id, 'PARENT_CONVERSATION_MISMATCH',
       JSON_OBJECT(
         'parent_message_id', child.parent_message_id,
         'parent_conversation_id', parent.conversation_id,
         'child_conversation_id', child.conversation_id
       )
FROM erp_messages child
JOIN erp_messages parent
  ON parent.id = child.parent_message_id
 AND parent.company_id = child.company_id
WHERE child.parent_message_id IS NOT NULL
  AND child.conversation_id <> parent.conversation_id;
