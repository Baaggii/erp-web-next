# Transaction Form Configuration

This module stores form settings grouped by table and transaction name. The configuration
file lives at `config/transactionForms.json` and is accessible via `/api/transaction_forms`.

Each **transaction** entry allows you to specify:

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
    "Receive": {
      "visibleFields": ["tran_date", "description"],
      "requiredFields": ["tran_date"],
      "defaultValues": { "status": "N" },
      "userIdField": "created_by",
      "branchIdField": "branch_id",
      "companyIdField": "company_id"
    },
    "Issue": {
      "visibleFields": ["tran_date", "description"],
      "requiredFields": ["tran_date"],
      "defaultValues": { "status": "N" },
      "userIdField": "created_by",
      "branchIdField": "branch_id",
      "companyIdField": "company_id"
    }
  }
}
```

Clients can retrieve a list of transaction names via `/api/transaction_forms`.
To obtain a configuration for a specific transaction use
`/api/transaction_forms?table=tbl&name=transaction`. New configurations are
posted with `{ table, name, config }` in the request body and can be removed via
`DELETE /api/transaction_forms?table=tbl&name=transaction`.
