# Transaction Form Configuration

This module stores form settings grouped by table and transaction name. The configuration
file lives at `config/transactionForms.json` and is accessible via `/api/transaction_forms`.

Each **transaction** entry allows you to specify:

- **visibleFields** – list of columns shown in the form
- **requiredFields** – columns that cannot be left empty
- **defaultValues** – map of column default values
- **editableDefaultFields** – list of columns where users may change the prefilled default
- **userIdFields** – fields automatically filled with the creating user ID
- **branchIdFields** – fields automatically filled with the branch ID
- **companyIdFields** – fields automatically filled with the company ID
- **moduleKey** – module slug used to group the form under a module
- **moduleLabel** – optional label for the parent module
- **allowedBranches** – restrict usage to these branch IDs
- **allowedDepartments** – restrict usage to these department IDs

Example snippet:

```json
{
  "inventory_transactions": {
    "Receive": {
      "visibleFields": ["tran_date", "description"],
      "requiredFields": ["tran_date"],
      "defaultValues": { "status": "N" },
      "editableDefaultFields": ["status"],
      "userIdFields": ["created_by"],
      "branchIdFields": ["branch_id"],
      "companyIdFields": ["company_id"],
      "moduleKey": "finance_transactions",
      "moduleLabel": "Finance",
      "allowedBranches": [1, 2],
      "allowedDepartments": [5]
    },
    "Issue": {
      "visibleFields": ["tran_date", "description"],
      "requiredFields": ["tran_date"],
      "defaultValues": { "status": "N" },
      "editableDefaultFields": ["status"],
      "userIdFields": ["created_by"],
      "branchIdFields": ["branch_id"],
      "companyIdFields": ["company_id"],
      "moduleKey": "finance_transactions",
      "moduleLabel": "Finance",
      "allowedBranches": [1, 2],
      "allowedDepartments": [5]
    }
  }
}
```

Clients can retrieve a list of transaction names via `/api/transaction_forms`.
Each entry includes the underlying table, `moduleKey` slug and the full
configuration parsed from the file.  This allows the front‑end to populate
forms without issuing additional requests or duplicating any parsing logic.
To obtain a configuration for a specific transaction use
`/api/transaction_forms?table=tbl&name=transaction`. New configurations are
posted with `{ table, name, config, showInSidebar?, showInHeader? }` in the request body and can be removed via
`DELETE /api/transaction_forms?table=tbl&name=transaction`.
Saving a configuration does **not** generate a module for every transaction.
Only the parent module referenced by `moduleKey` is created (or updated) if it
does not already exist.  All transactions share this parent module and are
grouped under it.  If no `moduleKey` is supplied the value
`finance_transactions` is used.  The optional `moduleLabel` lets you set a custom
name for the parent module.  The optional `showInSidebar` and `showInHeader`
flags previously applied to child modules and currently have no effect.
