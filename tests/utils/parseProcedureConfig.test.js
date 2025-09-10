import test from 'node:test';
import assert from 'node:assert/strict';
import parseProcedureConfig from '../../utils/parseProcedureConfig.js';

test('parseProcedureConfig extracts config block', () => {
  const sql = 'SELECT 1; /*REPORT_BUILDER_CONFIG {"foo":"bar"} */';
  assert.deepEqual(parseProcedureConfig(sql), {
    config: { foo: 'bar' },
    converted: false,
  });
});

test('parseProcedureConfig throws on malformed JSON', () => {
  const sql = 'SELECT 1; /*REPORT_BUILDER_CONFIG {foo} */';
  assert.throws(() => parseProcedureConfig(sql), /Invalid REPORT_BUILDER_CONFIG JSON/);
});

test('parseProcedureConfig converts SQL when block missing', () => {
  const sql = `CREATE PROCEDURE t() BEGIN SELECT p.id, p.name FROM prod p WHERE p.id = 1 GROUP BY p.id, p.name; END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.fromTable, 'prod');
  assert.equal(result.config.fields.length, 2);
  assert.equal(result.config.groups.length, 2);
});

test('parseProcedureConfig handles line comments in SHOW CREATE PROCEDURE output', () => {
  const sql = `CREATE DEFINER=\`root\`@\`localhost\` PROCEDURE \`t\`()
BEGIN
  SELECT p.id, p.name FROM prod p -- list products
  WHERE p.id = 1 # filter
  GROUP BY p.id, p.name;
END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.fromTable, 'prod');
  assert.equal(result.config.fields.length, 2);
  assert.equal(result.config.groups.length, 2);
});

test('parseProcedureConfig handles inner END and line comments', () => {
  const sql = `CREATE PROCEDURE t()
BEGIN
  WHILE i < 10 DO
    -- loop body
    SET i = i + 1;
  END WHILE;
  SELECT p.id, p.name FROM prod p; -- final select
END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.fromTable, 'prod');
  assert.equal(result.config.fields.length, 2);
});

test('parseProcedureConfig tolerates ORDER BY and positional GROUP BY', () => {
  const sql = `CREATE PROCEDURE t() BEGIN SELECT p.id, p.name FROM prod p GROUP BY 1 ORDER BY p.name; END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.fromTable, 'prod');
  assert.equal(result.config.fields.length, 2);
});

test('parseProcedureConfig converts SQL with ORDER BY and LIMIT', () => {
  const sql = `CREATE PROCEDURE t() BEGIN SELECT p.id, p.name FROM prod p ORDER BY p.name LIMIT 5; END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.fromTable, 'prod');
  assert.equal(result.config.fields.length, 2);
});

test('parseProcedureConfig converts SQL with GROUP BY, ORDER BY, and LIMIT', () => {
  const sql =
    `CREATE PROCEDURE t() BEGIN SELECT p.id, p.name FROM prod p GROUP BY p.id, p.name ORDER BY p.name LIMIT 5; END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.fromTable, 'prod');
  assert.equal(result.config.fields.length, 2);
  assert.equal(result.config.groups.length, 2);
});

test('parseProcedureConfig handles subquery FROM alias', () => {
  const sql =
    `CREATE PROCEDURE t() BEGIN SELECT s.id FROM (SELECT id FROM prod) s; END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.fromTable, 's');
  assert.equal(result.config.fields[0].table, 's');
});

test('parseProcedureConfig parses JOIN USING clause', () => {
  const sql =
    `CREATE PROCEDURE t() BEGIN SELECT p.id, c.name FROM prod p JOIN cat c USING (id); END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.joins.length, 1);
  assert.equal(result.config.joins[0].conditions[0].fromField, 'id');
  assert.equal(result.config.joins[0].conditions[0].toField, 'id');
  assert.equal(result.config.joins[0].targetTable, 'prod');
});

test('parseProcedureConfig converts SQL with subquery and JOIN ON', () => {
  const sql = `CREATE PROCEDURE t()` +
    ` BEGIN SELECT s.id, c.name FROM (SELECT id, category_id FROM prod) s JOIN cat c ON c.id = s.category_id GROUP BY s.id, c.name; END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.fromTable, 's');
  assert.equal(result.config.joins.length, 1);
  assert.equal(result.config.joins[0].targetTable, 's');
  assert.equal(result.config.fields.length, 2);
});

test('parseProcedureConfig converts SQL with subquery and JOIN USING', () => {
  const sql = `CREATE PROCEDURE t()` +
    ` BEGIN SELECT s.id, c.name FROM (SELECT id FROM prod) s JOIN cat c USING (id); END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.fromTable, 's');
  assert.equal(result.config.joins.length, 1);
  assert.equal(result.config.joins[0].conditions[0].fromField, 'id');
  assert.equal(result.config.joins[0].conditions[0].toField, 'id');
  assert.equal(result.config.joins[0].targetTable, 's');
});

test('parseProcedureConfig handles JOIN subquery alias', () => {
  const sql =
    `CREATE PROCEDURE t() BEGIN SELECT p.id FROM prod p JOIN (SELECT id FROM cat) c ON p.id = c.id; END`;
  const result = parseProcedureConfig(sql);
  assert.equal(result.converted, true);
  assert.equal(result.config.joins.length, 1);
  assert.equal(result.config.joins[0].table, 'c');
  assert.equal(result.config.joins[0].targetTable, 'prod');
  assert.equal(result.config.joins[0].conditions[0].fromField, 'id');
});

test('parseProcedureConfig throws on HAVING clause', () => {
  const sql =
    `CREATE PROCEDURE t() BEGIN SELECT p.id FROM prod p GROUP BY p.id HAVING COUNT(*) > 1; END`;
  assert.throws(() => parseProcedureConfig(sql), /Unsupported HAVING clause/);
});
