DELIMITER $$
CREATE PROCEDURE `create_tenant_temp_table`(
  IN src_table_name VARCHAR(100),
  IN tmp_table_name VARCHAR(100),
  IN company_id INT
)
BEGIN
  DECLARE v_is_shared BOOLEAN DEFAULT 0;
  DECLARE v_seed_on_create BOOLEAN DEFAULT 0;
  DECLARE v_condition TEXT;
  DECLARE v_deleted_at_exists INT DEFAULT 0;
  DECLARE v_where_clause TEXT;

  SET @drop_sql = CONCAT('DROP TEMPORARY TABLE IF EXISTS ', tmp_table_name);
  PREPARE stmt FROM @drop_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SELECT COALESCE(is_shared,0), COALESCE(seed_on_create,0)
    INTO v_is_shared, v_seed_on_create
  FROM tenant_tables
  WHERE table_name = src_table_name
  LIMIT 1;

  IF v_is_shared <> 1 THEN
    SET v_condition = CONCAT('company_id = ', company_id);
  ELSE
    SET v_condition = '1=1';
  END IF;

  SELECT COUNT(*) INTO v_deleted_at_exists
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = src_table_name
    AND column_name = 'deleted_at';

  IF v_deleted_at_exists > 0 THEN
    SET v_where_clause = CONCAT('WHERE ', v_condition, ' AND deleted_at IS NULL');
  ELSE
    SET v_where_clause = CONCAT('WHERE ', v_condition);
  END IF;

  SET @saved_mode := @@SESSION.sql_mode;
  SET SESSION sql_mode =
    REPLACE(REPLACE(REPLACE(@saved_mode,
      'STRICT_TRANS_TABLES',''),
      'NO_ZERO_DATE',''),
      'NO_ZERO_IN_DATE','');

  SET @create_sql = CONCAT(
    'CREATE TEMPORARY TABLE ', tmp_table_name, ' ENGINE=InnoDB AS ',
    'SELECT * FROM ', src_table_name, ' ', v_where_clause
  );
  PREPARE stmt FROM @create_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  IF @saved_mode IS NOT NULL THEN
    SET SESSION sql_mode = @saved_mode;
  END IF;
END $$
DELIMITER ;
