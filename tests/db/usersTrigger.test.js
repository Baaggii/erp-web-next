import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

async function loadUsersTrigger(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  const sql = await fs.readFile(filePath, 'utf8');
  return parseUsersTrigger(sql, relativePath);
}

function parseUsersTrigger(sqlText, source) {
  const match = /CREATE\s+TRIGGER\s+`?users_bi`?[\s\S]*?END\$\$/i.exec(sqlText);
  if (!match) {
    throw new Error(`users_bi trigger not found in ${source}`);
  }
  const triggerSql = match[0];
  const createdByMatch = /SET\s+NEW\.created_by\s*=\s*(.+?);/i.exec(triggerSql);
  const updatedByMatch = /SET\s+NEW\.updated_by\s*=\s*(.+?);/i.exec(triggerSql);
  return {
    createdByExpr: createdByMatch ? createdByMatch[1].trim() : null,
    createdByValue: parseSqlValue(createdByMatch?.[1]),
    updatedByExpr: updatedByMatch ? updatedByMatch[1].trim() : null,
    updatedByUsesCreatedBy: updatedByMatch ? isExprNewCreatedBy(updatedByMatch[1]) : false,
  };
}

function parseSqlValue(expr) {
  if (!expr) return null;
  const trimmed = expr.trim();
  const stringMatch = trimmed.match(/^'((?:[^']|'')*)'$/);
  if (stringMatch) {
    return stringMatch[1].replace(/''/g, "'");
  }
  return trimmed.replace(/\s+/g, ' ');
}

function isExprNewCreatedBy(expr) {
  if (!expr) return false;
  return expr.replace(/\s+/g, '').toLowerCase() === 'new.created_by';
}

function applyUsersTrigger(row, sentinel) {
  const next = { ...row };
  if (next.created_at === null || next.created_at === undefined) {
    next.created_at = 'NOW()';
  }
  if (next.created_by === null || next.created_by === undefined || next.created_by === '') {
    next.created_by = sentinel;
  }
  if (next.updated_at === null || next.updated_at === undefined) {
    next.updated_at = 'NOW()';
  }
  if (next.updated_by === null || next.updated_by === undefined || next.updated_by === '') {
    next.updated_by = next.created_by;
  }
  return next;
}

await test('users trigger defaults blank audit actors to system sentinel', async () => {
  const schemaTrigger = await loadUsersTrigger('db/schema.sql');
  assert.equal(
    schemaTrigger.createdByValue,
    'system',
    'schema trigger should default created_by to system',
  );
  assert.ok(
    schemaTrigger.updatedByUsesCreatedBy,
    'schema trigger should align updated_by with created_by',
  );

  const originalMigration = await loadUsersTrigger(
    'db/migrations/2025-09-05_users_created_trigger.sql',
  );
  assert.equal(
    originalMigration.createdByValue,
    'system',
    '2025-09-05 migration should default created_by to system',
  );
  assert.ok(
    originalMigration.updatedByUsesCreatedBy,
    '2025-09-05 migration should align updated_by with created_by',
  );

  const followUpMigration = await loadUsersTrigger(
    'db/migrations/2025-09-06_users_trigger_system_default.sql',
  );
  assert.equal(
    followUpMigration.createdByValue,
    'system',
    'follow-up migration should default created_by to system',
  );
  assert.ok(
    followUpMigration.updatedByUsesCreatedBy,
    'follow-up migration should align updated_by with created_by',
  );

  const inserted = applyUsersTrigger(
    { created_at: null, created_by: '', updated_at: null, updated_by: '' },
    schemaTrigger.createdByValue,
  );
  assert.equal(inserted.created_by, 'system');
  assert.equal(inserted.updated_by, 'system');

  const preserved = applyUsersTrigger(
    { created_at: null, created_by: 'auditor', updated_at: null, updated_by: '' },
    schemaTrigger.createdByValue,
  );
  assert.equal(preserved.created_by, 'auditor');
  assert.equal(preserved.updated_by, 'auditor');
});
