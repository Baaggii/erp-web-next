# Messaging conversation logic (backend + widget behavior)

## 1) Core entities and identity

- A **message** is a row in `erp_messages`.
- A **conversation** is represented by a canonical `conversation_id` shared by all messages in that thread.
- The **root message** is the message whose `id` equals the conversation's canonical `conversation_id` and whose `parent_message_id` is `NULL`.

The service treats conversation identity as canonical and immutable once stored.

## 2) First message behavior

When creating a brand-new conversation, the API path is `POST /api/messaging/conversations`, which calls `createConversationRoot()`. That helper forcibly clears `parentMessageId` and `conversationId`, then delegates to `postMessage()`. The insert then backfills `conversation_id` to the newly created message id, so root messages self-reference their own id as conversation identity.

## 3) Non-reply messages behavior

A non-reply message is one without `parentMessageId`.

- If no `conversationId` is provided, it creates a new root conversation.
- If `conversationId` is provided, `postMessage()` resolves the target root and auto-sets `parentMessageId` to that root id. This means a non-reply posted into an existing conversation is normalized into a direct child of the root.

So in this system, any additional non-reply message in an existing conversation is effectively a first-level thread entry under the root.

## 4) Second and further non-reply messages

For the second (and later) non-reply messages in the same conversation:

- Client sends to `POST /api/messaging/conversations/:conversationId/messages`.
- Server enforces canonical conversation identity and sets parent to root when omitted.
- Result: each such message shares the same `conversation_id` and gets `parent_message_id = root.id`.

These are siblings under the same root, not nested replies.

## 5) Difference between first vs second+ messages

- **First message of a conversation**: root (`parent_message_id = NULL`, `conversation_id = self id`).
- **Second+ non-reply in same conversation**: child of root (`parent_message_id = root id`, `conversation_id = root conversation id`).
- **Explicit reply**: child of the selected parent message (`parent_message_id = explicit parent`), while still forced to same `conversation_id`.

## 6) Why a separate conversation is created on first message

Because the model uses root-message identity as the conversation key. Without an existing root, the first message must establish canonical identity. The service and migrations enforce this by setting roots to self-reference conversation id and by guards/FKs/constraints that require reply rows to match the parent's conversation identity.

## 7) Meaning of root message

The root message is the canonical anchor of a thread:

- conversation summary/list endpoints list root messages (`parent_message_id IS NULL`),
- thread fetch resolves any message id to its root via `conversation_id`, then traverses descendants.

## 8) Meaning of multiple root messages

Multiple rows with `parent_message_id IS NULL` means multiple independent conversations.

Normally each root should have unique self-referencing `conversation_id = id`; if data has anomalies (e.g., wrong/missing conversation_id), migrations include backfill + repair/report logic for unresolved or mismatched parent-conversation relationships.

## 9) Where main messaging logic is defined

Primary orchestration lives in `api-server/services/messagingService.js`:

- create/post flows: `postMessage`, `createConversationRoot`, `postConversationMessage`, `postReply`
- read flows: `getMessages` (conversation list roots), `getThread` (root + descendants)
- delete flow: root delete marks whole conversation deleted by `conversation_id`

HTTP contract is in `api-server/routes/messaging.js` and the widget sending strategy is in `src/erp.mgt.mn/components/MessagingWidget.jsx`.
