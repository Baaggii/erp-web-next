import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeNumericId,
  normalizeWorkplaceAssignments,
} from '../../api-server/utils/workplaceAssignments.js';

test('normalizeNumericId accepts bigint inputs when safe', () => {
  assert.equal(normalizeNumericId(1n), 1);
  assert.equal(normalizeNumericId(9007199254740991n), 9007199254740991);
  assert.equal(normalizeNumericId(-12n), -12);
});

test('normalizeNumericId rejects bigint inputs outside the safe range', () => {
  assert.equal(normalizeNumericId(9007199254740992n), null);
});

test('normalizeWorkplaceAssignments keeps bigint identifiers', () => {
  const { assignments } = normalizeWorkplaceAssignments([
    {
      company_id: 1n,
      workplace_id: 12n,
      workplace_name: 'Main',
    },
  ]);

  assert.deepEqual(assignments, [
    {
      company_id: 1n,
      workplace_id: 12,
      workplace_name: 'Main',
    },
  ]);
});

test('normalizeWorkplaceAssignments keeps multiple assignments for the same workplace', () => {
  const { assignments } = normalizeWorkplaceAssignments([
    {
      company_id: 1,
      branch_id: 10,
      workplace_id: 5,
      workplace_name: 'North',
    },
    {
      company_id: 1,
      branch_id: 11,
      workplace_id: 5,
      workplace_name: 'North',
    },
  ]);

  assert.deepEqual(assignments, [
    {
      company_id: 1,
      branch_id: 10,
      workplace_id: 5,
      workplace_name: 'North',
    },
    {
      company_id: 1,
      branch_id: 11,
      workplace_id: 5,
      workplace_name: 'North',
    },
  ]);
});
