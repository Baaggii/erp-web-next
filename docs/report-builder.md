# Report Builder

The Report Builder now guards its initial data fetch and wraps all rendering
inside an error boundary. When the table list fails to load, the page shows a
clear message instead of a blank screen. Any runtime errors triggered by button
presses are caught and displayed, preventing the window from going blank.

When extending the builder, throw descriptive errors rather than letting
failures fall through silently so the boundary can surface them to the user.

## Testing report lock candidates

Use the following stored procedure to simulate a report that publishes
multiple lock candidates via both result sets and the modern session variables.
The procedure seeds locks for two report rows and a related approval request so
that the API can exercise the metadata merge logic.

```sql
DELIMITER $$
CREATE PROCEDURE `sp_multiple_lock_test`()
BEGIN
  SET @__report_lock_candidates = JSON_ARRAY(
    JSON_OBJECT('table', 'reports', 'record_id', 7, 'label', 'Report 7'),
    JSON_OBJECT('table', 'reports', 'record_id', 10, 'label', 'Report 10')
  );

  SELECT JSON_ARRAY(
           JSON_OBJECT(
             'lock_table', 'reports',
             'lock_record_id', 7,
             'label', 'Report 7'
           ),
           JSON_OBJECT(
             'lock_table', 'reports',
             'lock_record_ids', JSON_ARRAY(8, 9),
             'description', 'Queued reports'
           )
         ) AS strict_candidates,
         JSON_ARRAY(
           JSON_OBJECT(
             'approvals', JSON_ARRAY(
               JSON_OBJECT(
                 'table', 'requests',
                 'record_id', 'req-1',
                 'label', 'Approval 1'
               )
             )
           )
         ) AS secondary_candidates;
END $$
DELIMITER ;
```

After loading the procedure, run the dedicated test to verify the multiple-lock
handling branch:

```bash
node --test tests/db/procedureLockCandidates.test.js
```

The new assertions confirm that the data access layer queries the
`report_transaction_locks` table for each table bucket, merges metadata from the
priority statuses, and surfaces the final lock context back to the caller.
