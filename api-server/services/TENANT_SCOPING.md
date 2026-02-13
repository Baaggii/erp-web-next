# Tenant Scoping Contract (Backend)

This document defines how backend read queries must apply tenant visibility.

## Source of truth

Visibility is centralized in MySQL stored procedure:

- `create_tenant_temp_table(src_table_name, tmp_table_name, company_id)`

The procedure applies:

- tenant/company scope
- soft-delete exclusion (`deleted_at IS NULL`, when the column exists)
- shared/non-shared behavior from `tenant_tables`

## Required backend pattern

Use helpers from `api-server/services/tenantScope.js` for all business-table reads:

- `createTmpBusinessTable(connection, tableName, companyId)`
- `queryWithTenantScope(connection, tableName, companyId, originalQuery, params)`

### Canonical usage

```js
const [rows] = await queryWithTenantScope(
  pool,
  'pending_request',
  companyId,
  `SELECT * FROM {{table}} WHERE request_id = ?`,
  [requestId],
);
```

## Important implementation notes

1. **Session affinity is mandatory**
   - MySQL temp tables are session-scoped.
   - `queryWithTenantScope` pins one connection when called with a pool so `CALL create_tenant_temp_table` and subsequent `SELECT` run in the same session.

2. **Do not manually filter read queries by `company_id` / `deleted_at`**
   - Let the stored procedure define visibility.
   - Keep explicit `company_id` conditions for write/update guards only.

3. **Prefer `{{table}}` placeholders**
   - Write query text as `FROM {{table}}` for explicit rewrite behavior.

4. **Avoid temp-table self-reopen SQL patterns**
   - Queries that self-join the same temp table alias can trigger `ER_CANT_REOPEN_TABLE`.
   - If needed, fetch once and perform de-dup/grouping in application code.

## System table exclusions

`tenantScope.js` excludes these tables by default:

- `users`
- `login`
- `authentication`
- `tenant_tables`
- `system_schema_version`

## Migration checklist for new/updated code

- [ ] Is this a business-table **read**?
- [ ] Replaced direct `pool.query`/`conn.query` with `queryWithTenantScope`.
- [ ] Removed manual read-side `company_id` / `deleted_at` predicates.
- [ ] Kept write-side safety predicates where needed.
- [ ] Used parameterized SQL.
