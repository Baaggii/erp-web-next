# Workplace session identifiers

This document summarizes how workplace session identifiers are populated on the
server, persisted on the client, and finally rendered in the application UI.

## Server responses

1. **Fetch employment sessions:** During login the API asks `getEmploymentSessions`
   for every active employment session that belongs to the employee. The list is
   filtered by `company_id` when the user selects a specific company.
2. **Normalize assignments:** `normalizeWorkplaceAssignments` converts each raw
   assignment into a canonical shape (`workplace_id`, `workplace_session_id`,
   names, etc.) and collects the unique `workplace_session_id` values that belong
   to the company.【F:api-server/controllers/authController.js†L26-L64】
3. **Normalize primary session:** `normalizeEmploymentSession` merges the primary
   employment session with the normalized assignments, fills missing
   `workplace_id`/`workplace_session_id` values with deterministic fallbacks, and
   returns an array of `workplace_session_ids` so the client can access every
   session identifier that belongs to the company.【F:api-server/controllers/authController.js†L66-L103】
4. **Return session metadata:** The login payload includes the normalized session
   object and echoes the `workplace_session_id` as well as the full list of
   `workplace_session_ids`. The same normalization path is reused by the profile
   (`/auth/me`) and refresh endpoints so every auth response exposes identical
   metadata.【F:api-server/controllers/authController.js†L105-L186】

## Client persistence

1. **Normalize again in the browser:** The client calls
   `normalizeEmploymentSession` to guard against inconsistent payloads and to
   keep the fallback logic identical when future endpoints reuse the helper.
   The hook returns a session object that always contains `workplace_session_id`
   and `workplace_session_ids` arrays.【F:src/erp.mgt.mn/utils/normalizeEmploymentSession.js†L1-L79】
2. **Store identifiers in local storage:** Both `login` and `fetchProfile` write
   the resolved `workplace`, `workplace_session_id`, and `workplace_session_ids`
   into the `erp_session_ids` entry so the identifiers survive a page reload and
   can seed other parts of the UI before another API call completes.
   `senior_empid` metadata is stored alongside the identifiers so dependent
   features remain consistent.【F:src/erp.mgt.mn/hooks/useAuth.jsx†L1-L96】

## UI rendering

1. **Aggregate account details:** `AppLayout` reads the authenticated session and
   merges the normalized assignments with any stored session IDs. Each unique
   assignment produces a human-friendly label, while `workplace_session_ids`
   without assignment metadata are rendered as `Session <id>` summaries. The
   component also builds a sorted list of workplace IDs for the "Workplace IDs"
   line in the account bar.【F:src/erp.mgt.mn/components/AppLayout.jsx†L1-L125】
2. **Reports dropdown:** The Reports page hydrates its workplace selector from
   the same normalized session data. Every option includes the assignment label
   and the numeric `workplace_session_id`, guaranteeing that the dropdown exposes
   all sessions for multi-workplace users.【F:src/erp.mgt.mn/pages/Reports.jsx†L1-L120】

Together these steps ensure the identifiers are captured at login, persisted in
local storage, and presented consistently across the UI for users who belong to
multiple workplace sessions.
