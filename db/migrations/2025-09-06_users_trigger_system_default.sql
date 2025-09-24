-- Recreate users_bi trigger to default audit actors to the system sentinel
DROP TRIGGER IF EXISTS users_bi;
DELIMITER $$
CREATE TRIGGER users_bi
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
  IF NEW.created_at IS NULL THEN
    SET NEW.created_at = NOW();
  END IF;
  IF NEW.created_by IS NULL OR NEW.created_by = '' THEN
    SET NEW.created_by = 'system';
  END IF;
  IF NEW.updated_at IS NULL THEN
    SET NEW.updated_at = NOW();
  END IF;
  IF NEW.updated_by IS NULL OR NEW.updated_by = '' THEN
    SET NEW.updated_by = NEW.created_by;
  END IF;
END$$
DELIMITER ;
