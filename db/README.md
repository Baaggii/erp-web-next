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
