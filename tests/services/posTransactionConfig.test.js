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

test('hasPosTransactionAccess honors temporary permissions', () => {
  const config = {
    allowedBranches: [1],
    allowedDepartments: ['10'],
    temporaryAllowedBranches: ['2'],
    temporaryAllowedDepartments: ['20'],
    supportsTemporarySubmission: true,
  };
  assert.equal(hasPosTransactionAccess(config, 1, '10'), true);
  assert.equal(hasPosTransactionAccess(config, '2', '20'), true);
  assert.equal(hasPosTransactionAccess(config, '2', '10'), false);
  assert.equal(hasPosTransactionAccess(config, '3', '20'), false);
});

test('filterPosConfigsByAccess returns only permitted configurations', () => {
  const configs = {
    Alpha: { allowedBranches: [1], allowedDepartments: [] },
    Beta: { allowedBranches: [], allowedDepartments: ['20'] },
    Gamma: { allowedBranches: [3], allowedDepartments: ['30'] },
    Temp: {
      allowedBranches: [9],
      allowedDepartments: ['90'],
      temporaryAllowedBranches: ['1'],
      temporaryAllowedDepartments: ['20'],
      supportsTemporarySubmission: true,
    },
  };
  const filtered = filterPosConfigsByAccess(configs, 1, 20);
  assert.deepEqual(Object.keys(filtered).sort(), ['Alpha', 'Beta', 'Temp']);
  assert.ok(!filtered.Gamma);
});
