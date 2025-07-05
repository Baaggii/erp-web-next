import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSqlStatements } from '../../api-server/services/generatedSql.js';

test('splitSqlStatements handles CRLF and progress comments', () => {
  const sql = '-- Progress: Group 1 of 2\r\nINSERT INTO t VALUES (1);\r\n-- Progress: Group 2 of 2\r\nINSERT INTO t VALUES (2);\r\n';
  const stmts = splitSqlStatements(sql);
  assert.equal(stmts.length, 2);
  assert.equal(stmts[0], 'INSERT INTO t VALUES (1);');
  assert.equal(stmts[1], 'INSERT INTO t VALUES (2);');
});
