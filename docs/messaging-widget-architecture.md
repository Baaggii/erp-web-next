# Messaging Widget Architecture (ERP Frontend)

## Component tree

- `MessagingWidget`
  - `CollapsedLauncher`
    - unread badge
    - collaborator presence summary (online/away/offline)
  - `ExpandedShell`
    - `CompanyContextSwitcher`
    - `ConversationList`
    - `ActiveThreadView`
      - `MessageNode` (recursive nested replies)
      - reply count
      - jump-to-parent control
      - linked context chips (transaction / plan / topic)
    - `ComposerPanel`
      - inline reply state
      - message editor
      - attachment picker
      - safe preview list

## State management strategy

- UI + composer state use `useReducer` (`messagingWidgetReducer`) for deterministic transitions.
- Session-aware persistence (per-user key namespace):
  - open/closed state,
  - last active company,
  - last active conversation.
- Messages cached by company key (`company:<id>`) to enforce isolation.
- Socket events are merged only for the active company to avoid cross-company data bleed.

## Cache invalidation rules

1. **Company switch**:
   - dispatch hard reset action (`company/switch`),
   - clear stale company buckets from in-memory cache,
   - clear presence snapshot,
   - reset composer state.
2. **Session switch**:
   - storage keys are session-prefixed; one session cannot read another's persisted widget state.
3. **Message send**:
   - optimistic composer reset after `POST /messaging` success.
4. **Socket events**:
   - ignore events whose `company_id` does not match active context.

## Loading, empty, and error states

- **Loading**: `Loading messages…` while fetch is in flight.
- **Empty conversations**: `No conversations yet.` in list.
- **Empty active thread**: `No messages in this thread.`
- **Error**: alert-style message with network failure reason.

## Security model

- **Sanitization**: message text is sanitized (strip tags + control chars) before rendering/sending.
- **Attachment safety**: preview/attachment list allows only safe MIME families (image/pdf/text).
- **Permission-gated navigation**: linked context chip actions are disabled unless allowed by permissions.

## Accessibility strategy

- ARIA labels for open/collapse, composer, attachment picker, context controls.
- Live regions for screen-reader announcements (send success/errors, attachment changes).
- Keyboard shortcut: Ctrl/Cmd + Enter to send.
- Color usage is paired with text labels for presence state to support color-contrast and non-visual contexts.

## Frontend tests

- Unit:
  - reducer state transitions,
  - storage key generation,
  - sanitization,
  - file preview safety filter.
- E2E:
  - collapsed → expanded toggle,
  - per-session persistence,
  - company switch hard reset,
  - inline reply rendering and jump-to-parent,
  - attachment picker safe file handling,
  - keyboard send shortcut.
