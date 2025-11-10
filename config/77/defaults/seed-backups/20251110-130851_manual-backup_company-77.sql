-- Tenant seed backup
-- Company ID: 77
-- Backup name: Manual Backup
-- Generated at: 2025-11-10T13:08:51.818Z
-- Requested by: 5

START TRANSACTION;

-- Table: posts
DELETE FROM `posts` WHERE `company_id` = 77;
INSERT INTO `posts` (`id`, `company_id`, `title`) VALUES (10, 77, 'Hello');
INSERT INTO `posts` (`id`, `company_id`, `title`) VALUES (11, 77, 'World');

COMMIT;