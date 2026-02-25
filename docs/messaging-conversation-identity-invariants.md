# Messaging conversation identity invariants

## Canonical invariants

1. Every conversation is identified by `conversation_id` (stable, root-message id).
2. Root messages must persist with `conversation_id = id`.
3. Replies must persist with `conversation_id = parent.conversation_id`.
4. Conversation-scoped deletion is deterministic: deleting a root applies to the full `conversation_id` set.
5. API boundaries accept both `conversationId` and `conversation_id`; service internals use `conversation_id`.

## Service workflow updates

- `postMessage` now normalizes incoming conversation identifiers and, when targeting an existing conversation, always writes replies against that existing root and reuses that `conversation_id`.
- `postReply` rejects payloads where provided conversation id disagrees with the parent/root conversation.
- `getThread` resolves from any message id to the conversation root by canonical `conversation_id` before loading descendants.
- `deleteMessage` treats root deletion as conversation deletion and applies one deterministic update for all messages in that conversation.
- Real-time events include conversation delete broadcast via `conversation.deleted` for root-triggered deletes.

## Migration/backfill strategy

- Backfill populates missing conversation ids from parent traversal, then flags unresolved rows in `erp_message_conversation_backfill_report`.
- Ambiguous/unresolvable rows fall back to self-root (`conversation_id = id`) and are reported for manual audit.
- DB triggers enforce root/reply invariants and conversation immutability.
