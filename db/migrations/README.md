# Migrations

Legacy migrations have been moved to the `archive/` directory. New migrations should be added here and executed relative to the baseline schema defined in `../schema.sql`.

## Current migrations

- `2025-10-05_employment_plan_senior.sql`: Adds `employment_senior_plan_empid` to `tbl_employment`, indexes it, and seeds the column from `employment_senior_empid` for existing records.

No migrations are pending. The baseline schema now mirrors the production snapshot in `db/mgtmn_erp_db.sql` (generated 2025-10-03) so fresh databases already contain the identifier columns and audit metadata that earlier scripts added.

### Coding table indexes

The current schema enforces the following constraints:

- `code_chiglel`: primary key on `id` and unique constraint on (`company_id`, `chig_id`).
- `code_huvaari`: primary key on `id`, unique constraint on (`company_id`, `baitsaagch_id`), and index on `position_id`.
- `code_torol`: primary key on `id` and unique constraint on (`torol_id`, `company_id`).

No additional indexes are required at this time.
