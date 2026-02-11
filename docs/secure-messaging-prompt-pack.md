# Secure Multi-Company Messaging Prompt Pack

Use these prompts (in order) with your implementation assistant to build a secure, complete messaging system.

## 1) Product + Architecture Blueprint Prompt

```text
You are a staff engineer. Design a secure messaging system for an ERP with these requirements:
1) Messages may be optionally linked to exactly one of: transaction, plan, or topic.
2) Threaded replies are required (nested replies allowed up to configurable depth).
3) Real-time online/offline/away user status is required.
4) Multi-company context switching: users can change active company and must only see company-scoped data.
5) Permission-aware visibility: users only see messages/replies they are authorized to view.
6) UI must be a collapsible messaging widget, session-aware, and context-sensitive.
7) Messages and replies must be stored securely and efficiently.

Deliverables:
- C4-lite architecture (context/container/component).
- Data model ERD and rationale.
- API + realtime protocol contracts.
- AuthN/AuthZ model (RBAC + optional ABAC policy hooks).
- Threat model (STRIDE), mitigations, and residual risks.
- Performance targets (P95 latency, throughput), SLOs, and capacity assumptions.
- Migration strategy from empty state + rollback plan.
- Open questions and decision log.

Constraints:
- Use PostgreSQL + Redis + WebSocket (or SSE if justified).
- Tenant isolation must be enforced at DB and service layers.
- Include row-level security strategy.
- Include idempotency, rate limiting, and anti-spam controls.
```

## 2) Database Schema + Security Prompt

```text
Generate SQL migrations for PostgreSQL implementing:
- companies, users, memberships, roles, permissions.
- conversations (company scoped), messages, message_links (transaction|plan|topic), message_replies (or parent_id adjacency model), read_receipts, attachments metadata, user_presence, notification_queue.
- Soft delete + audit columns (created_at, created_by, updated_at, deleted_at, deleted_by).
- Strong constraints:
  - message link polymorphism with check constraints.
  - company_id mandatory on all tenant data.
  - FK cascade rules intentionally chosen and documented.
  - max reply depth enforcement (trigger or application + check strategy).
- Index plan for common queries (inbox, thread expansion, unread count, linked-entity lookup).
- PostgreSQL Row-Level Security (RLS) policies using current_setting('app.user_id') and current_setting('app.company_id').
- Encryption strategy:
  - TLS in transit,
  - at-rest encryption,
  - optional column-level encryption for sensitive content,
  - key rotation notes.

Also provide:
- Seed data for two companies and cross-company users.
- Query examples proving isolation and permission enforcement.
- Explain tradeoffs of adjacency list vs closure table for threads.
```

## 3) Backend API + Realtime Prompt

```text
Implement backend services for messaging with:
- REST endpoints:
  - POST /messages
  - GET /messages?companyId=&linkedType=&linkedId=&cursor=
  - GET /messages/:id/thread
  - POST /messages/:id/reply
  - PATCH /messages/:id (edit window policy)
  - DELETE /messages/:id (soft delete, permission-checked)
  - POST /presence/heartbeat
  - GET /presence?userIds=
  - POST /context/switch-company
- WebSocket channels:
  - message.created, message.updated, message.deleted,
  - thread.reply.created,
  - presence.changed,
  - receipt.read
- Strict authorization middleware:
  - validate session,
  - validate active company membership,
  - enforce per-resource permissions,
  - prevent IDOR/BOLA.
- Cursor pagination and optimistic UI-friendly payloads.
- Idempotency keys for message/reply creation.
- Profanity/spam/rate controls and abuse audit trail.
- Structured error model and correlation IDs.
- Unit + integration tests for auth, tenant isolation, and realtime fanout.

Return complete OpenAPI spec and event schema definitions.
```

## 4) Permission Model Prompt

```text
Design a permission matrix for messaging:
- message:create, message:read, message:reply, message:edit, message:delete,
  thread:read, presence:read, attachment:upload, attachment:read,
  admin:moderate, admin:export.

Support:
- Role presets: Owner, Admin, Manager, Staff, External.
- Context filters: by company, department, project, linked entity ownership.
- Rule precedence and deny-overrides.
- Scoped permissions for linked transaction/plan/topic.

Deliver:
- Human-readable matrix table.
- Machine-readable policy JSON examples.
- Middleware pseudocode for enforcement.
- Tests for privilege escalation attempts.
```

