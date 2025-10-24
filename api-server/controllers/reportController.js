import * as db from '../../db/index.js';
import {
  normalizeNumericId,
  normalizeWorkplaceAssignments,
} from '../utils/workplaceAssignments.js';

let getEmploymentSessionsImpl = db.getEmploymentSessions;
let describeEmploymentSessionsQueryImpl = db.describeEmploymentSessionsQuery;

export function __setGetEmploymentSessions(fetcher) {
  if (typeof fetcher !== 'function') {
    throw new TypeError('fetcher must be a function');
  }
  getEmploymentSessionsImpl = fetcher;
}

export function __resetGetEmploymentSessions() {
  getEmploymentSessionsImpl = db.getEmploymentSessions;
}

export function __setDescribeEmploymentSessionsQuery(fetcher) {
  if (typeof fetcher !== 'function') {
    throw new TypeError('fetcher must be a function');
  }
  describeEmploymentSessionsQueryImpl = fetcher;
}

export function __resetDescribeEmploymentSessionsQuery() {
  describeEmploymentSessionsQueryImpl = db.describeEmploymentSessionsQuery;
}

// Controller to handle fetching report data by ID
export async function getReportData(req, res, next) {
  try {
    const { reportId } = req.params;
    const data = await db.fetchReportData(reportId, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

function parseDateOnly(value) {
  if (value === undefined || value === null) return null;
  const str = typeof value === 'string' ? value.trim() : String(value);
  if (!str) return null;
  // Accept YYYY-MM-DD or YYYY/MM/DD formats
  const normalized = str.replace(/\//g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const [_, yearStr, monthStr, dayStr] = match;
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);
  if (
    !Number.isFinite(year) ||
    year < 1900 ||
    year > 9999 ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isFinite(day) ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const utcDate = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(utcDate)) return null;
  return new Date(utcDate);
}

export async function listReportWorkplaces(req, res, next) {
  try {
    if (!req.user?.empid) {
      return res.status(400).json({ message: 'Missing employee context' });
    }

    const companyInput = req.query.companyId ?? req.user.companyId;
    let normalizedCompanyId = null;
    if (companyInput !== undefined && companyInput !== null) {
      const raw =
        typeof companyInput === 'string'
          ? companyInput.trim()
          : companyInput;
      if (raw !== '' && raw !== null) {
        const numeric = Number(raw);
        if (Number.isFinite(numeric)) {
          normalizedCompanyId = numeric;
        }
      }
    }

    const explicitDate = parseDateOnly(req.query.date);
    const startDate = parseDateOnly(req.query.startDate);
    const endDate = parseDateOnly(req.query.endDate);

    let effectiveDate = null;
    if (endDate) {
      effectiveDate = endDate;
    } else if (startDate) {
      effectiveDate = startDate;
    } else if (explicitDate) {
      effectiveDate = explicitDate;
    } else {
      const { year, month } = req.query;
      if (year === undefined || month === undefined) {
        return res
          .status(400)
          .json({ message: 'Missing effective date parameters' });
      }
      const parsedYear = Number.parseInt(year, 10);
      const parsedMonth = Number.parseInt(month, 10);

      if (!Number.isFinite(parsedYear) || parsedYear < 1900 || parsedYear > 9999) {
        return res.status(400).json({ message: 'Invalid year value' });
      }

      if (!Number.isFinite(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        return res.status(400).json({ message: 'Invalid month value' });
      }

      const firstOfMonth = new Date(Date.UTC(parsedYear, parsedMonth - 1, 1));
      const endOfMonth = new Date(Date.UTC(parsedYear, parsedMonth, 0));
      effectiveDate = endOfMonth >= firstOfMonth ? endOfMonth : firstOfMonth;
    }

    if (!(effectiveDate instanceof Date) || Number.isNaN(effectiveDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date parameters' });
    }

    const sessionResult = await getEmploymentSessionsImpl(req.user.empid, {
      effectiveDate,
      includeDiagnostics: true,
    });

    let sessions = [];
    let diagnostics = null;

    if (Array.isArray(sessionResult)) {
      sessions = sessionResult;
      if ('__diagnostics' in sessionResult) {
        diagnostics = sessionResult.__diagnostics;
      }
    } else if (sessionResult && typeof sessionResult === 'object') {
      if (Array.isArray(sessionResult.sessions)) {
        sessions = sessionResult.sessions;
        if (!diagnostics && '__diagnostics' in sessionResult.sessions) {
          diagnostics = sessionResult.sessions.__diagnostics;
        }
      }
      if (!diagnostics && sessionResult.diagnostics) {
        diagnostics = sessionResult.diagnostics;
      }
    }

    if (!diagnostics && typeof describeEmploymentSessionsQueryImpl === 'function') {
      try {
        const fallback = await describeEmploymentSessionsQueryImpl(
          req.user.empid,
          { effectiveDate },
        );
        if (fallback && typeof fallback === 'object') {
          diagnostics = fallback;
        }
      } catch (err) {
        // Ignore diagnostics fallback errors to avoid masking primary results
      }
    }

    const filtered =
      normalizedCompanyId !== null
        ? sessions.filter((session) => {
            const sessionCompanyId = normalizeNumericId(
              session?.company_id ?? session?.companyId,
            );
            return sessionCompanyId === normalizedCompanyId;
          })
        : sessions;

    const rawAssignments = filtered
      .filter((session) => session && session.workplace_session_id != null)
      .map((session) => {
        const companyId = normalizeNumericId(
          session.company_id ?? session.companyId,
        );
        const branchId = normalizeNumericId(
          session.branch_id ?? session.branchId,
        );
        const departmentId = normalizeNumericId(
          session.department_id ?? session.departmentId,
        );
        const workplaceId = normalizeNumericId(
          session.workplace_id ?? session.workplaceId,
        );
        const workplaceSessionId = normalizeNumericId(
          session.workplace_session_id ?? session.workplaceSessionId,
        );

        const companyName =
          typeof session.company_name === 'string'
            ? session.company_name.trim() || null
            : session.company_name ?? null;
        const branchName =
          typeof session.branch_name === 'string'
            ? session.branch_name.trim() || null
            : session.branch_name ?? null;
        const departmentName =
          typeof session.department_name === 'string'
            ? session.department_name.trim() || null
            : session.department_name ?? null;
        const workplaceName =
          typeof session.workplace_name === 'string'
            ? session.workplace_name.trim() || null
            : session.workplace_name ?? null;

        return {
          company_id: companyId,
          companyId,
          company_name: companyName,
          companyName,
          branch_id: branchId,
          branchId,
          branch_name: branchName,
          branchName,
          department_id: departmentId,
          departmentId,
          department_name: departmentName,
          departmentName,
          workplace_id: workplaceId,
          workplaceId,
          workplace_name: workplaceName,
          workplaceName,
          workplace_session_id: workplaceSessionId,
          workplaceSessionId,
        };
      });

    const { assignments } = normalizeWorkplaceAssignments(rawAssignments);

    const hasContent = (value) =>
      typeof value === 'string' && value.length > 0;
    const preferredSql = diagnostics
      ? hasContent(diagnostics.formattedSql)
        ? diagnostics.formattedSql
        : hasContent(diagnostics.sql)
        ? diagnostics.sql
        : null
      : null;
    const responseDiagnostics = diagnostics
      ? {
          formattedSql: preferredSql,
          sql: hasContent(diagnostics?.sql) ? diagnostics.sql : preferredSql,
          params: Array.isArray(diagnostics?.params)
            ? diagnostics.params
            : null,
        }
      : null;

    res.json({ assignments, diagnostics: responseDiagnostics });
  } catch (err) {
    next(err);
  }
}
