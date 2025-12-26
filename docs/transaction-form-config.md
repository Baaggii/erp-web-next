# Transaction Form Configuration

This module stores form settings grouped by table and transaction name. The configuration
file lives at `config/transactionForms.json` and is accessible via `/api/transaction_forms`.

Each **transaction** entry allows you to specify:

- **visibleFields** – list of columns shown in the form
- **requiredFields** – columns that cannot be left empty
- **defaultValues** – map of column default values
- **editableDefaultFields** – list of columns where users may change the prefilled default
- **editableFields** – list of columns that remain editable in the form
    Fields omitted from both editable lists render as read-only in the POS
    layout. Computed `calcFields`/`posFields` mappings no longer force a column
    to be disabled; only the dynamic configuration determines editability.
- **userIdFields** – fields automatically filled with the creating user ID
- **branchIdFields** – fields automatically filled with the branch ID
- **departmentIdFields** – fields automatically filled with the department ID
- **companyIdFields** – fields automatically filled with the company ID
- **dateField** – list of columns treated as date for default filtering
- **emailField** – list of columns that store email addresses
- **imagenameField** – list of columns containing image file names
- **imageIdField** – column containing the unique identifier used to name images. Selecting this field automatically adds it to `imagenameField`.
- **imageFolder** – subfolder name for storing images of this transaction type

Uploaded images are resized and compressed on the server using the Sharp
library. Only the optimized versions are kept to minimize storage space and
speed up loading when the images are viewed.
- **printEmpField** – columns printed as employee info
- **printCustField** – columns printed as customer info
- **totalCurrencyFields** – fields summed to display total currency amount
- **totalAmountFields** – fields summed to display total amount
- **signatureFields** – fields printed as signature labels
- **headerFields** – fields shown in the header section
- **mainFields** – fields shown in the main section
- **footerFields** – fields shown in the footer section
- **viewSource** – map of field names to SQL view names
- When a field is mapped to a view, entering a value in that field triggers
  a lookup against the specified view. The first matching row is fetched and any
  columns that exist in the current table are automatically populated with the
  returned values. Display field mappings from `tableDisplayFields.json` are
  respected when assigning data.
- When debugging is enabled (`window.erpDebug = true`), the lookup displays
  temporary toast messages showing the generated SQL, parameters and returned
  row so you can verify the view integration.
- **isAllowedField** – optional column that must contain `1` for the transaction
  to be posted. The dynamic transaction workflow checks this field before
  calling the configured procedure/trigger.
- **transactionTypeField** – column used to store the transaction type code
- **transactionTypeValue** – default transaction type code value
- **detectFields** – columns used for automated detection
- **moduleKey** – module slug used to group the form under a module. If omitted,
  the transaction will not be associated with any module and is hidden from the
  Forms list.
- **moduleLabel** – optional label for the parent module
- **allowedBranches** – restrict usage to these branch IDs
- **allowedDepartments** – restrict usage to these department IDs

The form displays header fields (system filled values) separately from other
fields. When printing, the `printEmpField` and `printCustField` lists control
which fields appear on the employee or customer copy of the document.

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
      "viewSource": { "branch_id": "v_branch" },
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
posted with `{ table, name, config }` in the request body and can be removed via
`DELETE /api/transaction_forms?table=tbl&name=transaction`.
Saving a configuration does **not** create or update any modules. The optional
`moduleKey` and `moduleLabel` values are stored with the form entry but must be
managed separately in the modules table.

## POS API-specific configuration

Forms that submit POSAPI payloads use a handful of additional keys:

- **posApiMapping** – request field mappings for the POS endpoint. When present, the values are also recorded in
  **posApiRequestMappings** to persist the exact mapping type/variable selected in the UI.
- **posApiResponseMapping** – mappings for POSAPI response fields (e.g., `id`, `qrData`, `receipts[].lottery`).
  Each entry can target a column, literal, environment variable, session variable or expression. Defaults supplied by
  the endpoint live in **posApiResponseFieldMappings** and are merged automatically when a form is bound to an endpoint.
- **posApiAggregations** – destination columns for aggregated values defined on the endpoint (for example `totalAmount`
  derived from summing `items[].measureUnitPrice`). Custom aggregation definitions are stored in
  **posApiAggregationDefinitions** (each entry contains `target`, `operation`, `source`, and optional `label`).
- **posApiRequestVariation** – default request variation key to apply when the endpoint exposes multiple variations.
  If omitted, the endpoint’s `defaultVariation` hint is used.
- **posApiVariationDefaults** – overrides for variation-specific default values keyed by field name and variation key.
- **posApiCustomResponseFields** – list of extra response fields (path, label, destination hint, description) that should
  be available for mapping even if they are not present in the endpoint metadata.

Variation-specific defaults are defined on the endpoint (see `config/posApiEndpoints.json`) under `variationDefaults`
and can be overridden per form via `posApiVariationDefaults`. Only the defaults matching the selected variation are
applied when building request samples or payloads, preventing values from unrelated variations from leaking into a
transaction. Request fields marked as `variationSpecific` in endpoint metadata are surfaced explicitly in the UI so
that users know those values will not be reused across variations.
