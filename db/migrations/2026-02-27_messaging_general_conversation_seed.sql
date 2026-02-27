START TRANSACTION;

INSERT INTO erp_conversations (company_id, type, created_by_empid)
SELECT seed.company_id, 'general', 'system'
FROM (
  SELECT DISTINCT company_id FROM erp_conversations
  UNION
  SELECT DISTINCT company_id FROM erp_messages
) seed
LEFT JOIN erp_conversations existing
  ON existing.company_id = seed.company_id
 AND existing.type = 'general'
 AND existing.deleted_at IS NULL
WHERE seed.company_id IS NOT NULL
  AND existing.id IS NULL;

COMMIT;
