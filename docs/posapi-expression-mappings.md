# POSAPI expression mappings for aggregations

POSAPI endpoints now keep aggregation logic inside the **Expression** mapping type so the same
formula is reused anywhere the endpoint is selected.

## Supported syntax

- Functions: `sum`, `count`, `min`, `max`, `avg`
- Operators: `+`, `-`, `*`, `/`
- Parentheses for grouping (e.g., `sum(receipts[].items[].unitPrice * receipts[].items[].qty)`)

Expressions are validated to ensure they resolve to numeric results and are saved on the endpoint
definition. Transaction forms that pick the endpoint will auto-populate these formulas, avoiding
per-form duplication.

## Quick aggregate wrapper

The “Convert to expression” helper in the **Request values & environment variables** section
is a convenience wrapper. Selecting `sum` + `receipts[].items[].totalAmount` inserts the expression
`sum(receipts[].items[].totalAmount)`. Use the full expression editor for multi-field formulas such
as:

```
sum(receipts[].items[].unitPrice * receipts[].items[].qty)
```

Dedicated aggregation panels have been removed—store every aggregated field as an expression mapping
or through the quick wrapper above.
