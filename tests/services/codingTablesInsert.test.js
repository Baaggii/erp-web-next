import test from 'node:test';
import assert from 'node:assert/strict';
import { insertCodingTableRows } from '../../api-server/services/codingTablesInsert.js';
import { pool } from '../../db/index.js';

test('insertCodingTableRows inserts rows without staging using inline identifiers', async (t) => {
  const executes = [];
  let released = false;
  const connection = {
    async execute(sql, params) {
      executes.push({ sql, params });
      return [{}];
    },
    async query() {
      throw new Error('query should not be called when staging is disabled');
    },
    release() {
      released = true;
    },
  };
  const originalGetConnection = pool.getConnection;
  pool.getConnection = async () => connection;

  let result;
  try {
    result = await insertCodingTableRows({
      table: 'codes',
      mainRows: [{ code: 'A', label: 'Alpha' }],
      otherRows: [{ code: 'B', label: 'Beta' }],
      useStaging: false,
    });
  } finally {
    pool.getConnection = originalGetConnection;
  }

  assert.equal(executes.length, 2);
  assert.equal(
    executes[0].sql,
    'INSERT INTO `codes` (`code`, `label`) VALUES (?, ?)',
  );
  assert.deepEqual(executes[0].params, ['A', 'Alpha']);
  assert.equal(
    executes[1].sql,
    'INSERT INTO `codes_other` (`code`, `label`) VALUES (?, ?)',
  );
  assert.deepEqual(executes[1].params, ['B', 'Beta']);
  assert.equal(result.insertedMain, 1);
  assert.equal(result.insertedOther, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.stagingUsed, false);
  assert.ok(released);
});

test('insertCodingTableRows uses staging path without identifier placeholders', async (t) => {
  const executes = [];
  const queries = [];
  let stageName;
  let released = false;
  const connection = {
    async execute(sql, params) {
      executes.push({ sql, params });
      return [{}];
    },
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.startsWith('CREATE TEMPORARY TABLE')) {
        [stageName] = params;
      }
      return [{}];
    },
    release() {
      released = true;
    },
  };
  const originalGetConnection = pool.getConnection;
  pool.getConnection = async () => connection;

  const mainRows = [
    { code: 'A', label: 'Alpha' },
    { code: 'B', label: 'Beta' },
  ];

  let result;
  try {
    result = await insertCodingTableRows({
      table: 'codes',
      mainRows,
      otherRows: [{ code: 'C', label: 'Gamma' }],
      useStaging: true,
    });
  } finally {
    pool.getConnection = originalGetConnection;
  }

  assert.ok(stageName, 'staging table should be created');
  assert.match(stageName, /^[A-Za-z0-9_]+$/);
  const stageSql = `INSERT INTO \`${stageName}\` (\`code\`, \`label\`) VALUES (?, ?)`;
  const stageCalls = executes.filter((call) => call.sql === stageSql);
  assert.equal(stageCalls.length, mainRows.length);
  stageCalls.forEach((call, index) => {
    assert.deepEqual(call.params, [mainRows[index].code, mainRows[index].label]);
  });
  const otherCall = executes.find((call) => call.sql.startsWith('INSERT INTO `codes_other`'));
  assert.ok(otherCall, 'other rows should insert directly');
  assert.equal(
    otherCall.sql,
    'INSERT INTO `codes_other` (`code`, `label`) VALUES (?, ?)',
  );
  assert.deepEqual(otherCall.params, ['C', 'Gamma']);
  assert.equal(result.insertedMain, mainRows.length);
  assert.equal(result.insertedOther, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.stagingUsed, true);
  assert.ok(released);
  assert.ok(
    queries.some((entry) => entry.sql.startsWith('CREATE TEMPORARY TABLE')),
    'staging should create a temp table',
  );
  assert.ok(
    queries.some((entry) => entry.sql.startsWith('DROP TEMPORARY TABLE IF EXISTS')),
    'staging should drop the temp table when finished',
  );
});
