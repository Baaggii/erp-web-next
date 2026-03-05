SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS erp_message_polls (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  created_by_empid VARCHAR(64) NOT NULL,
  voter_visibility ENUM('visible', 'hidden') NOT NULL DEFAULT 'visible',
  allow_multiple_choices TINYINT(1) NOT NULL DEFAULT 0,
  allow_user_options TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_erp_message_polls_message (message_id),
  KEY idx_erp_message_polls_conversation (company_id, conversation_id),
  CONSTRAINT fk_erp_message_polls_message FOREIGN KEY (message_id) REFERENCES erp_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_message_poll_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id BIGINT UNSIGNED NOT NULL,
  option_text VARCHAR(255) NOT NULL,
  created_by_empid VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_erp_message_poll_options_poll (poll_id),
  CONSTRAINT fk_erp_message_poll_options_poll FOREIGN KEY (poll_id) REFERENCES erp_message_polls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_message_poll_votes (
  poll_id BIGINT UNSIGNED NOT NULL,
  option_id BIGINT UNSIGNED NOT NULL,
  empid VARCHAR(64) NOT NULL,
  voted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (poll_id, option_id, empid),
  KEY idx_erp_message_poll_votes_option (option_id),
  KEY idx_erp_message_poll_votes_empid (poll_id, empid),
  CONSTRAINT fk_erp_message_poll_votes_poll FOREIGN KEY (poll_id) REFERENCES erp_message_polls(id) ON DELETE CASCADE,
  CONSTRAINT fk_erp_message_poll_votes_option FOREIGN KEY (option_id) REFERENCES erp_message_poll_options(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
