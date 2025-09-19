# Tenant Configuration Resilience & Recovery Plan

## 1. Audit Summary

### 1.1 TenantTablesRegistry UI
- Loads registry options and registered tables separately via `/api/tenant_tables/options` and `/api/tenant_tables`, surfacing fetch failures through toasts but leaving the grid empty when either call fails; this can confuse admins because cached selections persist in component state even after an error.【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L645-L696】
- Company dropdown population depends on a best-effort fetch of `/api/companies`; network or JSON parsing errors only raise a toast and do not disable downstream seeding controls, so users can attempt actions without a valid company target.【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L574-L588】
- Backup collection before destructive actions relies on a blocking `window.prompt`; cancelling or providing blank text aborts the workflow without preserving the operator’s context, and the plain prompt offers no validation beyond a toast warning.【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L388-L405】
- Global default seeding calls `/api/tenant_tables/seed-defaults`, recording conflicts or success through transient toasts; conflicting tenant data (HTTP 409) halts the flow but the UI requires manual review of modal state to identify blocked tables.【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L746-L822】
- Default snapshot export and restore paths depend on manual prompts and ad‑hoc file selection; failures revert to toasts without differentiating between transient (network) and structural (invalid content-type) errors, making it difficult to diagnose persistence issues.【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L824-L959】
- Per-company seeding assembles mixed ID and manual row payloads; any invalid manual row aborts the entire request and the UI does not highlight the offending record, forcing operators to recompose the payload from scratch.【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L1237-L1320】
- Default row maintenance for tenant key `0` loads metadata and rows with `perPage` limits; errors blank the table and mark it non-editable, so intermittent API failures can be mistaken for permissions issues.【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L1402-L1504】

### 1.2 Tenant tables controller touchpoints
- Administrative gating hinges on `system_settings`; lack of privilege short-circuits requests but does not log audit context, reducing traceability of failed attempts.【F:api-server/controllers/tenantTablesController.js†L33-L112】
- `seedDefaults` performs a preview to detect tenant conflicts, exports a backup, then mutates global rows, yet no transaction covers the export + seed pair; a failure between steps could leave a backup without matching data state.【F:api-server/controllers/tenantTablesController.js†L124-L150】
- Company seeding validates payloads and authorizes against the creator but trusts manual row structures; malformed shapes yield HTTP 400 responses without per-row diagnostics, and seeding executes even if backup creation fails upstream in the database layer.【F:api-server/controllers/tenantTablesController.js†L200-L259】
- Default snapshot restore simply relays database errors; repeated attempts after structural failures (e.g., unsupported SQL) will continue to fail until snapshots are sanitized externally.【F:api-server/controllers/tenantTablesController.js†L290-L305】
- Default row CRUD enforces `company_id = 0` and table existence but lacks optimistic locking; simultaneous edits overwrite silently because server returns the last write only.【F:api-server/controllers/tenantTablesController.js†L308-L405】

### 1.3 Company CRUD workflows
- Company creation optionally triggers tenant seeding through `insertTableRow`; if `seedTables` or `seedRecords` cause an error, the company is already persisted and rollback must be manual.【F:api-server/controllers/companyController.js†L34-L61】【F:db/index.js†L3242-L3275】
- Deletion can create a backup, but the backup name is mandatory only when the operator requests it; accidental deletions without backups are irreversible aside from database-level recovery.【F:api-server/controllers/companyController.js†L79-L130】
- Restoration validates access by matching the requesting admin’s owned companies and backup catalog entries, yet relies on shared storage; missing or corrupted backup files surface as 404/400 responses without remediation guidance.【F:api-server/controllers/companyController.js†L132-L200】

### 1.4 Database seeding and recovery jobs
- `seedTenantTables` enumerates configured tables, optionally deletes tenant rows, and may create a backup when overwriting, but each table is processed sequentially outside a transaction; partial failures can leave tenants with a subset of defaults and no automatic rollback.【F:db/index.js†L1097-L1316】
- `seedDefaultsForSeedTables` blocks when tenant data exists and updates rows in place for the global tenant, yet it assumes column metadata is available and does not snapshot prior values beyond the exported SQL, risking drift if exports fail.【F:db/index.js†L1318-L1391】
- Seed backup generation writes SQL files per company and updates `defaults/seed-backups/index.json`; file-system errors or catalog corruption abort the backup but no retry metadata is returned to the caller.【F:db/index.js†L1869-L2018】
- Company backup helpers normalize metadata and expose catalogs to administrators, but retention is manual and catalog files can grow unbounded without pruning logic.【F:db/index.js†L2050-L2237】
- Restore routines validate allowed tables and rewrite `company_id`, yet they execute arbitrary INSERT/DELETE statements from files; unsupported statements raise 400 errors and leave target companies partially modified until manual cleanup succeeds.【F:db/index.js†L2239-L2694】
- Background helpers (`seedSeedTablesForCompanies`, `zeroSharedTenantKeys`) run unguarded loops over all companies or shared tables, lacking batching, retry semantics, and instrumentation; any failure aborts the loop without reporting progress.【F:db/index.js†L2697-L2795】

## 2. Proposed Design

### 2.1 Goals
- Provide reliable versioning and retention of tenant configuration datasets (defaults and per-company overrides).
- Deliver guided recovery workflows that couple UI, API, and storage semantics for both proactive backups and reactive restores.
- Embed observability, audit trails, and automated validation aligned with regulated ERP expectations.

