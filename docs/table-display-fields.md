# Table Display Field Configuration

Dynamic forms rely on a per-table configuration that declares which columns are shown to the user. Each record is saved as a **single flat object**; one row equals one exact matching rule. The configuration file lives at `config/tableDisplayFields.json` and stores an array of objects with the following shape (table and column names are case-sensitive):

```json
[
  {
    "table": "tbl_employee",
    "idField": "emp_id",
    "displayFields": ["emp_fname", "emp_lname"]
  },
  {
    "table": "tbl_employee",
    "idField": "emp_id",
    "filterColumn": "status",
    "filterValue": "active",
    "displayFields": ["emp_fname", "emp_dept"]
  }
]
```

Validation rules enforced at save-time:

1. `table` is required.
2. `idField` is required.
3. `displayFields` is required and must contain at least one entry (max 20).
4. `filterColumn` and `filterValue` must appear together when used.
5. The combination `(table, idField, filterColumn, filterValue)` must be unique.

Applications can fetch or update this information via `/api/display_fields`. To remove every configuration for a table, send a `DELETE` request to `/api/display_fields?table=TABLE_NAME`.

To request the configuration that matches a specific relation filter, include `filterColumn` and `filterValue` query parameters:

```
/api/display_fields?table=tbl_employee&filterColumn=status&filterValue=active
```
