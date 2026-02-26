# Messaging module workflow inspection and conversation-based conversion plan

## Scope and current-state summary

This report inspects the current runtime messaging workflow implemented by:

- `api-server/routes/messaging.js`
- `api-server/services/messagingService.js`
- `src/erp.mgt.mn/components/MessagingWidget.jsx`
- `src/erp.mgt.mn/components/messagingWidgetModel.js`

Current production behavior is **root-message conversation identity** (conversation id == root message id), even though the routes are named with `/conversations/...`.

---

## 1) Current messaging module workflows (detailed)

### 1.1 HTTP/API workflow (router level)

The messaging router exposes both generic message endpoints and conversation-labeled endpoints:

- `POST /messaging/messages` -> `postMessage`
- `POST /messaging/conversations` -> `createConversationRoot`
- `POST /messaging/conversations/:conversationId/messages` -> `postConversationMessage`
- `GET /messaging/conversations` -> `listConversations`
- `GET /messaging/conversations/:conversationId/messages` -> `getConversationMessages`
- `POST /messaging/messages/:id/reply` -> `postReply`
- Presence endpoints (`/presence`, `/presence/heartbeat`) and upload endpoints also live here.

The request body schema currently accepts both `conversationId` and `conversation_id` for compatibility.

### 1.2 Send-message workflow (service level)

`postMessage()` performs the core orchestration:

1. Validates schema availability (`erp_messages` existence check).
2. Resolves company session and permissions.
3. Accepts optional `conversationId` and `parentMessageId`.
4. Enforces `conversationId` when `parentMessageId` is provided.
5. Resolves target conversation by loading a **message row** and requiring that row to be the root (`id == conversation_id`).
6. For non-reply message in an existing conversation, auto-sets `parentMessageId` to root id.
7. Delegates insert to `createMessageInternal()`.

`createMessageInternal()` then:

- validates content and abuse/rate limits,
- applies visibility rules,
- inserts into `erp_messages`,
- upserts idempotency row (`erp_message_idempotency`),
- updates inserted row `conversation_id` to canonical id (or self for root),
- emits socket events.

### 1.3 Create-conversation workflow

`createConversationRoot()` forcibly nulls `parentMessageId` and `conversationId`, then calls `postMessage()`.

Effectively, creating a conversation means creating a root message first; no separate `erp_conversations` table write occurs in runtime.

### 1.4 Read workflows

#### Conversation list

`getMessages()` builds conversation summaries by querying `erp_messages` with `parent_message_id IS NULL` (root rows).

#### Conversation messages/thread

`getThread()` resolves root as `conversation_id || id` and traverses descendants in memory from all messages in company scope. It also inserts a read receipt for root into `erp_message_receipts`.

### 1.5 Reply workflow

`postReply()`:

- loads parent message,
- verifies thread depth,
- enforces same `conversation_id` when provided,
- calls `createMessageInternal()` with parent id + conversation id inherited from parent.

For private visibility, it can expand participant visibility across existing thread messages.

### 1.6 Widget workflow (frontend)

The widget behaves like conversation-based UX but still maps to root-message identity:

- active selection uses `activeConversationId` in state.
- message sending determines a `fallbackRootReplyTargetId` and posts to:
  - `/messaging/conversations` for new conversation root,
  - `/messaging/conversations/:rootId/messages` for follow-up/reply.
- payload still may include `conversationId` = root id and optional `parentMessageId`.
- thread refresh logic derives root from `conversation_id || parent_message_id || id`.

So UX is conversation-oriented, but persistence/identity is still coupled to root message.

---

## 2) Consistent conversion approach to true conversation-based model

## Target principle

Use a dedicated `erp_conversations.id` as the **only conversation identity**.

Messages must reference `erp_messages.conversation_id -> erp_conversations.id`.

Root-message identity must be removed from data invariants.

### 2.1 Data model target

Create/standardize:

- `erp_conversations`
  - `id`, `company_id`
  - `linked_type`, `linked_id`
  - `visibility_scope`, `visibility_department_id`, `visibility_empid`
  - `created_by_empid`, `created_at`
  - `last_message_id`, `last_message_at`
  - optional metadata (`title`, `deleted_at`, `deleted_by_empid`)

- `erp_messages`
  - `conversation_id` NOT NULL FK to `erp_conversations.id`
  - `parent_message_id` nullable for optional nested replies
  - keep `author_empid`, `body`, visibility, audit/delete columns

### 2.2 API contract target

