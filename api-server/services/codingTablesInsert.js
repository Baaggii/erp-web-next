import { pool } from '../../db/index.js';

const IDENTIFIER_RE = /^[A-Za-z0-9_]+$/;

function assertSafeIdentifier(name, label = 'identifier') {
  if (typeof name !== 'string' || !IDENTIFIER_RE.test(name)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
  return name;
}

function collectColumns(rows) {
  const set = new Set();
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      assertSafeIdentifier(key, 'column');
      set.add(key);
    }
  }
  return Array.from(set);
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const normalized = {};
  Object.keys(row).forEach((key) => {
    const safeKey = assertSafeIdentifier(key, 'column');
    const value = row[key];
    normalized[safeKey] = value === undefined ? null : value;
  });
  return normalized;
}

function buildInsertCommand(tableName, row) {
  const safeTable = assertSafeIdentifier(tableName, 'table');
  if (!row || typeof row !== 'object') {
    return null;
  }
  const columns = Object.keys(row);
  if (columns.length === 0) {
    return null;
  }
  const safeColumns = columns.map((col) => assertSafeIdentifier(col, 'column'));
  const columnList = safeColumns.map((col) => `\`${col}\``).join(', ');
  const valueTokens = safeColumns.map(() => '?').join(', ');
  const values = safeColumns.map((col) => row[col]);
  return {
    sql: `INSERT INTO \`${safeTable}\` (${columnList}) VALUES (${valueTokens})`,
    params: values,
  };
}

async function insertRowsSequentially(
  connection,
  tableName,
  rows,
  { useStaging = false, signal } = {},
) {
  const summary = {
    inserted: 0,
    errors: [],
    aborted: false,
    stagingUsed: false,
  };
  const safeTable = assertSafeIdentifier(tableName, 'table');
  const rowArray = Array.isArray(rows) ? rows : [];
  if (rowArray.length === 0) {
    return summary;
  }

  const normalizedRows = rowArray.map((row) => normalizeRow(row));
  const hasInsertable = normalizedRows.some(
    (row) => row && Object.keys(row).length > 0,
  );
  if (!hasInsertable) {
    summary.errors.push({
      index: -1,
      table: safeTable,
      message: 'No rows contained insertable columns.',
    });
    return summary;
  }

  let stageName = null;
  let stageColumns = [];

  if (useStaging) {
    try {
      stageName = `${safeTable}_stage_${Date.now()
        .toString(36)
        .replace(/[^A-Za-z0-9]/g, '')}${Math.random()
        .toString(36)
        .slice(2, 8)
        .replace(/[^A-Za-z0-9]/g, '')}`;
      stageName = stageName.slice(0, 60) || `${safeTable}_stage_tmp`;
      stageName = assertSafeIdentifier(stageName, 'staging table');
      await connection.query('CREATE TEMPORARY TABLE ?? LIKE ??', [
        stageName,
        safeTable,
      ]);
      stageColumns = collectColumns(normalizedRows);
      if (stageColumns.length === 0) {
        await connection.query('DROP TEMPORARY TABLE IF EXISTS ??', [stageName]);
        stageName = null;
        stageColumns = [];
      }
    } catch (err) {
      if (stageName) {
        try {
          await connection.query('DROP TEMPORARY TABLE IF EXISTS ??', [stageName]);
        } catch (dropErr) {
          summary.errors.push({
            index: -1,
            table: stageName,
            message: `Failed to drop staging table: ${dropErr.message}`,
          });
        }
      }
      summary.errors.push({
        index: -1,
        table: safeTable,
        message: `Failed to prepare staging table: ${err.message}`,
      });
      stageName = null;
      stageColumns = [];
    }
  }

  const columnPlaceholder = stageColumns.map(() => '??').join(', ');
  const stageInsertSql =
    stageName && stageColumns.length > 0
      ? `INSERT INTO ?? (${columnPlaceholder}) SELECT ${columnPlaceholder} FROM ??`
      : null;

  let stagedCopyPerformed = false;

  for (let i = 0; i < normalizedRows.length; i += 1) {
    if (signal?.aborted) {
      summary.aborted = true;
      break;
    }
    const normalizedRow = normalizedRows[i];
    if (!normalizedRow || Object.keys(normalizedRow).length === 0) {
      summary.errors.push({
        index: i,
        table: safeTable,
        message: 'Row had no insertable columns.',
      });
      continue;
    }
    try {
      if (stageName && stageInsertSql) {
        await connection.query('DELETE FROM ??', [stageName]);
        const stageInsert = buildInsertCommand(stageName, normalizedRow);
        if (!stageInsert) {
          throw new Error('Row had no insertable columns.');
        }
        await connection.execute(stageInsert.sql, stageInsert.params);
        const params = [
          safeTable,
          ...stageColumns,
          ...stageColumns,
          stageName,
        ];
        await connection.query(stageInsertSql, params);
        stagedCopyPerformed = true;
        await connection.query('DELETE FROM ??', [stageName]);
      } else {
        const insertCommand = buildInsertCommand(safeTable, normalizedRow);
        if (!insertCommand) {
          throw new Error('Row had no insertable columns.');
        }
        await connection.execute(insertCommand.sql, insertCommand.params);
      }
      summary.inserted += 1;
    } catch (err) {
      summary.errors.push({
        index: i,
        table: safeTable,
        message: err.message,
      });
    }
  }

  if (stageName) {
    try {
      await connection.query('DROP TEMPORARY TABLE IF EXISTS ??', [stageName]);
    } catch (err) {
      summary.errors.push({
        index: -1,
        table: stageName,
        message: `Failed to drop staging table: ${err.message}`,
      });
    }
  }

  summary.stagingUsed = stagedCopyPerformed;

  return summary;
}

export async function insertCodingTableRows({
  table,
  mainRows = [],
  otherRows = [],
  useStaging = false,
  signal,
} = {}) {
  const safeTable = assertSafeIdentifier(table, 'table');
  const connection = await pool.getConnection();
  try {
    const mainSummary = await insertRowsSequentially(connection, safeTable, mainRows, {
      useStaging,
      signal,
    });
    const otherSummary = await insertRowsSequentially(
      connection,
      `${safeTable}_other`,
      otherRows,
      { useStaging: false, signal },
    );
    return {
      table: safeTable,
      insertedMain: mainSummary.inserted,
      insertedOther: otherSummary.inserted,
      errors: [...mainSummary.errors, ...otherSummary.errors],
      aborted: mainSummary.aborted || otherSummary.aborted,
      stagingUsed: mainSummary.stagingUsed,
    };
  } finally {
    connection.release();
  }
}
