-- Ensure audit columns exist with consistent definitions across all base tables
DELIMITER $$
CREATE PROCEDURE ensure_standard_audit_columns()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE tbl VARCHAR(255);
  DECLARE has_col INT;

  DECLARE cur CURSOR FOR
    SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_TYPE = 'BASE TABLE';

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO tbl;
    IF done THEN
      LEAVE read_loop;
    END IF;

    -- created_at
    SELECT COUNT(*) INTO has_col
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = tbl
       AND COLUMN_NAME = 'created_at';
    IF has_col = 0 THEN
      SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;
    SELECT COUNT(*) INTO has_col
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = tbl
       AND COLUMN_NAME = 'created_at';
    IF has_col > 0 THEN
      SET @sql = CONCAT('UPDATE `', tbl, '` SET `created_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP);');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
      SET @sql = CONCAT('ALTER TABLE `', tbl, '` MODIFY COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;

    -- created_by
    SELECT COUNT(*) INTO has_col
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = tbl
       AND COLUMN_NAME = 'created_by';
    IF has_col = 0 THEN
      SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `created_by` VARCHAR(50) NULL;');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;
    SELECT COUNT(*) INTO has_col
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = tbl
       AND COLUMN_NAME = 'created_by';
    IF has_col > 0 THEN
      SET @sql = CONCAT('ALTER TABLE `', tbl, '` MODIFY COLUMN `created_by` VARCHAR(50) NULL;');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
      SET @sql = CONCAT('UPDATE `', tbl, '` SET `created_by` = IFNULL(NULLIF(`created_by`, ''), ''system'');');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
      SET @sql = CONCAT('ALTER TABLE `', tbl, '` MODIFY COLUMN `created_by` VARCHAR(50) NOT NULL;');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;

    -- updated_at
    SELECT COUNT(*) INTO has_col
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = tbl
       AND COLUMN_NAME = 'updated_at';
    IF has_col = 0 THEN
      SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;
    SELECT COUNT(*) INTO has_col
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = tbl
       AND COLUMN_NAME = 'updated_at';
    IF has_col > 0 THEN
      SET @sql = CONCAT('UPDATE `', tbl, '` SET `updated_at` = COALESCE(`updated_at`, CURRENT_TIMESTAMP);');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
      SET @sql = CONCAT('ALTER TABLE `', tbl, '` MODIFY COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;

    -- updated_by
    SELECT COUNT(*) INTO has_col
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = tbl
       AND COLUMN_NAME = 'updated_by';
    IF has_col = 0 THEN
      SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `updated_by` VARCHAR(50) DEFAULT NULL;');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;
    SELECT COUNT(*) INTO has_col
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = tbl
       AND COLUMN_NAME = 'updated_by';
    IF has_col > 0 THEN
      SET @sql = CONCAT('ALTER TABLE `', tbl, '` MODIFY COLUMN `updated_by` VARCHAR(50) DEFAULT NULL;');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;

    -- deleted_at
    SELECT COUNT(*) INTO has_col
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = tbl
       AND COLUMN_NAME = 'deleted_at';
    IF has_col = 0 THEN
      SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `deleted_at` TIMESTAMP NULL DEFAULT NULL;');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;
    SELECT COUNT(*) INTO has_col
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = tbl
       AND COLUMN_NAME = 'deleted_at';
    IF has_col > 0 THEN
      SET @sql = CONCAT('ALTER TABLE `', tbl, '` MODIFY COLUMN `deleted_at` TIMESTAMP NULL DEFAULT NULL;');
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;

  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;

CALL ensure_standard_audit_columns();
DROP PROCEDURE ensure_standard_audit_columns;
