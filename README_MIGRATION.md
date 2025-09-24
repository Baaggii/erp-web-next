# Migration Patch — Deploy ERP to **mgt.mn/erp**

**Generated:** 2025-05-22T11:02:10.621841 UTC

This zip contains minimal files to adapt *erp-web-next* for deployment under
**mgt.mn/erp**.  
Apply as follows:

1.  Extract the archive at repo root (overwrite existing files).
2.  `npm install` (if deps changed).
3.  Create your local configs using the app UI or API.
4.  Run `npm run build`.
5.  Deploy `dist/` and ensure server.js route `/erp/*` is wired.

User settings stored in `/config` and any files uploaded to `/uploads` remain
outside version control so your local data persists.

## Files included

| File | Purpose |
|------|---------|
| package.json | Updated build script with `--base=/erp/` |
| vite.config.js | Sets `base: '/erp/'` |
| server.js | Express static + history fallback under `/erp` |
| .cpanel.yml | Example cPanel deployment tasks |
| README_MIGRATION.md | This guide |

---
### Quick test

```bash
node server.js
# Open http://localhost:3000/erp
```

### Database helpers

Two SQL utilities assist with default module permissions:

* `db/migrations/2025-06-12_role_default_modules.sql` – defines `role_default_modules` and seeds defaults.
* `db/scripts/populate_role_module_permissions.sql` – copies those defaults into `role_module_permissions` for admin review.
* `db/migrations/2025-06-14_role_module_permissions_company_id.sql` – adds a `company_id` column so permissions are scoped per company.
* `db/migrations/2025-07-24_proc_fix.sql` – recreates `resolve_inventory_metadata` and `calculate_stock_per_branch` as read‑only procedures so triggers no longer attempt to update their source tables.
* `db/migrations/2025-07-25_inventory_triggers.sql` – recreates inventory and expense triggers so they call the read‑only procedures without modifying their own tables.
* `db/migrations/2025-09-02_standardize_audit_columns.sql` – normalizes `created_at`, `created_by`, `updated_at`, `updated_by`, and `deleted_at` across every base table and backfills existing rows with a fallback `created_by = 'system'`. Re-run this migration after pulling to align live databases with the schema.
* `db/migrations/2025-09-05_users_created_trigger.sql` – recreates the `users_bi` trigger so inserts automatically fill any missing audit timestamps or actors for the `users` table.

Run the script after applying the migration to initialize permissions for all roles.

### Sidebar route check

If the sidebar links do not match the available React routes, run:

```bash
node scripts/check-module-routes.cjs
```

The script loads module definitions from `db/defaultModules.js` and compares them
to the available React routes. It prints `All sidebar modules have matching routes.`
when every module has a corresponding route, or lists the missing ones so you can
correct them.
