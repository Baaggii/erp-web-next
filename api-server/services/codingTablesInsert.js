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
      stageColumns = collectColumns(rowArray);
      summary.stagingUsed = true;
    } catch (err) {
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

  for (let i = 0; i < rowArray.length; i += 1) {
    if (signal?.aborted) {
      summary.aborted = true;
      break;
    }
    const row = rowArray[i];
    if (!row || typeof row !== 'object') continue;
    try {
      if (stageName && stageInsertSql) {
        await connection.query('TRUNCATE TABLE ??', [stageName]);
        await connection.query('INSERT INTO ?? SET ?', [stageName, row]);
        const params = [
          safeTable,
          ...stageColumns,
          ...stageColumns,
          stageName,
        ];
        await connection.query(stageInsertSql, params);
        await connection.query('TRUNCATE TABLE ??', [stageName]);
      } else {
        await connection.query('INSERT INTO ?? SET ?', [safeTable, row]);
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
