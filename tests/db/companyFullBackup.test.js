import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import {
  createCompanyFullBackup,
  restoreCompanyFullBackup,
  pool,
} from '../../db/index.js';

function splitTopLevel(str, delimiter = ',') {
  const segments = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < str.length; i += 1) {
    const char = str[i];
    if (char === '\\') {
      current += char;
      if (i + 1 < str.length) {
        current += str[i + 1];
        i += 1;
      }
      continue;
    }
    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      current += char;
      continue;
    }
    if (!inSingle && char === '"') {
      inDouble = !inDouble;
      current += char;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth = Math.max(depth - 1, 0);
      }
      if (char === delimiter && depth === 0) {
        segments.push(current.trim());
        current = '';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) {
    segments.push(current.trim());
  }
  return segments;
}

function parseSqlValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed || /^NULL$/i.test(trimmed)) return null;
  if (/^'.*'$/.test(trimmed) || /^".*"$/.test(trimmed)) {
    const inner = trimmed.slice(1, -1);
    return inner.replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) return numeric;
  return trimmed;
}

test('createCompanyFullBackup and restoreCompanyFullBackup round trip', async (t) => {
  const sourceId = 5;
  const targetId = 8;
  const configRoot = path.join(process.cwd(), 'config');
  await fs.rm(path.join(configRoot, String(sourceId)), { recursive: true, force: true });
  await fs.rm(path.join(configRoot, String(targetId)), { recursive: true, force: true });

  const dataset = {
    orders: [
      { company_id: sourceId, id: 1, amount: 45, note: 'Alpha' },
      { company_id: targetId, id: 2, amount: 15, note: 'Stale target row' },
    ],
    invoices: [
      { company_id: sourceId, invoice_id: 3, total: 120.5, status: 'open' },
    ],
  };

  const columnMap = {
    orders: ['company_id', 'id', 'amount', 'note'],
    invoices: ['invoice_id', 'company_id', 'total', 'status'],
  };

  const originalQuery = pool.query;
  const originalGetConnection = pool.getConnection;
  t.after(async () => {
    pool.query = originalQuery;
    pool.getConnection = originalGetConnection;
    await fs.rm(path.join(configRoot, String(sourceId)), { recursive: true, force: true });
    await fs.rm(path.join(configRoot, String(targetId)), { recursive: true, force: true });
  });

  pool.query = async (sql, params) => {
    if (
      typeof sql === 'string' &&
      sql.includes('FROM information_schema.COLUMNS') &&
      sql.includes("COLUMN_NAME = 'company_id'")
    ) {
      return [[
        { tableName: 'orders' },
        { tableName: 'invoices' },
      ]];
    }
    if (typeof sql === 'string' && sql.startsWith('SELECT COLUMN_NAME')) {
      const tableName = params?.[0];
      const cols = columnMap[tableName] || [];
      return [cols.map((name) => ({ COLUMN_NAME: name }))];
    }
    if (typeof sql === 'string' && sql.startsWith('SELECT * FROM ??')) {
      const [tableName, companyId] = params;
      const rows = (dataset[tableName] || []).filter(
        (row) => Number(row.company_id) === Number(companyId),
      );
      return [rows.map((row) => ({ ...row }))];
    }
    if (
      typeof sql === 'string' &&
      sql.includes('FROM information_schema.COLUMNS')
    ) {
      // listTableColumnsDetailed or similar isn't used here, return empty
      return [[]];
    }
    return [[]];
  };

  const executed = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (statement) => {
      const trimmed = statement.trim().replace(/;$/, '');
      executed.push(trimmed);
      if (/^DELETE\s+FROM/i.test(trimmed)) {
        const match = trimmed.match(
          /^DELETE\s+FROM\s+`?([A-Za-z0-9_]+)`?\s+WHERE\s+`?company_id`?\s*=\s*(\d+)$/i,
        );
        if (!match) return [{}];
        const [, tableName, idStr] = match;
        const companyId = Number(idStr);
        const before = (dataset[tableName] || []).length;
        dataset[tableName] = (dataset[tableName] || []).filter(
          (row) => Number(row.company_id) !== companyId,
        );
        const after = dataset[tableName].length;
        return [{ affectedRows: before - after }];
      }
      if (/^INSERT\s+INTO/i.test(trimmed)) {
        const match = trimmed.match(
          /^INSERT\s+INTO\s+`?([A-Za-z0-9_]+)`?\s*\(([^)]+)\)\s*VALUES\s*\((.*)\)$/i,
        );
        if (!match) return [{}];
        const [, tableName, columnSegment, valueSegment] = match;
        const columns = splitTopLevel(columnSegment).map((col) =>
          col.replace(/`/g, '').trim(),
        );
        const values = splitTopLevel(valueSegment).map(parseSqlValue);
        const record = {};
        columns.forEach((col, idx) => {
          record[col] = values[idx];
        });
        if (!dataset[tableName]) dataset[tableName] = [];
        dataset[tableName].push(record);
        return [{ affectedRows: 1 }];
      }
      return [{}];
    },
  });

  const sourceOrdersSnapshot = dataset.orders
    .filter((row) => row.company_id === sourceId)
    .map((row) => ({ ...row }));
  const sourceInvoicesSnapshot = dataset.invoices
    .filter((row) => row.company_id === sourceId)
    .map((row) => ({ ...row }));

  const entry = await createCompanyFullBackup(sourceId, {
    backupName: 'all data',
    requestedBy: 77,
    companyName: 'SourceCo',
  });

  assert.equal(entry.type, 'full');
  assert.equal(entry.companyId, sourceId);
  assert.equal(entry.tableCount, 2);
  assert.ok(entry.fileName.endsWith('.sql'));

  const backupFilePath = path.join(
    configRoot,
    String(sourceId),
    'backups',
    'full-data',
    entry.fileName,
  );
  const backupSql = await fs.readFile(backupFilePath, 'utf8');
  assert.ok(
    backupSql.includes(
      `DELETE FROM \`orders\` WHERE \`company_id\` = ${sourceId};`,
    ),
    'backup should delete existing tenant rows',
  );
  assert.match(backupSql, /INSERT INTO `orders`/);

  const catalogPath = path.join(
    configRoot,
    String(sourceId),
    'backups',
    'full-data',
    'index.json',
  );
  const catalogRaw = await fs.readFile(catalogPath, 'utf8');
  const catalog = JSON.parse(catalogRaw);
  assert.equal(catalog[0].type, 'full');

  const summary = await restoreCompanyFullBackup(
    sourceId,
    entry.fileName,
    targetId,
    'EMP-5',
  );

  assert.equal(summary.type, 'full');
  assert.equal(summary.sourceCompanyId, sourceId);
  assert.equal(summary.targetCompanyId, targetId);
  assert.ok(executed.some((stmt) => stmt.includes('DELETE FROM `orders`')));

  const targetOrders = dataset.orders
    .filter((row) => row.company_id === targetId)
    .map((row) => ({ ...row, company_id: sourceId }))
    .sort((a, b) => a.id - b.id);
  const normalizedSourceOrders = sourceOrdersSnapshot
    .map((row) => ({ ...row }))
    .sort((a, b) => a.id - b.id);
  assert.deepEqual(targetOrders, normalizedSourceOrders);

  const targetInvoices = dataset.invoices
    .filter((row) => row.company_id === targetId)
    .map((row) => ({ ...row, company_id: sourceId }))
    .sort((a, b) => a.invoice_id - b.invoice_id);
  const normalizedSourceInvoices = sourceInvoicesSnapshot
    .map((row) => ({ ...row }))
    .sort((a, b) => a.invoice_id - b.invoice_id);
  assert.deepEqual(targetInvoices, normalizedSourceInvoices);

  const staleRows = dataset.orders.filter(
    (row) => row.company_id === targetId && row.note === 'Stale target row',
  );
  assert.equal(staleRows.length, 0);
});
