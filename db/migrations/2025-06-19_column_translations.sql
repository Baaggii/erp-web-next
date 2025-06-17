-- Add table for storing column translations
CREATE TABLE IF NOT EXISTS column_translations (
  table_name VARCHAR(255) NOT NULL,
  column_en VARCHAR(255) NOT NULL,
  column_local VARCHAR(255) NOT NULL,
  PRIMARY KEY (table_name, column_en)
);
