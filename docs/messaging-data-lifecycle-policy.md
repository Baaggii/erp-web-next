# Messaging Data Lifecycle Policy (Multi-tenant ERP)

This document defines and operationalizes retention, legal hold, purge, and defensible deletion controls for ERP messaging.

## 1) Retention schedule model

Retention is policy-driven per company and message class:

- `general`: default 365 days
- `financial`: default 2,555 days (7 years)
- `hr_sensitive`: default 2,555 days (7 years)
- `legal`: default 3,650 days (10 years)

Each company may override retention days and purge mode (`soft_delete` or `hard_delete`) by class using `erp_message_retention_policies`.

### Rules

1. Tenant isolation is mandatory: all policy rows must include `company_id`.
2. One active policy version per (`company_id`, `message_class`).
3. Retention deadline = `message.created_at + retention_days`.
4. Purge cannot proceed while any active legal hold scope matches the message.

## 2) Legal hold model

Legal hold entities:

- `erp_legal_holds`: hold header with status lifecycle (`draft` -> `active` -> `released`).
- `erp_legal_hold_scopes`: one-to-many scope bindings.

Supported scope types:

- `user` (`target_user_empid`)
- `conversation` (`target_conversation_id`)
- `linked_entity` (`linked_entity_type` + `linked_entity_id`)
- `company` (`target_company_id`)

### Precedence and release

- **Precedence**: active legal holds always override retention eligibility.
- Hold release requires explicit `released_by`, `released_at`, and `release_reason`.
- Released holds no longer block purge, but history remains immutable via chain-of-custody records.

## 3) Purge workflow with dry-run + approval gates

Workflow tables:

- `erp_message_purge_runs`
- `erp_message_purge_candidates`
- `erp_message_purge_approvals`

Operational stages:

1. **Queued**: run requested by admin/compliance actor.
2. **Dry-run**: candidate scan populates `erp_message_purge_candidates` without deletion.
3. **Approval gate**: one or two approvers (policy-controlled).
4. **Execute**: background job deletes eligible messages only.
5. **Complete / Failed**: immutable summary and failure reason captured.

Approval rules:

- `mode=dry_run` bypasses approval requirement.
- `mode=execute` must satisfy required approvals before deletion starts.
- Any reject decision transitions run to `cancelled`.

## 4) Defensible deletion controls

### Chain-of-custody

Every action in purge lifecycle writes append-only rows to `erp_message_chain_of_custody`:

- `action`: `identified`, `approved`, `deleted`, `certificate_issued`
- `previous_hash` + `record_hash`: hash-chain tamper evidence
- `evidence_json`: structured execution evidence (query filter, actor, timestamps)

### Deletion certificate

`erp_message_deletion_certificates` stores one signed evidence package per executed purge run:

- `certificate_no` (unique)
- `payload_json` (candidate set, counts, policy versions, hold exclusions)
- `signature_hash` (SHA-256 digest of payload)

## 5) API contracts

### Retention policy APIs

- `GET /api/messaging/lifecycle/policies?companyId=:id`
  - Returns active + historical retention policies.
- `POST /api/messaging/lifecycle/policies`
  - Creates next policy version.
  - Body:
    ```json
    {
      "companyId": 12,
      "messageClass": "financial",
      "retentionDays": 2555,
      "purgeMode": "soft_delete",
      "requiresDualApproval": true,
      "notes": "IFRS + tax retention"
    }
    ```

### Legal hold APIs

- `POST /api/messaging/lifecycle/legal-holds`
  - Creates draft hold with one or more scope entries.
- `POST /api/messaging/lifecycle/legal-holds/:holdId/activate`
  - Requires hold admin permission.
- `POST /api/messaging/lifecycle/legal-holds/:holdId/release`
  - Body must include `releaseReason`.
- `GET /api/messaging/lifecycle/legal-holds?companyId=:id&status=active`

### Purge APIs

- `POST /api/messaging/lifecycle/purge-runs`
  - Body:
    ```json
    {
      "companyId": 12,
      "mode": "dry_run",
      "asOf": "2026-02-01T00:00:00Z"
    }
    ```
- `POST /api/messaging/lifecycle/purge-runs/:runId/approve`
- `POST /api/messaging/lifecycle/purge-runs/:runId/execute`
- `GET /api/messaging/lifecycle/purge-runs/:runId`
- `GET /api/messaging/lifecycle/deletion-certificates?companyId=:id`

### RBAC requirements

- `messaging_lifecycle.read`
- `messaging_lifecycle.write`
- `messaging_legal_hold.manage`
- `messaging_purge.approve`
- `messaging_purge.execute`

## 6) Admin UI requirements

1. **Retention policy console**
   - Matrix editor by message class.
   - Effective policy preview (old/new diff).
   - Dual approval toggle.
2. **Legal hold console**
   - Hold wizard for scope selection (user, conversation, linked entity, company).
   - Active hold list with release action and reason capture.
3. **Purge workbench**
   - Dry-run candidate summary by class + hold exclusions.
   - Approval status timeline.
   - Execution state + rollback token visibility.
4. **Evidence center**
   - Chain-of-custody viewer.
   - Downloadable deletion certificates per company.

## 7) Background jobs, retries, and failure alerts

### Jobs

- `messaging.lifecycle.scan` (schedule: daily per company)
- `messaging.lifecycle.execute` (event-driven after approvals)
- `messaging.lifecycle.certificate` (post-execution)

### Retry policy

- Retryable failures: transient DB/network/lock timeout.
- Retry schedule: exponential backoff (`1m`, `5m`, `15m`, `60m`) then dead-letter.
- Max attempts: 4.
- Non-retryable failures: schema mismatch, permission denial, hash-chain integrity violation.

### Alerting

- Pager alert on repeated failure or dead-letter placement.
- Slack/email alert for any hash-chain validation failure.
- Compliance alert if an execute run is older than 24h in `awaiting_approval` or `running`.

## 8) Job pseudocode

```text
job messaging.lifecycle.scan(companyId, asOf, dryRun=true):
  load active retention policies by class for companyId
  load active legal holds + scope rows
  query candidate messages where deleted_at is null
  for each message:
    resolve retention deadline by message_class
    if deadline not reached -> mark blocked_policy
    else if matches active legal hold -> mark blocked_hold
    else mark eligible
  write purge_run row + candidate rows
  if dryRun: set run completed
  else: set run awaiting_approval
```

```text
job messaging.lifecycle.execute(runId):
  lock purge_run row FOR UPDATE
  verify approvals satisfy policy gate
  begin transaction
    for each eligible candidate:
      insert chain-of-custody(action=deleted)
      delete/soft-delete message
    update run status completed
  commit
  enqueue messaging.lifecycle.certificate(runId)
on failure:
  rollback transaction
  mark run failed + failure_reason
  emit failure alert
```

```text
job messaging.lifecycle.certificate(runId):
  collect run summary + candidate decisions + chain tail hash
  compute signature hash
  insert deletion certificate row
  append chain-of-custody(action=certificate_issued)
```

## 9) Compliance evidence checklist

Per company and per reporting period, retain:

- Active retention policy matrix and change history
- Legal hold register with scope and release records
- Purge run logs (dry-run + execute)
- Approval evidence (who/when/decision/comments)
- Candidate decision ledger (eligible vs blocked_hold)
- Chain-of-custody hash sequence validation output
- Deletion certificates and signature verification logs
- Failure/exception alerts with resolution notes
- Test evidence for purge correctness + legal hold precedence + rollback safety
