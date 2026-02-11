# Secure Messaging STRIDE Threat Model

## Context
Threat model applies to:
- `GET /api/messaging`
- `POST /api/messaging`
- Socket events `messages:new`, `messages:presence`
- Tables `erp_messages`, `erp_message_recipients`

## Trust boundaries
1. Browser client ↔ API server (HTTP + cookie auth).
2. Browser socket client ↔ Socket.IO server.
3. API server ↔ database.
4. In-memory process state (presence/rate limit maps) ↔ multi-instance deployment boundary.

## STRIDE matrix

| Category | Threat scenario | Current controls | Gaps / follow-ups |
|---|---|---|---|
| **S — Spoofing** | Attacker attempts to post/read as another user/company. | `requireAuth` + JWT verification; company scoped by employment session resolution. | Add explicit correlation/audit IDs per request for forensic traceability. |
| **T — Tampering** | Payload manipulation (invalid root-link combinations, forged parent IDs). | Root-link cardinality check and parent existence/depth checks in service layer. | Add DB-level constraints/triggers to reduce reliance on app-only enforcement. |
| **R — Repudiation** | User denies sending a message. | Message rows contain author, timestamps; app logs exist globally. | Add messaging-specific immutable audit log (create/edit/delete/moderation actions). |
| **I — Information disclosure** | Cross-company/thread leakage or unauthorized recipient visibility. | Message queries scoped by `company_id` + recipient filter and moderator override. | Add field-level data classification + stricter privacy test coverage (IDOR/BOLA cases). |
| **D — Denial of service** | Message flood or duplicate spam overwhelms service. | In-memory window rate limiting + duplicate suppression. | Externalize limits to shared store (e.g., Redis) and add WAF/API gateway quotas. |
| **E — Elevation of privilege** | Standard user performs moderator-only operations. | `canModerate`/`canSend` permission checks. | Formalize RBAC/ABAC matrix and enforce in all future endpoints. |

## Highest-priority risks
1. **Distributed bypass of in-memory anti-abuse controls** in multi-instance mode.
2. **Application-only integrity constraints** (root-link, depth), vulnerable to alternate write paths.
3. **Insufficient non-repudiation/audit trail** for investigations/compliance.

## Security backlog derived from this model
- Introduce centralized rate limit store and abuse event pipeline.
- Add DB constraints/migrations for root-link + depth invariants where feasible.
- Add messaging audit tables and retention policy.
- Define incident response runbook tied to alerting thresholds.
