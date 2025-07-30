import test from 'node:test';
import assert from 'node:assert/strict';
import buildImageName from '../../src/erp.mgt.mn/utils/buildImageName.js';

test('buildImageName joins fields and sanitizes', () => {
  const row = { Code: 'A1', Date: '2025-07-01' };
  const res = buildImageName(row, ['Code', 'Date'], { code: 'Code', date: 'Date' });
  assert.equal(res.name, 'a1_2025-07-01');
  assert.deepEqual(res.missing, []);
});

test('buildImageName returns missing list', () => {
  const row = { name: 'Test' };
  const res = buildImageName(row, ['code', 'name'], { code: 'code', name: 'name' });
  assert.equal(res.name, 'test');
  assert.deepEqual(res.missing, ['code']);
});
