-- Add identifier columns for hierarchical code tables
ALTER TABLE `code_chiglel`
  ADD COLUMN `chig_id` varchar(50) DEFAULT NULL AFTER `id`,
  ADD UNIQUE KEY `uniq_company_chig_id` (`company_id`, `chig_id`);

ALTER TABLE `code_torol`
  ADD COLUMN `torol_id` int NOT NULL AFTER `id`,
  ADD UNIQUE KEY `uniq_company_torol_id` (`company_id`, `torol_id`);

ALTER TABLE `code_huvaari`
  ADD COLUMN `baitsaagch_id` varchar(50) DEFAULT NULL AFTER `position_id`,
  ADD UNIQUE KEY `uniq_company_baitsaagch_id` (`company_id`, `baitsaagch_id`);
