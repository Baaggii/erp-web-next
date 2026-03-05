START TRANSACTION;

CREATE TABLE IF NOT EXISTS erp_message_polls (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  question VARCHAR(255) NOT NULL,
  voter_visibility ENUM('visible', 'hidden') NOT NULL DEFAULT 'visible',
  created_by_empid VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_erp_message_polls_message (company_id, message_id),
  KEY idx_erp_message_polls_company (company_id, id),
  CONSTRAINT fk_erp_message_polls_message
    FOREIGN KEY (message_id) REFERENCES erp_messages(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_message_poll_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  option_index INT NOT NULL,
  label VARCHAR(160) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_erp_message_poll_option_index (poll_id, option_index),
  KEY idx_erp_message_poll_options_company (company_id, poll_id),
  CONSTRAINT fk_erp_message_poll_options_poll
    FOREIGN KEY (poll_id) REFERENCES erp_message_polls(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_message_poll_votes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id BIGINT UNSIGNED NOT NULL,
  option_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  voter_empid VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_erp_message_poll_votes_voter (poll_id, voter_empid),
  KEY idx_erp_message_poll_votes_option (option_id),
  KEY idx_erp_message_poll_votes_message (company_id, message_id),
  CONSTRAINT fk_erp_message_poll_votes_poll
    FOREIGN KEY (poll_id) REFERENCES erp_message_polls(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_erp_message_poll_votes_option
    FOREIGN KEY (option_id) REFERENCES erp_message_poll_options(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_erp_message_poll_votes_message
    FOREIGN KEY (message_id) REFERENCES erp_messages(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;
