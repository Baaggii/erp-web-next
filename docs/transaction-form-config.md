# Transaction Form Configuration

This module stores per-table settings used by the dynamic form renderer. Configuration is saved in `config/transactionForms.json` and can be accessed via `/api/transaction_forms`.

Each table entry allows you to specify:

- **visibleFields** – list of columns shown in the form
- **requiredFields** – columns that cannot be left empty
- **defaultValues** – map of column default values
- **userIdField** – field storing the creating user ID
- **branchIdField** – field storing the branch ID
- **companyIdField** – field storing the company ID

Example snippet:

```json
{
  "inventory_transactions": {
    "visibleFields": ["tran_date", "description"],
    "requiredFields": ["tran_date"],
    "defaultValues": { "status": "N" },
    "userIdField": "created_by",
    "branchIdField": "branch_id",
    "companyIdField": "company_id"
  }
}
```

Clients can retrieve a single configuration using `/api/transaction_forms?table=tbl` or POST a new configuration with `{ table, config }` in the request body.
