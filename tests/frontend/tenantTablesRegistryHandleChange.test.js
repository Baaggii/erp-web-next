import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTableFieldChange,
  updateTablesWithChange,
  buildRowIdentifier,
} from '../../src/erp.mgt.mn/pages/TenantTablesRegistry.helpers.js';

test('applyTableFieldChange forces seedOnCreate and clears isShared when enabling seeding', () => {
  const original = Object.freeze({
    tableName: 'users',
    isShared: true,
    seedOnCreate: false,
  });

  const updated = applyTableFieldChange(original, 'seedOnCreate', true);

  assert.notEqual(updated, original);
  assert.equal(updated.seedOnCreate, true);
  assert.equal(updated.isShared, false);
  assert.equal(updated.tableName, original.tableName);
});

test('updateTablesWithChange keeps prior edits intact when toggling multiple rows sequentially', () => {
  const rowA = Object.freeze({ tableName: 'users', isShared: true, seedOnCreate: false });
  const rowB = Object.freeze({ tableName: 'posts', isShared: true, seedOnCreate: false });
  const initial = Object.freeze([rowA, rowB]);

  const afterFirstToggle = updateTablesWithChange(initial, 0, 'seedOnCreate', true);

  assert.equal(afterFirstToggle.length, 2);
  assert.notEqual(afterFirstToggle, initial);
  assert.notEqual(afterFirstToggle[0], rowA);
  assert.equal(afterFirstToggle[1], rowB);
  assert.equal(afterFirstToggle[0].seedOnCreate, true);
  assert.equal(afterFirstToggle[0].isShared, false);

  const afterSecondToggle = updateTablesWithChange(afterFirstToggle, 1, 'seedOnCreate', true);

  assert.equal(afterSecondToggle.length, 2);
  assert.notEqual(afterSecondToggle, afterFirstToggle);
  assert.equal(afterSecondToggle[0], afterFirstToggle[0]);
  assert.notEqual(afterSecondToggle[1], rowB);
  assert.equal(afterSecondToggle[1].seedOnCreate, true);
  assert.equal(afterSecondToggle[1].isShared, false);
});

test('buildRowIdentifier joins primary keys and coerces values to strings', () => {
  const row = { id: 7, code: 'A1' };
  assert.equal(buildRowIdentifier(row, ['id']), '7');
  assert.equal(buildRowIdentifier(row, ['id', 'code']), '7-A1');
});

test('buildRowIdentifier returns null when keys are missing', () => {
  const row = { id: null, code: 'A1' };
  assert.equal(buildRowIdentifier(null, ['id']), null);
  assert.equal(buildRowIdentifier(row, []), null);
  assert.equal(buildRowIdentifier(row, ['id']), null);
  assert.equal(buildRowIdentifier(row, ['missing']), null);
});
