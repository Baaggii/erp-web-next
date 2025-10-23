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

export async function listReportWorkplaces(req, res, next) {
  try {
    if (!req.user?.empid) {
      return res.status(400).json({ message: 'Missing employee context' });
    }

    const { year, month } = req.query;
    const parsedYear = Number.parseInt(year, 10);
    const parsedMonth = Number.parseInt(month, 10);

    if (!Number.isFinite(parsedYear) || parsedYear < 1900 || parsedYear > 9999) {
      return res.status(400).json({ message: 'Invalid year value' });
    }

    if (!Number.isFinite(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
      return res.status(400).json({ message: 'Invalid month value' });
    }

    const effectiveDate = new Date(Date.UTC(parsedYear, parsedMonth - 1, 1));
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

    const sessions = await getEmploymentSessionsImpl(req.user.empid, {
      effectiveDate,
    });

    const filtered = normalizedCompanyId
      ? sessions.filter((session) => session.company_id === normalizedCompanyId)
      : sessions;

    const seen = new Set();
    const assignments = [];
    filtered.forEach((session) => {
      if (!session || session.workplace_session_id == null) return;
      const workplaceId = normalizeNumericId(session.workplace_id);
      const workplaceSessionId = normalizeNumericId(session.workplace_session_id);
      if (workplaceSessionId === null) return;
      const key = `${workplaceId ?? ''}|${workplaceSessionId}`;
      if (seen.has(key)) return;
      seen.add(key);
      assignments.push({
        company_id: normalizeNumericId(session.company_id),
        company_name: session.company_name ?? null,
        branch_id: normalizeNumericId(session.branch_id),
        branch_name: session.branch_name ?? null,
        department_id: normalizeNumericId(session.department_id),
        department_name: session.department_name ?? null,
        workplace_id: workplaceId,
        workplace_name: session.workplace_name ?? null,
        workplace_session_id: workplaceSessionId,
      });
    });

    res.json({ assignments });
  } catch (err) {
    next(err);
  }
}
