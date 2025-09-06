# Tenant Directory Structure

ERP-Web-Next stores configuration templates and uploaded files in per-tenant folders.

## Configuration files

- Default templates live under `config/0/`.
- Each tenant receives its own copy in `config/<companyId>/` after import.

Run the migration to move legacy report builder files into the new layout:

```bash
node scripts/migrateReportBuilder.js
```

Then import the default configuration set for a tenant:

```bash
curl -X POST http://localhost:3000/api/config/import?companyId=1 \
  -H "Content-Type: application/json" \
  -d '{"files": ["generalConfig.json", "headerMappings.json"]}'
```

This copies files from `config/0/` into `config/1/` so the new company starts with the standard settings.

## Uploaded files

User uploads are segregated under `uploads/<companyId>/` (e.g. `uploads/1/txn_images`).
The server resolves paths based on the active tenant to keep files isolated.
