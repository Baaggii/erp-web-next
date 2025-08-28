# Tenant Table Scoping

Data-access helpers that accept `company_id` filters now consult the `tenant_tables` registry via `getTenantTableFlags`.

- **Shared tables** (`is_shared=1`) automatically include global rows by expanding the filter to `company_id IN (0, :companyId)`.
- **Global tables** not present in `tenant_tables` skip `company_id` scoping entirely.

This ensures queries return tenant-specific data while still honoring shared or global records.

## Global tenant row

The `companies` table reserves `id=0` for a `Global Defaults` tenant. Migration `2025-10-29_global_defaults_company.sql` seeds this row and future migrations may assume it exists. Use `company_id=0` when inserting records intended to be shared across all tenants.

## Listing tenant table options

Administrators can fetch a full list of database tables and their `tenant_tables`
settings via:

```
GET /api/tenant_tables/options
```

The response is an array with each table's `tableName`, `isShared`, and
`seedOnCreate` flags (defaulting to `false` when not configured).

## Default shared tables

The following tables are preconfigured as shared (`is_shared=1`) so that global rows
(company_id 0) are visible to every tenant. They do not seed tenant-specific copies
when a new company is created (`seed_on_create=0`):

- `code_position`
- `code_branches`
- `code_department`

