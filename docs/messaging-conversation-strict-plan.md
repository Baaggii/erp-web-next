# Messaging: Strict Conversation-Bound Model (No Stale Fallback)

## Goals

1. Every message belongs to exactly one conversation (`conversation_id` is mandatory).
2. A conversation supports unlimited top-level timeline messages (no forced reply tree).
3. Root message ID is **not** the conversation identity; use a dedicated `conversation_id`.
4. Conversation list loads by latest activity; opening a conversation paginates older messages on scroll-up.

---

## 1) Data model changes

### Required tables/columns

- `erp_conversations`
  - `id` (PK)
  - `company_id` (tenant key)
  - `linked_type`, `linked_id` (optional context)
  - `visibility_scope`, `visibility_department_id`, `visibility_empid`
  - `created_by_empid`, `created_at`
  - `last_message_id`, `last_message_at`
  - `deleted_at`, `deleted_by_empid`

- `erp_messages`
  - `id` (PK)
  - `company_id`
  - `conversation_id` (**NOT NULL**, FK to `erp_conversations.id`)
  - `author_empid`
  - `body` / encrypted body fields
  - `kind` (`'timeline' | 'reply'`) optional, default `'timeline'`
  - `parent_message_id` (nullable; used only for explicit reply threads)
  - `created_at`, `deleted_at`, `deleted_by_empid`

### Constraints/indexes

- FK: `erp_messages(conversation_id) -> erp_conversations(id)`
- Indexes:
  - `erp_messages(company_id, conversation_id, id DESC)`
  - `erp_conversations(company_id, last_message_at DESC, id DESC)`
- Optional check/guard:
  - If `parent_message_id` is set, parent must be in same `conversation_id`.

---

## 2) API contract (strict)

### Create conversation

`POST /messaging/conversations`

- Creates row in `erp_conversations`.
- Optionally creates first message (timeline message).
- Returns:
  - `conversation: { id, ... }`
  - `message` (if initial message exists)

### Post message to conversation

`POST /messaging/conversations/:conversationId/messages`

- Requires valid `conversationId` path param.
- Never infers from `parent_message_id` or root message ID.
- Request body:
  - `idempotencyKey`, `body`, optional `parentMessageId`.
- Server validation:
  - `parentMessageId` (if present) must belong to same conversation.

### List conversations (latest-first)

`GET /messaging/conversations?companyId=...&cursor=...&limit=...`

- Ordered by `last_message_at DESC, id DESC`.
- Cursor is conversation cursor (not message cursor).

### List messages in a conversation (timeline pagination)

`GET /messaging/conversations/:conversationId/messages?cursor=...&limit=...`

- Ordered by `id DESC` for transport (or `created_at DESC, id DESC`), then UI can reverse.
- Cursor is message cursor inside that conversation.
- Returns `{ items, pageInfo: { nextCursor, hasMore } }`.

---

## 3) Remove stale fallback logic

### Backend

Remove/disable these fallback patterns:

- Inserting messages without `conversation_id`.
- Resolving conversation identity as `conversation_id || parent_message_id || id`.
- Schema compatibility mode that silently tolerates missing `conversation_id`.

Replace with hard errors:

- `400 CONVERSATION_REQUIRED` when conversation context is absent.
- `409 CONVERSATION_MISMATCH` for parent message from another conversation.

### Frontend

Remove inference patterns:

- Do not derive conversation from message ID or parent ID.
- Do not overwrite server-returned `conversation_id` with local fallback.
- Selection key should be `conversation:<id>`, never `message:<id>`.

---

## 4) Reply vs non-reply timeline messages

To support unlimited non-reply messages in same conversation:

- Default new message posts as timeline (`parent_message_id = null`).
- Reply UI sets `parent_message_id` explicitly.
- Conversation stream is still a flat chronological feed.
- Thread UI can render reply grouping locally by parent linkage.

This gives:

