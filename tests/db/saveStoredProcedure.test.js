import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

function mockPool(procName) {
  const original = db.pool.query;
  const calls = [];
  db.pool.query = async (sql) => {
    calls.push(sql);
    if (/information_schema\.ROUTINES/i.test(sql)) {
      return [[{ ROUTINE_NAME: procName }]];
    }
    return [];
  };
  return () => {
    db.pool.query = original;
    return calls;
  };
}

test('saveStoredProcedure accepts script with END$$', async () => {
  const sql = `
DELIMITER $$
CREATE DEFINER=\`root\`@\`localhost\` PROCEDURE \`sp_test1\`()
BEGIN
  SELECT 1;
END$$
DELIMITER ;
`;
  const restore = mockPool('sp_test1');
  await db.saveStoredProcedure(sql);
  const calls = restore();
  assert.ok(/CREATE PROCEDURE/i.test(calls[0]));
  assert.ok(!/DELIMITER/i.test(calls[0]));
  assert.ok(calls[0].trim().endsWith('END;'));
});

test('saveStoredProcedure accepts script ending with END without semicolon', async () => {
  const sql = `
CREATE PROCEDURE sp_test2()
BEGIN
  SELECT 1;
END
`;
  const restore = mockPool('sp_test2');
  await db.saveStoredProcedure(sql);
  const calls = restore();
  assert.ok(/CREATE PROCEDURE/i.test(calls[0]));
  assert.ok(calls[0].trim().endsWith('END'));
});
