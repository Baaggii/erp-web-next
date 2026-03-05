# Notifying Message Owners About Reactions (Add + Remove)

This proposal adds owner-focused notifications when someone reacts to a message, and when a prior reaction is removed.

## Recommended behavior

- Notify only the **original message owner** (`messages.empid`) for both events:
  - `reaction_added`
  - `reaction_removed`
- Do **not** notify when users react/remove reactions on their own messages.
- Group-spam protections:
  - Debounce repeated identical events from same actor/emoji/message within a short window (for example 30–60s).
  - Optional digest fallback for high-volume channels (for example “5 people reacted to your message”).
- Include enough payload for UI deep-linking:
  - `messageId`, `conversationId`, `channelId` (if any), `actorEmpid`, `emoji`, `eventType`, `createdAt`.

## Where to hook this in current codebase

Reaction write paths already exist in `api-server/services/messagingService.js`:

- `addReaction(...)`
- `removeReaction(...)`
- `toggleReaction(...)`

Best approach:

1. After reaction DB mutation succeeds, fetch the message owner for `messageId`.
2. Build event payload (`reaction_added` or `reaction_removed`).
3. Publish to existing notification channel(s):
   - in-app notification record (notifications table/service)
   - websocket event for online owner session
   - optional push/email preference-based fanout

## Suggested implementation shape

- Add a small helper in `messagingService`:
  - `notifyMessageOwnerReactionEvent({ companyId, messageId, actorEmpid, emoji, eventType })`
- Inside helper:
  1. Resolve target message + owner (single SQL join/query).
  2. Guard clauses:
     - message missing/deleted -> no-op
     - owner equals actor -> no-op
  3. Persist notification (`type: messaging.reaction.added|removed`).
  4. Emit websocket event to owner room.

## Data model suggestions

If using the existing generic `notifications` table, set:

- `type`: `messaging.reaction.added` or `messaging.reaction.removed`
- `related_id`: message id
- `recipient_empid`: message owner
- `message`: user-readable text like:
  - `"{actor} reacted {emoji} to your message"`
  - `"{actor} removed {emoji} reaction from your message"`
- metadata JSON (if available):
  - actor, emoji, conversation/channel context

If metadata column does not exist, encode minimally in websocket payload and reconstruct UI details from message id on client fetch.

## Client UX recommendation

- Reuse one notification card template with event-specific verb:
  - Added: “reacted with 😀”
  - Removed: “removed 😀 reaction”
- Clicking notification opens the conversation and scrolls to target message.
- For removed reactions, visually mark as activity event (not error/warning).

## Edge cases to handle

- Soft-deleted message after reaction write but before notify: silently skip.
- Owner no longer has access to conversation (membership changed): skip notification.
- Bulk reaction storms on popular messages: aggregate into rolling summary.
- Idempotency for retries: stable dedupe key such as
  - `{companyId}:{messageId}:{actorEmpid}:{emoji}:{eventType}:{minuteBucket}`.

## Minimal rollout plan

1. Implement in-app + websocket only.
2. Add tests:
   - add reaction sends owner notify
   - remove reaction sends owner notify
   - self-reaction does not notify
3. Add optional push/email in second phase behind feature flag.
