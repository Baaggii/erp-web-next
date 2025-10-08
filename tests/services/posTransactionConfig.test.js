import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPosTransactionAccess,
  filterPosConfigsByAccess,
} from '../../api-server/services/posTransactionConfig.js';

test('hasPosTransactionAccess allows when no restrictions are set', () => {
  assert.equal(hasPosTransactionAccess({}, 1, 2), true);
  assert.equal(
    hasPosTransactionAccess({ allowedBranches: [], allowedDepartments: [] }, '5', '7'),
    true,
  );
});

test('hasPosTransactionAccess enforces branch and department restrictions', () => {
  const config = { allowedBranches: [1, '2'], allowedDepartments: ['10'] };
  assert.equal(hasPosTransactionAccess(config, 1, 10), true);
  assert.equal(hasPosTransactionAccess(config, '2', '10'), true);
  assert.equal(hasPosTransactionAccess(config, 3, 10), false);
  assert.equal(hasPosTransactionAccess(config, 1, '11'), false);
  assert.equal(hasPosTransactionAccess(config, null, '10'), true);
  assert.equal(hasPosTransactionAccess(config, undefined, undefined), true);
});

test('temporary access flags mirror dynamic transaction logic', () => {
  const config = {
    allowedBranches: ['1'],
    allowedDepartments: ['2'],
    supportsTemporarySubmission: true,
    temporaryAllowedBranches: ['3'],
    temporaryAllowedDepartments: ['4'],
  };

  assert.equal(hasPosTransactionAccess(config, '1', '2'), true);
  assert.equal(hasPosTransactionAccess(config, '3', '4'), true);
  assert.equal(hasPosTransactionAccess(config, '3', '5'), false);
});

test('filterPosConfigsByAccess returns only permitted configurations', () => {
  const configs = {
    Alpha: { allowedBranches: [1], allowedDepartments: [] },
    Beta: { allowedBranches: [], allowedDepartments: ['20'] },
    Gamma: { allowedBranches: [3], allowedDepartments: ['30'] },
  };
  const filtered = filterPosConfigsByAccess(configs, 1, 20);
  assert.deepEqual(Object.keys(filtered).sort(), ['Alpha', 'Beta']);
  assert.ok(!filtered.Gamma);
});
