# Messaging Module Security Hardening Review

## Scope and Baseline

Reviewed artifacts:
- `api-server/routes/messaging.js`
- `api-server/services/messagingService.js`
- `api-server/server.js`
- `api-server/middlewares/auth.js`
- `api-server/controllers/authController.js`
- `src/erp.mgt.mn/components/MessagingWidget.jsx`
- `src/erp.mgt.mn/components/messagingWidgetModel.js`
- `src/erp.mgt.mn/utils/socket.js`
- `docs/messaging-openapi.yaml`

This review focuses on the messaging domain (REST, websocket signaling, presence, and draft attachment UX), tenant isolation, and operational controls.

---

## 1) Threat Model Updates

### A. XSS (stored + reflected)
**Current posture**
- Backend stores raw message body after length trimming and policy checks (`sanitizeBody`) but does not perform output encoding at API boundary.
- Frontend strips HTML-ish tags in `sanitizeMessageText` before rendering and renders in plain text paragraph nodes.

**Threats**
- Stored XSS can still arise if any future client renders message `body` via `dangerouslySetInnerHTML`, markdown renderer, rich text, mobile client, exports, or notifications.
- Tag stripping (`/<[^>]*>/`) is not a full sanitizer and can be bypass-prone when data is reused in different contexts (HTML attrs, URLs, templates).

**Risk**: Medium now, High if rich text is introduced without strict sanitization policy.

### B. CSRF
**Current posture**
- Global CSRF middleware enabled in server path using cookie token.
- Frontend fetch wrapper obtains token and applies `X-CSRF-Token` for mutating requests.

**Threats**
- Any non-wrapper client, integration script, or websocket auth path bypassing anti-CSRF can become an attack path.
- SameSite=Lax helps but does not replace CSRF defense for same-site subdomain risk or browser edge-cases.

**Risk**: Medium (generally good controls, but scattered client code paths and dual app/server entrypoints increase drift risk).

### C. SSRF via attachments
**Current posture**
- Messaging UI has attachment picker metadata, but messaging service has no binary upload pipeline yet.
- Other upload APIs (e.g., images) exist in the broader app.

**Threats**
- If attachment ingestion later accepts URLs or server-side fetch/import, SSRF (metadata endpoints, internal network probing) becomes likely.
- MIME confusion, polyglot payloads, and malicious document malware risk are currently ungoverned in messaging-specific flow.

**Risk**: Medium now (feature gap), High once file/URL attachments are enabled.

### D. Injection (SQL/command/template)
**Current posture**
- SQL uses parameterized placeholders for message CRUD and presence queries.
- Dynamic `IN (...)` in presence query is parameterized per generated placeholders.

**Threats**
- No strict allowlist for `linkedType`; only truncation + trim. This can become an authorization bypass vector if later mapped to resource routing logic.
- If future notification templates interpolate raw body in HTML email, template/script injection risk appears.

**Risk**: Low-to-Medium currently, rises with downstream integrations.

### E. Replay attacks
**Current posture**
- Idempotency key table prevents duplicate create for same user/company/key.
- No TTL or signature validation on idempotency key semantics.

**Threats**
- Replay of a stolen request with same cookies and same key can still reveal prior message object.
- Key reuse strategy not enforced (length/entropy/expiry), leaving abuse surface for key-space probing.

**Risk**: Medium.

### F. Websocket hijack / unauthorized subscriptions
**Current posture**
- Socket auth from JWT cookie, joins user/company/branch/department rooms.
- CORS origin is permissive (`origin: true`) with credentials.

**Threats**
- Overly permissive origin reflection increases cross-origin credentialed websocket exposure.
- No explicit origin allowlist or CSRF-style handshake nonce for websocket connect.
- Long-lived socket sessions are not revalidated for company context switches.

**Risk**: High.

### G. Tenant breakout
**Current posture**
- DB queries include `company_id` checks and session resolution (`getEmploymentSession`) before access.
- Company context can be user-provided and validated against membership.

**Threats**
- Socket room membership is created from JWT company at connect time; if user has multi-company permissions and stale token/context mismatch occurs, event exposure risk rises.
- Route mounted both `/api` and `/api/messaging`; inconsistent clients currently call legacy shape (`/messaging`) and socket events (`messages:new`) that differ from backend events (`message.created`), increasing fallback / compatibility code paths where tenant checks are often forgotten.

**Risk**: Medium.

---

## 2) Concrete Mitigations and Code-Level Recommendations

### Priority 0 (immediate)
1. **Lock websocket origins and transport security**
   - Replace Socket.IO `cors: { origin: true, credentials: true }` with explicit allowlist from env (array exact-match).
   - Reject handshake if `Origin` not allowlisted.
   - Enforce `cookie.secure=true` in production and terminate non-TLS upstream.

