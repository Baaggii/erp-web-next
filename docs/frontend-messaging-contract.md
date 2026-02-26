# Frontend Messaging Contract (temporary alignment note)

This document locks the frontend assumptions to current backend behavior.

## Endpoints

- `GET /messaging/conversations`
  - Returns conversation rows from `erp_conversations`.
  - Payload shape: `{ items, pageInfo }`.
  - **Does not return thread message bodies for each conversation.**

- `GET /messaging/conversations/:conversationId/messages`
  - Returns message rows for a single conversation.
  - Payload shape: `{ conversationId, items, pageInfo }`.

- Send message flow
  - New conversation: `POST /messaging/conversations`
  - Existing conversation: `POST /messaging/conversations/:conversationId/messages`

## Frontend deprecation note

The previous frontend behavior that tried to extract message rows from `/messaging/conversations` response payloads is now deprecated and should not be used for new code paths.
