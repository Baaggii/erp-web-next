import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import * as db from '../../db/index.js';

const defaultsDir = path.join(process.cwd(), 'config', '0', 'defaults');

await test('listTenantDefaultSnapshots returns metadata for stored SQL files', async () => {
  await fs.mkdir(defaultsDir, { recursive: true });
  const primaryPath = path.join(defaultsDir, '20240102_baseline.sql');
  const secondaryPath = path.join(defaultsDir, '20231215_archive.sql');
  const sharedSql = `-- Tenant table defaults export\n-- Version: Baseline\n-- Generated at: 2024-01-02T12:00:00.000Z\n\nSTART TRANSACTION;\n\n-- Table: shared_defaults\nDELETE FROM \`shared_defaults\` WHERE \`company_id\` = 0;\nINSERT INTO \`shared_defaults\` (\`company_id\`, \`id\`, \`label\`) VALUES ('0', 1, 'Welcome');\n\n-- Table: seed_defaults\nDELETE FROM \`seed_defaults\` WHERE \`company_id\` = 0;\nINSERT INTO \`seed_defaults\` (\`company_id\`, \`code\`) VALUES ('0', 'A');\n\nCOMMIT;\n`;
  await fs.writeFile(primaryPath, sharedSql, 'utf8');
  await fs.writeFile(
    secondaryPath,
    sharedSql.replace('Baseline', 'Archive').replace('Welcome', 'Legacy'),
    'utf8',
  );

  try {
    const snapshots = await db.listTenantDefaultSnapshots();
    assert.ok(Array.isArray(snapshots));
    assert.ok(snapshots.length >= 2);
    const baseline = snapshots.find((snap) => snap.fileName === '20240102_baseline.sql');
    assert.ok(baseline, 'baseline snapshot not found');
    assert.equal(baseline.versionName, 'Baseline');
    assert.equal(baseline.tableCount, 2);
    assert.equal(baseline.rowCount, 2);
    assert.ok(Array.isArray(baseline.tables));
    const tableNames = baseline.tables.map((t) => t.tableName);
    assert.ok(tableNames.includes('shared_defaults'));
    assert.ok(tableNames.includes('seed_defaults'));
    assert.ok(typeof baseline.generatedAt === 'string');
  } finally {
    await fs.unlink(primaryPath).catch(() => {});
    await fs.unlink(secondaryPath).catch(() => {});
  }
});