2. **Add secure headers via `helmet` (or equivalent) on server**
   - CSP, frame-ancestors, no-sniff, referrer-policy, strict transport security.
   - Add COOP/CORP as compatible with app behavior.

3. **Harden JWT and cookie policies**
   - Ensure JWT secret startup assertion (fail fast if missing).
   - Add issuer/audience checks in verify/sign.
   - Rotate refresh tokens (one-time-use with server-side revocation list/jti).

4. **Normalize messaging API contract mismatch**
   - Frontend currently calls `/messaging` expecting `{ messages, onlineUsers }` and emits `attachments`, `conversationId`; backend expects `/messages` and idempotency key.
   - This mismatch increases unsafe shim code and accidental bypasses.
   - Align to OpenAPI and reject unknown fields by schema validator.

### Priority 1 (next sprint)
5. **Schema-based request validation (Ajv/Zod) at route boundary**
   - Validate body/query/params for each endpoint.
   - Enforce strict patterns:
     - `idempotencyKey`: UUIDv4 or 128-bit random base64url; max 128 chars.
     - `linkedType`: enum allowlist (`transaction`, `plan`, `report`, etc.).
     - `linkedId`: context-specific format (numeric/uuid).

6. **Message content policy + output encoding strategy**
   - Store raw text only, render escaped text only.
   - If rich text required, use allowlist sanitizer (DOMPurify server+client parity) and store both raw + sanitized canonical form.
   - Add outbound encoding wrappers for email/push/websocket payloads.

7. **Replay and abuse hardening**
   - Add idempotency record TTL (e.g., 24h) and periodic cleanup job.
   - Bind idempotency to request digest: `hash(body + linkedType + linkedId + parentMessageId)`.
   - Add per-IP + per-user + per-company rate limits at HTTP gateway.

8. **Websocket authorization model**
   - On connect, issue short-lived socket token (5–10 min) derived from access token and rotate.
   - Authorize each subscription/join action server-side (company, branch, department).
   - Re-check membership on sensitive emit paths.

### Priority 2 (hardening maturity)
9. **Tenant isolation-in-depth**
   - Add DB-level row security equivalent pattern (if MySQL: strict query helper requiring companyId and test enforcement).
   - Add security unit tests for cross-company read/write denial on every endpoint.

10. **Security regression test suite**
   - Fuzz message body (control chars, Unicode bidi spoofing, long grapheme clusters).
   - CSRF negative tests, websocket origin tests, replay tests, and tampered JWT tests.

---

## 3) Content Security Policy and Secure Headers

