# Report drilldown capabilities

Use the `@report_capabilities` session variable in your stored procedure to describe drilldown behavior for the Reports UI.

## Multi-level materialized drilldown

`detailTempTable` now supports multiple levels (in addition to a single string):

- **string**: one temp table for all levels.
- **array**: level-indexed tables (`0`, `1`, `2`, ...). If a deeper level is requested, the last table is reused.
- **object**: explicit level map (`"0"`, `"1"`, ...) with optional `"default"` (or `"*"`) fallback.

Each aggregated row can include `__drilldown_level` to route the lookup to the matching level table.

## Stored procedure example

```sql
-- inside your report stored procedure
SET @report_capabilities = JSON_OBJECT(
  'showTotalRowCount', TRUE,
  'supportsApproval', TRUE,
  'supportsSnapshot', TRUE,
  'drilldown', JSON_OBJECT(
    'mode', 'materialized',
    'detailPkColumn', 'id',
    'detailTempTable', JSON_OBJECT(
      '0', 'tmp_sales_lvl0',
      '1', 'tmp_sales_lvl1',
      '2', 'tmp_sales_lvl2',
      'default', 'tmp_sales_lvl2'
    ),
    'fallbackProcedure', 'sp_report_sales_detail'
  )
);
```

## Notes

- Keep temp table names in `tmp_*` format so the API validation accepts them.
- `fallbackProcedure` is still used when no materialized rows are available.
- Existing reports using a single `detailTempTable` string continue to work unchanged.

## Using a shared base stored procedure

Yes — you can keep drilldown logic in a shared/base stored procedure and call it
from report-specific procedures.

- `callStoredProcedure()` resets `@report_capabilities` to `NULL` before each
  report call, then reads the final value after the procedure chain completes.
- Because MySQL session variables are shared across nested procedure calls,
  either the base procedure **or** the final report procedure can set
  `@report_capabilities`.
- Multi-level drilldown still works as long as the final
  `@report_capabilities.drilldown` contains valid materialized config
  (`mode: "materialized"` + `detailTempTable` / `detailTempTables`).

Recommended pattern:

1. Base procedure creates temp tables and sets a default
   `@report_capabilities` JSON (including drilldown).
2. Report-specific procedure calls the base procedure, runs final joins/selects,
   and only overrides `@report_capabilities` if it needs report-specific
   behavior.
