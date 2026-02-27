START TRANSACTION;

DROP TABLE IF EXISTS erp_message_reads;
DROP TABLE IF EXISTS erp_conversation_participants;

DROP TABLE IF EXISTS erp_messages;
DROP TABLE IF EXISTS erp_conversations;

CREATE TABLE erp_conversations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  type ENUM('general','private','linked') NOT NULL DEFAULT 'general',
  linked_type VARCHAR(64) NULL,
  linked_id VARCHAR(128) NULL,
  created_by_empid VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_message_id BIGINT UNSIGNED NULL,
  last_message_at DATETIME NULL,
  deleted_at DATETIME NULL,
  INDEX idx_erp_conversations_company (company_id),
  INDEX idx_erp_conversations_last_message_at (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE erp_conversation_participants (
  conversation_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  empid VARCHAR(64) NOT NULL,
  role ENUM('member','admin') DEFAULT 'member',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME NULL,
  PRIMARY KEY (conversation_id, empid),
  INDEX idx_erp_conversation_participants_lookup (company_id, empid),
  CONSTRAINT fk_erp_conversation_participants_conversation
    FOREIGN KEY (conversation_id)
    REFERENCES erp_conversations(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE erp_messages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  author_empid VARCHAR(64) NOT NULL,
  parent_message_id BIGINT UNSIGNED NULL,
  body TEXT NOT NULL,
  topic VARCHAR(255) NULL,
  message_class ENUM('general','financial','hr_sensitive','legal') NOT NULL DEFAULT 'general',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  INDEX idx_erp_messages_conversation_id (conversation_id),
  INDEX idx_erp_messages_company_id (company_id),
  CONSTRAINT fk_erp_messages_conversation
    FOREIGN KEY (conversation_id)
    REFERENCES erp_conversations(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE erp_conversations
  ADD CONSTRAINT fk_erp_conversations_last_message
    FOREIGN KEY (last_message_id)
    REFERENCES erp_messages(id)
    ON DELETE SET NULL;

CREATE TABLE erp_message_reads (
  message_id BIGINT UNSIGNED NOT NULL,
  empid VARCHAR(64) NOT NULL,
  read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, empid),
  INDEX idx_erp_message_reads_empid (empid),
  CONSTRAINT fk_erp_message_reads_message
    FOREIGN KEY (message_id)
    REFERENCES erp_messages(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;
