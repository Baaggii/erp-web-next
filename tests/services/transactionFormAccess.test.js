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
  assert.equal(
    hasTransactionFormAccess(config, null, null, {
      positionId: '200',
      workplaceId: '11',
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

test('evaluateTransactionFormAccess always allows posting for Regular Access user right', () => {
  const config = {
    allowedBranches: ['100'],
    allowedDepartments: ['200'],
    allowedUserRights: ['999'],
    supportsTemporarySubmission: true,
    temporaryAllowedBranches: ['100'],
  };
  const result = evaluateTransactionFormAccess(config, '300', '400', {
    userRightId: '888',
    userRightName: 'Regular Access',
    allowTemporaryAnyScope: true,
  });
  assert.equal(result.canPost, true);
  assert.equal(result.allowTemporary, true);
  assert.equal(result.allowTemporaryOnly, false);
});

test('hasTransactionFormAccess grants access for Regular Access even when scopes mismatch', () => {
  const config = {
    allowedBranches: ['1'],
    allowedDepartments: ['2'],
    allowedUserRights: ['3'],
    supportsTemporarySubmission: true,
    temporaryAllowedBranches: ['1'],
    temporaryAllowedDepartments: ['2'],
    temporaryAllowedUserRights: ['3'],
  };
  assert.equal(
    hasTransactionFormAccess(config, '9', '9', {
      userRightName: 'Regular Access',
    }),
    true,
  );
});
