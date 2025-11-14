# POSAPI schema gaps

This note lists every column that the POSAPI integration expects to read or write for the `transactions_pos` form but that does **not** exist in the exported database schema (`db/mgtmn_erp_db.sql`). The sources for each column are the POS API mapping (`posApiMapping`), the list of POS API response fields we persist (`fieldsFromPosApi`), and the info endpoint response mappings defined for the "Посын борлуулалтын гүйлгээ" form.

## How to read the table

* **POS API source** – where the requirement comes from inside `config/0/transactionForms.json`.
* **Configured column** – the column name the form expects inside `transactions_pos`.
* **Reason** – why the field is needed (payload mapping, info endpoint response, etc.).
* **Suggested schema change** – where to add the column (always the `transactions_pos` table) and a data type suggestion that matches how the field is used in the POS API payload or response. Use the same change in both the live database and in `db/mgtmn_erp_db.sql` so code generation stays in sync.

| POS API source | Configured column | Reason | Suggested schema change |
| --- | --- | --- | --- |
| `posApiMapping.totalVAT` | `vat_amount` | Required to send receipt VAT totals via POSAPI, but `transactions_pos` currently exposes only `total_amount` and `total_discount`. | `ALTER TABLE transactions_pos ADD COLUMN \`vat_amount\` DECIMAL(18,2) NULL AFTER \`total_amount\`;` |
| `posApiMapping.totalCityTax` | `city_tax` | City tax must be supplied in the POSAPI payload when applicable. | `ALTER TABLE transactions_pos ADD COLUMN \`city_tax\` DECIMAL(18,2) NULL AFTER \`vat_amount\`;` |
| `posApiMapping.customerTin` and info-endpoint requests | `customer_tin` | Customer tax ID is sent to the POSAPI request and to the `verifyCustomerTin` info endpoint. | `ALTER TABLE transactions_pos ADD COLUMN \`customer_tin\` VARCHAR(20) NULL AFTER \`order_id\`;` |
| `posApiMapping.consumerNo` | `consumer_no` | Consumer (citizen) number is needed for B2C receipts. | `ALTER TABLE transactions_pos ADD COLUMN \`consumer_no\` VARCHAR(32) NULL AFTER \`customer_tin\`;` |
| `posApiMapping.taxType` | `tax_type` | Header-level tax type (VAT_FREE, etc.) is mapped out of the transaction. | `ALTER TABLE transactions_pos ADD COLUMN \`tax_type\` VARCHAR(32) NULL AFTER \`consumer_no\`;` |
| `posApiMapping.lotNo` | `lot_no` | Pharmacy receipts must include a lot/serial number. | `ALTER TABLE transactions_pos ADD COLUMN \`lot_no\` VARCHAR(64) NULL AFTER \`tax_type\`;` |
| `fieldsFromPosApi → receipts[].billId` | `bill_id` | POSAPI returns the bill/receipt number that must be printed later. | `ALTER TABLE transactions_pos ADD COLUMN \`bill_id\` VARCHAR(64) NULL AFTER \`lot_no\`;` |
| `fieldsFromPosApi → receipts[].qrData` | `qr_data` | QR payload needs to be stored so the printed receipt matches what POSAPI issued. | `ALTER TABLE transactions_pos ADD COLUMN \`qr_data\` TEXT NULL AFTER \`bill_id\`;` |
| `fieldsFromPosApi → receipts[].lottery` | `lottery` | Lottery number is required for compliance printing. | `ALTER TABLE transactions_pos ADD COLUMN \`lottery\` VARCHAR(64) NULL AFTER \`qr_data\`;` |
| `verifyCustomerTin.responseMappings[].target` | `customer_name` | The info endpoint returns a registered name that we map back into the transaction, but the column is missing. | `ALTER TABLE transactions_pos ADD COLUMN \`customer_name\` VARCHAR(191) NULL AFTER \`customer_tin\`;` |
| `verifyCustomerTin.responseMappings[].target` | `customer_status` | Stores the tax status returned by the lookup. | `ALTER TABLE transactions_pos ADD COLUMN \`customer_status\` VARCHAR(64) NULL AFTER \`customer_name\`;` |
| `verifyCustomerTin.responseMappings[].target` | `customer_tin_valid` | Boolean flag telling whether the entered TIN passed validation. | `ALTER TABLE transactions_pos ADD COLUMN \`customer_tin_valid\` TINYINT(1) NULL AFTER \`customer_status\`;` |

## References

* POSAPI field mappings and info endpoint definitions: `config/0/transactionForms.json` ("transactions_pos" → "Посын борлуулалтын гүйлгээ").
* Persisted fields loader: `api-server/services/posApiPersistence.js` (the `fieldsFromPosApi` list controls which POS API response values are written back to the transaction record).
* Current `transactions_pos` schema: `db/mgtmn_erp_db.sql` – contains none of the columns listed above, so applying the suggested `ALTER TABLE` statements (and updating the SQL dump) keeps the schema consistent with the application configuration.
