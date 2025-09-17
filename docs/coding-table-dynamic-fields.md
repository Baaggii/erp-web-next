# Coding Table Dynamic Field Handling

Some coding tables populate transactional metadata such as `TRTYPENAME` and `trtype` by running MySQL triggers that update the row after it is inserted.  Bulk inserts that relied on those triggers forced MySQL to run an `UPDATE` on the same table for every row, which created contention and was difficult to troubleshoot.

The upload workflow now recognizes the coding tables that require these dynamic fields (`transactions_income`, `transactions_expense`, `transactions_order`, and `transactions_plan`).  When one of these tables is selected the UI no longer emits bulk INSERT SQL.  Instead it streams each row to `/api/coding_tables/upsert-row`, which fills in the dynamic fields by reading from `code_transaction` before performing an upsert.  This keeps the logic in application code and avoids self-updating triggers altogether.

Because the helper takes care of populating the dynamic fields, any trigger snippets that try to `UPDATE` the same table are ignored when SQL scripts are generated.  Administrators should remove those trigger blocks from existing configurations—the new API path now guarantees the dynamic metadata will be present without relying on database triggers.
