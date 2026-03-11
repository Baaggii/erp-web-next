# Policy Authoring UI

## Architecture overview

The visual policy authoring feature adds a policy builder page (`/settings/event-policy-builder`) that writes policy drafts, validates generated `condition_json` and `action_json`, simulates policy outcomes using a non-mutating API, and deploys active policies with version snapshots.

## UI workflow

1. Select event trigger metadata (event type, policy identity, priority, enabled).
2. Build condition expressions visually (`field`, `operator`, `value`, `logic`).
3. Build a list of actions and field mappings.
4. Run simulation against test payloads (`POST /api/events/simulate`).
5. Save draft and deploy to active policy table.

## Rule examples

Condition example:

- `payload.shortageQty > 10`
- `payload.severity in [high,critical]`

Serialized:

```json
{
  "logic": "and",
  "rules": [
    { "field": "payload.shortageQty", "operator": ">", "value": 10 },
    { "field": "payload.severity", "operator": "in", "value": ["high", "critical"] }
  ]
}
```

Action example:

```json
{
  "actions": [
    {
      "type": "create_transaction",
      "transactionType": "plan_investigation",
      "mapping": {
        "linked_record_id": "source.recordId",
        "priority": "payload.severity"
      }
    }
  ]
}
```

## Sandbox testing instructions

Use the builder sandbox panel:

- Choose event type
- Provide payload JSON
- Set company/branch
- Run simulation

Simulation returns:

- matched policies
- per-policy condition evaluations
- generated action types
- twin/notification previews

Simulation route is read-only and does not insert/update business records.
