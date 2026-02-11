# Enterprise Messaging — QA, Acceptance, Rollout, and Gap Closure

## 1) End-to-End QA + Acceptance Plan

### 1.1 Scope and test objectives
This plan validates enterprise messaging across functional behavior, multi-tenant isolation, permissions, real-time presence, session continuity, security hardening, and data lifecycle controls.

Primary outcomes:
- Verify thread/message behaviors are correct and bounded (depth and linkage).
- Prove tenant/company isolation at UI, API, and DB layers.
- Confirm role-based authorization is enforced continuously, including role revocation during an active session.
- Validate real-time consistency for presence and websocket events across connectivity disruptions.
- Ensure lifecycle/legal controls are enforceable and auditable.

---

### 1.2 Test case matrix

| ID | Area | Scenario | Preconditions | Steps | Expected Result / Acceptance Criteria | Type | Priority |
|---|---|---|---|---|---|---|---|
| THR-01 | Threading | Create top-level thread | User has messaging:create in company A | Create new thread with subject/body | Thread created with depth=0; visible to authorized users in company A only | API+UI | P0 |
| THR-02 | Threading | Reply to thread (depth +1) | Existing thread depth=0 | Post reply | Reply saved with parent_id set; depth=1; ordered correctly in UI tree | API+UI | P0 |
| THR-03 | Threading | Reply chain up to max depth | Max depth config available (e.g., 5) | Post replies until max depth reached | Replies at depth <= max accepted; all ancestors resolved | API | P0 |
| THR-04 | Threading | Reject reply beyond max depth | Existing node at max depth | Attempt reply to max-depth node | Request rejected with explicit error code (e.g., 422 DEPTH_LIMIT_EXCEEDED); no DB insert | API+DB | P0 |
| THR-05 | Threading | UI depth affordance | Same as THR-04 | Open composer on max-depth node | UI disables/hides reply with explanatory tooltip; no API call dispatched | UI | P1 |
| LNK-01 | Linked/unlinked | Create linked message to transaction | User has link:transaction permission | Compose message with transaction_id | Message stored with transaction_id; link chip visible/clickable | API+UI | P0 |
| LNK-02 | Linked/unlinked | Create linked message to plan/topic | User has link:plan/topic permission | Compose with plan_id/topic_id | Correct link fields persisted and rendered | API+UI | P1 |
| LNK-03 | Linked/unlinked | Create unlinked message | No linked context selected | Compose standard message | Message persisted with null link references; no broken chips | API+UI | P0 |
| LNK-04 | Linked/unlinked | Invalid foreign link target | Nonexistent transaction/plan/topic id | Submit linked message | API rejects with 404/422; no orphan linkage in DB | API+DB | P0 |
| ISO-01 | Isolation | Company-scoped UI list | User has access to companies A+B | Switch company selector | UI only lists threads for active company; no leakage from inactive company | UI | P0 |
| ISO-02 | Isolation | API cross-company access denied | User session company=A | Query thread from company=B | API returns 403/404; audit record emitted | API | P0 |
| ISO-03 | Isolation | DB row-level tenant filter | Seed data across tenants | Run repository queries | SQL includes tenant/company predicates; no rows from foreign tenant | DB/integration | P0 |
| ISO-04 | Isolation | Cache key isolation | Redis/cache enabled | Fetch/update thread in tenant A then B | Distinct cache namespaces/keys prevent cross-tenant contamination | integration | P1 |
| PERM-01 | Permissions | Role allows read/write | Role matrix configured | Read/post message | Allowed operations succeed; disallowed actions hidden | API+UI | P0 |
| PERM-02 | Permissions | Role denied write | Read-only role | Attempt compose/send | UI blocks send; direct API call returns 403 | API+UI | P0 |
| PERM-03 | Permissions | Revoked role mid-session | Active websocket + role revoked server-side | Attempt send/fetch after revocation | Next request denied; websocket auth invalidated; client rehydrates permissions | API+WS+UI | P0 |
| PERM-04 | Permissions | Permission drift after token refresh | Token-based auth enabled | Refresh token after role change | New token claims enforce updated role; stale claim rejected by server validation strategy | API/auth | P1 |
| PRES-01 | Presence | Disconnect/reconnect fast path | 2 users in same thread | Drop network briefly then restore | Presence transitions online→offline→online within SLA; no duplicate sessions | WS | P1 |
| PRES-02 | Presence | Tab sleep/visibility resume | Browser tab backgrounded | Sleep > heartbeat window then focus | Presence degrades to away/offline and recovers on resume | WS+UI | P1 |
| PRES-03 | Presence | Multi-tab identity merge | Same user in 2 tabs | Close one tab | User remains online until last active tab/session closes | WS | P2 |
| WID-01 | Widget session | Open/close persistence | Session storage available | Open widget, reload page | Open state persists per user/session key | UI | P1 |
| WID-02 | Widget session | Draft persistence | Composer contains unsent draft | Refresh page | Draft restored according to product rule (persist or clear deterministically) | UI | P2 |
| WID-03 | Widget + company switch | Switch company with active thread | Company A thread open | Switch to company B | Context resets safely; no company A thread displayed; composer cleared/guarded | UI+API | P0 |
| SEC-01 | Security | IDOR via message/thread IDs | User in company A | Attempt direct fetch/update/delete of company B message ID | All attempts denied; no metadata leak in response body | API | P0 |
| SEC-02 | Security | Stored XSS payload in message | Sanitization pipeline enabled | Post `<img onerror=...>` payload | Payload rendered safely (escaped/sanitized); no script execution | UI+API | P0 |
| SEC-03 | Security | Reflected XSS through filters/search | Search endpoint exists | Submit script payload in query params | Response/DOM neutralizes payload; CSP intact | UI+API | P1 |
| SEC-04 | Security | Unauthorized websocket event publish | WS uses event ACL | Emit privileged event without permission | Event rejected + logged; no fanout to subscribers | WS | P0 |
| SEC-05 | Security | Replay/resubmission protection | Idempotency support enabled | Replay same send request | Exactly-once semantics or duplicate marking per policy | API | P1 |
| DLC-01 | Data lifecycle | Retention purge schedule | Retention policy configured | Run purge job | Expired messages purged/anonymized as configured; immutable audit trail retained | DB+jobs | P0 |
| DLC-02 | Data lifecycle | Soft delete and restore | Message soft-delete feature enabled | Soft delete then restore | Deleted message hidden by default and recoverable until retention cutoff | API+DB+UI | P1 |
| DLC-03 | Data lifecycle | Legal hold blocks purge | Legal hold enabled on thread/user/case | Execute purge job | Held records excluded from purge; hold reason traceable | DB+jobs | P0 |
| DLC-04 | Data lifecycle | Hold removal resumes lifecycle | Existing legal hold removed | Re-run purge/backfill | Records become eligible in next cycle with audit evidence | DB+jobs | P1 |

