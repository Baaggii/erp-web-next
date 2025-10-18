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
