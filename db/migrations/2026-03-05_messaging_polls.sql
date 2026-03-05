START TRANSACTION;

CREATE TABLE IF NOT EXISTS erp_message_polls (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  question VARCHAR(400) NOT NULL,
  voters_visible TINYINT(1) NOT NULL DEFAULT 0,
  allow_multiple_selections TINYINT(1) NOT NULL DEFAULT 0,
  allow_user_options TINYINT(1) NOT NULL DEFAULT 0,
  created_by_empid VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_erp_message_polls_message (message_id),
  KEY idx_erp_message_polls_company_conversation (company_id, conversation_id),
  CONSTRAINT fk_erp_message_polls_message
    FOREIGN KEY (message_id) REFERENCES erp_messages(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_erp_message_polls_conversation
    FOREIGN KEY (conversation_id) REFERENCES erp_conversations(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_message_poll_options (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  poll_id BIGINT UNSIGNED NOT NULL,
  option_text VARCHAR(255) NOT NULL,
  created_by_empid VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uk_erp_message_poll_options_unique_text (poll_id, option_text),
  KEY idx_erp_message_poll_options_company_poll (company_id, poll_id),
  CONSTRAINT fk_erp_message_poll_options_poll
    FOREIGN KEY (poll_id) REFERENCES erp_message_polls(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_message_poll_votes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  poll_id BIGINT UNSIGNED NOT NULL,
  option_id BIGINT UNSIGNED NOT NULL,
  empid VARCHAR(64) NOT NULL,
  voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_erp_message_poll_votes_company_poll (company_id, poll_id),
  KEY idx_erp_message_poll_votes_option (option_id),
  KEY idx_erp_message_poll_votes_empid (empid),
  UNIQUE KEY uk_erp_message_poll_votes_active (poll_id, option_id, empid, deleted_at),
  CONSTRAINT fk_erp_message_poll_votes_poll
    FOREIGN KEY (poll_id) REFERENCES erp_message_polls(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_erp_message_poll_votes_option
    FOREIGN KEY (option_id) REFERENCES erp_message_poll_options(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;
