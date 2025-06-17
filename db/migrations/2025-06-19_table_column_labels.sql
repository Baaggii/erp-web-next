-- Store Mongolian labels for table columns
CREATE TABLE IF NOT EXISTS table_column_labels (
  table_name VARCHAR(100) NOT NULL,
  column_name VARCHAR(100) NOT NULL,
  mn_label VARCHAR(255) NOT NULL,
  PRIMARY KEY (table_name, column_name)
);
