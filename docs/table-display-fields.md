# Table Display Field Configuration

Dynamic forms rely on a per-table configuration that declares which columns are shown to the user.  Each table can specify an `idField` used for storing references and a list of up to **20** `displayFields` that are rendered in selection lists or forms.

The configuration file lives at `config/tableDisplayFields.json` and has the following structure (table and column names are case-sensitive):

```json
{
  "tbl_employee": {
    "idField": "emp_id",
    "displayFields": ["emp_fname", "emp_lname"]
  }
}
```

Applications can fetch or update this information via `/api/display_fields`.
To remove a configuration for a table, send a `DELETE` request to
`/api/display_fields?table=TABLE_NAME`.

