# Unified POS Transaction Buttons

This module includes a single set of buttons used by every POS transaction configuration. Each button drives multiple tables using the mapping rules from `posTransactionConfig.json`.

## New
- Creates a fresh master record.
- Generates a session ID and applies it to every field mapped via `calcFields` or `posFields`.
- Fills default values from the master form configuration.
- Sets the configured `statusField` to the `created` value if defined.
- Clears any previously loaded or pending transaction IDs.

## Save
- Writes the current master and child table values to the pending transactions store.
- Auto-fills any missing default values for each form before saving.
- Updates the `statusField` to the `beforePost` value so the transaction can be resumed later.
- Returns an ID for the pending transaction which is required for Load/Delete/Post.

## Load
- Lists pending transaction IDs saved for the chosen configuration.
- Loads the master and all child tables for the selected ID with session-based field mapping.
- Disables Load until a configuration is selected and a pending ID exists.

## Delete
- Removes the currently loaded pending transaction and all related child tables.
- Clears the session ID, master ID and pending ID from the UI.
- Disabled when no pending transaction is loaded.

## POST
- Validates required fields for all forms before submission.
- Merges default values so each payload contains the latest defaults.
- Verifies `calcFields` mapping rules to ensure all tables contain the same session ID or other linked values.
- Sends the data to `/api/pos_txn_post`.
- On success, clears the pending entry and updates the `statusField` to `posted`.
- Hidden forms are included in the submission automatically.
