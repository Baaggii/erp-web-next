-- Step 1: enforce NOT NULL on company_id for messaging message/thread tables.
-- This migration intentionally implements only company_id nullability hardening.

SET @db_name := DATABASE();

-- Normalize existing nulls before tightening constraints.
SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'erp_messages'
      AND column_name = 'company_id'
  ),
  'UPDATE erp_messages SET company_id = 0 WHERE company_id IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'erp_message_threads'
      AND column_name = 'company_id'
  ),
  'UPDATE erp_message_threads SET company_id = 0 WHERE company_id IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'erp_threads'
      AND column_name = 'company_id'
  ),
  'UPDATE erp_threads SET company_id = 0 WHERE company_id IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Enforce NOT NULL and retain integer unsigned shape for tenant/company keys.
SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'erp_messages'
      AND column_name = 'company_id'
  ),
  'ALTER TABLE erp_messages MODIFY COLUMN company_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'erp_message_threads'
      AND column_name = 'company_id'
  ),
  'ALTER TABLE erp_message_threads MODIFY COLUMN company_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'erp_threads'
      AND column_name = 'company_id'
  ),
  'ALTER TABLE erp_threads MODIFY COLUMN company_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
