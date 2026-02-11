# Secure Messaging Migration & Rollback Decision Log

## Purpose
Track schema/runtime decisions for messaging changes with explicit rollback posture.

## Decision records

### MSG-DR-001 — Runtime schema bootstrap (current)
- **Date**: 2026-02-11
- **Decision**: Keep `ensureSchema()` runtime table creation as current-state baseline.
- **Rationale**: Matches current implementation and avoids immediate deployment coupling to migration pipeline.
- **Risks**:
  - Drift risk across environments.
  - Harder change governance and rollback predictability.
- **Rollback plan**:
  - If runtime bootstrap causes startup/query issues, disable messaging route registration and keep historical rows intact.
  - Restore from DB backup only if destructive DDL was introduced (not in current bootstrap flow).
- **Status**: Accepted (temporary).

### MSG-DR-002 — Move to migration-first DDL (target)
- **Date**: 2026-02-11
- **Decision**: Future schema changes must be introduced via versioned SQL migration scripts, not runtime DDL.
- **Rationale**: Deterministic deployments, auditable schema evolution, safer rollbacks.
- **Forward plan**:
  1. Snapshot current runtime-created schema.
  2. Create baseline migration `db/migrations/<timestamp>_messaging_baseline.sql`.
  3. Add follow-up migrations for constraints/indexes.
  4. Gate deployment on migration success.
- **Rollback plan**:
  - Use paired down-migrations when non-destructive and validated.
  - Otherwise restore from backup and redeploy prior app build.
- **Status**: Planned.

### MSG-DR-003 — Constraint hardening sequencing
- **Date**: 2026-02-11
- **Decision**: Add DB-enforced root-link and referential checks in phased releases.
- **Rationale**: Avoid sudden write failures on existing data without pre-validation.
- **Phases**:
  1. Data audit script to detect violating rows.
  2. Remediation migration for invalid records.
  3. Constraint migration with rollout guard.
- **Rollback plan**:
  - If new constraints reject production traffic unexpectedly, revert constraint migration and redeploy previous service version.
- **Status**: Planned.

## Operational rollback checklist (per release)
1. Confirm recent DB backup and restore test timestamp.
2. Run pre-deploy data validation for new constraints.
3. Apply migration in staging with representative data.
4. Deploy app changes behind feature flag when possible.
5. Monitor error rate + latency + socket stability for 30 minutes.
6. If rollback triggered, execute migration rollback or backup restore runbook and post incident summary.
