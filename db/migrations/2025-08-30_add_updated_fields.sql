-- Add updated_by and updated_at columns to all tables missing them
-- Mirrors indexes and foreign keys from created_by when present

DELIMITER $$
CREATE PROCEDURE add_updated_fields()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE tbl VARCHAR(255);
  DECLARE fk_ref_table VARCHAR(255);
  DECLARE fk_ref_column VARCHAR(255);
  DECLARE fk_name VARCHAR(255);
  DECLARE idx_name VARCHAR(255);
  DECLARE idx_unique INT;
  DECLARE cur CURSOR FOR
    SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_TYPE = 'BASE TABLE'; -- skip VIEWS
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO tbl;
    IF done THEN
      LEAVE read_loop;
    END IF;

    -- Add updated_by if missing
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = tbl
         AND COLUMN_NAME = 'updated_by'
    ) THEN
      SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `updated_by` varchar(50) NULL;');
      PREPARE stmt FROM @s;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;

    -- Add updated_at if missing
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = tbl
         AND COLUMN_NAME = 'updated_at'
    ) THEN
      SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;');
      PREPARE stmt FROM @s;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;

    -- Mirror foreign key from created_by
    IF EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = tbl
         AND COLUMN_NAME = 'created_by'
         AND REFERENCED_TABLE_NAME IS NOT NULL
    ) THEN
      -- fetch referenced table and column
      SELECT REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME INTO fk_ref_table, fk_ref_column
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = tbl
         AND COLUMN_NAME = 'created_by'
         AND REFERENCED_TABLE_NAME IS NOT NULL
       LIMIT 1;

      IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = tbl
           AND COLUMN_NAME = 'updated_by'
      ) AND NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = tbl
           AND COLUMN_NAME = 'updated_by'
           AND REFERENCED_TABLE_NAME IS NOT NULL
      ) THEN
        SET fk_name = CONCAT('fk_', tbl, '_updated_by');
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD CONSTRAINT `', fk_name, '` FOREIGN KEY (`updated_by`) REFERENCES `', fk_ref_table, '`(`', fk_ref_column, '`);');
        PREPARE stmt FROM @s;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
      END IF;
    END IF;

    -- Mirror index from created_by
    IF EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = tbl
         AND COLUMN_NAME = 'created_by'
    ) THEN
      IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = tbl
           AND COLUMN_NAME = 'updated_by'
      ) AND NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = tbl
           AND COLUMN_NAME = 'updated_by'
      ) THEN
        SELECT NON_UNIQUE INTO idx_unique
          FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = tbl
           AND COLUMN_NAME = 'created_by'
         LIMIT 1;
        SET idx_name = CONCAT('idx_', tbl, '_updated_by');
        IF idx_unique = 0 THEN
          SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD UNIQUE INDEX `', idx_name, '` (`updated_by`);');
        ELSE
          SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx_name, '` (`updated_by`);');
        END IF;
        PREPARE stmt FROM @s;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
      END IF;
    END IF;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;

CALL add_updated_fields();
DROP PROCEDURE add_updated_fields;
