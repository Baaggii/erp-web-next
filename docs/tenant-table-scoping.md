# Tenant Table Scoping

Data-access helpers that accept `company_id` filters now consult the `tenant_tables` registry via `getTenantTableFlags`.

- **Shared tables** (`is_shared=1`) automatically include global rows by expanding the filter to `company_id IN (0, :companyId)`.
- **Global tables** not present in `tenant_tables` skip `company_id` scoping entirely.

This ensures queries return tenant-specific data while still honoring shared or global records.

## Listing tenant table options

Administrators can fetch a full list of database tables and their `tenant_tables`
settings via:

```
GET /api/tenant_tables/options
```

The response is an array with each table's `tableName`, `isShared`, and
`seedOnCreate` flags (defaulting to `false` when not configured).
