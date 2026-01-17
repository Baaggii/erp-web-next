# Tenant Table Scoping

Data-access helpers that accept `company_id` filters now consult the `tenant_tables` registry via `getTenantTableFlags`.

- **Shared tables** (`is_shared=1`) automatically include global rows by expanding the filter to `company_id IN (0, :companyId)`.
- **Global tables** not present in `tenant_tables` skip `company_id` scoping entirely.

This ensures queries return tenant-specific data while still honoring shared or global records.

## Report builder tenant normalization

The report builder now generates tenant-scoped stored procedures automatically. When
the "Apply tenant isolation" toggle is enabled, the client inspects the report
definition, collects every table used in `FROM`, `JOIN`, and `UNION` blocks, and then:

- **Tenant-specific tables** (`is_shared=0`) are materialized into temporary tables
  using `CALL create_tenant_temp_table('<table>', 'tmp_<table>', session_company_id);`.
  The generated `SELECT` reads from the `tmp_` table while preserving original aliases.
- **Shared tables** (`is_shared=1`) are left as-is, but the builder appends a
  `company_id IN (0, session_company_id)` predicate for each shared table alias to
  reinforce isolation.
- **Global tables** (not present in `tenant_tables`) skip normalization.

The procedure parameter list is automatically extended with
`IN session_company_id INT` when missing so the tenant isolation calls can run
without additional user input.

Example:

```
BEGIN
  CALL create_tenant_temp_table('transactions_contract', 'tmp_transactions_contract', session_company_id);
  CALL create_tenant_temp_table('tbl_bill_lines', 'tmp_tbl_bill_lines', session_company_id);

  SELECT ... FROM tmp_transactions_contract AS transactions_contract
    JOIN tmp_tbl_bill_lines AS tbl_bill_lines ON ...
  /*REPORT_BUILDER_CONFIG {…}*/
END
```

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

## Alternative: row-level security

If future requirements demand stronger tenant isolation, consider database-enforced
row-level security (RLS). Engines such as PostgreSQL can bind policies to session
variables (for example `current_setting('myapp.tenant_id')`), eliminating the need
for temporary tables at query-build time. Adopting RLS would require database
changes and a thorough review of existing queries and permissions.

## Configuration import

`seedOnCreate` only governs database rows. After creating a company, copy
default config files from `config/0/` into `config/<companyId>/` via
`/api/config/import` so the tenant starts with the standard settings. See
`tenant-directory-structure.md` for commands.

## Default shared tables

The following tables are preconfigured as shared (`is_shared=1`) so that global rows
(company_id 0) are visible to every tenant. They do not seed tenant-specific copies
when a new company is created (`seed_on_create=0`):

- `code_position`
- `code_branches`
- `code_department`
