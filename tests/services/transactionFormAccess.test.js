import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasTransactionFormAccess,
  evaluateTransactionFormAccess,
} from '../../src/erp.mgt.mn/utils/transactionFormAccess.js';

test('hasTransactionFormAccess respects workplace-linked positions', () => {
  const config = {
    allowedBranches: [],
    allowedDepartments: [],
    allowedPositions: ['200'],
  };
  assert.equal(
    hasTransactionFormAccess(config, null, null, {
      positionId: '999',
      workplaceId: '10',
      workplacePositionMap: { 10: '200' },
    }),
    true,
  );
  assert.equal(
    hasTransactionFormAccess(config, null, null, {
      positionId: '200',
      workplaceId: '10',
      workplacePositionMap: { 10: '300' },
    }),
    false,
  );
});

test('evaluateTransactionFormAccess blocks when workplace-linked position is disallowed', () => {
  const config = {
    allowedBranches: [],
    allowedDepartments: [],
    allowedPositions: ['400'],
    supportsTemporarySubmission: true,
    temporaryAllowedPositions: ['400'],
  };
  const result = evaluateTransactionFormAccess(config, null, null, {
    positionId: '400',
    workplaceId: '50',
    workplacePositionMap: { 50: '999' },
  });
  assert.equal(result.canPost, false);
  assert.equal(result.allowTemporary, false);
  assert.equal(result.allowTemporaryOnly, false);
});

test('hasTransactionFormAccess allows when any mapped workplace position is allowed', () => {
  const config = {
    allowedBranches: [],
    allowedDepartments: [],
    allowedPositions: ['600'],
  };
  assert.equal(
    hasTransactionFormAccess(config, null, null, {
      positionId: '999',
      workplaces: ['10', '20'],
      workplacePositionMap: { 20: '600' },
    }),
    true,
  );
});
