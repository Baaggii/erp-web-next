# Messaging Enhancement Plan: Auto-Pinned Department/Branch Conversations

This plan describes how to enhance the conversation list so users automatically receive pinned, deduplicated department and branch conversations, and how participant visibility should react to employee changes.

## Goals

1. Automatically create/update **default pinned conversations** for each active employee based on:
   - Session employee's department
   - Session employee's branch
2. Keep participants synchronized when employees are hired, transferred, or become inactive.
3. Send a welcome message when a new employee is hired.
4. Restrict visibility of department/branch messages so an employee only sees messages from the employee's hire date onward.
5. Respect active date window from:
   - `tbl_employee.emp_hiredate`
   - `tbl_employee.emp_outdate`

## Proposed Data Model

Add or standardize the following metadata at conversation level:

- `conversation_type`: `department` | `branch` | `direct` | `general`
- `scope_key`: deterministic identity key for dedupe
  - Department: `department:{company_id}:{department_id}`
  - Branch: `branch:{company_id}:{branch_id}`
- `scope_department_id` / `scope_branch_id` (nullable based on type)
- `is_default_pinned` boolean

Add participant membership history table (if not present):

- `erp_conversation_participants`
  - `conversation_id`
  - `emp_id`
  - `joined_at` (datetime)
  - `left_at` (nullable datetime)
  - `source` (`system` | `manual`)
  - unique: (`conversation_id`, `emp_id`, `joined_at`)

Why membership history: it allows strict timeline filtering and auditability when users move between departments/branches.

## Core Rules

### A) Dedupe + Auto-create default pinned conversations

When session starts or user opens messaging:

1. Resolve current user employee row (`tbl_employee`) and validate active window:
   - active if `emp_hiredate <= NOW()` and (`emp_outdate IS NULL OR emp_outdate >= NOW()`).
2. Build two desired scopes:
   - department scope from current department id
   - branch scope from current branch id
3. For each scope, upsert conversation by `scope_key`.
4. Ensure current user is an active participant (`joined_at` set when first added).
5. Mark conversation pinned in user preference mapping (or computed pinned state if system conversation).

### B) Update active users by session department/branch

At session refresh (or auth middleware that hydrates messaging context):

- Recompute employee active status + current department/branch.
- Ensure the employee is:
  - added to current department conversation
  - added to current branch conversation
- If employee changed department/branch:
  - set `left_at` on old scope conversation participant record
  - create new membership row for new scope with current timestamp

### C) New hire onboarding

On new employee creation (or first login if async provisioning):

1. Insert user participant rows for their department + branch conversations with `joined_at = emp_hiredate`.
2. Insert system welcome message to each relevant conversation (or only direct "welcome" thread if preferred):
   - body example: `Welcome {name}! You were added to {department/branch} channel.`
3. Mark these conversations pinned by default.

### D) Message visibility from hire date

For department/branch conversations, message list query should filter by the participant `joined_at` and `left_at` window.

Effective rule per message `m.created_at`:

- visible if `m.created_at >= participant.joined_at`
- and (`participant.left_at IS NULL OR m.created_at < participant.left_at`)

Additionally bound with employee lifecycle:

- `m.created_at >= tbl_employee.emp_hiredate`
- and (`tbl_employee.emp_outdate IS NULL OR m.created_at < tbl_employee.emp_outdate`)

Use whichever start is later (`MAX(joined_at, emp_hiredate)`) and whichever end is earlier (`MIN(left_at, emp_outdate)`).

## Suggested Service-Level Changes

In messaging service (API layer):

1. Add `ensureScopedConversation({ companyId, type, scopeId })`
   - upsert by `scope_key`
2. Add `syncEmployeeScopedMemberships({ companyId, empId, departmentId, branchId, hireDate, outDate })`
   - add current memberships
   - close obsolete memberships (`left_at`)
3. Add `applyConversationVisibilityWindow({ empId, conversationId })`
   - returns SQL fragment or query constraints
4. Add event handler `onEmployeeCreated` / `onEmployeeUpdated`
   - triggers sync + optional welcome messages

## SQL Sketches

### Upsert deduped conversation

```sql
INSERT INTO erp_conversations (
  company_id,
  conversation_type,
  scope_key,
  scope_department_id,
  scope_branch_id,
  is_default_pinned,
  created_at
)
VALUES (?, ?, ?, ?, ?, 1, NOW())
ON DUPLICATE KEY UPDATE
  is_default_pinned = VALUES(is_default_pinned);
```

### Add participant membership row

```sql
INSERT INTO erp_conversation_participants (
  conversation_id,
  emp_id,
  joined_at,
  left_at,
  source
)
VALUES (?, ?, ?, NULL, 'system');
```

### Close old membership on transfer

```sql
UPDATE erp_conversation_participants
SET left_at = NOW()
WHERE conversation_id = ?
  AND emp_id = ?
  AND left_at IS NULL;
```

### Message list visibility window

```sql
SELECT m.*
FROM erp_messages m
JOIN erp_conversation_participants p
  ON p.conversation_id = m.conversation_id
  AND p.emp_id = ?
JOIN tbl_employee e
  ON e.emp_id = p.emp_id
WHERE m.conversation_id = ?
  AND m.created_at >= GREATEST(COALESCE(p.joined_at, e.emp_hiredate), e.emp_hiredate)
  AND (
    LEAST(
      COALESCE(p.left_at, '2999-12-31'),
      COALESCE(e.emp_outdate, '2999-12-31')
    ) = '2999-12-31'
    OR m.created_at < LEAST(
      COALESCE(p.left_at, '2999-12-31'),
      COALESCE(e.emp_outdate, '2999-12-31')
    )
  );
```

## Rollout Strategy

1. **Migration 1**: add conversation scope columns + unique index on `scope_key`.
2. **Migration 2**: add participant history table (`joined_at`, `left_at`, `source`).
3. **Backfill**:
   - infer department/branch conversations and assign `scope_key`
   - migrate existing participants with `joined_at = NOW()` fallback
4. **Feature flag**: enable auto-sync for pilot tenant(s).
5. **Monitoring**:
   - count duplicates prevented by `scope_key`
   - count memberships added/closed daily
   - verify message visibility with hire/outdate fixtures

## Acceptance Criteria (mapped to your list)

1. **Update active users by session's department**: session hydration triggers department conversation membership sync.
2. **Update active users by session branch**: same sync process for branch scope.
3. **New hire adds user + welcome message**: onboarding hook inserts memberships and system welcome message.
4. **Department/branch messages visible only from hire time**: query enforces membership and employee date window.
5. **Active dates from `tbl_employee.emp_hiredate` and `tbl_employee.emp_outdate`**: both fields are used as hard visibility boundaries.
