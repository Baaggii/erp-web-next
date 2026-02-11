# Secure Messaging ERD (Current State)

## Logical entities

```mermaid
erDiagram
  ERP_MESSAGES ||--o{ ERP_MESSAGE_RECIPIENTS : "message_id"

  ERP_MESSAGES {
    bigint id PK
    bigint company_id
    varchar author_empid
    bigint parent_message_id FK "self-reference"
    text body
    varchar topic
    varchar transaction_id
    varchar plan_id
    datetime created_at
    datetime updated_at
    datetime deleted_at
  }

  ERP_MESSAGE_RECIPIENTS {
    bigint message_id FK
    varchar recipient_empid
    PK "(message_id, recipient_empid)"
  }
```

## Relationship and constraints
- `erp_messages.id` is the primary key.
- `erp_messages.parent_message_id` creates a thread tree by self-reference (validated in application logic).
- `erp_message_recipients.message_id` references `erp_messages.id` with `ON DELETE CASCADE`.
- Recipient rows are optional; absence means broad company visibility (subject to application filters).

## Current indexing
- `erp_messages`: `(company_id, created_at)`, `parent_message_id`, `author_empid`.
- `erp_message_recipients`: `(message_id, recipient_empid)` PK and `recipient_empid` secondary index.

## Known model gaps (tracked)
- No DB-level check for exactly one root-link (`topic | transaction_id | plan_id`) on root messages.
- No DB-level guard for reply-depth maximum.
- No first-class entities yet for read receipts, attachment metadata, moderation actions, or notification queue.
