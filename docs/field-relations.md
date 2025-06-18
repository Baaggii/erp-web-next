# Field Relations Configuration

Dynamic forms can show friendly names for foreign key fields. The mapping of table columns to reference tables is stored in `config/fieldRelations.json`.

Example:
```json
{
  "users": {
    "employee_id": {
      "table": "tbl_employee",
      "column": "id",
      "displayFields": ["emp_fname", "emp_lname"]
    }
  }
}
```

Only fields listed in this file are treated as relationships by the UI. The `displayFields` array controls which columns from the referenced table are concatenated for display.
