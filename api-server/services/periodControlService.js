import { pool, getEmploymentSession } from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';
import {
  deleteSnapshotArtifact,
  loadSnapshotArtifactPage,
  storeSnapshotArtifact,
} from './reportSnapshotArtifacts.js';

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function fiscalDateRange(year) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  return { start, end };
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

export async function ensurePeriodControlTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS fin_period_control (
      company_id INT NOT NULL,
      fiscal_year INT NOT NULL,
      period_from DATE NOT NULL,
      period_to DATE NOT NULL,
      is_closed TINYINT DEFAULT 0,
      closed_at DATETIME,
      closed_by VARCHAR(50),
      PRIMARY KEY (company_id, fiscal_year)
    )
  `);

  const alterStatements = [
    'ALTER TABLE fin_period_control ADD INDEX idx_fin_period_control_company_closed (company_id, is_closed)',
    'ALTER TABLE fin_period_control ADD INDEX idx_fin_period_control_range (company_id, period_from, period_to)',
    `ALTER TABLE fin_period_control
      ADD CONSTRAINT fk_fin_period_control_company
      FOREIGN KEY (company_id) REFERENCES companies(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE`,
  ];

  for (const statement of alterStatements) {
    try {
      await conn.query(statement);
    } catch (error) {
      if (!/duplicate|exists|errno\s*121|already/i.test(String(error?.message || ''))) {
        throw error;
      }
    }
  }
}


export async function ensurePeriodReportSnapshotTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS fin_period_report_snapshot (
      snapshot_id BIGINT NOT NULL AUTO_INCREMENT,
      company_id INT NOT NULL,
      fiscal_year INT NOT NULL,
      procedure_name VARCHAR(191) NOT NULL,
      artifact_id VARCHAR(191) NOT NULL,
      row_count INT NOT NULL DEFAULT 0,
      created_by VARCHAR(100),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (snapshot_id),
      INDEX idx_fin_period_report_snapshot_lookup (company_id, fiscal_year, created_at)
    )
  `);
}

export async function requirePeriodClosePermission(req) {
  const session =
    req.session ||
    (await getEmploymentSession(req.user.empid, req.user.companyId)) || {
      user_level: req.user.userLevel,
      company_id: req.user.companyId,
    };
  const allowed =
    (await hasAction(session, 'period.close')) ||
    (await hasAction(session, 'finance_period_close')) ||
    (await hasAction(session, 'system_settings'));
  return { allowed, session };
}

export async function getOrCreateFiscalPeriod(conn, companyId, fiscalYear) {
  await ensurePeriodControlTable(conn);
  const [rows] = await conn.query(
    `SELECT company_id, fiscal_year, period_from, period_to, is_closed, closed_at, closed_by
       FROM fin_period_control
      WHERE company_id = ? AND fiscal_year = ?`,
    [companyId, fiscalYear],
  );

  if (rows.length) return rows[0];

  const { start, end } = fiscalDateRange(fiscalYear);
  await conn.query(
    `INSERT INTO fin_period_control (company_id, fiscal_year, period_from, period_to, is_closed)
     VALUES (?, ?, ?, ?, 0)`,
    [companyId, fiscalYear, formatDateOnly(start), formatDateOnly(end)],
  );

  return {
    company_id: companyId,
    fiscal_year: fiscalYear,
    period_from: formatDateOnly(start),
    period_to: formatDateOnly(end),
    is_closed: 0,
    closed_at: null,
    closed_by: null,
  };
}

function deriveFiscalYear(period) {
  const fromDate = normalizeDate(period?.period_from);
  return fromDate ? fromDate.getUTCFullYear() : Number(period?.fiscal_year);
}

function computeLineAmount(row) {
  const drCr = String(row.dr_cr || '').toUpperCase();
  const amount = Number(row.amount || 0);
  if (!amount) return 0;
  if (drCr === 'D' || drCr === 'DR' || drCr === 'DEBIT') return amount;
  return -amount;
}