## 5) Frontend Widget Prompt

```text
Build a collapsible messaging widget for a web ERP:
- Collapsed state: unread badge + online collaborator indicators.
- Expanded state: conversation list, active thread, composer, attachment picker.
- Session-aware behavior:
  - restore open/closed state per user session,
  - restore last active company and conversation.
- Company context switcher:
  - explicit UI control,
  - hard reset stale data on switch,
  - prevent cross-company cache bleed.
- Thread UX:
  - inline reply, nested reply rendering, reply count, jump-to-parent.
- Linked context chips (transaction/plan/topic) with permission-gated navigation.
- Presence indicators (online/away/offline) with graceful degradation.
- Accessibility: keyboard navigation, ARIA labels, color contrast, screen reader announcements.
- Security: sanitize rendered content, safe file preview handling.

Provide:
- Component tree,
- state management strategy,
- cache invalidation rules,
- loading/empty/error states,
- frontend tests (unit + e2e).
```

## 6) Security Hardening Prompt

```text
Perform a full security hardening review of the messaging module and produce:
- Threat model updates (XSS, CSRF, SSRF via attachments, injection, replay, websocket hijack, tenant breakout).
- Concrete mitigations and code-level recommendations.
- Content security policy and secure headers.
- Input validation and output encoding checklist.
- Attachment scanning pipeline (MIME validation, AV scanning, quarantine, signed URLs).
- Secrets management and rotation plan.
- Audit logging schema and tamper-evidence strategy.
- Incident response playbook for data leak and account compromise.
- Compliance checklist (GDPR/CCPA basics: retention, export, deletion workflows).
```

## 7) Performance + Scale Prompt

```text
Design performance strategy for 10k concurrent users and bursty realtime traffic:
- Presence fanout strategy (Redis pub/sub, sharded channels, throttled updates).
- Message query optimization (indexes, materialized unread counters, denormalized preview rows).
- Backpressure handling and retry policies.
- Async jobs for notifications and attachment processing.
- Load test plan with success thresholds.
- Observability:
  - metrics, logs, traces,
  - dashboards,
  - alerts for latency, error rate, dropped websocket events.

Provide a benchmark script outline and target SLO/SLA table.
```

## 8) QA + Acceptance Prompt

```text
Create an end-to-end test plan with acceptance criteria for:
- Thread creation/reply behavior including depth limits.
- Linked/unlinked message behavior for transaction, plan, topic.
- Tenant/company isolation across UI, API, and DB layers.
- Permission checks by role and edge cases (revoked role mid-session).
- Presence accuracy under disconnect/reconnect and tab sleep.
- Widget session persistence and company switch behavior.
- Security regression tests (IDOR, XSS payloads, unauthorized websocket events).
- Data lifecycle tests (retention purge, soft delete restore, legal hold if enabled).

Output:
- Test case matrix,
- automation priority,
- release gate checklist.
```

## 9) Rollout + Operations Prompt

```text
Create a production rollout plan:
- Feature flags by company and role.
- Canary strategy and rollback triggers.
- Data migration and backfill sequencing.
- Operational runbooks for websocket outage, Redis outage, and queue backlog.
- Support documentation for admins and end users.
- Post-launch monitoring checkpoints (day 1, day 7, day 30).
```

## 10) “Fill Gaps” Prompt (Use Last)

```text
Given all prior outputs, identify missing requirements and hidden risks for enterprise messaging.
Classify by: Security, Privacy, Compliance, UX, Reliability, Cost, Maintainability, and Operations.
For each gap provide:
- why it matters,
- severity,
- proposed fix,
- owner (BE/FE/DevOps/Sec/Product),
- implementation estimate,
- validation method.

Then produce a final prioritized roadmap in Now / Next / Later format.
```

---

## Additional requirements you did not explicitly list (recommended)