---

### 1.3 Automation priority and strategy

#### Tier definitions
- **P0 (must automate before GA):** tenant isolation, authz enforcement, depth limits, IDOR/XSS/unauthorized websocket events, retention/legal-hold correctness.
- **P1 (automate before broad rollout):** presence reconnect accuracy, cache isolation, company-switch safety, advanced permission/token drift.
- **P2 (automate opportunistically):** multi-tab presence nuances, draft persistence UX detail.

#### Recommended automation split
- **API/integration (primary):** Supertest/Newman/Postman + seeded DB fixtures for deterministic authorization and lifecycle tests.
- **UI E2E (critical user journeys):** Playwright/Cypress for thread reply tree, company switch reset, XSS rendering, session persistence.
- **Websocket contract tests:** Event-level tests for subscription auth, presence heartbeat, disconnect/reconnect.
- **DB/job tests:** Nightly integration jobs validating retention purge and legal-hold exclusion with audit table verification.

#### Suggested minimum automated suite for release readiness
- 100% pass on all P0 test cases.
- >= 90% pass on P1 with only documented known issues not impacting confidentiality/integrity.
- No open Sev-1/Sev-2 defects related to messaging security or tenant isolation.

---

### 1.4 Release gate checklist

#### Functional gate
- [ ] Thread create/reply flow validated including max-depth enforcement (API + UI behavior).
- [ ] Linked/unlinked messages for transaction/plan/topic validated end-to-end.
- [ ] Company switch behavior deterministic and leakage-free.

