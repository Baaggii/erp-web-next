# Messaging Workflow Reference

This document summarizes how message sending and conversation threading work in the messaging widget.

## Core model (important)

- In backend data, an existing conversation follow-up sent through `POST /messaging/messages` **with `conversationId`** is stored with `parent_message_id = <root message id>`.
- So technically it is attached under the root node in storage, but in UI this action is treated as “send to conversation” (top-level conversation message), not an explicit nested reply to a specific child message.
- Explicit nested reply uses `POST /messaging/messages/:id/reply` and sets parent to the exact replied message.

## 1) General conversation: first send message

- The widget always includes a synthetic `general` conversation bucket. It is not tied to a specific root message and has `rootMessageId: null`.
- When user selects **General**, send flow resolves `selectedIsGeneral = true`, so it treats the message as a company-wide message (`visibilityScope = 'company'`).
- For General sends, payload is posted to `POST /messaging/messages` without `conversationId`; no thread root is required.
- The client inserts an optimistic message immediately, then replaces it with server response.

## 2) General conversation: second and further sends

- Subsequent sends from General follow the same branch as first send:
  - `isGeneralChannel = true`
  - `visibilityScope = 'company'`
  - still no required `conversationId`
- Each send is another root-level company message unless user explicitly replies from a specific message context.
- Incoming real-time events (`message.created` / `thread.reply.created`) merge into local cache; if message isn’t directly visible from current cache context, the widget fetches the full thread for reconciliation.

### Why an "Untitled topic" conversation may appear

If a message does not satisfy the General classifier, it is grouped as a normal thread and title falls back to `Untitled topic` when no topic/link is present.
General classifier requires all of:
- no linked entity,
- `visibilityScope = company`,
- no extracted `[topic]` prefix.

So if message scope/context/topic metadata differs from those rules (or thread/root metadata is inconsistent), it can move out of General into an `Untitled topic` thread.

Implementation note: stale composer-linked context can also force a send out of General. The widget now clears/overwrites composer linked context when conversation selection changes, so selecting General cannot retain a previous thread's linkedType/linkedId.

## 3) New conversation creation workflow

- User picks recipients from employee list, then clicks **New conversation**.
- Widget dispatches `composer/start` with `conversationId = '__new__'` (draft mode), topic/recipients prefilled.
- On send in draft mode:
  - validates at least one recipient,
  - builds private participant set including sender,
  - posts to `POST /messaging/messages` with `visibilityScope = 'private'` and `recipientEmpids`.
- After success, returned root message id is used to switch active selection from draft (`__new__`) to concrete conversation key (`message:<rootId>`).

## 4) Second user sends message in selected conversation

- If selected conversation is an existing thread (non-General), widget resolves thread root and includes `conversationId` in payload.
- For normal follow-up (not explicit per-message reply), it posts to `POST /messaging/messages` with `conversationId = rootId`; backend maps that to `parent_message_id = root.id` and preserves thread conversation metadata.
- For explicit reply to a specific message, widget posts to `POST /messaging/messages/:id/reply`.
- Backend reply flow inherits visibility/linked context from target message and, for private threads, can expand participant list and backfill visibility across the thread.
- Real-time socket events are filtered by company + visibility; if access is uncertain, client performs thread fetch to hydrate proper participant/visibility data.

## Why send flow re-resolves selected conversation instead of blindly posting

Even after user clicks a conversation, the widget still validates/re-resolves selection before send. This is intentional safety against stale UI state:

- Conversation list is derived from current visible messages + access filtering, not from a permanent static table.
- A previously selected conversation can become invalid (company switch, permission/participant change, root message deleted, session restore mismatch, race with realtime updates).
- Before sending, the widget resolves current selected summary and root id (`conversationRootIdFromSelection`) and blocks send if that context is no longer valid.

So this is not trying to "guess" user intent; it is ensuring the selected conversation still exists and is sendable at the exact send moment, avoiding wrong-thread or orphan sends.
