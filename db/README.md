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

The baseline schema is provided in `schema.sql`. After creating your database, load the schema and then seed default data:

```bash
mysql -u <user> -p <database> < db/schema.sql
mysql -u <user> -p <database> < db/seed_default.sql
```

`seed_default.sql` inserts shared code tables, modules, user level defaults and role/module mappings. All shared rows use `company_id=0`.

## Global trigger skip condition

Use the following reusable condition block at the very start of any trigger to honor the session toggle `@skip_triggers`:

```sql
trigger_block: BEGIN
    IF @skip_triggers = 1 THEN
        LEAVE trigger_block;
    END IF;
    -- existing trigger logic follows
```

- Place this block immediately after the `BEGIN` keyword and before any `DECLARE` statements.
- Do not alter the trigger logic itself; the `LEAVE` exits cleanly when `@skip_triggers` is enabled with `SET @skip_triggers = 1;`.
