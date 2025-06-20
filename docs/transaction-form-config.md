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
      "allowedBranches": [1, 2],
      "allowedDepartments": [5]
    }
  }
}
```

Clients can retrieve a list of transaction names via `/api/transaction_forms`.
Each item in the returned object now includes the underlying table and the
`moduleKey` (slug) used for routing so the front‑end can build links without
replicating the slugify logic.
To obtain a configuration for a specific transaction use
`/api/transaction_forms?table=tbl&name=transaction`. New configurations are
posted with `{ table, name, config, showInSidebar?, showInHeader? }` in the request body and can be removed via
`DELETE /api/transaction_forms?table=tbl&name=transaction`.
Saving a configuration automatically creates a module using a slug of the transaction
name under the parent `finance_transactions`. If this parent module does not
exist it will be created automatically. The optional `showInSidebar` and
`showInHeader` flags determine where the generated module appears in the UI.
