-- Add company_id to user_level_permissions
ALTER TABLE user_level_permissions
  ADD COLUMN company_id INT NOT NULL DEFAULT 0 AFTER id;

-- Index for company_id
ALTER TABLE user_level_permissions
  ADD INDEX idx_user_level_permissions_company_id (company_id);

-- Update existing records with default company_id
UPDATE user_level_permissions SET company_id = 0 WHERE company_id IS NULL;

-- Include company_id in keys and add foreign key
ALTER TABLE user_level_permissions
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (id, company_id),
  ADD UNIQUE KEY uq_user_level_permissions (company_id, userlevel_id, action, action_key),
  ADD CONSTRAINT fk_user_level_permissions_company FOREIGN KEY (company_id) REFERENCES companies(id);
