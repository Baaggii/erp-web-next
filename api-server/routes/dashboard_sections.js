import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listRequests, listRequestsByEmp } from '../services/pendingRequest.js';
import { listTemporarySubmissionGroups } from '../services/transactionTemporaries.js';
import { getReportApprovalsDashboardTab } from '../services/reportAccessConfig.js';

const router = express.Router();
const SECTION_LIMIT = 5;
const TEMPORARY_PAGE_SIZE = 10;

function dedupeRequests(list = []) {
  const map = new Map();
  list.forEach((item) => {
    if (!item || !item.request_id) return;
    if (!map.has(item.request_id)) {
      map.set(item.request_id, item);
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a?.created_at || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.created_at || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function normalizeSupervisorIds(req) {
  const ids = [];
  const hasSupervisor = Number(req.user?.senior_empid) > 0 || Number(req.user?.senior_plan_empid) > 0;
  if (!hasSupervisor && req.user?.empid) ids.push(String(req.user.empid).trim());
  if (hasSupervisor && req.user?.senior_plan_empid) ids.push(String(req.user.senior_plan_empid).trim());
  return Array.from(new Set(ids.filter(Boolean)));
}

async function fetchRequestsForTypes({ req, requestTypes = [], statuses = ['pending'] }) {
  const normalizedStatuses = Array.from(
    new Set(
      (Array.isArray(statuses) ? statuses : ['pending'])
        .map((status) => String(status || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (!normalizedStatuses.includes('pending')) normalizedStatuses.unshift('pending');

  const incomingLists = [];
  const outgoingStatusLists = new Map();
  const supervisorIds = normalizeSupervisorIds(req);

  await Promise.all(
    requestTypes.map(async (requestType) => {
      if (supervisorIds.length) {
        await Promise.all(
          supervisorIds.map(async (id) => {
            try {
              const { rows } = await listRequests({
                status: 'pending',
                request_type: requestType,
                per_page: SECTION_LIMIT,
                page: 1,
                senior_empid: id,
                company_id: req.user.companyId,
              });
              incomingLists.push(
                (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, request_type: row.request_type || requestType })),
              );
            } catch {
              // ignore single source failures
            }
          }),
        );
      }

      try {
        const { rows } = await listRequestsByEmp(req.user.empid, {
          status: normalizedStatuses.join(','),
          request_type: requestType,
          per_page: SECTION_LIMIT,
          page: 1,
          company_id: req.user.companyId,
        });
        (Array.isArray(rows) ? rows : []).forEach((row) => {
          const resolvedStatus = row.status || row.response_status || 'pending';
          const normalizedStatus = String(resolvedStatus || 'pending').trim().toLowerCase() || 'pending';
          const prev = outgoingStatusLists.get(normalizedStatus) || [];
          outgoingStatusLists.set(
            normalizedStatus,
            prev.concat({ ...row, request_type: row.request_type || requestType, status: normalizedStatus }),
          );
        });
      } catch {
        // ignore single source failures
      }
    }),
  );

  const incoming = dedupeRequests(incomingLists.flat()).slice(0, SECTION_LIMIT);
  const outgoing = dedupeRequests(outgoingStatusLists.get('pending') || []).slice(0, SECTION_LIMIT);
  const responses = normalizedStatuses
    .filter((status) => status !== 'pending')
    .reduce((acc, status) => {
      acc[status] = dedupeRequests(outgoingStatusLists.get(status) || []).slice(0, SECTION_LIMIT);
      return acc;
    }, {});

  return { incoming, outgoing, responses };
}

async function fetchTemporaryScope({ req, scope, status, limit = TEMPORARY_PAGE_SIZE, offset = 0 }) {
  const list = await listTemporarySubmissionGroups({
    scope,
    tableName: null,
    formName: null,
    configName: null,
    empId: req.user.empid,
    companyId: req.user.companyId,
    status,
    limit,
    offset,
    transactionTypeField: null,
    transactionTypeValue: null,
  });
  return {
    entries: Array.isArray(list?.rows) ? list.rows : [],
    groups: Array.isArray(list?.groups) ? list.groups : [],
    hasMore: Boolean(list?.hasMore),
    cursor: Number.isFinite(Number(list?.nextOffset)) ? Number(list.nextOffset) : offset + limit,
  };
}

router.get('/overview', requireAuth, async (req, res, next) => {
  try {
    const [reportApprovalsDashboardTab, reportApprovals, changeRequests, temporaryReview, temporaryCreated] = await Promise.all([
      getReportApprovalsDashboardTab(req.user.companyId),
      fetchRequestsForTypes({ req, requestTypes: ['report_approval'], statuses: ['pending', 'accepted', 'declined'] }),
      fetchRequestsForTypes({ req, requestTypes: ['edit', 'delete'], statuses: ['pending', 'accepted', 'declined'] }),
      fetchTemporaryScope({ req, scope: 'review', status: 'pending' }),
      fetchTemporaryScope({ req, scope: 'created', status: 'any' }),
    ]);

    res.json({
      reportApprovalsDashboardTab: reportApprovalsDashboardTab || 'audition',
      sections: {
        reportApprovals,
        changeRequests,
        temporaryTransactions: {
          review: { ...temporaryReview, loading: false },
          created: { ...temporaryCreated, loading: false },
        },
      },
      limits: {
        section: SECTION_LIMIT,
        temporary: TEMPORARY_PAGE_SIZE,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/temporary', requireAuth, async (req, res, next) => {
  try {
    const scope = String(req.query.scope || 'created').trim().toLowerCase() === 'review' ? 'review' : 'created';
    const statusDefault = scope === 'review' ? 'pending' : 'any';
    const status = String(req.query.status || statusDefault).trim().toLowerCase() || statusDefault;
    const limit = Math.min(Math.max(Number(req.query.limit) || TEMPORARY_PAGE_SIZE, 1), 50);
    const offset = Math.max(Number(req.query.cursor ?? req.query.offset) || 0, 0);
    const result = await fetchTemporaryScope({ req, scope, status, limit, offset });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
