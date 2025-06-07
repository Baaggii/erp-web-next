-- Add parent_key and display flags for modules hierarchy
ALTER TABLE modules
  ADD COLUMN parent_key VARCHAR(50) NULL,
  ADD COLUMN show_in_sidebar TINYINT(1) DEFAULT 1,
  ADD COLUMN show_in_header TINYINT(1) DEFAULT 0,
  ADD CONSTRAINT fk_modules_parent FOREIGN KEY (parent_key)
    REFERENCES modules(module_key);
