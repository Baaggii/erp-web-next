-- Add created_by and created_at columns to all tables missing them
-- This migration checks INFORMATION_SCHEMA and alters tables accordingly.

DELIMITER $$
CREATE PROCEDURE add_created_fields()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE tbl VARCHAR(255);
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

    -- Add created_by if missing
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = tbl
         AND COLUMN_NAME = 'created_by'
    ) THEN
      SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `created_by` varchar(50) NULL;');
      PREPARE stmt FROM @s;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;

    -- Add created_at if missing
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = tbl
         AND COLUMN_NAME = 'created_at'
    ) THEN
      SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;');
      PREPARE stmt FROM @s;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;

CALL add_created_fields();
DROP PROCEDURE add_created_fields;
