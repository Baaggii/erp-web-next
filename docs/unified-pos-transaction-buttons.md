# Unified POS Transaction Buttons

This module includes a single set of buttons used by every POS transaction configuration. Each button drives multiple tables using the mapping rules from `posTransactionConfig.json`.

## New
- Generates a session ID prefixed with `pos_` and applies it to every field mapped via `calcFields` or `posFields`.
- Fills default values for **all** forms including hidden ones so every table is ready for input.
- Sets the configured `statusField` to the `created` value if defined.
- Clears any previously loaded or pending transaction IDs.

## Save
- Writes the current values to the pending transactions store.
- Auto-fills any missing default values for each form before saving.
- Updates the `statusField` to the `beforePost` value so the transaction can be resumed later.
- Returns an ID for the pending transaction which is required for Delete or POST.

## Load
- Lists pending transaction IDs saved for the chosen configuration.
- Loads the master and all child tables for the selected ID with session-based field mapping and restores the master ID.
- The Load button is enabled whenever a configuration is selected.

## Delete
- Removes the currently loaded pending transaction and all related child tables.
- Clears the session ID, master ID and pending ID from the UI.
- Disabled when no pending transaction is loaded.

## POST
- Validates required fields for all forms before submission.
- Merges default values so each payload contains the latest defaults.
- Verifies `calcFields` mapping rules to ensure all tables contain the same session ID or other linked values.
- Splits the payload into `single` and `multi` collections before sending to `/api/pos_txn_post`.
- On success, deletes the pending entry, updates the `statusField` to `posted`, and leaves the master record intact.
- Hidden forms are included in the submission automatically.
- Error messages report the problematic field and value whenever possible.

Posted transactions are recorded in `config/posTransactions.json` together with
the company, branch and employee that created them and the posting date.
