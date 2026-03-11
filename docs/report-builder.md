# Report Builder

The Report Builder now guards its initial data fetch and wraps all rendering
inside an error boundary. When the table list fails to load, the page shows a
clear message instead of a blank screen. Any runtime errors triggered by button
presses are caught and displayed, preventing the window from going blank.

When extending the builder, throw descriptive errors rather than letting
failures fall through silently so the boundary can surface them to the user.

## Sample transactions dataset

The database migrations now seed a lightweight `transactions_test` table along
with a related `transactions_test_detail` table. Three sample transactions are
inserted so the report builder can showcase aggregate totals and the locking
workflow without having to bootstrap additional fixtures. Each detail row is
linked back to its parent transaction and includes quantities, SKU metadata and
line totals.

On top of the tables, the `dynrep_1_sp_transactions_test_report` stored
procedure demonstrates how dynamic reports can surface multiple lock candidates
at once. The procedure groups detail rows into a JSON payload that exposes both
record-level hints and session variables for the locking subsystem. This makes
it easy to exercise scenarios where a single report row needs to reserve records
from more than one table before the report can be approved.

## Configuring report totals

`ReportTable` automatically renders a `TOTAL` footer whenever the current result
set contains at least one numeric column. Each numeric column is summed on the
fly, so basic totals appear without any extra configuration or metadata in your
stored procedure output.【F:src/erp.mgt.mn/components/ReportTable.jsx†L640-L687】

If a stored procedure needs to expose a true summary row (for example, a total
that comes from a different aggregation query), include that row in the payload
under any of the following keys: `totalRow`, `total_row`, `totals`, `summary`,
`summaryRow`, or `summary_row`. Arrays are converted to `{ columnName: value }
` maps using the column list, and plain objects are used directly. The
sanitization layer inside `normalizeSnapshotRow` keeps the summary aligned with
the resolved columns before the UI consumes it.【F:api-server/services/pendingRequest.js†L109-L182】

Snapshots and the standalone `ReportSnapshotViewer` preserve the same summary by
pulling the `totalRow` value back out of the normalized dataset, ensuring that
the footer appears in downloaded artifacts as well as in the live table. Leaving
those keys undefined simply omits the summary row, so the viewer falls back to
the automatically computed totals described above.【F:src/erp.mgt.mn/utils/normalizeSnapshot.js†L1-L124】
