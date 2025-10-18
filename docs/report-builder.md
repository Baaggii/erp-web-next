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

## Automatic session parameters

When the UI executes a report through `/api/procedures/raw`, the backend inspects
the stored procedure signature before forwarding the request to MySQL. If a
parameter named `session_workplace_id` is detected, the handler resolves the
active workplace from the authenticated employee’s employment session and injects
it into the payload that backs the `@session_workplace_id` placeholder. The
lookup also populates the matching `workplace` and `workplace_name` fields when
they are missing so reports can display friendly labels without extra queries.

Existing session values submitted by the client are preserved, so custom report
filters (branch, department, etc.) continue to flow through untouched. The
automatic hydration only fills gaps, ensuring operators who lack an active
workplace still execute reports successfully while workplace-assigned employees
receive consistent scoping metadata out of the box.
