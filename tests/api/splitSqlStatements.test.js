import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSqlStatements } from '../../api-server/services/generatedSql.js';

const triggerSQL = `CREATE TRIGGER t_bi BEFORE INSERT ON t FOR EACH ROW\nBEGIN\n  SET NEW.num = 1;\nEND;\nINSERT INTO t VALUES (1);`;

test('splitSqlStatements keeps CREATE TRIGGER intact', () => {
  const stmts = splitSqlStatements(triggerSQL);
  assert.equal(stmts.length, 2);
  assert.ok(stmts[0].startsWith('CREATE TRIGGER'));
});

test('splitSqlStatements handles trigger without ending semicolon', () => {
  const noSemi = triggerSQL.replace('END;', 'END');
  const stmts = splitSqlStatements(noSemi);
  assert.equal(stmts.length, 2);
  assert.ok(stmts[0].startsWith('CREATE TRIGGER'));
});

test('splitSqlStatements handles nested BEGIN blocks', () => {
  const nested = `CREATE TRIGGER t_bi BEFORE INSERT ON t FOR EACH ROW\nBEGIN\n  IF NEW.x IS NULL THEN\n    BEGIN\n      SET NEW.x = 1;\n    END;\n  END IF;\nEND;\nINSERT INTO t VALUES (1);`;
  const stmts = splitSqlStatements(nested);
  assert.equal(stmts.length, 2);
  assert.ok(stmts[0].includes('SET NEW.x = 1;'));
});