### 2.2 Version storage architecture
- Introduce a `tenant_config_versions` table storing metadata (company scope, type, checksum, creator, source snapshot) to complement existing SQL files in `defaults/` and `defaults/seed-backups/`; populate records when `exportTenantTableDefaults` or `createSeedBackupForCompany` emit files so API consumers can query authoritative state rather than parsing catalogs.【F:db/index.js†L1869-L2018】
- Store generated SQL in object storage (e.g., S3-compatible bucket) with immutable version IDs while retaining a short-lived local cache for downloads; fall back to filesystem only when remote storage is unavailable to reduce the single-node dependency highlighted in `readSeedBackupFile`/`readTenantSnapshotFile`.【F:db/index.js†L2021-L2056】【F:db/index.js†L1680-L1710】
- Compute and persist hash digests for each exported snapshot, allowing verification before restore and enabling deduplication policies.

### 2.3 Retention policies
- Apply per-scope retention windows (e.g., keep last N daily snapshots per company plus monthly long-term copies) enforced by a scheduled pruning job that reads the metadata table and deletes both the object storage version and catalog entries; surface dry-run mode in the admin UI to preview deletions.【F:db/index.js†L2050-L2237】
- Require explicit tagging of regulatory/long-term snapshots to bypass pruning, supporting compliance audits.
- Capture retention actions in an audit log with actor, scope, and files removed for traceability.

### 2.4 Restore tooling and safeguards
- Wrap `seedTenantTables`, `restoreCompanySeedBackup`, and `restoreTenantDefaultSnapshot` operations in database transactions per company/table group and emit structured progress events so the UI can stream statuses instead of relying solely on final toast messages.【F:db/index.js†L1097-L1316】【F:db/index.js†L2239-L2694】
- Expand API responses with granular error payloads (e.g., invalid manual row details, unsupported SQL statements) and link to remediation docs directly in the TenantTablesRegistry UI.【F:api-server/controllers/tenantTablesController.js†L200-L259】【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L1237-L1320】
- Add dry-run previews for per-company restore and seed actions that enumerate impacted tables/rows before execution, mirroring the preview already used for global seeding.【F:api-server/controllers/tenantTablesController.js†L124-L150】

### 2.5 User workflows
- **Backup workflow:** Admin selects scope (global defaults or company), is prompted with a modal that validates naming, tags the snapshot, and shows recent versions from metadata. Success banners include download links and retention hints, replacing browser prompts.【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L388-L405】【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L824-L887】
- **Restore workflow:** Guided wizard fetches version history, verifies hash status, warns about overwriting data, and provides optional automatic backup before restore. Progress indicators surface per-table execution results in-app rather than relying on manual refresh.【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L898-L959】
- **Monitoring workflow:** Dashboard widget summarizes latest backups, retention actions, and outstanding conflicts (e.g., seed-defaults blocked tables) so operations staff can intervene promptly.【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L746-L822】【F:db/index.js†L1318-L1391】

### 2.6 Observability and audit
- Emit structured logs for every mutation (triggered from controllers) that include version IDs, company scope, counts of inserted/deleted rows, and backup URIs for alignment with ERP audit requirements.【F:api-server/controllers/tenantTablesController.js†L124-L305】【F:api-server/controllers/companyController.js†L79-L200】
- Instrument Prometheus metrics for backup success/failure counts, restore durations, and retention sweeps; expose alerts when counts deviate from expected cadence.
- Persist operator notes with each version (UI-provided) so compliance reviews can tie restores to business justifications.

## 3. Implementation Roadmap & Socialization

### 3.1 Phase plan
1. **Foundational storage (Sprint 1-2):** Create metadata tables, integrate exports/backups with object storage uploads, and expose catalog queries via API endpoints; add feature flags to fall back to filesystem when storage is unavailable.【F:db/index.js†L1869-L2056】
2. **Recovery workflows (Sprint 3-4):** Replace prompt-based UI with modal wizards, stream progress updates, and enhance API responses for seeding/restore endpoints, including dry-run previews.【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L388-L959】【F:api-server/controllers/tenantTablesController.js†L124-L305】
3. **Retention & auditing (Sprint 5):** Implement scheduled retention job, audit logging, and metrics emission; build admin dashboards summarizing backup health and outstanding conflicts.【F:db/index.js†L2050-L2795】
4. **Automated validation (Sprint 6):** Add integration tests covering backup/restore cycles, failure injection (corrupt files, conflicting data), and UI end-to-end flows for tenant seeding to guard regressions.【F:db/index.js†L1097-L2694】【F:src/erp.mgt.mn/pages/TenantTablesRegistry.jsx†L645-L1504】

### 3.2 Stakeholder socialization & sign-off
- Conduct design reviews with platform engineering, DBA, and compliance leads to validate storage/retention assumptions and confirm audit log schemas.
- Present UI prototypes to customer success and support teams for feedback on operator workflows before implementation.
- Secure executive sponsor approval for phased rollout, especially if object storage introduces new infrastructure spend; document rollback plans in change management portal.
- Schedule training sessions aligned with each release phase and capture sign-off in the ERP governance checklist.

### 3.3 Risks and mitigations
- **Infrastructure readiness:** Object storage availability may lag; mitigate by feature-flagging remote uploads and documenting manual fallback procedures.【F:db/index.js†L1869-L2056】
- **Operator adoption:** New flows could slow experienced admins; mitigate with contextual help, sandbox environments, and staged rollout.
- **Data consistency:** Transactional restores may still fail on bespoke SQL; augment automated tests with schema validation and maintain clear runbooks for manual intervention.【F:db/index.js†L2239-L2694】
