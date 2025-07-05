import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSqlStatements } from '../../api-server/services/generatedSql.js';

const triggerSQL = `CREATE TRIGGER t_bi BEFORE INSERT ON t FOR EACH ROW\nBEGIN\n  SET NEW.num = 1;\nEND;\nINSERT INTO t VALUES (1);`;

test('splitSqlStatements keeps CREATE TRIGGER intact', () => {
  const stmts = splitSqlStatements(triggerSQL);
  assert.equal(stmts.length, 2);
  assert.ok(stmts[0].startsWith('CREATE TRIGGER'));
});
