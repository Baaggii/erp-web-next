# Messaging eDiscovery & Export Subsystem Design

This document defines an enterprise-grade eDiscovery/export subsystem for messaging data with strong tenant isolation, tamper-evidence, and resumable large-scale processing.

## 1) Architecture

### 1.1 Goals and non-goals

**Goals**
- Support multi-dimensional search/filtering by company, user, role, date range, keyword, linked entity, moderation flags.
- Produce export bundles in JSONL + CSV + PDF summary.
- Include full forensic context: message versions, attachment metadata, read receipts, and audit events.
- Ensure tamper-evidence through manifesting, checksums/signatures, and access logs.
- Enforce least-privilege access with optional dual-authorization for sensitive exports.
- Handle very large exports with async jobs, chunked processing, and resume/retry.

**Non-goals (v1)**
- Binary attachment content export (metadata only in v1).
- Cross-tenant/global search from a single query execution path.
- Real-time stream export while queries are still being built.

### 1.2 High-level components

```mermaid
flowchart LR
  actor[Compliance Officer]
  approver[Second Approver]
  ui[ERP Admin UI\n(eDiscovery Console)]
  api[API Gateway + eDiscovery Controller]
  auth[Policy Engine\nRBAC + ABAC]
  q[(Job Queue)]
  worker[Export Worker Pool]
  search[(Operational DB\nMessaging + Audit)]
  obj[(Object Storage\nExport Artifacts)]
  kms[KMS/HSM]
  audit[(Immutable Audit Log)]

  actor --> ui
  approver --> ui
  ui --> api
  api --> auth
  api --> search
  api --> q
  q --> worker
  worker --> search
  worker --> obj
  worker --> kms
  api --> audit
  worker --> audit
  ui --> obj
```

### 1.3 Service boundaries

- **eDiscovery API service**
  - Accepts search criteria and validates request scope.
  - Determines whether dual authorization is required.
  - Creates export jobs and returns job IDs.
- **Policy/authorization evaluator**
  - Enforces least privilege, purpose-of-use requirements, and scoped entitlements.
  - Adds data-label controls (e.g., legal hold, internal-only, privileged roles).
- **Export orchestrator + workers**
  - Executes query in shards/chunks.
  - Produces normalized records and format-specific outputs.
  - Computes checksums, signatures, and manifest entries.
- **Artifact storage layer**
  - Stores JSONL/CSV/PDF files and per-export manifest.
  - Supports immutable versioning / WORM retention where available.
- **Audit/tamper-evidence layer**
  - Append-only event logs for request, approval, execution, download, and verify operations.
  - Hash chain over export file descriptors in manifest.

### 1.4 Multi-tenant isolation model

- Company ID is mandatory on every export request.
- Query planner performs **tenant-first filtering** (`company_id = ?`) before any other predicate.
- Export artifacts are stored under tenant-scoped prefixes: `exports/{company_id}/{export_id}/...`.
- Signing keys may be per-environment or per-tenant depending on compliance policy.

---

## 2) SQL / query strategy

> Assumes MySQL 8+ and existing messaging entities (`message`, `message_versions`, `attachments`, `read_receipts`, `message_audit_events`, `users`, `employment/role assignments`).

### 2.1 Query pattern principles

1. **Start with indexed range + tenant filter**
   - `company_id`, `created_at`, `id` composite index on primary search table.
2. **Use two-phase retrieval for huge exports**
   - Phase A: fetch matching message IDs in keyset pages.
   - Phase B: batch-join supplementary entities by `message_id IN (...)`.
3. **Prefer keyset pagination over offset**
   - Use `(created_at, id)` cursor for stable resume points.
4. **Tokenized keyword search**
   - Full-text index on normalized message content; fallback `LIKE` only for small scopes.
5. **Role/user filters via pre-resolved principal sets**
   - Resolve permitted user IDs once, then apply as bounded IN/join table.

### 2.2 Core indexing recommendations

