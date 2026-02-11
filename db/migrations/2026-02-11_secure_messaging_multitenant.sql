START TRANSACTION;

-- Secure messaging hardening for MySQL deployments.
-- Rollback: drop added columns/indexes/triggers and optional seed rows.

ALTER TABLE erp_messages
  ADD COLUMN IF NOT EXISTS body_ciphertext MEDIUMTEXT NULL AFTER body,
  ADD COLUMN IF NOT EXISTS body_iv VARCHAR(32) NULL AFTER body_ciphertext,
  ADD COLUMN IF NOT EXISTS body_auth_tag VARCHAR(64) NULL AFTER body_iv,
  ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(16) NOT NULL DEFAULT 'company' AFTER linked_id,
  ADD COLUMN IF NOT EXISTS visibility_department_id BIGINT UNSIGNED NULL AFTER visibility_scope,
  ADD COLUMN IF NOT EXISTS visibility_empid VARCHAR(64) NULL AFTER visibility_department_id;

ALTER TABLE erp_messages
  ADD INDEX IF NOT EXISTS idx_messages_visibility (company_id, visibility_scope, visibility_department_id, visibility_empid),
  ADD INDEX IF NOT EXISTS idx_messages_author (company_id, author_empid);

ALTER TABLE erp_messages
  MODIFY COLUMN body TEXT NULL,
  ADD CONSTRAINT chk_messages_visibility_scope CHECK (visibility_scope IN ('company', 'department', 'private')),
  ADD CONSTRAINT chk_messages_encrypted_payload CHECK (
    (body IS NOT NULL)
    OR (body_ciphertext IS NOT NULL AND body_iv IS NOT NULL AND body_auth_tag IS NOT NULL)
  );

DROP TRIGGER IF EXISTS trg_erp_messages_parent_company_guard;
DELIMITER $$
CREATE TRIGGER trg_erp_messages_parent_company_guard
BEFORE INSERT ON erp_messages
FOR EACH ROW
BEGIN
  DECLARE parent_company_id BIGINT UNSIGNED;
  IF NEW.parent_message_id IS NOT NULL THEN
    SELECT company_id INTO parent_company_id
    FROM erp_messages
    WHERE id = NEW.parent_message_id
    LIMIT 1;

    IF parent_company_id IS NULL OR parent_company_id <> NEW.company_id THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'parent message must belong to the same company';
    END IF;
  END IF;
END$$
DELIMITER ;

INSERT INTO user_level_permissions (company_id, userlevel_id, action, action_key)
SELECT 0, 1, 'secure_messaging_moderate', 'secure_messaging_moderate'
WHERE NOT EXISTS (
  SELECT 1
  FROM user_level_permissions
  WHERE company_id = 0
    AND userlevel_id = 1
    AND action_key = 'secure_messaging_moderate'
);

COMMIT;
