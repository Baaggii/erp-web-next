# Report drilldown capabilities

Use the `@report_capabilities` session variable in your stored procedure to describe drilldown behavior for the Reports UI.

## Multi-level materialized drilldown

`detailTempTable` supports multiple formats:

- **string**: one temp table for all levels.
- **array**: level-indexed tables (`0`, `1`, `2`, ...). If a deeper level is requested, the last table is reused.
- **object**: explicit level map (`"0"`, `"1"`, ...) with optional `"default"` (or `"*"`) fallback.

Each aggregated row should include:

- `__row_ids`: comma-separated IDs of child rows for the *next* drilldown level.
- `__drilldown_level` (optional): current level index, default is `0`.

## Stored procedure example

```sql
SET @report_capabilities = JSON_OBJECT(
  'showTotalRowCount', TRUE,
  'supportsApproval', TRUE,
  'supportsSnapshot', TRUE,
  'drilldown', JSON_OBJECT(
    'mode', 'materialized',
    'detailPkColumn', 'id',
    'detailTempTable', JSON_OBJECT(
      '0', 'tmp_sales_lvl1',
      '1', 'tmp_sales_lvl2',
      '2', 'tmp_sales_lvl3',
      'default', 'tmp_sales_lvl3'
    ),
    'fallbackProcedure', 'sp_report_sales_detail'
  )
);
```

## Why a report does not expand on row click

For a procedure like `dynrep_1_sp_trial_balance_expandable`, expansion fails when one or more of these are true:

1. Rows do not return `__row_ids`.
   - The UI drilldown is ID-driven for materialized mode; without `__row_ids`, there is nothing to fetch.
2. `detailTempTable` shape is invalid.
   - This is **invalid**:
     ```sql
     JSON_OBJECT(
       'levels', JSON_ARRAY('0','tmp_a','1','tmp_b','default','tmp_c')
     )
     ```
   - Use keyed object or array instead.
3. Level mapping does not point to the next-level table.
   - When clicking level 0 rows, table key `"0"` must contain the level 1 rows those IDs belong to.

### Minimal fix pattern

- Return top-level rows with:
  - `id`
  - `__drilldown_level = 0`
  - `__row_ids = GROUP_CONCAT(child.id)` (child IDs from next-level temp table)
- Return second-level rows similarly with:
  - `__drilldown_level = 1`
  - `__row_ids = GROUP_CONCAT(grandchild.id)`

## Notes

- Keep temp table names in `tmp_*` format so the API validation accepts them.
- `fallbackProcedure` is still used when no materialized rows are available.
- Existing reports using a single `detailTempTable` string continue to work unchanged.