```sql
-- Message search path
CREATE INDEX idx_message_company_created_id
  ON message (company_id, created_at, id);

CREATE INDEX idx_message_company_user_created
  ON message (company_id, user_id, created_at, id);

CREATE INDEX idx_message_company_linked
  ON message (company_id, linked_entity_type, linked_entity_id, created_at, id);

CREATE FULLTEXT INDEX ftx_message_body
  ON message (message_body);

-- Moderation and audit joins
CREATE INDEX idx_moderation_message_flags
  ON message_moderation_flags (message_id, flag_type, created_at);

CREATE INDEX idx_message_versions_message_version
  ON message_versions (message_id, version_no);

CREATE INDEX idx_read_receipts_message_user
  ON read_receipts (message_id, user_id);

CREATE INDEX idx_audit_events_message_time
  ON message_audit_events (message_id, event_time, id);
```

### 2.3 Export candidate query (ID scan)

```sql
SELECT m.id, m.created_at
FROM message m
LEFT JOIN message_moderation_flags mf
  ON mf.message_id = m.id
WHERE m.company_id = :company_id
  AND m.created_at >= :start_at
  AND m.created_at < :end_at
  AND (:user_id IS NULL OR m.user_id = :user_id)
  AND (:linked_entity_type IS NULL OR m.linked_entity_type = :linked_entity_type)
  AND (:linked_entity_id IS NULL OR m.linked_entity_id = :linked_entity_id)
  AND (:keyword IS NULL OR MATCH(m.message_body) AGAINST (:keyword IN BOOLEAN MODE))
  AND (
    :moderation_flag IS NULL
    OR EXISTS (
      SELECT 1
      FROM message_moderation_flags mf2
      WHERE mf2.message_id = m.id
        AND mf2.flag_type = :moderation_flag
    )
  )
  AND (
    :role_id IS NULL
    OR m.user_id IN (
      SELECT e.user_id
      FROM employment e
      WHERE e.company_id = :company_id
        AND e.role_id = :role_id
        AND e.status = 'active'
    )
  )
  AND (
    :cursor_created_at IS NULL
    OR (m.created_at, m.id) > (:cursor_created_at, :cursor_id)
  )
GROUP BY m.id, m.created_at
ORDER BY m.created_at, m.id
LIMIT :page_size;
```

### 2.4 Enrichment query set

For each page of message IDs:
- Fetch message current rows.
- Fetch versions (`message_versions`), ordered by `version_no`.
- Fetch attachment metadata (`attachments`), excluding blob content.
- Fetch read receipts.
- Fetch audit events.

This avoids heavy join explosions and keeps memory bounded per page.

### 2.5 Materialization strategy

- Write normalized records into temporary export staging tables keyed by `export_id` for deterministic re-runs.
- Each stage commit includes a checkpoint row with:
  - `last_created_at`, `last_message_id`, `records_written`, `bytes_written`.
- Resume uses latest successful checkpoint and continues keyset scan.

---

## 3) Async export pipeline

### 3.1 Job lifecycle

1. **Requested**: user submits request with filters + purpose.
2. **Awaiting approval** (optional): sensitive scopes require second approver.
3. **Queued**: accepted request enqueued with immutable parameters hash.
4. **Running**: worker processes pages, writes format files incrementally.
5. **Finalizing**: build PDF summary, manifest, signatures.
6. **Completed/Failed/Expired**: terminal state with reason codes.

### 3.2 Queue contract

Queue payload (immutable once queued):

```json
{
  "exportId": "exp_01J...",
  "companyId": 42,
  "requestedBy": 1005,
  "approvedBy": 1011,
  "purpose": "Litigation hold review",
  "filtersHash": "sha256:...",
  "requestedFormats": ["jsonl", "csv", "pdf"],
  "resumeToken": null,
  "priority": "normal"
}
```

### 3.3 Worker execution phases

- **Phase A: validate authorization snapshot**
  - Re-validate grants at execution time to prevent stale privilege abuse.
- **Phase B: page scan + enrichment**
  - Pull ID page, enrich entities, apply redaction policy, write rows.
- **Phase C: artifact assembly**
  - `messages.jsonl`, `messages.csv`, `summary.pdf`.
- **Phase D: manifest/signing**
  - Compute SHA-256 for each output.
  - Build manifest JSON and sign detached signature.
- **Phase E: publish + audit**
  - Store artifacts, persist metadata, emit immutable audit event.

### 3.4 Performance controls

