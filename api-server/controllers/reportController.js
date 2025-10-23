import { fetchReportData, getEmploymentSessions } from '../../db/index.js';

// Controller to handle fetching report data by ID
export async function getReportData(req, res, next) {
  try {
    const { reportId } = req.params;
    const data = await fetchReportData(reportId, req.query);
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

    const sessions = await getEmploymentSessions(req.user.empid, {
      effectiveDate,
    });

    const filtered = normalizedCompanyId
      ? sessions.filter((session) => session.company_id === normalizedCompanyId)
      : sessions;

    const assignments = filtered
      .filter((session) => session.workplace_session_id != null)
      .map((session) => ({
        company_id: session.company_id ?? null,
        company_name: session.company_name ?? null,
        branch_id: session.branch_id ?? null,
        branch_name: session.branch_name ?? null,
        department_id: session.department_id ?? null,
        department_name: session.department_name ?? null,
        workplace_id: session.workplace_id ?? null,
        workplace_name: session.workplace_name ?? null,
        workplace_session_id: session.workplace_session_id ?? null,
      }));

    res.json({ assignments });
  } catch (err) {
    next(err);
  }
}