- unlimited normal messages,
- optional threaded sub-discussions,
- no dependency on a root message artifact.

---

## 5) Do we need root ID in conversation-based model?

Short answer: **No** (as identity).

- Use conversation row `id` as the one true identity.
- A “first message” can exist for UX, but it is not the conversation identifier.
- If old code needs root semantics, compute `first_message_id` as metadata only.

---

## 6) Pagination UX like notification dropdown

### Conversation list

- Initial load: `GET /messaging/conversations?limit=30`
- Infinite scroll down: request with `cursor=nextCursor`.
- Real-time updates: move touched conversation to top when new message arrives.

### Conversation message view

- Initial load latest page: `GET /messaging/conversations/:id/messages?limit=50`
- User scrolls up near top: fetch older page with message `cursor`.
- Prepend older messages; keep scroll anchored (preserve viewport position).

### Cursor rules

- Treat `cursor` as opaque server output (do not derive it client-side).
- Keep separate cursors for:
  - conversation list pagination
  - message pagination per conversation
- Reset message cursor when switching active conversation.

### Realtime merge rules

- If incoming message conversation matches open conversation:
  - append if new, update if existing.
- If not open:
  - increment unread count and bump conversation summary order.

---

## 7) Migration rollout (safe sequence)

1. Add `erp_conversations` and backfill from existing roots.
2. Backfill every `erp_messages.conversation_id`.
3. Add NOT NULL + FK constraints.
4. Deploy backend with strict contract but feature-flagged.
5. Deploy frontend with conversation-only IDs.
6. Enable strict mode (reject legacy fallback).
7. Remove dead compatibility code.

---

## 8) Concrete code-level refactor checklist

### Backend (`api-server/services/messagingService.js`)

- Replace message-root assumptions in:
  - message creation validation,
  - `getMessages` (conversation summaries should come from `erp_conversations`),
  - `getThread/getConversationMessages` naming and behavior.
- Introduce:
  - `listConversationMessages({ conversationId, cursor, limit })`.
- Keep `postReply` as thin wrapper to `postConversationMessage` with parent validation.

### Routes (`api-server/routes/messaging.js`)

- Keep:
  - `POST /conversations`
  - `POST /conversations/:id/messages`
  - `GET /messaging/conversations`
  - `GET /messaging/conversations/:id/messages`
- Deprecate/remove:
  - `/messages/:id/reply`
  - `/messages/:id/thread`
  - any message-root-driven endpoint.

### Frontend (`src/erp.mgt.mn/components/MessagingWidget.jsx`)

- Replace active key model with strict `conversation:<id>`.
- Build send target solely from selected conversation ID or create-new path.
- Remove fallback root derivation and local overwrite of `conversation_id`.
- Add `hasMoreMessagesByConversation` + `messageCursorByConversation` state for upward pagination.

---

## 9) Answering your direct questions

1. **All messages conversation based?**
   - Yes. Enforce `conversation_id NOT NULL` + FK + strict API.

2. **Unlimited non-reply messages in conversation?**
   - Yes. Make timeline message default (`parent_message_id = null`), replies optional.

3. **Do we have to use root id when messaging is conversation-based?**
   - No. Use `conversation.id` as identity; root message is optional metadata only.

4. **Load conversations by latest and load older on scroll up (notification-dropdown style)?**
   - Yes. Cursor-paginate conversation list by `last_message_at`, and paginate conversation messages by message cursor with upward infinite scroll.

## Rollback plan (short)

1. Disable tenant strict-mode flag to route tenants back to legacy read-only endpoints.
2. Keep `erp_conversations` and `erp_messages.conversation_id` data intact; do not drop columns during rollback.
3. Re-enable legacy route handlers only as temporary compatibility shim while repairing tenant-specific anomalies listed in `erp_message_conversation_repair_report`.
4. Replay failed writes from idempotency logs after strict mode is re-enabled.