- Bounded page size (e.g., 5k IDs) tuned per DB capacity.
- Backpressure from worker to queue based on DB latency.
- Memory cap per worker process and streaming writers for JSONL/CSV.
- Adaptive concurrency per tenant to avoid noisy-neighbor effects.
- Time-sliced checkpoints (every N rows or M seconds) for resumability.

### 3.5 Resumable jobs

- Persist cursor checkpoint and file offsets.
- On retry:
  - verify filters hash unchanged,
  - truncate partial trailing row if needed,
  - continue from last committed cursor.
- Idempotency key: `export_id + phase + chunk_sequence`.

---

## 4) API endpoints

Base prefix: `/api/ediscovery`

### 4.1 Search/preview

- `POST /search`
  - Validates filters and returns paginated preview (no artifact generation).
- `POST /search/count`
  - Fast estimated/exact count to inform job sizing.

Example request:

```json
{
  "companyId": 42,
  "userId": 1005,
  "roleId": 12,
  "dateRange": { "start": "2026-01-01T00:00:00Z", "end": "2026-02-01T00:00:00Z" },
  "keyword": "contract breach",
  "linkedEntity": { "type": "invoice", "id": "INV-10092" },
  "moderationFlags": ["escalated", "blocked"],
  "cursor": { "createdAt": "2026-01-03T12:00:00Z", "id": 889201 }
}
```

### 4.2 Export lifecycle

- `POST /exports`
  - Create export request; returns state `awaiting_approval` or `queued`.
- `POST /exports/{exportId}/approve`
  - Dual-authorization second approver endpoint.
- `GET /exports/{exportId}`
  - Status, progress, checkpoints, artifact metadata.
- `POST /exports/{exportId}/resume`
  - Resume failed/interrupted export from checkpoint.
- `POST /exports/{exportId}/cancel`
  - Cancel queued/running export.

### 4.3 Artifact access and verification

- `GET /exports/{exportId}/manifest`
  - Download manifest JSON.
- `GET /exports/{exportId}/files/{name}`
  - Time-limited signed URL or proxied download with watermarking.
- `POST /exports/{exportId}/verify`
  - Server-side checksum + signature verification routine.
- `GET /exports/{exportId}/access-logs`
  - Export access/download events for chain-of-custody.

### 4.4 Access control requirements (API)

- Least privilege scope claims:
  - `ediscovery.search`, `ediscovery.export.create`, `ediscovery.export.approve`, `ediscovery.export.download`, `ediscovery.export.verify`.
- Purpose-of-use is required for `POST /exports`.
- Dual authorization required if any sensitivity trigger matches:
  - high volume threshold,
  - includes privileged role messages,
  - includes moderation/legal-hold content.

---

## 5) Tamper-evidence design

### 5.1 Manifest structure (per export)

```json
{
  "manifestVersion": 1,
  "exportId": "exp_01J...",
  "companyId": 42,
  "requestedBy": 1005,
  "approvedBy": 1011,
  "purpose": "Litigation hold review",
  "filtersHash": "sha256:...",
  "createdAt": "2026-02-11T10:15:22Z",
  "files": [
    {"name": "messages.jsonl", "sha256": "...", "bytes": 120039912},
    {"name": "messages.csv", "sha256": "...", "bytes": 90103822},
    {"name": "summary.pdf", "sha256": "...", "bytes": 941281}
  ],
  "recordCounts": {
    "messages": 231199,
    "versions": 55123,
    "attachments": 912,
    "readReceipts": 118220,
    "auditEvents": 310999
  },
  "chainHash": "sha256:..."
}
```

### 5.2 Signature model

- Sign canonicalized manifest JSON with environment private key (KMS/HSM-backed).
- Store detached signature as `manifest.sig`.
- Publish signer key ID and algorithm metadata.

### 5.3 Export access logs

Capture immutable events for:
- request creation,
- approval action,
- job start/fail/complete,
- artifact download attempts (success/failure),
- verification operations.

Each access event includes actor, role snapshot, IP/device metadata, purpose, and correlation ID.

---

## 6) Redaction policy options

Redaction is policy-driven and declared in export metadata.

### 6.1 Policy modes

1. **None (forensic full)**
   - No redaction; strictest authorization path.
