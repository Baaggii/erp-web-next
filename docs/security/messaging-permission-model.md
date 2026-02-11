# Messaging Permission Model

## 1) Human-readable permission matrix

Legend: ✅ allowed by default, ◐ allowed with scope constraints, ❌ denied.

| Permission | Owner | Admin | Manager | Staff | External |
|---|---:|---:|---:|---:|---:|
| `message:create` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `message:read` | ✅ | ✅ | ◐ | ◐ | ◐ |
| `message:reply` | ✅ | ✅ | ✅ | ✅ | ◐ |
| `message:edit` | ✅ | ✅ | ◐ | ◐ (self, edit window) | ❌ |
| `message:delete` | ✅ | ✅ | ◐ | ❌ (except own if explicitly enabled) | ❌ |
| `thread:read` | ✅ | ✅ | ◐ | ◐ | ◐ |
| `presence:read` | ✅ | ✅ | ◐ | ◐ | ❌ |
| `attachment:upload` | ✅ | ✅ | ◐ | ◐ | ❌ |
| `attachment:read` | ✅ | ✅ | ◐ | ◐ | ◐ |
| `admin:moderate` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `admin:export` | ✅ | ❌ (unless custom allow) | ❌ | ❌ | ❌ |

### Scope filters applied to ◐ actions

- **Company filter**: actor `companyId` must match resource `companyId` unless role is global owner for multi-tenant superuser flows.
- **Department filter**: for Manager/Staff departmental traffic, actor department assignment must include resource department.
- **Project filter**: actor must be assigned to resource project.
- **Linked entity ownership**: for ownership-scoped actions, linked entity owner must match actor empid.
- **Linked object scope**: `linked.type` can be constrained (`transaction`, `plan`, `topic`) by policy rule.

---

## 2) Rule precedence

1. Evaluate **explicit deny rules** (`effect = deny`) that match action + scope.
2. Then evaluate **explicit allow rules** (`effect = allow`) that match action + scope.
3. If no explicit rule matches, evaluate role preset deny list.
4. If not denied, evaluate role preset allow list.
5. If allowed by role preset, enforce context scope constraints (company/department/project/ownership).
6. Default fallback is deny.

> Deny-overrides always wins over allows, including role-level allows.

---

## 3) Machine-readable policy JSON examples

### 3.1 Role presets

```json
{
  "version": "2026-01-01",
  "roles": {
    "Owner": {
      "allow": ["*"],
      "scope": { "company": "all" }
    },
    "Admin": {
      "allow": [
        "message:create", "message:read", "message:reply", "message:edit", "message:delete",
        "thread:read", "presence:read", "attachment:upload", "attachment:read", "admin:moderate"
      ],
      "deny": ["admin:export"],
      "scope": { "company": "same" }
    },
    "Manager": {
      "allow": [
        "message:create", "message:read", "message:reply", "message:edit", "message:delete",
        "thread:read", "presence:read", "attachment:upload", "attachment:read"
      ],
      "deny": ["admin:moderate", "admin:export"],
      "scope": { "company": "same", "department": "same", "project": "assigned" }
    },
    "Staff": {
      "allow": [
        "message:create", "message:read", "message:reply", "message:edit",
        "thread:read", "presence:read", "attachment:upload", "attachment:read"
      ],
      "deny": ["message:delete", "admin:moderate", "admin:export"],
      "scope": {
        "company": "same",
        "department": "same",
        "project": "assigned",
        "linkedEntityOwnership": "self"
      }
    },
    "External": {
      "allow": ["message:create", "message:read", "message:reply", "thread:read", "attachment:read"],
      "deny": ["message:edit", "message:delete", "presence:read", "attachment:upload", "admin:moderate", "admin:export"],
      "scope": { "company": "same", "project": "assigned", "linkedEntityOwnership": "self" }
    }
  }
}
```

### 3.2 Scoped allow/deny for linked entities

```json
{
  "rules": [
    {
      "id": "allow-manager-transaction-replies",
      "effect": "allow",
      "actions": ["message:reply", "thread:read"],
      "scope": {
        "company": "same",
        "department": "same",
        "project": "assigned",
        "linkedTypes": ["transaction"]
      }
    },
    {
      "id": "deny-non-owner-topic-delete",
      "effect": "deny",
      "actions": ["message:delete"],
      "scope": {
        "company": "same",
        "linkedTypes": ["topic"],
        "linkedEntityOwnership": "self"
      }
    },
    {
      "id": "deny-export-external",
      "effect": "deny",
      "subjects": ["External"],
      "actions": ["admin:export"],
      "scope": { "company": "same" }
    }
  ]
}
```

---

## 4) Middleware enforcement pseudocode

```pseudo
function messagingAuthMiddleware(requiredAction):
  actor = request.authUser
  resource = buildResourceFromRequest(request)
  role = actor.role

  if not actor or not actor.companyId:
    return 401

  decision = evaluateMessagingPermission(
    role = role,
    action = requiredAction,
    actor = {
      empid: actor.empid,
      companyId: actor.companyId,
      departmentIds: actor.departmentIds,
      projectIds: actor.projectIds
    },
    resource = {
      companyId: resource.companyId,
      departmentId: resource.departmentId,
      projectId: resource.projectId,
      linked: {
        type: resource.linkedType,
        id: resource.linkedId,
        ownerEmpid: resource.ownerEmpid
      }
    },
    policy = tenantPolicyFor(resource.companyId)
  )

  if decision.allowed is false:
    audit("permission_denied", actor, requiredAction, decision.reason)
    return 403

  request.permissionDecision = decision
  next()
```

---

## 5) Privilege-escalation test scenarios

1. **Cross-company thread read**: External user in company A attempts `thread:read` in company B → deny (`SCOPE_MISMATCH`).
2. **Delete escalation via crafted payload**: Staff tries `message:delete` on message not owned by them while passing forged owner id in request body → deny using server-fetched ownership.
3. **Allow+deny collision**: Policy has both `allow` and `deny` for `message:delete`; deny rule matches same scope → deny (`RULE_DENY`).
4. **Admin export escalation**: Admin attempts `admin:export` without explicit custom allow → deny (`ROLE_DENY`).
5. **Department breakout**: Manager with dept A tries to moderate/read dept B thread → deny (`SCOPE_MISMATCH`).
6. **Linked-type breakout**: Rule allows `transaction` replies, user attempts same action on `plan` link → deny.