- Data retention policy, legal hold, and defensible deletion workflow.
- eDiscovery/export tooling for regulated customers.
- Message edit history/versioning and moderation actions.
- Notification preferences (in-app/email/push) and quiet hours.
- Block/mute controls and abuse reporting.
- Disaster recovery targets (RPO/RTO) and backup restore drills.
- Cross-device/session consistency rules.
- Internationalization/time zone correctness.
- Accessibility compliance target (WCAG 2.1 AA minimum).
- Analytics with privacy guardrails.

Use this final meta-prompt if you want one-shot generation:

```text
Act as a principal architect and deliver a complete technical design + implementation plan for a secure, multi-tenant ERP messaging system with optional entity linking (transaction/plan/topic), threaded replies, realtime presence, company context switching, permission-aware visibility, and a collapsible session-aware widget.
Include schema, APIs, websocket events, RLS policies, authorization model, frontend architecture, security hardening, performance plan, tests, rollout, and operations.
Also include missing enterprise requirements (retention, compliance, moderation, observability, DR, accessibility).
Output implementation-ready artifacts and a prioritized roadmap.
```

## Why you are getting only `.md` output

Most assistants default to design/spec output unless you **explicitly require file edits, runnable code, and commit-ready diffs**. The prompts above are strong for architecture, but they do not strictly force implementation behavior.

Use the execution prompts below to move from planning docs to production code.

## 11) Implementation Execution Prompt (forces code changes)

```text
You are implementing in an existing repository, not writing a design doc.

Execution rules:
- Make direct code changes in the repo.
- Create/modify real source files, migrations, tests, and configuration.
- Do not stop at Markdown plans unless explicitly asked.
- If any requirement is unclear, choose sensible defaults and continue.
- After coding, run project tests/lint/typecheck and fix failures.
- Return:
  1) concise summary,
  2) changed file list,
  3) unified diffs,
  4) test command outputs,
  5) known follow-ups.

Implement the messaging requirements already defined (entity linking, threaded replies, realtime presence, company isolation, permission-aware visibility, secure storage).
Start now with database migrations + backend endpoints + tests.
```

## 12) Slice-by-Slice Delivery Prompt (prevents endless docs)

```text
Implement this in vertical slices. For each slice, ship code before moving on.

Slice order:
1) DB schema + RLS + migrations + seed data.
2) Message create/list/thread/reply/delete APIs + auth middleware.
3) Presence heartbeat + realtime events.
4) Frontend widget skeleton wired to real APIs.
5) Security/perf hardening.

Per slice requirements:
- Add/modify code files.
- Add automated tests for that slice.
- Run tests and show results.
- Provide rollback notes for DB changes.
- Open TODOs only when blocked by external dependency.

Do not output high-level prose beyond a short implementation summary.
```

## 13) “No Markdown-Only” Guardrail Prompt

```text
Hard constraint: markdown-only output is not acceptable.

Acceptance criteria for this response:
- At least one migration file added/updated.
- At least one backend route/service file added/updated.
- At least one test file added/updated.
- Evidence of executed test commands.

If you cannot modify files due to environment restrictions, explain the exact blocker and provide copy-paste-ready patch hunks for each target file.
```

## 14) Repo-Aware Prompt Template (fill before use)

```text
Repository context:
- Stack: <e.g., Next.js + Node + PostgreSQL + Redis>
- Backend path: <path>
- Frontend path: <path>
- Migration path: <path>
- Test commands: <exact commands>

Task:
Implement secure messaging requirements directly in this repo.

Definition of done:
- Code changes committed across backend/frontend/migrations.
- Tests green for changed areas.
- OpenAPI/event schemas updated.
- No tenant isolation violations in tests.

Output format:
1) Summary (5-10 bullets)
2) Changed files
3) Diffs
4) Test outputs
5) Risks + next steps

Do not generate standalone planning documents.
```

## 15) Optional two-agent workflow (planner + implementer)

If your assistant supports roles/modes, run this pattern:

1. **Planner pass (short):** architecture + task breakdown only.
2. **Implementer pass (strict):** use Prompt 11/12/13 and forbid markdown-only completion.

This keeps strategic quality while forcing tangible code output each cycle.
