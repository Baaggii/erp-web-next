import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPurgePlan,
  buildChainOfCustodyRecord,
  buildDeletionCertificate,
  buildPurgePlan,
  evaluateMessageLifecycle,
} from '../../api-server/services/messagingLifecyclePolicy.js';

test('purge correctness: expired messages become purge candidates', () => {
  const asOf = new Date('2026-02-01T00:00:00Z');
  const plan = buildPurgePlan({
    companyId: 7,
    asOf,
    companyPolicy: { general: 30 },
    messages: [
      {
        id: 100,
        companyId: 7,
        authorEmpid: 'E-1',
        conversationId: 'conv-a',
        linkedEntityType: 'transaction',
        linkedEntityId: 'TX-1',
        messageClass: 'general',
        createdAt: '2025-11-01T00:00:00Z',
      },
      {
        id: 101,
        companyId: 7,
        authorEmpid: 'E-2',
        conversationId: 'conv-b',
        linkedEntityType: 'transaction',
        linkedEntityId: 'TX-2',
        messageClass: 'general',
        createdAt: '2026-01-20T00:00:00Z',
      },
    ],
  });

  assert.equal(plan.summary.candidateCount, 1);
  assert.equal(plan.candidates[0].messageId, 100);
  assert.equal(plan.skipped.length, 1);
});

test('legal hold precedence: active hold blocks purge despite expired retention', () => {
  const decision = evaluateMessageLifecycle({
    asOf: new Date('2026-02-01T00:00:00Z'),
    companyPolicy: { financial: 10 },
    message: {
      id: 200,
      companyId: 9,
      authorEmpid: 'EMP-9',
      conversationId: 'conv-fin',
      linkedEntityType: 'transaction',
      linkedEntityId: 'FIN-9',
      messageClass: 'financial',
      createdAt: '2025-01-01T00:00:00Z',
    },
    legalHolds: [
      {
        id: 501,
        status: 'active',
        scope: 'company',
        companyId: 9,
        startsAt: '2025-01-01T00:00:00Z',
        endsAt: null,
      },
    ],
  });

  assert.equal(decision.purgeEligible, false);
  assert.equal(decision.status, 'blocked_by_legal_hold');
  assert.equal(decision.holdId, 501);
});

test('rollback safety: destructive purge requires approval gate, dry-run does not', () => {
  const purgePlan = {
    companyId: 3,
    candidates: [{ messageId: 10 }, { messageId: 11 }],
  };

  const dryRun = applyPurgePlan({ purgePlan, dryRun: true, requiredApprovals: 2, approvals: [] });
  assert.equal(dryRun.actions.every((a) => a.action === 'would_delete'), true);

  assert.throws(
    () => applyPurgePlan({ purgePlan, dryRun: false, requiredApprovals: 2, approvals: ['approver-a'] }),
    /Approval gate not met/,
  );

  const approved = applyPurgePlan({
    purgePlan,
    dryRun: false,
    requiredApprovals: 2,
    approvals: ['approver-a', 'approver-b'],
  });
  assert.equal(approved.actions.every((a) => a.action === 'delete'), true);
});

test('defensible deletion artifacts: chain-of-custody hashing and certificate digest are stable length', () => {
  const chain1 = buildChainOfCustodyRecord({ purgeRunId: 88, companyId: 5, messageId: 900 });
  const chain2 = buildChainOfCustodyRecord({
    purgeRunId: 88,
    companyId: 5,
    messageId: 901,
    previousHash: chain1.recordHash,
  });

  assert.equal(chain1.recordHash.length, 64);
  assert.equal(chain2.recordHash.length, 64);
  assert.equal(chain2.previousHash, chain1.recordHash);

  const cert = buildDeletionCertificate({
    companyId: 5,
    purgeRunId: 88,
    actionCount: 2,
    chainTailHash: chain2.recordHash,
    generatedBy: 'compliance.bot',
  });

  assert.equal(cert.certificateDigest.length, 64);
  assert.equal(cert.companyId, 5);
});
