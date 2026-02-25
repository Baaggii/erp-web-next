import { pool, getEmploymentSession } from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

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

async function runReportProcedure(conn, procedureName, { companyId, fiscalYear, fromDate, toDate }) {
  const fourArgSql = `CALL \`${procedureName}\`(?, ?, ?, ?)`;
  const twoArgSql = `CALL \`${procedureName}\`(?, ?)`;
  const fourArgParams = [companyId, fiscalYear, formatDateOnly(fromDate), formatDateOnly(toDate)];
  const twoArgParams = [companyId, fiscalYear];

  try {
    await conn.query(fourArgSql, fourArgParams);
  } catch (error) {
    const message = String(error?.message || '');
    if (!/Incorrect number of arguments/i.test(message)) throw error;
    await conn.query(twoArgSql, twoArgParams);
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
