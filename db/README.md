# Database Setup

To initialize a fresh database:

1. **Create the schema**
   ```bash
   mysql -u <user> -p <database> < db/schema.sql
   ```
2. **Seed baseline data**
   ```bash
   mysql -u <user> -p <database> < db/seed_default.sql
   ```

The files above establish the baseline structure and data. All new SQL migrations in `db/migrations/` should be written assuming this baseline has already been applied.
