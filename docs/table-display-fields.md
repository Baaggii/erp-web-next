# Table Display Field Configuration

Dynamic forms rely on a per-table configuration that declares which columns are shown to the user.  Each table can specify an `idField` used for storing references and a list of up to **20** `displayFields` that are rendered in selection lists or forms.

The configuration file lives at `config/tableDisplayFields.json` and has the following structure:

```json
{
  "tbl_employee": {
    "idField": "emp_id",
    "displayFields": ["emp_fname", "emp_lname"]
  }
}
```

Applications can fetch or update this information via `/api/display_fields`.

When a table contains a foreign key to another table, dynamic forms look up the
target table's configuration.  If a mapping exists, option labels are composed
from the listed `displayFields` and the underlying value comes from `idField`.
If no configuration is found the first two columns of the row are used as the
label.

