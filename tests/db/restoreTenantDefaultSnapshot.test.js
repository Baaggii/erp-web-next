import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import * as db from '../../db/index.js';

const defaultsDir = path.join(process.cwd(), 'config', '0', 'defaults');

await test('restoreTenantDefaultSnapshot runs statements for allowed tables', async () => {
  await fs.mkdir(defaultsDir, { recursive: true });
  const fileName = '20240105_restore.sql';
  const filePath = path.join(defaultsDir, fileName);
  const sql = `-- Tenant table defaults export\nSTART TRANSACTION;\n-- Table: shared_defaults\nDELETE FROM \`shared_defaults\` WHERE \`company_id\` = 0;\nINSERT INTO \`shared_defaults\` (\`company_id\`, \`id\`, \`label\`) VALUES ('0', 1, 'Hello');\nCOMMIT;\n`;
  await fs.writeFile(filePath, sql, 'utf8');

  const originalQuery = db.pool.query;
  const originalGetConnection = db.pool.getConnection;
  const calls = [];
  db.pool.query = async (statement) => {
    calls.push({ type: 'pool', sql: statement });
    if (/SELECT table_name/.test(statement)) {
      return [[{ table_name: 'shared_defaults' }]];
    }
    return [[]];
  };
  const conn = {
    released: false,
    async beginTransaction() {
      calls.push({ type: 'begin' });
    },
    async commit() {
      calls.push({ type: 'commit' });
    },
    async rollback() {
      calls.push({ type: 'rollback' });
    },
    release() {
      this.released = true;
    },
    async query(statement) {
      calls.push({ type: 'exec', sql: statement });
      if (/DELETE/i.test(statement)) {
        return [{ affectedRows: 0 }];
      }
      if (/INSERT/i.test(statement)) {
        return [{ affectedRows: 1 }];
      }
      return [{}];
    },
  };
  db.pool.getConnection = async () => conn;

  try {
    const summary = await db.restoreTenantDefaultSnapshot(fileName, 42);
    assert.equal(summary.fileName, fileName);
    assert.equal(summary.totalInserted, 1);
    assert.equal(summary.totalDeleted, 0);
    assert.ok(Array.isArray(summary.tables));
    const tableSummary = summary.tables.find((info) => info.tableName === 'shared_defaults');
    assert.deepEqual(tableSummary, {
      tableName: 'shared_defaults',
      deletedRows: 0,
      insertedRows: 1,
    });
    assert.ok(calls.some((entry) => entry.type === 'begin'));
    assert.ok(calls.some((entry) => entry.type === 'commit'));
    assert.equal(conn.released, true);
  } finally {
    db.pool.query = originalQuery;
    db.pool.getConnection = originalGetConnection;
    await fs.unlink(filePath).catch(() => {});
  }
});

await test('restoreTenantDefaultSnapshot rejects disallowed tables', async () => {
  await fs.mkdir(defaultsDir, { recursive: true });
  const fileName = '20240106_invalid.sql';
  const filePath = path.join(defaultsDir, fileName);
  const sql = `-- Tenant table defaults export\nSTART TRANSACTION;\n-- Table: forbidden_defaults\nDELETE FROM \`forbidden_defaults\` WHERE \`company_id\` = 0;\nINSERT INTO \`forbidden_defaults\` (\`company_id\`, \`id\`) VALUES ('0', 1);\nCOMMIT;\n`;
  await fs.writeFile(filePath, sql, 'utf8');

  const originalQuery = db.pool.query;
  db.pool.query = async (statement) => {
    if (/SELECT table_name/.test(statement)) {
      return [[{ table_name: 'shared_defaults' }]];
    }
    return [[]];
  };

  try {
    await assert.rejects(
      () => db.restoreTenantDefaultSnapshot(fileName, 5),
      /not registered as shared or seed-enabled/i,
    );
  } finally {
    db.pool.query = originalQuery;
    await fs.unlink(filePath).catch(() => {});
  }
});
