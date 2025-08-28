-- Ensure inventory transaction triggers call read-only procedures
-- and avoid modifying the table within the trigger context.

DROP TRIGGER IF EXISTS `transactions_inventory_bi`;
DELIMITER $$
CREATE TRIGGER `transactions_inventory_bi` BEFORE INSERT ON `transactions_inventory`
FOR EACH ROW
BEGIN
  DECLARE v_primary_code VARCHAR(50);
  DECLARE v_selling_code VARCHAR(50);
  DECLARE v_pm_name VARCHAR(255);
  DECLARE v_pm_unit_id INT;
  DECLARE v_categories INT;
  DECLARE v_manufacturer_id INT;
  DECLARE v_cost DECIMAL(18,4);
  DECLARE v_cost_date DATE;
  DECLARE v_source_table VARCHAR(50);
  DECLARE v_stock DECIMAL(18,4);

  CALL resolve_inventory_metadata(
    NEW.bmtr_pmid,
    v_primary_code,
    v_selling_code,
    v_pm_name,
    v_pm_unit_id,
    v_categories,
    v_manufacturer_id,
    v_cost,
    v_cost_date,
    v_source_table
  );

  CALL calculate_stock_per_branch(
    NEW.bmtr_transbranch,
    NEW.bmtr_pmid,
    NEW.bmtr_date,
    v_stock
  );

  SET NEW.sp_primary_code = v_primary_code;
  SET NEW.sp_selling_code = v_selling_code;
  SET NEW.sp_pm_name = v_pm_name;
  SET NEW.sp_pm_unit_id = v_pm_unit_id;
  SET NEW.sp_categories = v_categories;
  SET NEW.sp_manufacturer_id = v_manufacturer_id;
  SET NEW.sp_cost = v_cost;
  SET NEW.sp_cost_date = v_cost_date;
  SET NEW.sp_source_table = v_source_table;
  SET NEW.sp_current_stock = v_stock;
END $$
DELIMITER ;

DROP TRIGGER IF EXISTS `transactions_inventory_bu`;
DELIMITER $$
CREATE TRIGGER `transactions_inventory_bu` BEFORE UPDATE ON `transactions_inventory`
FOR EACH ROW
BEGIN
  DECLARE v_primary_code VARCHAR(50);
  DECLARE v_selling_code VARCHAR(50);
  DECLARE v_pm_name VARCHAR(255);
  DECLARE v_pm_unit_id INT;
  DECLARE v_categories INT;
  DECLARE v_manufacturer_id INT;
  DECLARE v_cost DECIMAL(18,4);
  DECLARE v_cost_date DATE;
  DECLARE v_source_table VARCHAR(50);
  DECLARE v_stock DECIMAL(18,4);

  CALL resolve_inventory_metadata(
    NEW.bmtr_pmid,
    v_primary_code,
    v_selling_code,
    v_pm_name,
    v_pm_unit_id,
    v_categories,
    v_manufacturer_id,
    v_cost,
    v_cost_date,
    v_source_table
  );

  CALL calculate_stock_per_branch(
    NEW.bmtr_transbranch,
    NEW.bmtr_pmid,
    NEW.bmtr_date,
    v_stock
  );

  SET NEW.sp_primary_code = v_primary_code;
  SET NEW.sp_selling_code = v_selling_code;
  SET NEW.sp_pm_name = v_pm_name;
  SET NEW.sp_pm_unit_id = v_pm_unit_id;
  SET NEW.sp_categories = v_categories;
  SET NEW.sp_manufacturer_id = v_manufacturer_id;
  SET NEW.sp_cost = v_cost;
  SET NEW.sp_cost_date = v_cost_date;
  SET NEW.sp_source_table = v_source_table;
  SET NEW.sp_current_stock = v_stock;
END $$
DELIMITER ;

-- Repeat for expense transactions
DROP TRIGGER IF EXISTS `transactions_expense_bi`;
DELIMITER $$
CREATE TRIGGER `transactions_expense_bi` BEFORE INSERT ON `transactions_expense`
FOR EACH ROW
BEGIN
  DECLARE v_primary_code VARCHAR(50);
  DECLARE v_selling_code VARCHAR(50);
  DECLARE v_pm_name VARCHAR(255);
  DECLARE v_pm_unit_id INT;
  DECLARE v_categories INT;
  DECLARE v_manufacturer_id INT;
  DECLARE v_cost DECIMAL(18,4);
  DECLARE v_cost_date DATE;
  DECLARE v_source_table VARCHAR(50);

  CALL resolve_inventory_metadata(
    NEW.bmte_pmid,
    v_primary_code,
    v_selling_code,
    v_pm_name,
    v_pm_unit_id,
    v_categories,
    v_manufacturer_id,
    v_cost,
    v_cost_date,
    v_source_table
  );

  SET NEW.sp_primary_code = v_primary_code;
  SET NEW.sp_selling_code = v_selling_code;
  SET NEW.sp_pm_name = v_pm_name;
  SET NEW.sp_pm_unit_id = v_pm_unit_id;
  SET NEW.sp_categories = v_categories;
  SET NEW.sp_manufacturer_id = v_manufacturer_id;
  SET NEW.sp_cost = v_cost;
  SET NEW.sp_cost_date = v_cost_date;
  SET NEW.sp_source_table = v_source_table;
END $$
DELIMITER ;

DROP TRIGGER IF EXISTS `transactions_expense_bu`;
DELIMITER $$
CREATE TRIGGER `transactions_expense_bu` BEFORE UPDATE ON `transactions_expense`
FOR EACH ROW
BEGIN
  DECLARE v_primary_code VARCHAR(50);
  DECLARE v_selling_code VARCHAR(50);
  DECLARE v_pm_name VARCHAR(255);
  DECLARE v_pm_unit_id INT;
  DECLARE v_categories INT;
  DECLARE v_manufacturer_id INT;
  DECLARE v_cost DECIMAL(18,4);
  DECLARE v_cost_date DATE;
  DECLARE v_source_table VARCHAR(50);

  CALL resolve_inventory_metadata(
    NEW.bmte_pmid,
    v_primary_code,
    v_selling_code,
    v_pm_name,
    v_pm_unit_id,
    v_categories,
    v_manufacturer_id,
    v_cost,
    v_cost_date,
    v_source_table
  );

  SET NEW.sp_primary_code = v_primary_code;
  SET NEW.sp_selling_code = v_selling_code;
  SET NEW.sp_pm_name = v_pm_name;
  SET NEW.sp_pm_unit_id = v_pm_unit_id;
  SET NEW.sp_categories = v_categories;
  SET NEW.sp_manufacturer_id = v_manufacturer_id;
  SET NEW.sp_cost = v_cost;
  SET NEW.sp_cost_date = v_cost_date;
  SET NEW.sp_source_table = v_source_table;
END $$
DELIMITER ;