2. **PII minimal**
   - Mask emails, phones, national IDs in message bodies and attachment names.
3. **Role-sensitive**
   - Suppress content from protected roles unless explicit override approval exists.
4. **Field-level legal hold aware**
   - Preserve hold-tagged fields unchanged; redact all others per data class.

### 6.2 Implementation notes

- Redaction executes after record retrieval and before serialization.
- Include `redaction_policy` and `redaction_version` in manifest and PDF summary.
- Include deterministic placeholder markers, e.g., `[REDACTED:EMAIL]`, to preserve parseability.

---

## 7) Watermarking and purpose-of-use metadata

- CSV/JSONL headers include export metadata comment blocks where format supports it.
- PDF summary includes:
  - requesting user,
  - purpose-of-use,
  - timestamp,
  - legal notice,
  - unique watermark token.
- Optional row-level watermark fields:
  - `export_id`, `watermark_token` appended in CSV.

---

## 8) PDF summary bundle contents

`summary.pdf` should contain:
- Export scope and filter criteria.
- Date/time range and timezone normalization note.
- Counts by message type, user, moderation status, linked entity type.
- Redaction policy applied.
- Hash table for included files.
- Signature verification instructions.
- Chain-of-custody events snapshot.

---

## 9) Verification procedure

### 9.1 Server-side verification (`POST /exports/{id}/verify`)

1. Load manifest and signature.
2. Verify signature using configured public key.
3. Recompute SHA-256 for each artifact and compare.
4. Recompute `chainHash` from ordered `files[]` entries.
5. Validate access log continuity and no missing terminal events.
6. Return `verified=true` with detailed evidence report.

### 9.2 Offline verifier flow

Provide a CLI/script that takes `manifest.json`, `manifest.sig`, and exported files:

```bash
ediscovery-verify \
  --manifest manifest.json \
  --signature manifest.sig \
  --pubkey ediscovery_pub.pem \
  --files ./
```

Expected output:
- Signature status
- Per-file checksum status
- Overall verification verdict

### 9.3 Chain-of-custody checklist

- Confirm requestor and approver identities.
- Confirm purpose-of-use matches approved purpose.
- Confirm checksum/signature match at handoff and at intake.
- Confirm access log shows only authorized downloads.
- Record verifier identity and verification timestamp.

---

## 10) Suggested storage schema additions

```sql
CREATE TABLE ediscovery_exports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  export_uid VARCHAR(64) NOT NULL UNIQUE,
  company_id BIGINT NOT NULL,
  requested_by BIGINT NOT NULL,
  approved_by BIGINT NULL,
  purpose VARCHAR(500) NOT NULL,
  sensitivity_level VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  filters_json JSON NOT NULL,
  filters_hash VARCHAR(128) NOT NULL,
  redaction_policy VARCHAR(64) NOT NULL,
  watermark_token VARCHAR(128) NOT NULL,
  resume_cursor_created_at DATETIME NULL,
  resume_cursor_id BIGINT NULL,
  progress_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE ediscovery_export_artifacts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  export_id BIGINT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  sha256 VARCHAR(128) NOT NULL,
  byte_size BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_eda_export (export_id)
);

CREATE TABLE ediscovery_export_access_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  export_id BIGINT NOT NULL,
  actor_user_id BIGINT NOT NULL,
  actor_role_id BIGINT NULL,
  action VARCHAR(64) NOT NULL,
  action_status VARCHAR(32) NOT NULL,
  purpose VARCHAR(500) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  correlation_id VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_edal_export_time (export_id, created_at)
);
```

---

## 11) Operational safeguards

- Retention policy for export artifacts and logs (e.g., 30/90/365 days by policy class).
- Automatic purge with legal hold exceptions.
- Alerting for abnormal export volume and repeated verification failures.
- Periodic key rotation and signature algorithm agility plan.

---

## 12) Rollout plan

1. **Phase 1**: Search/preview + basic export jobs (JSONL/CSV only).
2. **Phase 2**: PDF summary, manifest signing, verification API.
3. **Phase 3**: Dual-authorization rules + advanced redaction policies.
4. **Phase 4**: Throughput tuning, cross-region artifact replication, and external verifier tooling.

This staged rollout limits operational risk while delivering auditable discovery capability early.
