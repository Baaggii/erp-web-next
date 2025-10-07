-- Seed data and stored procedure used by report builder tests
CREATE TABLE IF NOT EXISTS transactions_test (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  request_id BIGINT NOT NULL,
  customer_name VARCHAR(191) NOT NULL,
  status ENUM('draft', 'pending', 'approved') NOT NULL DEFAULT 'pending',
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transactions_test_company (company_id),
  KEY idx_transactions_test_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO transactions_test (
  id,
  company_id,
  request_id,
  customer_name,
  status,
  total_amount,
  created_at,
  updated_at
) VALUES
  (1, 1, 9001, 'Acme Manufacturing', 'pending', 125000.00, '2024-09-15 10:30:00', '2024-09-15 11:00:00'),
  (2, 1, 9002, 'Beta Logistics', 'approved', 86500.00, '2024-09-16 09:20:00', '2024-09-16 10:05:00'),
  (3, 2, 9100, 'Central Retail', 'draft', 152500.00, '2024-09-17 08:45:00', '2024-09-17 08:45:00')
ON DUPLICATE KEY UPDATE
  company_id = VALUES(company_id),
  request_id = VALUES(request_id),
  customer_name = VALUES(customer_name),
  status = VALUES(status),
  total_amount = VALUES(total_amount),
  created_at = VALUES(created_at),
  updated_at = VALUES(updated_at);

CREATE TABLE IF NOT EXISTS transactions_test_detail (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_id BIGINT UNSIGNED NOT NULL,
  line_no INT NOT NULL,
  sku VARCHAR(64) NULL,
  quantity DECIMAL(18,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transactions_detail_transaction (transaction_id),
  CONSTRAINT fk_transactions_test_detail_transaction FOREIGN KEY (transaction_id)
    REFERENCES transactions_test (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO transactions_test_detail (
  id,
  transaction_id,
  line_no,
  sku,
  quantity,
  line_total,
  created_at,
  updated_at
) VALUES
  (1001, 1, 1, 'SKU-001', 2, 50000.00, '2024-09-15 10:31:00', '2024-09-15 10:31:00'),
  (1002, 1, 2, 'SKU-002', 3, 75000.00, '2024-09-15 10:32:00', '2024-09-15 10:32:00'),
  (1003, 2, 1, 'SKU-003', 5, 86500.00, '2024-09-16 09:21:00', '2024-09-16 09:21:00')
ON DUPLICATE KEY UPDATE
  transaction_id = VALUES(transaction_id),
  line_no = VALUES(line_no),
  sku = VALUES(sku),
  quantity = VALUES(quantity),
  line_total = VALUES(line_total),
  created_at = VALUES(created_at),
  updated_at = VALUES(updated_at);

DROP PROCEDURE IF EXISTS dynrep_1_sp_transactions_test_report;
DELIMITER $$
CREATE PROCEDURE dynrep_1_sp_transactions_test_report(
  IN p_company_id INT
)
BEGIN
  DECLARE v_company_id INT DEFAULT NULL;

  IF p_company_id IS NOT NULL AND p_company_id <> 0 THEN
    SET v_company_id = p_company_id;
  END IF;

  SET @__report_lock_candidates = JSON_ARRAY();
  SET @_report_lock_candidates = JSON_ARRAY();
  SET @report_lock_candidates = JSON_ARRAY();

  WITH base AS (
    SELECT
      t.id,
      t.company_id,
      t.request_id,
      t.customer_name,
      t.status,
      t.total_amount,
      COALESCE((
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'lock_table', 'transactions_test_detail',
            'lock_record_id', d.id,
            'label', CONCAT('Detail ', d.line_no, ' (', IFNULL(d.sku, 'N/A'), ')'),
            'context', JSON_OBJECT(
              'line_no', d.line_no,
              'sku', d.sku,
              'quantity', d.quantity,
              'line_total', d.line_total
            )
          )
        )
        FROM transactions_test_detail d
        WHERE d.transaction_id = t.id
      ), JSON_ARRAY()) AS detail_records
    FROM transactions_test t
    WHERE v_company_id IS NULL OR t.company_id = v_company_id
  )
  SELECT
    b.id AS transaction_id,
    b.company_id,
    b.request_id,
    b.customer_name,
    b.status,
    b.total_amount,
    JSON_OBJECT(
      'transactions_test',
      JSON_ARRAY(
        JSON_OBJECT(
          'lock_table', 'transactions_test',
          'lock_record_id', b.id,
          'label', CONCAT('Transaction ', b.id),
          'context', JSON_OBJECT(
            'company_id', b.company_id,
            'request_id', b.request_id,
            'customer', b.customer_name
          )
        )
      ),
      'transactions_test_detail',
      JSON_OBJECT(
        'lock_table', 'transactions_test_detail',
        'lock_record_ids',
        IF(
          JSON_LENGTH(b.detail_records) IS NULL OR JSON_LENGTH(b.detail_records) = 0,
          JSON_ARRAY(),
          JSON_EXTRACT(b.detail_records, '$[*].lock_record_id')
        ),
        'records', b.detail_records,
        'label', CONCAT('Transaction ', b.id, ' details')
      )
    ) AS lock_bundle
  FROM base b
  ORDER BY b.id;

  SELECT COALESCE(JSON_ARRAYAGG(candidate), JSON_ARRAY())
    INTO @__report_lock_candidates
  FROM (
    SELECT JSON_OBJECT(
      'table', 'transactions_test',
      'record_id', CAST(t.id AS CHAR),
      'label', CONCAT('Transaction ', t.id),
      'context', JSON_OBJECT(
        'company_id', t.company_id,
        'request_id', t.request_id,
        'customer', t.customer_name
      )
    ) AS candidate
    FROM transactions_test t
    WHERE v_company_id IS NULL OR t.company_id = v_company_id

    UNION ALL

    SELECT JSON_OBJECT(
      'table', 'transactions_test_detail',
      'record_id', CAST(d.id AS CHAR),
      'label', CONCAT('Detail ', d.line_no, ' of Txn ', d.transaction_id),
      'context', JSON_OBJECT(
        'transaction_id', d.transaction_id,
        'sku', d.sku,
        'line_no', d.line_no,
        'quantity', d.quantity
      )
    )
    FROM transactions_test_detail d
    JOIN transactions_test t ON t.id = d.transaction_id
    WHERE v_company_id IS NULL OR t.company_id = v_company_id
  ) AS derived;

  SET @_report_lock_candidates = @__report_lock_candidates;
  SET @report_lock_candidates = @__report_lock_candidates;
END $$
DELIMITER ;
