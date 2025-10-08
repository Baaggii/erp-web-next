# POS Transaction Permissions

This document summarizes how the application determines who can view POS transaction layouts and who is allowed to submit POS transactions. The rules reflect the logic implemented in `api-server/services/posTransactionConfig.js` and the POS transaction routes.

## Configuration visibility (`/api/pos_txn_config`)

A user can list or read POS transaction configurations when **any** of the following conditions are met:

- Their active employment session includes the `system_settings` permission.
- Their user-level permissions grant `system_settings`.
- They have explicit API access to `/api/pos_txn_config`.
- They have the `pos_transaction_management` module permission.
- They have the `pos_transactions` module permission.

After the high-level permission check passes, each configuration is filtered by branch and department. A configuration is visible when both of the following hold:

- The user's branch is in the configuration's `allowedBranches` list (or the list is empty).
- The user's department is in the configuration's `allowedDepartments` list (or the list is empty).

If a layout blocks the user's branch/department, it can still be visible when temporary access is enabled (`supportsTemporarySubmission`, `allowTemporarySubmission`, or `supportsTemporary`) **and** both `temporaryAllowedBranches` and `temporaryAllowedDepartments` include the user's scope.

## Transaction submission (`/api/pos_txn_post`)

Submitting a POS transaction requires an explicit operate permission. Access is granted when **any** of the following is true:

- The employment session has `system_settings`, `pos_transaction_management`, or `pos_transactions` permissions.
- The user-level permissions grant `system_settings`, `pos_transaction_management`, or `pos_transactions`.
- The user-level module assignments include `pos_transaction_management` or `pos_transactions`.
- The user-level API permissions allow calling `/api/pos_txn_post`.

When a request is authorized, the API derives the final branch and department scope by combining the values supplied in the request body (if any) with the active employment session. The resolved scope is then enforced against the POS layout's `allowed*` and `temporaryAllowed*` lists via `hasPosTransactionAccess`. Transactions submitted outside the allowed scope are rejected with a 403 error.

## Summary

- **Visibility** is controlled by configuration permissions plus branch/department filters, with temporary overrides when enabled.
- **Submission** additionally requires an operate permission and the resolved scope must be permitted by the layout.
- Administrators (with `system_settings`) automatically satisfy both checks; branch/department restrictions continue to apply unless explicitly left blank or overridden with temporary allowances.
