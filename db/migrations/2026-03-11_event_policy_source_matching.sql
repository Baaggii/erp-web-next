ALTER TABLE core_event_policies
  ADD COLUMN source_table VARCHAR(120) NULL AFTER event_type,
  ADD COLUMN source_transaction_type VARCHAR(120) NULL AFTER source_table,
  ADD COLUMN source_transaction_code INT NULL AFTER source_transaction_type,
  ADD COLUMN is_sample TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;

UPDATE core_event_policies
   SET is_sample = 1
 WHERE LOWER(COALESCE(policy_key, '')) LIKE '%sample%'
    OR LOWER(COALESCE(policy_key, '')) LIKE '%demo%'
    OR LOWER(COALESCE(policy_name, '')) LIKE '%sample%'
    OR LOWER(COALESCE(policy_name, '')) LIKE '%demo%';

CREATE INDEX idx_event_policy_company_event_source
  ON core_event_policies (company_id, event_type, is_active, source_table, source_transaction_code);

CREATE INDEX idx_event_policy_source_type
  ON core_event_policies (company_id, event_type, source_transaction_type);
