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

test('hasPosTransactionAccess enforces user rights, workplaces, and procedures', () => {
  const config = {
    allowedUserRights: ['7'],
    allowedWorkplaces: ['3'],
    procedures: ['PROC_A'],
  };
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      userRightId: 7,
      workplaceId: 3,
      procedure: 'PROC_A',
    }),
    true,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      userRightId: '5',
      workplaceId: 3,
      procedure: 'PROC_A',
    }),
    false,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      userRightId: 7,
      workplaceId: '4',
      procedure: 'PROC_A',
    }),
    false,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      userRightId: 7,
      workplaceId: 3,
      procedure: 'PROC_B',
    }),
    false,
  );
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

test('hasPosTransactionAccess honors temporary user right and workplace scopes', () => {
  const config = {
    allowedUserRights: ['9'],
    temporaryAllowedUserRights: ['5'],
    temporaryAllowedWorkplaces: ['15'],
    supportsTemporarySubmission: true,
  };
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      userRightId: '9',
      workplaceId: '99',
    }),
    true,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      userRightId: '5',
      workplaceId: '15',
    }),
    true,
  );
  assert.equal(
    hasPosTransactionAccess(config, null, null, {
      userRightId: '5',
      workplaceId: '11',
    }),
    false,
  );
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

test('filterPosConfigsByAccess enforces user rights and workplaces', () => {
  const configs = {
    Rights: { allowedUserRights: ['5'] },
    Workplace: { allowedWorkplaces: ['10'] },
    TempOnly: {
      allowedUserRights: ['8'],
      temporaryAllowedUserRights: ['7'],
      temporaryAllowedWorkplaces: ['12'],
      supportsTemporarySubmission: true,
    },
  };
  const allowed = filterPosConfigsByAccess(configs, null, null, {
    userRightId: '5',
    workplaceId: '10',
  });
  assert.deepEqual(Object.keys(allowed).sort(), ['Rights', 'Workplace']);
  const temp = filterPosConfigsByAccess(configs, null, null, {
    userRightId: '7',
    workplaceId: '12',
  });
  assert.deepEqual(Object.keys(temp).sort(), ['TempOnly']);
  const denied = filterPosConfigsByAccess(configs, null, null, {
    userRightId: '2',
    workplaceId: '99',
  });
  assert.deepEqual(Object.keys(denied), []);
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
