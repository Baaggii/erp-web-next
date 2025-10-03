# Migrations

Legacy migrations have been moved to the `archive/` directory. New migrations should be added here and executed relative to the baseline schema defined in `../schema.sql`.

## Current migrations

All identifier column changes from `2025-10-30_code_identifier_columns.sql` have been
applied to the live database and folded into `../schema.sql`. The historical script is
retained under `archive/2025-10-30_code_identifier_columns.sql` for reference, so there
are currently no pending migrations in this directory.
