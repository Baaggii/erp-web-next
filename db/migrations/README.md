# Migrations

Legacy migrations have been moved to the `archive/` directory. New migrations should be added here and executed relative to the baseline schema defined in `../schema.sql`.

## Current migrations

No additional migrations are required at this time. The lookup identifier columns (`chig_id`, `torol_id`, `baitsaagch_id`, and related unique constraints) are now part of the baseline `schema.sql`.
