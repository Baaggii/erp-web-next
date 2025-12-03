-- Static contract receivables trigger/procedure to avoid dynamic SQL failures
-- Guards ensure the trigger is recreated only when the contract order table exists.

-- Detect target table availability
SET @has_contract_order := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'transactions_contract_order'
);

-- Drop existing trigger if present
SET @drop_trigger := IF(
  @has_contract_order > 0,
  'DROP TRIGGER IF EXISTS `trg_contract_order_bi`',
  'SELECT 1'
);
PREPARE stmt FROM @drop_trigger;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop procedure to ensure replacement uses static SQL
DROP PROCEDURE IF EXISTS resolve_contract_receivables;

-- Recreate procedure with static SQL only when the target table exists
SET @create_proc := IF(
  @has_contract_order > 0,
  CONCAT_WS('\n',
    'CREATE OR REPLACE PROCEDURE resolve_contract_receivables(',
    '    IN  p_g_id  VARCHAR(255),',
    '    IN  p_or_date DATE,',
    '    OUT o_curr_receivables            DECIMAL(18,2),',
    '    OUT o_curr_penalty                DECIMAL(18,2),',
    '    OUT o_curr_receivableswithpenalty DECIMAL(18,2)',
    ')',
    'BEGIN',
    '  DECLARE v_year INT;',
    '  DECLARE v_month INT;',
    '  DECLARE v_company_id INT;',
    '  DECLARE v_base_rent DECIMAL(18,2) DEFAULT 0;',
    '  DECLARE v_total_util DECIMAL(18,2) DEFAULT 0;',
    '  DECLARE v_penalty_raw DECIMAL(18,2) DEFAULT 0;',
    '  DECLARE v_income_total DECIMAL(18,2) DEFAULT 0;',
    '',
    '  IF p_g_id IS NULL THEN',
    "    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contract ID cannot be NULL';",
    '  END IF;',
    '  IF p_or_date IS NULL THEN',
    "    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'or_date cannot be NULL';",
    '  END IF;',
    '',
    '  SET v_year  = YEAR(p_or_date);',
    '  SET v_month = MONTH(p_or_date);',
    '',
    '  SELECT company_id',
    '    INTO v_company_id',
    '    FROM transactions_contract',
    '   WHERE g_id = p_g_id',
    '   LIMIT 1;',
    '',
    '  IF v_company_id IS NULL THEN',
    "    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No company_id found for given g_id';",
    '  END IF;',
    '',
    '  SELECT',
    '    COALESCE(CEIL(MAX(r.base_final_rent)/10.0)*10, 0),',
    '    COALESCE(CEIL(MAX(ug.total_util)/10.0)*10, 0),',
    '    COALESCE(MAX(ps.total_penalty), 0),',
    '    COALESCE(MAX(itg.income_total), 0)',
    '  INTO',
    '    v_base_rent,',
    '    v_total_util,',
    '    v_penalty_raw,',
    '    v_income_total',
    '  FROM contract_info ci',
    '  LEFT JOIN rent_grouped r',
    '    ON r.g_id = ci.g_id',
    '   AND r.period_year = v_year',
    '   AND r.period_month = v_month',
    '  LEFT JOIN util_grouped ug',
    '    ON ug.g_id = ci.g_id',
    '   AND ug.period_year = v_year',
    '   AND ug.period_month = v_month',
    '  LEFT JOIN penalty_summary ps',
    '    ON ps.g_id = ci.g_id',
    '   AND ps.period_year = v_year',
    '   AND ps.period_month = v_month',
    '  LEFT JOIN income_total_grouped itg',
    '    ON itg.g_id = ci.g_id',
    '   AND itg.period_year = v_year',
    '   AND itg.period_month = v_month',
    '  WHERE ci.g_id = p_g_id',
    '  LIMIT 1;',
    '',
    '  SET o_curr_receivables = CEIL((v_base_rent + v_total_util)/10.0)*10;',
    '  SET o_curr_penalty = CEIL(v_penalty_raw/10.0)*10;',
    '  SET o_curr_receivableswithpenalty = CEIL((v_base_rent + v_total_util + v_penalty_raw - v_income_total)/10.0)*10;',
    'END'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @create_proc;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Recreate the BEFORE INSERT trigger with static logic
SET @create_trigger := IF(
  @has_contract_order > 0,
  CONCAT_WS('\n',
    'CREATE TRIGGER `trg_contract_order_bi`',
    'BEFORE INSERT ON `transactions_contract_order`',
    'FOR EACH ROW',
    'BEGIN',
    '  DECLARE v_receivables DECIMAL(18,2);',
    '  DECLARE v_penalty DECIMAL(18,2);',
    '  DECLARE v_receivables_with_penalty DECIMAL(18,2);',
    '',
    '  CALL resolve_contract_receivables(',
    '    NEW.or_g_id,',
    '    NEW.or_date,',
    '    v_receivables,',
    '    v_penalty,',
    '    v_receivables_with_penalty',
    '  );',
    '',
    '  SET NEW.sp_curr_receivables            = v_receivables;',
    '  SET NEW.sp_curr_penalty                = v_penalty;',
    '  SET NEW.sp_curr_receivableswithpenalty = v_receivables_with_penalty;',
    'END'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @create_trigger;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
