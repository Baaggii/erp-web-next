import * as db from '../../db/index.js';
import { normalizeEmploymentSession } from '../utils/employmentSession.js';
import { normalizeNumericId } from '../utils/workplaceAssignments.js';

let getEmploymentSessionsImpl = db.getEmploymentSessions;

export function __setGetEmploymentSessions(fetcher) {
  if (typeof fetcher !== 'function') {
    throw new TypeError('fetcher must be a function');
  }
  getEmploymentSessionsImpl = fetcher;
}

export function __resetGetEmploymentSessions() {
  getEmploymentSessionsImpl = db.getEmploymentSessions;
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
    const normalizedCompanyId = normalizeNumericId(companyInput);

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

      const now = new Date();
      const currentUtcYear = now.getUTCFullYear();
      const currentUtcMonth = now.getUTCMonth() + 1;

      if (parsedYear === currentUtcYear && parsedMonth === currentUtcMonth) {
        effectiveDate = new Date();
      } else {
        effectiveDate = new Date(Date.UTC(parsedYear, parsedMonth, 0));
      }
    }

    if (!(effectiveDate instanceof Date) || Number.isNaN(effectiveDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date parameters' });
    }

    const sessions = await getEmploymentSessionsImpl(req.user.empid, {
      effectiveDate,
      includeDiagnostics: true,
    });

    const sessionList = Array.isArray(sessions) ? sessions : [];

    const diagnostics =
      sessions && typeof sessions === 'object' && '__diagnostics' in sessions
        ? sessions.__diagnostics
        : null;

    const baseDiagnostics =
      diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
    let formattedSqlForResponse =
      typeof baseDiagnostics.formattedSql === 'string'
        ? baseDiagnostics.formattedSql
        : null;
    if (
      !formattedSqlForResponse ||
      (
        typeof formattedSqlForResponse === 'string' &&
        formattedSqlForResponse.trim().length === 0
      )
    ) {
      formattedSqlForResponse =
        typeof baseDiagnostics.sql === 'string' ? baseDiagnostics.sql : null;
    }

    const filtered =
      normalizedCompanyId !== null
        ? sessionList.filter((session) => {
            const sessionCompanyId = normalizeNumericId(
              session?.company_id ?? session?.companyId,
            );
            return sessionCompanyId === normalizedCompanyId;
          })
        : sessionList;

    const workplaceAssignments = filtered
      .filter((s) => s && s.workplace_id != null)
      .map(
        ({
          company_id,
          company_name,
          branch_id,
          branch_name,
          department_id,
          department_name,
          workplace_id,
          workplace_name,
        }) => ({
          company_id: company_id ?? null,
          company_name: company_name ?? null,
          branch_id: branch_id ?? null,
          branch_name: branch_name ?? null,
          department_id: department_id ?? null,
          department_name: department_name ?? null,
          workplace_id: workplace_id ?? null,
          workplace_name: workplace_name ?? null,
        }),
      );

    const pickDefaultSession = (items = []) => {
      if (!Array.isArray(items) || items.length === 0) return null;
      const withWorkplace = items.find((item) => item?.workplace_id != null);
      return withWorkplace ?? items[0];
    };

    const defaultSession = pickDefaultSession(filtered);

    const sessionPayload = defaultSession
      ? normalizeEmploymentSession(defaultSession, workplaceAssignments)
      : null;

    const assignmentsForResponse = Array.isArray(
      sessionPayload?.workplace_assignments,
    )
      ? sessionPayload.workplace_assignments
      : workplaceAssignments;
    const safeAssignments = Array.isArray(assignmentsForResponse)
      ? assignmentsForResponse
      : [];

    const diagnosticsPayload = {
      ...baseDiagnostics,
      formattedSql: formattedSqlForResponse,
      effectiveDate:
        effectiveDate instanceof Date && !Number.isNaN(effectiveDate.getTime())
          ? effectiveDate.toISOString()
          : null,
      rowCount: sessionList.length,
      filteredCount: filtered.length,
      assignmentCount: workplaceAssignments.length,
      normalizedAssignmentCount: Array.isArray(safeAssignments)
        ? safeAssignments.length
        : 0,
      selectedWorkplaceId:
        sessionPayload?.workplace_id ?? sessionPayload?.workplaceId ?? null,
    };

    res.json({
      assignments: sessionPayload?.workplace_assignments ?? [],
      diagnostics: diagnosticsPayload,
    });
  } catch (err) {
    next(err);
  }
}
