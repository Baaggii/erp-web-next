-- Replace inventory metadata helpers with static implementations so that
-- triggers can call them without triggering the "Dynamic SQL is not allowed"
-- error that occurs when prepared statements run inside triggers.
DROP PROCEDURE IF EXISTS resolve_inventory_metadata;
DELIMITER $$
CREATE PROCEDURE resolve_inventory_metadata(
  IN p_inventory_id INT,
  OUT sp_primary_code VARCHAR(50),
  OUT sp_selling_code VARCHAR(50),
  OUT sp_pm_name VARCHAR(255),
  OUT sp_pm_unit_id INT,
  OUT sp_categories INT,
  OUT sp_manufacturer_id INT,
  OUT sp_cost DECIMAL(18,4),
  OUT sp_cost_date DATE,
  OUT sp_source_table VARCHAR(50)
)
BEGIN
  SELECT primary_code,
         selling_code,
         pm_name,
         pm_unit_id,
         categories,
         manufacturer_id,
         cost,
         cost_date,
         'product_cost'
    INTO sp_primary_code,
         sp_selling_code,
         sp_pm_name,
         sp_pm_unit_id,
         sp_categories,
         sp_manufacturer_id,
         sp_cost,
         sp_cost_date,
         sp_source_table
    FROM product_cost
   WHERE id = p_inventory_id
   LIMIT 1;

  IF ROW_COUNT() = 0 THEN
    SET sp_primary_code = NULL;
    SET sp_selling_code = NULL;
    SET sp_pm_name = NULL;
    SET sp_pm_unit_id = NULL;
    SET sp_categories = NULL;
    SET sp_manufacturer_id = NULL;
    SET sp_cost = NULL;
    SET sp_cost_date = NULL;
    SET sp_source_table = NULL;
  END IF;
END $$
DELIMITER ;

DROP PROCEDURE IF EXISTS resolve_inventory_metadatas;
DELIMITER $$
CREATE PROCEDURE resolve_inventory_metadatas(
  IN p_inventory_id INT,
  OUT sp_primary_code VARCHAR(50),
  OUT sp_selling_code VARCHAR(50),
  OUT sp_pm_name VARCHAR(255),
  OUT sp_pm_unit_id INT,
  OUT sp_categories INT,
  OUT sp_manufacturer_id INT,
  OUT sp_cost DECIMAL(18,4),
  OUT sp_cost_date DATE,
  OUT sp_source_table VARCHAR(50)
)
BEGIN
  -- Delegate to the singular procedure that already avoids dynamic SQL.
  CALL resolve_inventory_metadata(
    p_inventory_id,
    sp_primary_code,
    sp_selling_code,
    sp_pm_name,
    sp_pm_unit_id,
    sp_categories,
    sp_manufacturer_id,
    sp_cost,
    sp_cost_date,
    sp_source_table
  );
END $$
DELIMITER ;