async function getProcedureInParameterNames(conn, procedureName) {
  const [rows] = await conn.query(
    `SELECT PARAMETER_NAME AS name
       FROM information_schema.parameters
      WHERE SPECIFIC_SCHEMA = DATABASE()
        AND SPECIFIC_NAME = ?
        AND ROUTINE_TYPE = 'PROCEDURE'
        AND PARAMETER_MODE IN ('IN', 'INOUT')
      ORDER BY ORDINAL_POSITION`,
    [procedureName],
  );
  return Array.isArray(rows)
    ? rows.map((row) => String(row?.name || '').trim()).filter(Boolean)
    : [];
}

function resolveProcedureParameterValue(parameterName, { companyId, fiscalYear, fromDate, toDate }) {
  const key = String(parameterName || '').toLowerCase().replace(/^@+/, '');
  const from = formatDateOnly(fromDate);
  const to = formatDateOnly(toDate);

  if ([
    'company_id',
    'p_company_id',
    'comp_id',
    'p_comp_id',
    'companyid',
    'pcompanyid',
  ].includes(key)) return companyId;

  if ([
    'fiscal_year',
    'p_fiscal_year',
    'year',
    'p_year',
    'fyear',
    'p_fyear',
  ].includes(key)) return fiscalYear;

  if ([
    'date_from',
    'p_date_from',
    'period_from',
    'p_period_from',
    'from_date',
    'p_from_date',
  ].includes(key)) return from;

  if ([
    'date_to',
    'p_date_to',
    'period_to',
    'p_period_to',
    'to_date',
    'p_to_date',
  ].includes(key)) return to;

  return null;
}

