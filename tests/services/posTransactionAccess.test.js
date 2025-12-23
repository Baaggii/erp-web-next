import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPosTransactionAccess } from '../../src/erp.mgt.mn/utils/posTransactionAccess.js';

test('hasPosTransactionAccess enforces workplace position precedence', () => {
  const config = {
    allowedBranches: [],
    allowedDepartments: [],
    allowedPositions: ['200'],
  };

  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      positionId: '999',
      workplaceId: '10',
      workplacePositionMap: { 10: '200' },
    }),
    true,
  );

  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      positionId: '200',
      workplaceId: '10',
      workplacePositionMap: { 10: '300' },
    }),
    false,
  );

  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      positionId: '200',
      workplaceId: '11',
    }),
    false,
  );

  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      workplaceId: '11',
      workplacePositions: [
        { workplaceId: '10', workplacePositionId: '200' },
        { workplaceId: '11', workplacePositionId: '300' },
      ],
    }),
    true,
  );
});
