# Event Policy Schema

Machine-readable schema: `config/schema/eventPolicy.schema.json`.

## Condition JSON
- Root: `{ logic: 'and'|'or', rules: [] }`
- Nested groups supported.
- Operators:
  - `=`, `!=`, `>`, `>=`, `<`, `<=`
  - `in`, `not_in`, `contains`
  - `exists`, `not_exists`
  - `starts_with`, `ends_with`

### Example
```json
{
  "logic": "and",
  "rules": [
    { "field": "payload.shortageQty", "operator": ">", "value": 10 },
    { "field": "payload.severity", "operator": "in", "value": ["high", "critical"] }
  ]
}
```

## Action JSON
- Root: `{ actions: [{ type: ... }] }`
- Supported action types:
  - `create_transaction`
  - `update_transaction`
  - `create_notification`
  - `notify`
  - `update_twin`
  - `call_procedure` (allow-list only)
  - `enqueue_ai_review`
  - `reserve_budget` *(reserved for extension)*
  - `reserve_resource` *(reserved for extension)*
  - `block_operation` *(reserved for extension)*
  - `write_audit_note` *(reserved for extension)*

### Example
```json
{
  "actions": [
    {
      "type": "update_twin",
      "twin": "risk_state",
      "mapping": {
        "risk_key": "inventory_shortage",
        "entity_type": "inventory_item",
        "entity_ref_id": "payload.itemId",
        "severity": "payload.severity",
        "status_code": "open"
      }
    }
  ]
}
```


## Policy source scope fields
`core_event_policies` supports both generic and source-specific subscriptions:

- `source_table` *(nullable)*: when set, policy only matches events from this table.
- `source_transaction_type` *(nullable)*: when set, policy only matches this source transaction type name.
- `source_transaction_code` *(nullable int)*: when set, policy only matches this transaction type code.
- `is_sample` *(tinyint, default `0`)*: mark demo/sample policies; ignored in production matching.

Matching logic keeps backward compatibility:
- If a source field is `NULL` in the policy, that dimension is treated as wildcard.
- If non-`NULL`, the event must equal the field value.
