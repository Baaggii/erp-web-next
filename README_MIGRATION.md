# Migration Patch — Deploy ERP to **mgt.mn/erp**

**Generated:** 2025-05-22T11:02:10.621841 UTC

This zip contains minimal files to adapt *erp-web-next* for deployment under
**mgt.mn/erp**.  
Apply as follows:

1.  Extract the archive at repo root (overwrite existing files).
2.  `npm install` (if deps changed) then `npm run build`.
3.  Deploy `dist/` and ensure server.js route `/erp/*` is wired.

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

Run the script after applying the migration to initialize permissions for all roles.