#### Security gate
- [ ] IDOR tests pass for read/update/delete/message-link routes.
- [ ] Stored/reflected XSS regressions pass with sanitization/CSP verified.
- [ ] Unauthorized websocket events are blocked and audited.

#### Isolation & authorization gate
- [ ] UI/API/DB tenant isolation tests pass on seeded cross-tenant datasets.
- [ ] Mid-session role revocation revokes effective permissions within defined SLA.

#### Reliability gate
- [ ] Presence transition accuracy validated for disconnect/reconnect and tab sleep.
- [ ] Websocket reconnect behavior does not create duplicate identity/presence ghosts.

#### Data governance gate
- [ ] Retention purge validated in staging with dry-run report and sampled hard verification.
- [ ] Soft delete restore behavior verified against retention windows.
- [ ] Legal hold exclusion verified and audited.

#### Operational gate
- [ ] Dashboards/alerts for websocket errors, queue delay, purge failures, and authz denies are live.
- [ ] Runbooks reviewed by on-call and support teams.
- [ ] Rollback playbook tested at least once in staging canary.

---

## 2) Production Rollout + Operations Plan

### 2.1 Feature flag strategy (company + role)
- Introduce hierarchical flags:
  - `messaging.enabled` (global kill switch)
  - `messaging.company.<companyId>.enabled`
  - `messaging.role.<role>.enabled`
  - `messaging.capability.<capability>` (reply-depth, linked-context, attachments, presence)
- Resolution rule: **deny by default**, then enable by global -> company -> role/capability intersection.
- Audit each flag evaluation with user/company/role snapshot for incident forensics.

### 2.2 Canary strategy and rollback triggers

#### Phased rollout
1. **Internal canary (employees/test tenants):** 1-2 companies, low volume.
2. **Pilot canary:** 5-10% of eligible companies by risk profile.
3. **Progressive ramp:** 25% -> 50% -> 100% over planned windows.

#### Promotion criteria between phases
- Error budget within threshold (e.g., <1% API 5xx for messaging endpoints).
- No Sev-1 incidents and no unresolved Sev-2 isolation/security defects.
- Queue latency and websocket reconnect rates within SLO.

#### Automatic rollback triggers
- Spike in authz denials inconsistent with baseline (possible permission bug).
- Any confirmed tenant data leakage incident.
- Sustained websocket failure > X minutes.
- Queue backlog surpassing threshold and message delays > SLA.
- Increased client-side crash/XSS detection signal.

Rollback action:
- Immediate disable with `messaging.enabled=false` and selective company overrides.
- Pause retention-destructive jobs if data consistency is in question.
- Preserve audit/event logs for postmortem.

### 2.3 Data migration and backfill sequencing
1. **Pre-migration checks:** schema drift audit, index readiness, nullable defaults, lock impact analysis.
2. **Expand phase:** add new columns/tables/indexes backward-compatible.
3. **Dual-write phase (optional):** write old+new structures for verification window.
4. **Backfill phase:** id-range/time-window batching with checkpointing and retry.
5. **Consistency verification:** row counts, checksum samples, referential integrity for links.
6. **Cutover phase:** switch reads to new path behind flag.
7. **Contract phase:** remove deprecated paths after stability window.

Guardrails:
- Idempotent migration scripts.
- Pause/resume controls.
- Backfill observability: throughput, lag, error class distribution.

### 2.4 Operational runbooks

