-- Map English column names to Mongolian labels
CREATE TABLE IF NOT EXISTS column_translations (
  table_name VARCHAR(100) NOT NULL,
  english_header VARCHAR(100) NOT NULL,
  mongolian_header VARCHAR(100) NOT NULL,
  PRIMARY KEY (table_name, english_header)
) ENGINE=InnoDB;
