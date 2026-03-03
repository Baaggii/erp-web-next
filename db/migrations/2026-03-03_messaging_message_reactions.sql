START TRANSACTION;

CREATE TABLE IF NOT EXISTS erp_message_reactions (
  message_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  empid VARCHAR(64) NOT NULL,
  emoji VARCHAR(32) NOT NULL,
  reacted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (message_id, empid, emoji),
  INDEX idx_erp_message_reactions_company_message (company_id, message_id),
  INDEX idx_erp_message_reactions_company_empid (company_id, empid),
  CONSTRAINT fk_erp_message_reactions_message
    FOREIGN KEY (message_id)
    REFERENCES erp_messages(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;