#### A) Websocket outage runbook
- Detect: connection drop rate, failed handshake rate, heartbeat timeout alarms.
- Mitigate:
  - Shift clients to polling fallback mode.
  - Scale WS gateway pods/workers.
  - Validate TLS/cert and load balancer sticky-session settings.
- Recover:
  - Staged reconnect jitter to avoid thundering herd.
  - Verify presence correction sweep job.
- Post-incident:
  - Reconcile missed events via durable queue replay.

#### B) Redis outage runbook
- Detect: Redis health/read-write timeout alerts.
- Mitigate:
  - Enable degraded mode (disable ephemeral presence or reduce TTL reliance).
  - Route to replica/failover if configured.
  - Protect DB with rate limiting and cache-bypass safeguards.
- Recover:
  - Warm critical keys.
  - Validate tenant key namespace integrity.
- Post-incident:
  - Review eviction policy and memory headroom.

#### C) Queue backlog runbook
- Detect: consumer lag, oldest message age, dead-letter growth.
- Mitigate:
  - Increase consumer concurrency.
  - Prioritize latency-sensitive message delivery queues.
  - Temporarily disable non-critical background jobs.
- Recover:
  - Drain backlog under controlled throughput.
  - Reprocess DLQ with capped retries.
- Post-incident:
  - Tune partitioning, retry strategy, and poison-message handling.

### 2.5 Support documentation deliverables

#### Admin docs
- Role/capability matrix and permission troubleshooting.
- Company flag management guide and safe rollout sequence.
- Data lifecycle controls: retention, soft delete, legal hold workflows.
- Incident response quick cards (websocket/redis/queue).

#### End-user docs
- How to create threads/replies and understand depth limits.
- Linked context behavior (transaction/plan/topic chips).
- Presence semantics (online/away/offline) and common sync issues.
- Company switch expectations and draft/session behavior.

### 2.6 Post-launch monitoring checkpoints

#### Day 1
- Validate deployment health and canary KPIs every 2-4 hours.
- Review authz deny anomalies and XSS/WAF/security telemetry.
- Confirm support ticket taxonomy and triage routing.

#### Day 7
- Compare canary cohorts vs control on reliability and adoption.
- Review top user friction points (company switch, threading UX).
- Validate retention jobs and legal-hold behavior with sampled audits.

#### Day 30
- Full KPI review: reliability, security incidents, cost-to-serve, adoption.
- Decide feature hardening priorities and technical debt paydown.
- Finalize long-term SLOs and handoff to steady-state operations.

---

## 3) “Fill Gaps” Analysis — Missing Requirements and Hidden Risks

### 3.1 Gap matrix by category

