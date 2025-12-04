# POSAPI schema gaps

This note tracked the delta between the POS API configuration and the exported SQL dumps. All previously missing columns for the `transactions_pos` form have now been added to both `db/mgtmn_erp_db.sql` and `db/schema.sql`, so the form’s `posApiMapping` and persisted response fields line up with the actual schema.

The `transactions_pos` table now exposes:

* Merchant- and invoice-level references (`merchant_id`, `ebarimt_invoice_id`) so merchant metadata and the `ebarimt_invoice` snapshots stay linked to each master record.
* Customer and document metadata (`customer_tin`, `customer_name`, `customer_status`, `customer_tin_valid`, `consumer_no`, `tax_type`, `lot_no`, `bill_id`) required by the POS API payload builders and info endpoints.
* Tax totals (`vat_amount`, `city_tax`) that match the `totalVAT` / `totalCityTax` mappings from `config/0/transactionForms.json`.

If new POS API fields need to be recorded in the future, update both SQL dumps and the live database in lockstep so configuration, migrations and documentation remain consistent.