async function runReportProcedure(conn, procedureName, { companyId, fiscalYear, fromDate, toDate }) {
  const resolveArgumentSets = async () => {
    const parameterNames = await getProcedureInParameterNames(conn, procedureName);
    if (parameterNames.length > 0) {
      return [
        parameterNames.map((name) =>
          resolveProcedureParameterValue(name, { companyId, fiscalYear, fromDate, toDate }),
        ),
      ];
    }
    return [
      [companyId, fiscalYear, formatDateOnly(fromDate), formatDateOnly(toDate)],
      [companyId, formatDateOnly(fromDate), formatDateOnly(toDate), fiscalYear],
      [companyId, fiscalYear],
    ];
  };

  const buildProcedureResult = (rows) => {
    const resultRows = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];
    return {
      rows: resultRows,
      rowCount: resultRows.length,
    };
  };

  const argumentSets = await resolveArgumentSets();
  let lastError = null;
  for (const args of argumentSets) {
    try {
      const dynamicSql = `CALL \`${procedureName}\`(${args.map(() => '?').join(', ')})`;
      const [rows] = await conn.query(dynamicSql, args);
      return buildProcedureResult(rows);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || '');
      if (/Incorrect number of arguments|Incorrect integer value|Incorrect date value/i.test(message)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(`Unable to execute procedure: ${procedureName}`);
}

async function runReportProcedureWithWorkflow(conn, procedureName, context) {
  const parameterNames = await getProcedureInParameterNames(conn, procedureName);
  const argumentSets = parameterNames.length > 0
    ? [parameterNames.map((name) => resolveProcedureParameterValue(name, context))]
    : [
      [context.companyId, context.fiscalYear, formatDateOnly(context.fromDate), formatDateOnly(context.toDate)],
      [context.companyId, formatDateOnly(context.fromDate), formatDateOnly(context.toDate), context.fiscalYear],
      [context.companyId, context.fiscalYear],
    ];

  const defaultReportCapabilities = {
    showTotalRowCount: true,
    supportsApproval: true,
    supportsSnapshot: true,
    supportsBulkUpdate: false,
  };

  const normalizeReportCapabilities = (value) => {
    if (!value) return { ...defaultReportCapabilities };
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return { ...defaultReportCapabilities };
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...defaultReportCapabilities };
    }
    return {
      ...defaultReportCapabilities,
      ...parsed,
      showTotalRowCount: parsed.showTotalRowCount === false ? false : true,
      supportsApproval: parsed.supportsApproval === false ? false : true,
      supportsSnapshot: parsed.supportsSnapshot === false ? false : true,
      supportsBulkUpdate: parsed.supportsBulkUpdate === true,
    };
  };

  let lastError = null;
  for (const args of argumentSets) {
    try {
      await conn.query('SET @report_capabilities = NULL');
      const dynamicSql = `CALL \`${procedureName}\`(${args.map(() => '?').join(', ')})`;
      const [rows] = await conn.query(dynamicSql, args);
      const resultRows = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];
      const [capRows] = await conn.query('SELECT @report_capabilities AS report_capabilities');
      const rawCapabilities = Array.isArray(capRows) ? capRows[0]?.report_capabilities : null;
      const reportCapabilities = normalizeReportCapabilities(rawCapabilities);
      let reportMeta = {};
      if (rawCapabilities) {
        try {
          const parsed = typeof rawCapabilities === 'string' ? JSON.parse(rawCapabilities) : rawCapabilities;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            reportMeta = { ...parsed };
          }
        } catch {
          reportMeta = {};
        }
      }

      return {
        rows: resultRows,
        rowCount: resultRows.length,
        reportMeta,
        reportCapabilities,
      };
    } catch (error) {
      lastError = error;
      const message = String(error?.message || '');
      if (/Incorrect number of arguments|Incorrect integer value|Incorrect date value/i.test(message)) {
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error(`Unable to execute procedure: ${procedureName}`);
}

export async function previewFiscalPeriodReports({ companyId, fiscalYear, reportProcedures = [], dbPool = pool }) {
  const conn = await dbPool.getConnection();
  try {
    const period = await getOrCreateFiscalPeriod(conn, companyId, fiscalYear);
    const fromDate = normalizeDate(period.period_from);
    const toDate = normalizeDate(period.period_to);
    if (!fromDate || !toDate || fromDate > toDate) {
      throw new Error('Invalid period range in fin_period_control.');
    }

    const results = [];
    for (const procedureName of reportProcedures) {
      const proc = String(procedureName || '').trim();
      if (!/^[A-Za-z0-9_]+$/.test(proc)) {
        results.push({ name: proc || String(procedureName || ''), ok: false, error: `Invalid report procedure: ${procedureName}` });
        continue;
      }
      try {
        const reportResult = await runReportProcedureWithWorkflow(conn, proc, {
          companyId,
          fiscalYear,
          fromDate,
          toDate,
        });
        results.push({
          name: proc,
          ok: true,
          rowCount: reportResult.rowCount,
          rows: reportResult.rows,
          reportMeta: reportResult.reportMeta,
          reportCapabilities: reportResult.reportCapabilities,
        });
      } catch (error) {
        results.push({ name: proc, ok: false, error: error?.message || 'Report failed' });
      }
    }
    return results;
  } finally {
    conn.release();
  }
}

export async function closeFiscalPeriod({ companyId, fiscalYear, userId, reportProcedures = [], dbPool = pool }) {
  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    const period = await getOrCreateFiscalPeriod(conn, companyId, fiscalYear);
    if (Number(period.is_closed) === 1) {
      throw new Error(`Fiscal year ${fiscalYear} is already closed.`);
    }

    const fromDate = normalizeDate(period.period_from);
    const toDate = normalizeDate(period.period_to);
    if (!fromDate || !toDate || fromDate > toDate) {
      throw new Error('Invalid period range in fin_period_control.');
    }

    for (const procedureName of reportProcedures) {
      const proc = String(procedureName || '').trim();
      if (!/^[A-Za-z0-9_]+$/.test(proc)) {
        throw new Error(`Invalid report procedure: ${procedureName}`);
      }
      await runReportProcedure(conn, proc, { companyId, fiscalYear, fromDate, toDate });
    }

    const [balanceRows] = await conn.query(
      `SELECT l.account_code,
              COALESCE(l.dimension_type_code, '') AS dimension_type_code,
              COALESCE(l.dimension_id, '') AS dimension_id,
              l.dr_cr,
              l.amount
         FROM fin_journal_line l
         JOIN fin_journal_header h ON h.journal_id = l.journal_id
        WHERE h.company_id = ?
          AND DATE(h.document_date) BETWEEN ? AND ?`,
      [companyId, formatDateOnly(fromDate), formatDateOnly(toDate)],
    );

    const totalsByKey = new Map();
    for (const row of balanceRows) {
      const key = `${row.account_code}__${row.dimension_type_code}__${row.dimension_id}`;
      const current = totalsByKey.get(key) || 0;
      totalsByKey.set(key, current + computeLineAmount(row));
    }

    const nextYear = deriveFiscalYear(period) + 1;
    const nextPeriodStart = `${nextYear}-01-01`;

    let openingJournalId = null;
    if (totalsByKey.size > 0) {
      const [headerResult] = await conn.query(
        `INSERT INTO fin_journal_header
         (company_id, source_table, source_id, document_date, currency, exchange_rate, is_posted, created_by, created_at)
         VALUES (?, 'fin_period_control', ?, ?, 'MNT', 1, 1, ?, NOW())`,
        [companyId, fiscalYear, nextPeriodStart, String(userId || 'system')],
      );
      openingJournalId = headerResult.insertId;

      let order = 1;
      for (const [key, netAmount] of totalsByKey.entries()) {
        if (!netAmount) continue;
        const [accountCode, dimensionTypeCode, dimensionId] = key.split('__');
        const isDebit = netAmount > 0;
        await conn.query(
          `INSERT INTO fin_journal_line
           (journal_id, line_order, dr_cr, account_code, amount, dimension_type_code, dimension_id, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), ?, NOW())`,
          [
            openingJournalId,
            order,
            isDebit ? 'D' : 'C',
            accountCode,
            Math.abs(netAmount),
            dimensionTypeCode,
            dimensionId,
            String(userId || 'system'),
          ],
        );
        order += 1;
      }
    }

    await conn.query(
      `UPDATE fin_period_control
          SET is_closed = 1,
              period_from = ?,
              period_to = ?,
              closed_at = NOW(),
              closed_by = ?
        WHERE company_id = ? AND fiscal_year = ? AND is_closed = 0`,
      [`${fiscalYear}-01-01`, `${fiscalYear}-12-31`, String(userId || 'system'), companyId, fiscalYear],
    );

    await conn.query(
      `INSERT INTO fin_period_control (company_id, fiscal_year, period_from, period_to, is_closed)
       VALUES (?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE period_from = VALUES(period_from), period_to = VALUES(period_to)`,
      [companyId, nextYear, `${nextYear}-01-01`, `${nextYear}-12-31`],
    );

    await conn.commit();
    return { ok: true, openingJournalId, nextFiscalYear: nextYear };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}


export async function saveFiscalPeriodReportSnapshot({
  companyId,
  fiscalYear,
  procedureName,
  rows = [],
  createdBy,
  dbPool = pool,
}) {
  const conn = await dbPool.getConnection();
  try {
    await ensurePeriodReportSnapshotTable(conn);
    const normalizedRows = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
    const columns = normalizedRows.length ? Object.keys(normalizedRows[0]) : [];
    const artifact = storeSnapshotArtifact({
      rows: normalizedRows,
      columns,
      procedure: procedureName,
      params: { companyId, fiscalYear },
    });

    const [result] = await conn.query(
      `INSERT INTO fin_period_report_snapshot
       (company_id, fiscal_year, procedure_name, artifact_id, row_count, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [companyId, fiscalYear, procedureName, artifact.id, normalizedRows.length, String(createdBy || 'system')],
    );
    return {
      snapshotId: result.insertId,
      artifactId: artifact.id,
      rowCount: normalizedRows.length,
      createdAt: artifact.createdAt,
    };
  } finally {
    conn.release();
  }
}

export async function listFiscalPeriodReportSnapshots({ companyId, fiscalYear, dbPool = pool }) {
  const conn = await dbPool.getConnection();
  try {
    await ensurePeriodReportSnapshotTable(conn);
    const [rows] = await conn.query(
      `SELECT snapshot_id, company_id, fiscal_year, procedure_name, artifact_id, row_count, created_by, created_at
         FROM fin_period_report_snapshot
        WHERE company_id = ? AND fiscal_year = ?
        ORDER BY created_at DESC, snapshot_id DESC`,
      [companyId, fiscalYear],
    );
    return Array.isArray(rows) ? rows : [];
  } finally {
    conn.release();
  }
}

export async function getFiscalPeriodReportSnapshot({ snapshotId, companyId, page = 1, perPage = 200, dbPool = pool }) {
  const conn = await dbPool.getConnection();
  try {
    await ensurePeriodReportSnapshotTable(conn);
    const [rows] = await conn.query(
      `SELECT snapshot_id, company_id, fiscal_year, procedure_name, artifact_id, row_count, created_by, created_at
         FROM fin_period_report_snapshot
        WHERE snapshot_id = ? AND company_id = ?
        LIMIT 1`,
      [snapshotId, companyId],
    );
    const meta = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!meta) return null;
    const artifact = loadSnapshotArtifactPage(meta.artifact_id, page, perPage);
    return { ...meta, artifact };
  } finally {
    conn.release();
  }
}

export async function deleteFiscalPeriodReportSnapshot({ snapshotId, companyId, dbPool = pool }) {
  const conn = await dbPool.getConnection();
  try {
    await ensurePeriodReportSnapshotTable(conn);
    const [rows] = await conn.query(
      `SELECT snapshot_id, artifact_id
         FROM fin_period_report_snapshot
        WHERE snapshot_id = ? AND company_id = ?
        LIMIT 1`,
      [snapshotId, companyId],
    );
    const snapshot = Array.isArray(rows) ? rows[0] : null;
    if (!snapshot) return { deleted: false };

    await conn.query(
      `DELETE FROM fin_period_report_snapshot
        WHERE snapshot_id = ? AND company_id = ?`,
      [snapshotId, companyId],
    );
    if (snapshot.artifact_id) {
      deleteSnapshotArtifact(snapshot.artifact_id);
    }
    return { deleted: true };
  } finally {
    conn.release();
  }
}

export async function getCurrentPeriodStatus({ companyId, fiscalYear }) {
  const conn = await pool.getConnection();
  try {
    const period = await getOrCreateFiscalPeriod(conn, companyId, fiscalYear);
    return period;
  } finally {
    conn.release();
  }
}

export async function getPeriodStatus(companyId, fiscalYear) {
  return getCurrentPeriodStatus({ companyId, fiscalYear });
}

export async function assertDateInOpenPeriod(conn, { companyId, postingDate }) {
  await ensurePeriodControlTable(conn);
  const targetDate = normalizeDate(postingDate) || new Date();
  const y = targetDate.getUTCFullYear();
  const [rows] = await conn.query(
    `SELECT is_closed
       FROM fin_period_control
      WHERE company_id = ?
        AND fiscal_year = ?
        AND ? BETWEEN period_from AND period_to
      LIMIT 1`,
    [companyId, y, formatDateOnly(targetDate)],
  );

  if (rows.length && Number(rows[0].is_closed) === 1) {
    throw new Error(`Cannot post journals into closed fiscal period ${y}.`);
  }
}
