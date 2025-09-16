-- Recreate transactions_income triggers to populate TRTYPENAME and trtype
-- without performing self-updates that raise ER_CANT_UPDATE_USED_TABLE (1442).
DROP TRIGGER IF EXISTS `trg_transactions_income_insert`;
DROP TRIGGER IF EXISTS `trg_transactions_income_update`;

DELIMITER $$
CREATE TRIGGER `trg_transactions_income_insert` BEFORE INSERT ON `transactions_income`
FOR EACH ROW
BEGIN
  DECLARE v_trtypename VARCHAR(100);
  DECLARE v_trtype VARCHAR(4);
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_trtypename = NULL, v_trtype = NULL;

  SELECT ct.UITransTypeName, ct.UITrtype
    INTO v_trtypename, v_trtype
    FROM code_transaction ct
   WHERE ct.UITransType = NEW.TransType
   LIMIT 1;

  SET NEW.TRTYPENAME = v_trtypename;
  SET NEW.trtype = v_trtype;
END$$

CREATE TRIGGER `trg_transactions_income_update` BEFORE UPDATE ON `transactions_income`
FOR EACH ROW
BEGIN
  DECLARE v_trtypename VARCHAR(100);
  DECLARE v_trtype VARCHAR(4);
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_trtypename = NULL, v_trtype = NULL;

  SELECT ct.UITransTypeName, ct.UITrtype
    INTO v_trtypename, v_trtype
    FROM code_transaction ct
   WHERE ct.UITransType = NEW.TransType
   LIMIT 1;

  SET NEW.TRTYPENAME = v_trtypename;
  SET NEW.trtype = v_trtype;
END$$
DELIMITER ;
