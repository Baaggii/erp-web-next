-- Ensure code_chiglel identifiers use integer values and enforced uniqueness
ALTER TABLE `code_chiglel`
  MODIFY COLUMN `chig_id` int NOT NULL,
  DROP INDEX `uniq_company_chig_id`,
  ADD UNIQUE KEY `uniq_company_chig_id` (`company_id`, `chig_id`);
