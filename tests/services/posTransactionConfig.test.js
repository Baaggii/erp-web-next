import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPosTransactionAccess,
  filterPosConfigsByAccess,
  hasPosConfigReadAccess,
  pickScopeValue,
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

test('hasPosTransactionAccess enforces user rights, workplaces, and procedures', () => {
  const config = {
    allowedBranches: [],
    allowedDepartments: [],
    allowedUserRights: ['100'],
    allowedPositions: ['10'],
    allowedWorkplaces: [5],
    procedures: ['sp_pos_submit'],
    temporaryAllowedUserRights: ['200'],
    temporaryAllowedPositions: ['20'],
    temporaryAllowedWorkplaces: ['9'],
    temporaryProcedures: ['sp_pos_temp'],
    supportsTemporarySubmission: true,
  };
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      userRightId: '100',
      positionId: '10',
      workplaceId: 5,
      procedure: 'sp_pos_submit',
    }),
    true,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      userRightId: '101',
      positionId: '10',
      workplaceId: 5,
      procedure: 'sp_pos_submit',
    }),
    false,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      userRightId: '200',
      positionId: '20',
      workplaceId: '9',
      procedure: 'sp_pos_temp',
    }),
    true,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      userRightId: '200',
      positionId: '10',
      workplaceId: '9',
      procedure: 'sp_pos_submit',
    }),
    false,
  );
});

test('hasPosTransactionAccess enforces positions for regular access', () => {
  const config = {
    allowedBranches: [],
    allowedDepartments: [],
    allowedPositions: ['77'],
    supportsTemporarySubmission: true,
    temporaryAllowedPositions: ['99'],
  };
  assert.equal(
    hasPosTransactionAccess(config, null, null, { positionId: '77' }),
    true,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, { positionId: '88' }),
    false,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, { positionId: '99' }),
    true,
  );
});

test('hasPosTransactionAccess allows workplace-linked positions', () => {
  const config = {
    allowedBranches: [],
    allowedDepartments: [],
    allowedPositions: ['123'],
  };
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      workplaceId: '77',
      positionId: '999',
      workplacePositionMap: { 77: '123' },
    }),
    true,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      workplaceId: '77',
      positionId: '999',
      workplacePositionMap: { 77: '555' },
    }),
    false,
  );
});

test('hasPosTransactionAccess blocks when workplace-linked position is disallowed even if user position allowed', () => {
  const config = {
    allowedBranches: [],
    allowedDepartments: [],
    allowedPositions: ['500'],
  };
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      workplaceId: '11',
      positionId: '500',
      workplacePositionMap: { 11: '999' },
    }),
    false,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      workplaceId: '11',
      positionId: '123',
      workplacePositionMap: { 11: '500' },
    }),
    true,
  );
});

test('filterPosConfigsByAccess returns only permitted configurations', () => {
  const configs = {
    Alpha: { allowedBranches: [1], allowedDepartments: [], allowedUserRights: ['10'] },
    Beta: { allowedBranches: [], allowedDepartments: ['20'], allowedWorkplaces: ['5'] },
    Gamma: { allowedBranches: [3], allowedDepartments: ['30'], allowedUserRights: ['99'] },
    Temp: {
      allowedBranches: [9],
      allowedDepartments: ['90'],
      temporaryAllowedBranches: ['1'],
      temporaryAllowedDepartments: ['20'],
      temporaryAllowedUserRights: ['10'],
      temporaryAllowedWorkplaces: ['5'],
      supportsTemporarySubmission: true,
    },
  };
  const filtered = filterPosConfigsByAccess(
    configs,
    1,
    20,
    { userRightId: '10', workplaceId: '5' },
  );
  assert.deepEqual(Object.keys(filtered).sort(), ['Alpha', 'Beta', 'Temp']);
  assert.ok(!filtered.Gamma);
});

test('pickScopeValue prefers request value when provided', () => {
  assert.equal(pickScopeValue('5', 3), '5');
  assert.equal(pickScopeValue(7, 3), 7);
  assert.equal(pickScopeValue('  ', 3), 3);
  assert.equal(pickScopeValue(undefined, 4), 4);
  assert.equal(pickScopeValue(null, 4), 4);
  assert.equal(pickScopeValue(undefined, null), undefined);
});

test('hasPosConfigReadAccess grants access for permitted permissions', () => {
  assert.equal(hasPosConfigReadAccess({ permissions: { system_settings: true } }, {}), true);
  assert.equal(
    hasPosConfigReadAccess({}, { permissions: { system_settings: true } }),
    true,
  );
  assert.equal(
    hasPosConfigReadAccess({}, { api: { '/api/pos_txn_config': true } }),
    true,
  );
  assert.equal(hasPosConfigReadAccess({}, { pos_transaction_management: true }), true);
  assert.equal(hasPosConfigReadAccess({}, { pos_transactions: true }), true);
});

test('hasPosConfigReadAccess denies when no permissions granted', () => {
  assert.equal(hasPosConfigReadAccess({}, {}), false);
  assert.equal(
    hasPosConfigReadAccess({ permissions: { system_settings: false } }, {}),
    false,
  );
  assert.equal(
    hasPosConfigReadAccess({}, { permissions: { system_settings: false } }),
    false,
  );
});
