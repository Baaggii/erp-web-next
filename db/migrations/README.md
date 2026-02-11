# Migrations

Legacy migrations have been moved to the `archive/` directory. New migrations should be added here and executed relative to the baseline schema defined in `../schema.sql`.

## Current migrations

- `2025-10-05_employment_plan_senior.sql`: Adds `employment_senior_plan_empid` to `tbl_employment`, indexes it, and seeds the column from `employment_senior_empid` for existing records.
- `2025-10-16_pending_request_record_id_varchar.sql`: Converts `pending_request.record_id` and `user_activity_log.record_id` to `VARCHAR(191)` and re-applies related indexes/constraints.
- `2025-11-02_report_transactions_test_fixture.sql`: Seeds the `transactions_test` and `transactions_test_detail` tables and adds the `dynrep_1_sp_transactions_test_report` stored procedure with expanded lock candidate metadata used by report tests.

No migrations are pending. The baseline schema now mirrors the production snapshot in `db/mgtmn_erp_db.sql` (generated 2025-10-03) so fresh databases already contain the identifier columns and audit metadata that earlier scripts added.

### Coding table indexes

The current schema enforces the following constraints:

- `code_chiglel`: primary key on `id` and unique constraint on (`company_id`, `chig_id`).
- `code_huvaari`: primary key on `id`, unique constraint on (`company_id`, `baitsaagch_id`), and index on `position_id`.
- `code_torol`: primary key on `id` and unique constraint on (`torol_id`, `company_id`).

No additional indexes are required at this time.

## PostgreSQL reference migrations

- `postgres/2026-02-11_multitenant_collaboration_schema.sql`: PostgreSQL-first collaboration schema with tenant RLS, polymorphic message links, audit columns, seed data, and isolation query examples.
- `postgres/2026-02-11_thread_model_tradeoffs.md`: Design note comparing adjacency-list vs closure-table thread modeling.