| Category | Gap / Hidden Risk | Why it matters | Severity | Proposed fix | Owner | Estimate | Validation |
|---|---|---|---|---|---|---|---|
| Security | No explicit anti-automation controls for abuse/spam bursts | Messaging can be used for resource exhaustion or phishing spam | High | Add per-user/company rate limits, anomaly scoring, abuse throttles | BE+Sec | M | Load tests + abuse simulation |
| Security | Insufficient webhook/ws event signing/verification | Event spoofing can inject unauthorized state | High | Sign internal events, verify origin, enforce strict event ACLs | BE+Sec | M | Contract tests + pen test |
| Privacy | Missing data classification policy for message content/attachments | Sensitive data may be retained/shared improperly | High | Introduce data classes + masking/redaction rules + DLP hooks | Product+Sec+BE | L | DLP test corpus + audits |
| Compliance | Unclear jurisdiction-specific retention/erasure handling | Legal non-compliance risk (GDPR/CCPA/local laws) | High | Policy engine by region/company with legal-hold precedence | Product+BE+Legal | L | Compliance test scenarios |
| UX | Depth-limit behavior may confuse users in long conversations | Reduces adoption and increases support burden | Medium | Add branch/quote UX and guidance when max depth reached | FE+Product | M | Usability testing + funnel metrics |
| Reliability | No explicit offline compose queue strategy | Message loss perception during flaky networks | Medium | Client-side outbox with idempotency keys + retry backoff | FE+BE | M | Chaos network tests |
| Cost | Presence heartbeat too frequent for large tenants | Infra cost and noisy load increase | Medium | Adaptive heartbeat intervals and batching | BE+DevOps | M | Perf/cost benchmarking |
| Maintainability | Permission rules spread across UI/API without single policy source | Drift causes inconsistent enforcement | High | Centralize policy in shared authz module and policy tests | BE+FE | M | Golden permission matrix tests |
| Operations | Missing SLO/error budget definitions for messaging | Weak rollout decisions and incident ambiguity | Medium | Define SLOs (latency, delivery, presence accuracy, auth freshness) | DevOps+Product | S | Weekly SLO reporting |
| Security | Attachment malware scanning unspecified | Direct malware propagation risk | High | Async AV scanning + quarantine workflow | BE+Sec+DevOps | M | EICAR and malware test harness |
| Privacy | Audit log access controls not defined | Sensitive metadata may leak through logs | Medium | RBAC for logs + field-level tokenization | DevOps+Sec | M | Access review + audit |
| Reliability | No reconciliation job for websocket missed events | Clients can remain stale after outages | High | Add replay cursor + periodic reconciliation job | BE | M | Fault injection + replay validation |
| Compliance | Legal hold scope/granularity unclear (thread/user/case) | Accidental deletion under hold or over-retention | High | Define hold precedence model and immutable hold audit | Product+BE+Legal | M | Policy conformance tests |
| Cost | Backfill jobs may compete with peak traffic | User-facing latency degradation during migration | Medium | Time-window throttling and adaptive concurrency caps | DevOps+BE | S | Load tests during backfill |
| Maintainability | Missing contract versioning for messaging APIs/events | Breaking clients during iterative rollout | Medium | Introduce API/event versioning and deprecation policy | BE+FE | M | Backward compatibility CI |
| Operations | Support tooling lacks “effective permissions” inspector | Slow incident triage and misdiagnosis | Medium | Admin debug panel for permission evaluation trace | FE+BE | M | Support UAT |

---

### 3.2 Final prioritized roadmap (Now / Next / Later)

#### Now (0-30 days) — release blockers
1. **Security and isolation hardening**
   - Close IDOR/XSS/ws unauthorized event gaps.
   - Add rate limits and abuse detection baseline.
2. **Permission consistency and revocation guarantees**
   - Centralize policy checks and validate revocation within SLA.
3. **P0 automation completion + release gates**
   - Fully automate P0 matrix and enforce as CI quality gate.
4. **Runbook readiness + rollback drills**
   - Validate websocket/redis/queue incident playbooks in staging.

#### Next (30-90 days) — scale and resilience
1. **Presence and reconnect resilience improvements**
   - Reconciliation jobs, adaptive heartbeat tuning, multi-tab handling.
2. **Data governance maturity**
   - Legal hold granularity, region-specific retention policies, audit controls.
3. **Migration and backfill optimization**
   - Add adaptive throttling, richer observability, replay safety checks.
4. **Support and admin tooling**
   - Effective-permissions inspector and tenant-specific diagnostics.

#### Later (90+ days) — optimization and strategic hardening
1. **Advanced compliance automation**
   - Policy-as-code for retention/hold across jurisdictions.
2. **Cost efficiency program**
   - Presence/event transport optimization and infra right-sizing.
3. **UX evolution for complex threads**
   - Branching/quote models, discoverability improvements.
4. **Long-term API/event governance**
   - Version lifecycle management and compatibility scorecards.

---

## 4) Suggested ownership and cadence
- **Weekly:** cross-functional messaging quality review (BE/FE/DevOps/Sec/Product).
- **Per release:** sign-off from Security + QA + SRE using release gate checklist.
- **Monthly:** roadmap re-prioritization based on incidents, support burden, and adoption analytics.
