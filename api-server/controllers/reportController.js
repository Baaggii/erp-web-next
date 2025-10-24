import * as db from '../../db/index.js';

function normalizeNumericId(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

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
    const employeeInput =
      req.query.employeeId ?? req.query.empId ?? req.query.empid ?? null;
    const overrideEmployeeId = normalizeNumericId(employeeInput);
    const fallbackEmployeeId = normalizeNumericId(
      req.user?.empid ?? req.user?.employeeId ?? req.user?.employee_id,
    );
    const normalizedEmployeeId =
      overrideEmployeeId ?? fallbackEmployeeId ?? null;

    if (normalizedEmployeeId === null) {
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

    const sessions = await getEmploymentSessionsImpl(normalizedEmployeeId, {
      effectiveDate,
    });

    const filtered =
      normalizedCompanyId !== null
        ? sessions.filter((session) => {
            const sessionCompanyId = normalizeNumericId(
              session?.company_id ?? session?.companyId,
            );
            return sessionCompanyId === normalizedCompanyId;
          })
        : sessions;

    const seen = new Set();
    const assignments = [];
    filtered.forEach((session) => {
      if (!session || session.workplace_session_id == null) return;
      const workplaceId = normalizeNumericId(session.workplace_id);
      const workplaceSessionId = normalizeNumericId(session.workplace_session_id);
      if (workplaceSessionId === null || workplaceId === null) return;
      const key = `${workplaceId ?? ''}|${workplaceSessionId}`;
      if (seen.has(key)) return;
      seen.add(key);

      const companyId = normalizeNumericId(session.company_id);
      const branchId = normalizeNumericId(session.branch_id);
      const departmentId = normalizeNumericId(session.department_id);
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

      assignments.push({
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
      });
    });

    res.json({ assignments });
  } catch (err) {
    next(err);
  }
}
