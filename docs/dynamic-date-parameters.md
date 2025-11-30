# Handling Auto-Filled Dates in Procedures and Triggers

This note explains how date parameters are supplied and why they may appear empty when working with forms that auto-populate date fields via dynamic configuration.

## 1. How date parameters are provided
- **Procedure parameters** come from the caller. If a form auto-fills a date cell, the client must still bind that value when calling the stored procedure, or the procedure must derive it (for example, `COALESCE(@dateParam, CURRENT_TIMESTAMP)`). Auto-filling the UI field does not automatically populate the procedure argument.
- **Relying on table defaults** works only when the `INSERT` or `UPDATE` omits the column. Including the column with `NULL` bypasses the default. If you want the default, either omit the column or coalesce the parameter before the write.
- **Triggers** read the new row via pseudo-tables (`inserted`/`deleted`, `NEW`/`OLD`). A trigger sees the auto-filled value only after it has been set. Use `AFTER INSERT/UPDATE` triggers if you rely on a column default, or set `NEW.date` manually in `BEFORE` triggers when needed.
- **Modal submission check**: Ensure the submission payload actually includes the auto-filled date and that the API layer maps it to the stored procedure or trigger parameter. Logging the payload alongside bound parameters helps catch missing bindings quickly.
- **Always use the modal's field value**: Whether the date cell is visible or hidden in the modal, the client must submit the field's value and bind that value to the stored procedure/trigger parameter. Do not assume hidden or dynamically filled cells will be picked up automatically by the database layer.

## 2. Why a date parameter can be empty even though the form cell is filled
- The caller never bound the date argument, assuming the database default would populate the trigger/procedure parameter automatically. Defaults do not populate parameters; they only affect the column when it is omitted from the write.
- The `INSERT`/`UPDATE` includes the date column with `NULL`, so the table default never fires and the parameter remains `NULL`.
- A trigger executes **before** the default applies, so reading `NEW.date` (or `inserted.date`) in a `BEFORE` trigger yields `NULL`. Move the logic to `AFTER` or set the value directly in the trigger.
- Parameter/column name mismatches or incorrect mapping in the modal submission cause the stored procedure to receive no value even though the UI shows one.
- Hidden or dynamically filled modal fields are not posted: if the modal never submits the hidden date cell, the procedure/trigger parameter will be empty even though the UI shows the value. Always include the field value in the payload and map it explicitly to the date parameter.
- Conditional branches can skip binding the date in certain cases, leading to intermittent empty parameters while the UI always auto-fills the field.

## Practical safeguards
- In stored procedures, initialize date parameters with `COALESCE` or `DEFAULT` expressions before use, and omit the date column from the `INSERT` when you want the table default.
- In triggers, reference the pseudo-table after the default applies (use `AFTER` timing) or assign `NEW.date := CURRENT_TIMESTAMP` in `BEFORE` triggers.
- Enforce `NOT NULL` with a default on the date column and avoid writing explicit `NULL` values.
- Add logging/validation to detect missing date bindings from the client.
