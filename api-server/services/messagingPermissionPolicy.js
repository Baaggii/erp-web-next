const MESSAGING_ACTIONS = Object.freeze([
  'message:create',
  'message:read',
  'message:reply',
  'message:edit',
  'message:delete',
  'thread:read',
  'presence:read',
  'attachment:upload',
  'attachment:read',
  'admin:moderate',
  'admin:export',
]);

const ROLE_PRESETS = Object.freeze({
  Owner: {
    allow: MESSAGING_ACTIONS,
    deny: [],
    scope: { company: 'all' },
  },
  Admin: {
    allow: MESSAGING_ACTIONS.filter((action) => action !== 'admin:export'),
    deny: [],
    scope: { company: 'all' },
  },
  Manager: {
    allow: [
      'message:create',
      'message:read',
      'message:reply',
      'message:edit',
      'message:delete',
      'thread:read',
      'presence:read',
      'attachment:upload',
      'attachment:read',
    ],
    deny: ['admin:moderate', 'admin:export'],
    scope: { company: 'same', department: 'same', project: 'assigned' },
  },
  Staff: {
    allow: [
      'message:create',
      'message:read',
      'message:reply',
      'message:edit',
      'thread:read',
      'presence:read',
      'attachment:upload',
      'attachment:read',
    ],
    deny: ['message:delete', 'admin:moderate', 'admin:export'],
    scope: { company: 'same', department: 'same', project: 'assigned', linkedEntityOwnership: 'self' },
  },
  External: {
    allow: ['message:create', 'message:read', 'message:reply', 'thread:read', 'attachment:read'],
    deny: ['message:edit', 'message:delete', 'presence:read', 'attachment:upload', 'admin:moderate', 'admin:export'],
    scope: { company: 'same', project: 'assigned', linkedEntityOwnership: 'self' },
  },
});

function toSet(values) {
  return new Set(Array.isArray(values) ? values : []);
}

function matchesScope(scope = {}, actor = {}, resource = {}) {
  if ((scope.company === 'same' || scope.company === 'all') && actor.companyId !== resource.companyId) return false;
  if (scope.department === 'same' && resource.departmentId && !toSet(actor.departmentIds).has(resource.departmentId)) return false;
  if (scope.project === 'assigned' && resource.projectId && !toSet(actor.projectIds).has(resource.projectId)) return false;

  if (scope.linkedEntityOwnership === 'self') {
    const linkedOwner = resource?.linked?.ownerEmpid;
    if (linkedOwner && linkedOwner !== actor.empid) return false;
  }

  if (Array.isArray(scope.linkedTypes) && scope.linkedTypes.length > 0) {
    if (!scope.linkedTypes.includes(resource?.linked?.type)) return false;
  }

  return true;
}

function ruleMatches(rule, action, actor, resource) {
  if (!rule || !Array.isArray(rule.actions) || !rule.actions.includes(action)) return false;
  if (!matchesScope(rule.scope, actor, resource)) return false;
  return true;
}

export function evaluateMessagingPermission({
  role,
  action,
  actor,
  resource,
  policy = {},
}) {
  if (!MESSAGING_ACTIONS.includes(action)) {
    return { allowed: false, reason: 'UNKNOWN_ACTION' };
  }

  const preset = ROLE_PRESETS[role] || ROLE_PRESETS.External;
  const explicitRules = Array.isArray(policy.rules) ? policy.rules : [];

  const matchingDenyRule = explicitRules.find((rule) => rule.effect === 'deny' && ruleMatches(rule, action, actor, resource));
  if (matchingDenyRule) {
    return { allowed: false, reason: 'RULE_DENY', ruleId: matchingDenyRule.id || null };
  }

  const matchingAllowRule = explicitRules.find((rule) => rule.effect === 'allow' && ruleMatches(rule, action, actor, resource));
  if (matchingAllowRule) {
    return { allowed: true, reason: 'RULE_ALLOW', ruleId: matchingAllowRule.id || null };
  }

  const presetDeny = toSet(preset.deny);
  if (presetDeny.has(action)) return { allowed: false, reason: 'ROLE_DENY' };

  const presetAllow = toSet(preset.allow);
  if (!presetAllow.has(action)) return { allowed: false, reason: 'ROLE_NOT_ALLOWED' };

  if (!matchesScope(preset.scope, actor, resource)) {
    return { allowed: false, reason: 'SCOPE_MISMATCH' };
  }

  return { allowed: true, reason: 'ROLE_ALLOW' };
}

export function getMessagingPermissionMatrix() {
  return ROLE_PRESETS;
}

export { MESSAGING_ACTIONS, ROLE_PRESETS };
