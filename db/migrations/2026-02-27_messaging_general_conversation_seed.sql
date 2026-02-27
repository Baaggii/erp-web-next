START TRANSACTION;

INSERT INTO erp_conversations (
  company_id,
  linked_type,
  linked_id,
  visibility_scope,
  visibility_department_id,
  visibility_empid,
  created_by_empid,
  created_at,
  last_message_id,
  last_message_at
)
SELECT
  seed.company_id,
  NULL,
  NULL,
  'company',
  NULL,
  NULL,
  'system',
  CURRENT_TIMESTAMP,
  NULL,
  NULL
FROM (
  SELECT DISTINCT company_id FROM erp_messages
  UNION
  SELECT DISTINCT company_id FROM erp_conversations
) seed
LEFT JOIN erp_conversations existing
  ON existing.company_id = seed.company_id
 AND existing.deleted_at IS NULL
 AND existing.linked_type IS NULL
 AND existing.linked_id IS NULL
 AND existing.visibility_scope = 'company'
WHERE seed.company_id IS NOT NULL
  AND existing.id IS NULL;

UPDATE erp_conversations c
LEFT JOIN (
  SELECT m.conversation_id, MAX(m.id) AS last_message_id, MAX(m.created_at) AS last_message_at
  FROM erp_messages m
  WHERE m.deleted_at IS NULL
  GROUP BY m.conversation_id
) agg ON agg.conversation_id = c.id
SET c.last_message_id = agg.last_message_id,
    c.last_message_at = agg.last_message_at
WHERE c.deleted_at IS NULL;

COMMIT;
