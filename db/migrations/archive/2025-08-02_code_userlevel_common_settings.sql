-- Add common_settings flag to code_userlevel
ALTER TABLE code_userlevel
  ADD COLUMN common_settings TINYINT(1) NOT NULL DEFAULT 0 AFTER developer;