Recommended baseline for this module (tune for current asset pipeline):

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  connect-src 'self' https://<api-origin> wss://<api-origin>;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
  form-action 'self';
  upgrade-insecure-requests;

Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
X-Frame-Options: DENY
```

Implementation notes:
- Prefer nonce-based CSP if inline scripts appear.
- Split dev/prod policies; never ship wildcard `connect-src *` in production.

---

## 4) Input Validation and Output Encoding Checklist

### API input validation checklist
- [ ] Enforce JSON schema for all messaging endpoints (`POST/PATCH/DELETE/GET`).
- [ ] Reject unknown properties (`additionalProperties: false`).
- [ ] Validate `companyId`, `messageId`, `cursor`, `limit` numeric ranges.
- [ ] Validate `userIds` list length and element pattern.
- [ ] Enforce `idempotencyKey` entropy/pattern and max length.
- [ ] Validate `status` enum for presence heartbeat.
- [ ] Validate linked context through allowlist + resource existence check.

### Output encoding checklist
- [ ] Escape all message body content for HTML context by default.
- [ ] Encode for URL context when building links from `linkedId`.
- [ ] Sanitize/escape for notification/email templates.
- [ ] For logs, truncate and normalize control characters.
- [ ] Never inject untrusted values into HTML attributes without context encoding.

---

## 5) Attachment Scanning Pipeline (Target Design)

Because messaging currently has attachment metadata only and no hardened server pipeline, implement this staged flow before enabling binary attachments:

1. **Upload initiation**
   - Client requests upload intent with filename, size, MIME claim, sha256.
   - Server returns short-lived pre-signed PUT URL to **quarantine** bucket prefix.

2. **Quarantine ingest**
   - Object store event triggers scanner worker.
   - Verify file size limits and extension allowlist.

3. **MIME/type validation**
   - Determine true MIME by magic bytes (`libmagic`), not client header.
   - Reject mismatches (`.jpg` containing executable/polyglot).

4. **AV and content disarm**
   - ClamAV/YARA scanning.
   - Optional CDR (for Office/PDF) to strip active content.

5. **Verdict handling**
   - `clean` → move to immutable `safe/` prefix and attach metadata record.
   - `infected` or `unknown` → retain in quarantine, block user access, emit security event.

6. **Delivery**
   - Generate short-lived signed GET URL (60–300s), bound to user+company claims.
   - Force safe response headers: `Content-Disposition: attachment` for risky types.

7. **Auditability**
   - Store hash, scanner version/signature set timestamp, verdict, operator action.

---

## 6) Secrets Management and Rotation Plan

1. **Secret inventory**
   - JWT signing keys, refresh keys, DB creds, SMTP/API keys, storage signing keys.

2. **Storage and access**
   - Move secrets to managed vault (AWS Secrets Manager/GCP Secret Manager/Vault).
   - Use workload identity, no static secrets in repo or env files beyond local dev.

3. **Rotation cadence**
   - JWT keys: every 90 days (or faster for high-risk env).
   - DB/API keys: 60–90 days.
   - Emergency rotation runbook with <1 hour execution target.

4. **JWT key rotation model**
   - Use `kid` header and JWKS-like active+previous key set.
   - Verify accepts current+previous; signing uses current only.
   - Expire previous after max token TTL + buffer.

5. **Detection controls**
   - Alert on secret access anomalies, failed decrypt bursts, and token verification spikes.

---

## 7) Audit Logging Schema and Tamper-Evidence Strategy

### Suggested audit log schema
`security_audit_events`
- `id` (ULID/UUID)
- `occurred_at` (UTC)
- `actor_empid`
- `actor_user_id`
- `company_id`
- `event_type` (`message.create`, `message.update`, `message.delete`, `attachment.scan_failed`, `auth.refresh`, ...)
- `resource_type` / `resource_id`
- `request_id` / `correlation_id`
- `source_ip`, `user_agent`
- `outcome` (`success|denied|error`)
- `risk_score` (0–100)
- `details_json` (strictly structured; no raw secrets)
- `prev_hash`, `event_hash` (chain linkage)

### Tamper-evidence approach
- Append-only log store (WORM bucket or immutable table policy).
- Hash-chain each row: `event_hash = SHA256(canonical_event_json + prev_hash)`.
- Hourly anchor latest hash to external trust point (KMS-signed record or external ledger bucket).
- Daily verification job; alert on chain discontinuity.

---

## 8) Incident Response Playbook

### A. Data leak scenario
1. **Detect & triage (0–30 min)**
   - Trigger: unusual export volume, cross-tenant query anomaly, leaked attachment URL.
   - Assign incident commander and severity.
2. **Contain (30–90 min)**
   - Revoke active sessions/tokens for affected scope.
   - Disable messaging attachment delivery endpoints.
   - Tighten WAF rules and block suspicious IPs.
3. **Eradicate (same day)**
   - Patch root cause (authorization bug, signed URL TTL issue, CSP bypass).
   - Rotate affected secrets/keys.
4. **Recovery**
   - Restore service with heightened monitoring and temporary rate limits.
5. **Post-incident**
   - Forensics report, timeline, blast radius, customer/legal notifications (GDPR/CCPA timelines).

### B. Account compromise scenario
1. Force password reset + MFA challenge for impacted users.
2. Invalidate refresh/access tokens and socket sessions.
3. Review `message.delete/edit/export` actions for malicious activity.
4. Backfill notifications and user-facing activity summary.

Operational SLOs:
- Time to contain high severity: ≤ 2 hours.
- Customer notification readiness: ≤ 72 hours for regulated breach workflows.

---

## 9) Compliance Checklist (GDPR/CCPA basics)

### Data retention
- [ ] Define retention class per message type (already modeled in lifecycle policy; enforce operationally).
- [ ] Implement scheduled purge jobs with legal hold override.
- [ ] Maintain deletion certificates for completed purge runs.

### Data export (DSAR)
- [ ] Export messages, metadata, attachments, and audit trail by data subject/company.
- [ ] Provide machine-readable package (JSON + manifest + hashes).
- [ ] Verify tenant boundary and requester authorization before export.

### Data deletion
- [ ] Support user-level deletion requests with policy exceptions (legal/financial retention).
- [ ] Soft-delete immediate, hard-delete after retention/legal review.
- [ ] Cascade deletion for attachments and signed URL invalidation.

### Transparency and control
- [ ] Update privacy notice for message content processing and retention periods.
- [ ] Expose in-product retention/help documentation.
- [ ] Record lawful basis and processor/subprocessor list for storage/scanning services.

---

## 10) Immediate Backlog (Executable)

1. Add `helmet` + CSP and strict socket origin allowlist.
2. Add schema validators for all messaging routes; reject unknown fields.
3. Align frontend messaging widget contract with `/api/messages` API and idempotency requirements.
4. Implement attachment quarantine + AV scan pipeline before enabling file upload send path.
5. Add cross-tenant security integration tests (REST and websocket).
6. Add append-only hashed security audit events and daily verifier job.

