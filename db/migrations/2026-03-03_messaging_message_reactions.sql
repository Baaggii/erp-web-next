CREATE TABLE IF NOT EXISTS erp_message_reactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  empid VARCHAR(32) NOT NULL,
  emoji VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_erp_message_reactions_unique (company_id, message_id, empid, emoji),
  KEY idx_erp_message_reactions_message (company_id, message_id),
  KEY idx_erp_message_reactions_empid (company_id, empid),
  CONSTRAINT fk_erp_message_reactions_message
    FOREIGN KEY (message_id)
    REFERENCES erp_messages(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
