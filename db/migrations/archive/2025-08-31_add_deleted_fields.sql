-- Add deleted_by and deleted_at columns to all soft-deletable tables
-- Soft-deletable tables are identified by presence of typical soft delete columns
-- such as is_deleted or deleted flag.
DELIMITER $$
CREATE PROCEDURE add_deleted_audit_fields()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE t VARCHAR(191);
  DECLARE cur CURSOR FOR
    SELECT DISTINCT table_name
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND column_name IN ('is_deleted','deleted','deleted_at','isDeleted','deletedAt');
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO t;
    IF done THEN LEAVE read_loop; END IF;
    SET @stmt = CONCAT('ALTER TABLE `', t, '` '
      , 'ADD COLUMN IF NOT EXISTS `deleted_by` VARCHAR(50) NULL, '
      , 'ADD COLUMN IF NOT EXISTS `deleted_at` TIMESTAMP NULL');
    PREPARE s FROM @stmt;
    EXECUTE s;
    DEALLOCATE PREPARE s;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;
CALL add_deleted_audit_fields();
DROP PROCEDURE add_deleted_audit_fields;
