import test from 'node:test';
import assert from 'node:assert/strict';

import { filterDisabledFieldsForIdFields } from '../../src/erp.mgt.mn/components/tableManagerDisabledFields.js';

test('filterDisabledFieldsForIdFields keeps defaults when not adding', () => {
  const result = filterDisabledFieldsForIdFields({
    disabledFields: ['created_by'],
    isAdding: false,
  });
  assert.deepEqual(result, ['created_by']);
});

test('filterDisabledFieldsForIdFields disables id fields with session scope', () => {
  const result = filterDisabledFieldsForIdFields({
    disabledFields: ['created_by'],
    isAdding: true,
    autoFillSession: true,
    userIdFields: ['employee_id'],
    branchIdFields: ['branch_id'],
    user: { empid: 'E-100' },
    branch: 7,
  });

  assert.deepEqual(result.sort(), ['branch_id', 'created_by', 'employee_id'].sort());
});

test('filterDisabledFieldsForIdFields unlocks id fields without session scope', () => {
  const result = filterDisabledFieldsForIdFields({
    disabledFields: ['employee_id', 'branch_id'],
    isAdding: true,
    autoFillSession: true,
    userIdFields: ['employee_id'],
    branchIdFields: ['branch_id'],
    user: { empid: null },
    branch: null,
  });

  assert.deepEqual(result, []);
});
