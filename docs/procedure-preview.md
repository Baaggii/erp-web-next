# Dynamic Transaction Preview Logic

This snippet demonstrates how to call a stored procedure once and map the
returned values to preview fields without updating the database.

```javascript
import previewTransaction from '../src/erp.mgt.mn/utils/previewTransaction.js';

// Example usage inside a React component
async function handlePreview() {
  const proc = 'sp_preview_transaction';
  const params = [masterId, branchId];
  const fieldMap = {
    total_amt: 'previewTotalAmount',
    total_qty: 'previewTotalQuantity',
  };

  const preview = await previewTransaction(proc, params, fieldMap);
  setPreviewValues(preview); // update local state only
}
```

The `previewTransaction` helper parses the stored procedure result into a field
map so any returned field can be dynamically assigned to a matching form value.
No database writes occur during this process.
