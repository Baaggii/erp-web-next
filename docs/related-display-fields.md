# Related Display Fields Configuration

The automatic table management module can show related record information for certain foreign key fields. Configuration lives in `config/relationDisplayFields.json` and maps a table and column to the fields that should be displayed from the related table.

```json
{
  "users": {
    "empid": ["emp_lname", "emp_fname"]
  }
}
```

When editing the **users** table, the `empid` field will display the employee last and first name. Any fields not listed remain unchanged.
