# Report lock approval workflow

## API-controlled session variables

The API layer is responsible for populating the session variables used by report
locking. Stored procedures **must not** set these variables directly. They are
managed in `callStoredProcedure()` and applied through `applyReportLockSessionVars()`
before the procedure executes.

* `@collect_used_rows` → Controls whether the procedure should emit lock candidates.
  The API sets this from the `collectLocks`/`populateLockCandidates` flag.
* `@request_id` → Correlates lock candidates and pending approvals. This is generated
  by the API when lock collection is enabled.
* `@emp_id` → Identifies the requesting employee. The API assigns this from the
  authenticated user session.

If the UI does **not** request lock candidates, the API sets `@collect_used_rows`
to `0` and `@request_id` to `NULL`, ensuring the procedure runs as a standard
report execution without touching the lock workflow.

## UI workflow for report approvals

1. **Run report** – The user runs the stored procedure with parameters.
2. **(Optional) Populate lock candidates** – When the checkbox is enabled, the API
   sets `@collect_used_rows = 1`, runs the stored procedure, and then reads
   `SELECT * FROM tmp_used_rows` on the same connection. The resulting rows are
   returned to the UI as **Transactions marked for locking**.
3. **Select candidates** – The user selects which rows should be locked and can
   exclude any ineligible rows with a reason.
4. **Request approval** – The user explicitly submits a lock request.
5. **Manager approval** – A manager accepts the approval request.
6. **Locks activated** – The API calls `activateReportTransactionLocks()` to
   transition the pending locks to `locked`.

This sequence ensures that simply populating candidates does not lock rows; the
rows remain pending until an explicit approval request is accepted.
