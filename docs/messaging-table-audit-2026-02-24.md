# Messaging table audit (2026-02-24)

This audit reviews the supplied MySQL dump tables containing `message` and compares them to runtime usage in `api-server/services/messagingService.js`.

## 1) Table usage status

| Table | Used by current runtime code? | Notes |
|---|---|---|
| `erp_messages` | Yes | Core read/write table for create, list, thread, edit, delete. |
| `erp_message_idempotency` | Yes | Used for idempotency replay/conflict detection. |
| `erp_message_receipts` | Yes | Used to mark reads in thread fetch. |
| `erp_messaging_abuse_audit` | Yes | Used for policy/rate-limit abuse logging. |
| `erp_message_chain_of_custody` | Not yet (runtime) | Referenced by lifecycle migration/docs only. |
| `erp_message_deletion_certificates` | Not yet (runtime) | Referenced by lifecycle migration/docs only. |
| `erp_message_participants` | No | No runtime references found. |
| `erp_message_purge_approvals` | Not yet (runtime) | Referenced by lifecycle migration/docs only. |
| `erp_message_purge_candidates` | Not yet (runtime) | Referenced by lifecycle migration/docs only. |
| `erp_message_purge_runs` | Not yet (runtime) | Referenced by lifecycle migration/docs only. |
| `erp_message_recipients` | No | No runtime references found. |
| `erp_message_retention_policies` | Not yet (runtime) | Referenced by lifecycle migration/docs only. |

## 2) Missing/misaligned columns in supplied dump

### `erp_messages`
The dump schema is missing (or may miss) columns used by modern messaging code paths:
- `linked_type`
- `linked_id`
- `visibility_scope`
- `visibility_department_id`
- `visibility_empid`
- `body_ciphertext`
- `body_iv`
- `body_auth_tag`
- `depth`
- soft-delete actor compatibility columns (`deleted_by_empid`, `deleted_by`)

### `erp_message_idempotency`
The dump schema is missing:
- `request_hash`
- `expires_at`

### Type alignment
- `erp_message_receipts.company_id` and `erp_message_recipients.company_id` were `INT`; aligned to `BIGINT UNSIGNED` to match messaging tenant keys.

## Applied fix

Migration added:
- `db/migrations/2026-02-24_messaging_table_alignment.sql`

It adds missing compatibility columns/indexes and aligns `company_id` types for receipts/recipients.