- `POST /messaging/conversations`
  - Create conversation row first.
  - Optionally create initial message with `parent_message_id = null`.
- `POST /messaging/conversations/:conversationId/messages`
  - Always requires path conversation id.
  - `parentMessageId` optional, but if present must belong to same conversation.
- `GET /messaging/conversations`
  - Source from `erp_conversations` ordered by `last_message_at DESC, id DESC`.
- `GET /messaging/conversations/:conversationId/messages`
  - Source directly from `erp_messages WHERE conversation_id = ?` with cursor pagination.

Deprecate/remove legacy message-root endpoints once clients migrate.

### 2.3 Service refactor strategy (consistent and low-risk)

1. Add conversation repository helpers:
   - `findConversationById`,
   - `createConversation`,
   - `touchConversationLastMessage`.
2. Split creation flow:
   - `createConversation()` (table write),
   - `postConversationMessage()` (message write only).
3. Remove fallback identity resolution:
   - no `conversation_id || parent_message_id || id`.
4. Enforce strict validation:
   - missing conversation context => `CONVERSATION_REQUIRED`.
   - parent from different conversation => `CONVERSATION_MISMATCH`.
5. Update delete semantics:
   - deleting conversation should mark/delete by `erp_conversations.id`, not root message id.
6. Keep idempotency, abuse logging, receipts, presence unchanged except for joining by conversation id where needed.

### 2.4 Frontend refactor strategy

1. Selection key remains `conversation:<id>` semantics, but id now comes from `erp_conversations.id`.
2. Remove root derivation helpers and fallback logic:
   - no `fallbackRootReplyTargetId` requirements.
3. Send flow:
   - new conversation -> POST `/conversations`, capture returned conversation id.
   - subsequent messages -> POST `/conversations/:id/messages`.
4. Reply mode:
   - still uses `parentMessageId`, but always with existing conversation id.
5. Thread refresh:
   - fetch by selected conversation id only.

### 2.5 Migration rollout sequence

1. Create `erp_conversations` with indexes.
2. Backfill conversation rows from existing root messages.
3. Backfill all `erp_messages.conversation_id` to new conversation ids.
4. Add FK + NOT NULL constraints.
5. Deploy backend dual-read/dual-write under feature flag.
6. Deploy frontend conversation-id-only behavior.
7. Enable strict mode (reject root fallback).
8. Remove dead compatibility code and legacy endpoints.

---

## 3) Is root message mandatory in conversation-based model?

**No.**

In a true conversation-based model, root message is not required as identity and should not be mandatory.

What can still be true:

- A conversation may optionally have a first message (for UX).
- `parent_message_id` remains optional for reply trees.
- Timeline messages can be unlimited with `parent_message_id = null`.

Mandatory identity should be `erp_conversations.id`, not a message id.

---

## 4) What else is needed to complete conversion

Beyond schema + service + widget changes, the following are required:

1. **Permissions model update**
   - Evaluate access at conversation resource level (`conversation:create/read/update/delete`) and propagate to message actions.

2. **Socket/event payload contract update**
   - Ensure all events contain canonical `conversation_id` from conversation table.
   - Remove any fallback consumers that infer from parent/root ids.

3. **Data lifecycle alignment**
   - legal hold scopes and purge jobs should target canonical conversation ids from `erp_conversations`.

4. **Search/indexing updates**
   - add and tune indexes:
     - `erp_messages(company_id, conversation_id, id DESC)`
     - `erp_conversations(company_id, last_message_at DESC, id DESC)`

5. **Conversation summary materialization policy**
   - define whether to maintain denormalized summary fields (`last_message_id`, `last_message_at`, unread counters) synchronously or via async workers.

6. **Comprehensive tests**
   - service tests for strict conversation checks,
   - migration tests for backfill correctness,
   - widget integration tests for new conversation and reply flows,
   - socket contract tests.

7. **Operational rollout controls**
   - feature flags,
   - migration dry run + repair reports,
   - metrics + alerting for conversation mismatch errors post-cutover.

8. **Cleanup of unused tables/paths**
   - decide whether to keep or remove currently unused participant/recipient legacy paths to avoid future drift.

---

## 5) Practical final recommendation

Use a two-phase conversion:

- **Phase A (compatibility):** introduce `erp_conversations`, dual-write conversation metadata, keep existing behavior readable.
- **Phase B (strict):** enforce conversation-id-only APIs, remove root-message identity assumptions, and simplify both backend and widget.

This is the safest way to reach a clean conversation-based architecture without breaking existing tenants.
