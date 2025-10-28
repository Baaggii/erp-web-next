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

    const sessionContext =
      req.session && typeof req.session === 'object' ? req.session : null;

    const preferredSessionIdSet = new Set();
    const preferredWorkplaceIdSet = new Set();

    const addPreferredSessionId = (value) => {
      const normalized = normalizeNumericId(value);
      if (normalized !== null) preferredSessionIdSet.add(normalized);
    };

    const addPreferredWorkplaceId = (value) => {
      const normalized = normalizeNumericId(value);
      if (normalized !== null) preferredWorkplaceIdSet.add(normalized);
    };

    const collectQueryValues = (raw) => {
      if (raw === undefined || raw === null) return [];
      return Array.isArray(raw) ? raw : [raw];
    };

    collectQueryValues(req.query.currentWorkplaceSessionId).forEach(
      addPreferredSessionId,
    );
    collectQueryValues(req.query.workplaceSessionId).forEach(
      addPreferredSessionId,
    );

    collectQueryValues(req.query.currentWorkplaceId).forEach(
      addPreferredWorkplaceId,
    );
    collectQueryValues(req.query.workplaceId).forEach(addPreferredWorkplaceId);

    if (sessionContext) {
      addPreferredSessionId(
        sessionContext.workplace_session_id ?? sessionContext.workplaceSessionId,
      );
      if (Array.isArray(sessionContext.workplace_session_ids)) {
        sessionContext.workplace_session_ids.forEach(addPreferredSessionId);
      }
      addPreferredWorkplaceId(
        sessionContext.workplace_id ?? sessionContext.workplaceId,
      );
      if (Array.isArray(sessionContext.workplace_assignments)) {
        sessionContext.workplace_assignments.forEach((assignment) => {
          if (!assignment || typeof assignment !== 'object') return;
          addPreferredSessionId(
            assignment.workplace_session_id ?? assignment.workplaceSessionId,
          );
          addPreferredWorkplaceId(
            assignment.workplace_id ?? assignment.workplaceId,
          );
        });
      }
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

    const matchesPreference = (session) => {
      if (!session || typeof session !== 'object') return false;
      const sessionId = normalizeNumericId(
        session.workplace_session_id ?? session.workplaceSessionId,
      );
      if (sessionId !== null && preferredSessionIdSet.has(sessionId)) {
        return true;
      }
      const workplaceId = normalizeNumericId(
        session.workplace_id ?? session.workplaceId,
      );
      if (workplaceId !== null && preferredWorkplaceIdSet.has(workplaceId)) {
        return true;
      }
      return false;
    };

    const preferredMatches = filtered.filter(matchesPreference);
    const relevantSessions = preferredMatches.length ? preferredMatches : filtered;

    const workplaceAssignments = relevantSessions
      .filter((s) => s && s.workplace_session_id != null)
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
          workplace_session_id,
        }) => ({
          company_id: company_id ?? null,
          company_name: company_name ?? null,
          branch_id: branch_id ?? null,
          branch_name: branch_name ?? null,
          department_id: department_id ?? null,
          department_name: department_name ?? null,
          workplace_id: workplace_id ?? null,
          workplace_name: workplace_name ?? null,
          workplace_session_id: workplace_session_id ?? null,
        }),
      );

    const pickDefaultSession = (items = []) => {
      if (!Array.isArray(items) || items.length === 0) return null;
      const withWorkplace = items.find(
        (item) => item?.workplace_session_id != null,
      );
      return withWorkplace ?? items[0];
    };

    const companyMatchesSessionContext = () => {
      if (!sessionContext) return false;
      if (normalizedCompanyId === null) return true;
      const contextCompanyId = normalizeNumericId(
        sessionContext.company_id ?? sessionContext.companyId,
      );
      return contextCompanyId === normalizedCompanyId;
    };

    const selectPreferredSession = (sessionsToSearch) => {
      if (!Array.isArray(sessionsToSearch) || sessionsToSearch.length === 0) {
        return null;
      }
      const bySessionId = sessionsToSearch.find((session) => {
        const sessionId = normalizeNumericId(
          session?.workplace_session_id ?? session?.workplaceSessionId,
        );
        return sessionId !== null && preferredSessionIdSet.has(sessionId);
      });
      if (bySessionId) return bySessionId;
      const byWorkplaceId = sessionsToSearch.find((session) => {
        const workplaceId = normalizeNumericId(
          session?.workplace_id ?? session?.workplaceId,
        );
        return workplaceId !== null && preferredWorkplaceIdSet.has(workplaceId);
      });
      return byWorkplaceId ?? null;
    };

    let sessionPayload = null;
    let sessionSource = 'none';
    const preferredSession = selectPreferredSession(preferredMatches);
    if (preferredSession) {
      sessionPayload = normalizeEmploymentSession(
        preferredSession,
        workplaceAssignments,
      );
      sessionSource = 'preferred';
    } else if (sessionContext && companyMatchesSessionContext()) {
      sessionPayload = normalizeEmploymentSession(
        sessionContext,
        workplaceAssignments,
      );
      sessionSource = 'context';
      const normalizedSessionId = normalizeNumericId(
        sessionPayload?.workplace_session_id ?? sessionPayload?.workplaceSessionId,
      );
      if (
        preferredSessionIdSet.size > 0 &&
        (normalizedSessionId === null ||
          !preferredSessionIdSet.has(normalizedSessionId))
      ) {
        sessionPayload = null;
        sessionSource = 'fallback';
      }
    }

    if (!sessionPayload) {
      const defaultSession = pickDefaultSession(relevantSessions);
      if (defaultSession) {
        sessionPayload = normalizeEmploymentSession(
          defaultSession,
          workplaceAssignments,
        );
        if (sessionSource === 'fallback') {
          sessionSource = 'default';
        } else if (sessionSource === 'none') {
          sessionSource = 'default';
        }
      }
    }

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
      preferredMatchCount: preferredMatches.length,
      assignmentCount: workplaceAssignments.length,
      normalizedAssignmentCount: Array.isArray(safeAssignments)
        ? safeAssignments.length
        : 0,
      selectedWorkplaceId:
        sessionPayload?.workplace_id ?? sessionPayload?.workplaceId ?? null,
      selectedWorkplaceSessionId:
        sessionPayload?.workplace_session_id ??
        sessionPayload?.workplaceSessionId ??
        null,
      preferredWorkplaceSessionIds: Array.from(preferredSessionIdSet),
      preferredWorkplaceIds: Array.from(preferredWorkplaceIdSet),
      sessionSource,
    };

    res.json({
      assignments: assignmentsForResponse,
      diagnostics: diagnosticsPayload,
    });
  } catch (err) {
    next(err);
  }
}
