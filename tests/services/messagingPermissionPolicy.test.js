import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMessagingPermission } from '../../api-server/services/messagingPermissionPolicy.js';

const baseActor = {
  empid: 'emp-1',
  companyId: 10,
  departmentIds: [100],
  projectIds: ['P-1'],
};

test('deny-overrides blocks privilege escalation when allow rule also matches', () => {
  const result = evaluateMessagingPermission({
    role: 'Manager',
    action: 'message:delete',
    actor: baseActor,
    resource: {
      companyId: 10,
      departmentId: 100,
      projectId: 'P-1',
      linked: { type: 'transaction', ownerEmpid: 'emp-2' },
    },
    policy: {
      rules: [
        { id: 'allow-delete-tx', effect: 'allow', actions: ['message:delete'], scope: { company: 'same', linkedTypes: ['transaction'] } },
        { id: 'deny-manager-delete-transaction', effect: 'deny', actions: ['message:delete'], scope: { company: 'same', linkedTypes: ['transaction'] } },
      ],
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'RULE_DENY');
});

test('external cannot read thread from another company (cross-tenant escalation)', () => {
  const result = evaluateMessagingPermission({
    role: 'External',
    action: 'thread:read',
    actor: baseActor,
    resource: {
      companyId: 11,
      projectId: 'P-1',
      linked: { type: 'topic', ownerEmpid: 'emp-1' },
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'SCOPE_MISMATCH');
});

test('manager cannot moderate messages outside own department', () => {
  const result = evaluateMessagingPermission({
    role: 'Manager',
    action: 'message:read',
    actor: baseActor,
    resource: {
      companyId: 10,
      departmentId: 200,
      projectId: 'P-1',
      linked: { type: 'plan', ownerEmpid: 'emp-2' },
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'SCOPE_MISMATCH');
});

test('staff cannot gain admin export via custom allow when explicit deny exists', () => {
  const result = evaluateMessagingPermission({
    role: 'Staff',
    action: 'admin:export',
    actor: baseActor,
    resource: { companyId: 10, departmentId: 100, projectId: 'P-1', linked: { type: 'topic' } },
    policy: {
      rules: [
        { id: 'deny-export', effect: 'deny', actions: ['admin:export'], scope: { company: 'same' } },
        { id: 'allow-export', effect: 'allow', actions: ['admin:export'], scope: { company: 'same' } },
      ],
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'RULE_DENY');
});

test('owner can export moderation data company-wide', () => {
  const result = evaluateMessagingPermission({
    role: 'Owner',
    action: 'admin:export',
    actor: { ...baseActor, companyId: 10 },
    resource: {
      companyId: 10,
      departmentId: 999,
      projectId: 'any',
      linked: { type: 'transaction', ownerEmpid: 'someone-else' },
    },
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'ROLE_ALLOW');
});
