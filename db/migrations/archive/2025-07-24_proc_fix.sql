-- Recreate stored procedures without modifying transactions table
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

DROP PROCEDURE IF EXISTS calculate_stock_per_branch;
DELIMITER $$
CREATE PROCEDURE calculate_stock_per_branch(
  IN p_branch_id INT,
  IN p_inventory_id INT,
  IN p_as_of_date DATE,
  OUT sp_current_stock DECIMAL(18,4)
)
BEGIN
  SELECT IFNULL(SUM(qty), 0)
    INTO sp_current_stock
    FROM inventory_transactions
   WHERE branch_id = p_branch_id
     AND inventory_id = p_inventory_id
     AND transaction_date <= IFNULL(p_as_of_date, NOW());
END $$
DELIMITER ;

