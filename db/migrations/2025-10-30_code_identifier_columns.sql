-- Standardize identifier columns for hierarchical code tables
ALTER TABLE `code_chiglel`
  ADD COLUMN IF NOT EXISTS `chig_id` varchar(50) DEFAULT NULL AFTER `id`;

DROP INDEX IF EXISTS `uniq_company_chig_id` ON `code_chiglel`;
ALTER TABLE `code_chiglel`
  ADD UNIQUE KEY `uniq_company_chig_id` (`company_id`, `chig_id`);

ALTER TABLE `code_torol`
  ADD COLUMN IF NOT EXISTS `torol_id` varchar(50) DEFAULT NULL AFTER `id`;

DROP INDEX IF EXISTS `uniq_company_torol_id` ON `code_torol`;
ALTER TABLE `code_torol`
  ADD UNIQUE KEY `uniq_company_torol_id` (`company_id`, `torol_id`);

SET @huvaari_has_baitsaagch := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'code_huvaari'
    AND COLUMN_NAME = 'baitsaagch_id'
);

SET @huvaari_stmt := IF(
  @huvaari_has_baitsaagch > 0,
  'ALTER TABLE `code_huvaari` CHANGE COLUMN `baitsaagch_id` `huvaari_id` INT NOT NULL AFTER `id`',
  'ALTER TABLE `code_huvaari` ADD COLUMN IF NOT EXISTS `huvaari_id` INT NOT NULL AFTER `id`'
);

PREPARE stmt FROM @huvaari_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `code_huvaari`
  MODIFY COLUMN `huvaari_id` INT NOT NULL AFTER `id`;

DROP INDEX IF EXISTS `uniq_company_baitsaagch_id` ON `code_huvaari`;
DROP INDEX IF EXISTS `uniq_company_huvaari_id` ON `code_huvaari`;
ALTER TABLE `code_huvaari`
  ADD UNIQUE KEY `uniq_company_huvaari_id` (`company_id`, `huvaari_id`);
