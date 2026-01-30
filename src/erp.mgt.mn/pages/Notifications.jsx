import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import { useTransactionNotifications } from '../context/TransactionNotificationsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import LangContext from '../context/I18nContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import NotificationDots, { DEFAULT_NOTIFICATION_COLOR } from '../components/NotificationDots.jsx';

const SECTION_LIMIT = 5;
const TEMPORARY_PAGE_SIZE = 10;
const STATUS_COLORS = {
  pending: '#fbbf24',
  accepted: '#34d399',
  declined: '#ef4444',
};

function dedupeRequests(list) {
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

function dedupeTemporaryEntries(list) {
  const map = new Map();
  list.forEach((entry) => {
    if (!entry) return;
    const key = String(
      entry.id ??
        entry.temporary_id ??
        entry.temporaryId ??
        entry.temporaryID ??
        '',
    ).trim();
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, entry);
    }
  });
  return Array.from(map.values());
}

function getTemporaryEntryKey(entry) {
  return String(
    entry?.id ??
      entry?.temporary_id ??
      entry?.temporaryId ??
      entry?.temporaryID ??
      '',
  ).trim();
}

function getTemporaryEntryTimestamp(entry) {
  const reviewedAt = entry?.reviewed_at || entry?.reviewedAt || entry?.updated_at || entry?.updatedAt;
  const createdAt = entry?.created_at || entry?.createdAt || 0;
  const raw = reviewedAt || createdAt || 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function areTemporaryListsEqual(previous = [], next = []) {
  if (previous === next) return true;
  if (!Array.isArray(previous) || !Array.isArray(next)) return false;
  if (previous.length !== next.length) return false;
  for (let i = 0; i < previous.length; i += 1) {
    if (getTemporaryEntryKey(previous[i]) !== getTemporaryEntryKey(next[i])) return false;
    if (getTemporaryEntryTimestamp(previous[i]) !== getTemporaryEntryTimestamp(next[i])) return false;
  }
  return true;
}

function createEmptyResponses() {
  return { accepted: [], declined: [] };
}

function createEmptyTemporaryScope() {
  return { entries: [], groups: [], hasMore: false, cursor: 0, loading: false };
}

export default function NotificationsPage() {
  const { workflows, markWorkflowSeen, temporary, notificationColors } = usePendingRequests();
  const { user, session } = useAuth();
  const { t } = useContext(LangContext);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    notifications: transactionNotifications,
    hasMore: transactionHasMore,
    loading: transactionLoading,
    loadMore: loadMoreTransactions,
    markRead: markTransactionRead,
    unreadCount: transactionUnreadCount,
  } = useTransactionNotifications();
  const [reportState, setReportState] = useState({
    incoming: [],
    outgoing: [],
    responses: createEmptyResponses(),
    loading: true,
    error: '',
  });
  const [changeState, setChangeState] = useState({
    incoming: [],
    outgoing: [],
    responses: createEmptyResponses(),
    loading: true,
    error: '',
  });
  const [temporaryState, setTemporaryState] = useState({
    loading: true,
    error: '',
    review: createEmptyTemporaryScope(),
    created: createEmptyTemporaryScope(),
  });
  const highlightTransactionName = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return params.get('highlight') || '';
  }, [location.search]);

  const hasSupervisor =
    Number(session?.senior_empid) > 0 || Number(session?.senior_plan_empid) > 0;
  const seniorEmpId =
    session && user?.empid && !hasSupervisor ? String(user.empid) : null;
  const seniorPlanEmpId = hasSupervisor ? session?.senior_plan_empid : null;

  const supervisorIds = useMemo(() => {
    const ids = [];
    if (seniorEmpId) ids.push(String(seniorEmpId).trim());
    if (seniorPlanEmpId) ids.push(String(seniorPlanEmpId).trim());
    return Array.from(new Set(ids.filter(Boolean)));
  }, [seniorEmpId, seniorPlanEmpId]);

  const transactionGroups = useMemo(() => {
    const groups = new Map();
    transactionNotifications.forEach((note) => {
      const name = note.transaction_name || note.transactionName || t('notifications_unknown_type', 'Other transaction');
      const key = String(name).trim() || t('notifications_unknown_type', 'Other transaction');
      if (!groups.has(key)) {
        groups.set(key, { name: key, entries: [] });
      }
      groups.get(key).entries.push(note);
    });
    return Array.from(groups.values()).map((group) => ({
      ...group,
      entries: group.entries.sort((a, b) => {
        const aTime = new Date(a.created_at || a.createdAt || 0).getTime();
        const bTime = new Date(b.created_at || b.createdAt || 0).getTime();
        return bTime - aTime;
      }),
    }));
  }, [t, transactionNotifications]);

  const makeGroupId = useCallback((name) => {
    return `transaction-group-${String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')}`;
  }, []);

  useEffect(() => {
    if (!highlightTransactionName) return;
    const targetId = makeGroupId(highlightTransactionName);
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightTransactionName, makeGroupId]);

  const fetchRequests = useCallback(
    async (types, statuses = ['pending']) => {
      const normalizedStatuses = Array.isArray(statuses)
        ? Array.from(
            new Set(
              statuses
                .map((status) => String(status || '').trim().toLowerCase())
                .filter(Boolean),
            ),
          )
        : [];
      if (!normalizedStatuses.includes('pending')) {
        normalizedStatuses.unshift('pending');
      }

      const incomingLists = [];
      const outgoingStatusLists = new Map();
      await Promise.all(
        types.map(async (type) => {
          if (supervisorIds.length) {
            await Promise.all(
              supervisorIds.map(async (id) => {
                try {
                  const params = new URLSearchParams({
                    status: 'pending',
                    request_type: type,
                    per_page: String(SECTION_LIMIT),
                    page: '1',
                    senior_empid: id,
                  });
                  const res = await fetch(`/api/pending_request?${params.toString()}`, {
                    credentials: 'include',
                    skipLoader: true,
                  });
                  if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    const rows = Array.isArray(data?.rows) ? data.rows : [];
                    incomingLists.push(
                      rows.map((row) => ({ ...row, request_type: row.request_type || type })),
                    );
                  }
                } catch {
                  // ignore
                }
              }),
            );
          }

          try {
            const params = new URLSearchParams({
              status: normalizedStatuses.join(','),
              request_type: type,
              per_page: String(SECTION_LIMIT),
              page: '1',
            });
            const res = await fetch(
              `/api/pending_request/outgoing?${params.toString()}`,
              {
                credentials: 'include',
                skipLoader: true,
              },
            );
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              const rows = Array.isArray(data?.rows) ? data.rows : [];
              rows.forEach((row) => {
                const resolvedStatus = row.status || row.response_status || 'pending';
                const normalizedStatus = resolvedStatus
                  ? String(resolvedStatus).trim().toLowerCase()
                  : 'pending';
                const prev = outgoingStatusLists.get(normalizedStatus) || [];
                outgoingStatusLists.set(normalizedStatus, prev.concat({
                  ...row,
                  request_type: row.request_type || type,
                  status: normalizedStatus,
                }));
              });
            }
          } catch {
            // ignore
          }
        }),
      );

      const incoming = dedupeRequests(incomingLists.flat()).slice(0, SECTION_LIMIT);
      const outgoing = dedupeRequests(outgoingStatusLists.get('pending') || []).slice(
        0,
        SECTION_LIMIT,
      );
      const responses = normalizedStatuses
        .filter((status) => status !== 'pending')
        .reduce((acc, status) => {
          const list = outgoingStatusLists.get(status) || [];
          acc[status] = dedupeRequests(list).slice(0, SECTION_LIMIT);
          return acc;
        }, {});
      return { incoming, outgoing, responses };
    },
    [supervisorIds],
  );

  useEffect(() => {
    let cancelled = false;
    const incomingPending = workflows?.reportApproval?.incoming?.pending?.count || 0;
    const outgoingPending = workflows?.reportApproval?.outgoing?.pending?.count || 0;
    const outgoingAccepted = workflows?.reportApproval?.outgoing?.accepted?.count || 0;
    const outgoingDeclined = workflows?.reportApproval?.outgoing?.declined?.count || 0;
    const totalCount =
      incomingPending + outgoingPending + outgoingAccepted + outgoingDeclined;

    if (totalCount === 0) {
      setReportState({
        incoming: [],
        outgoing: [],
        responses: createEmptyResponses(),
        loading: false,
        error: '',
      });
      return () => {
        cancelled = true;
      };
    }

    setReportState((prev) => ({
      ...prev,
      loading: true,
      error: '',
      responses: prev.responses || createEmptyResponses(),
    }));
    fetchRequests(['report_approval'], ['pending', 'accepted', 'declined'])
      .then((data) => {
        if (!cancelled)
          setReportState({
            ...data,
            responses: {
              accepted: data.responses?.accepted || [],
              declined: data.responses?.declined || [],
            },
            loading: false,
            error: '',
          });
      })
      .catch(() => {
        if (!cancelled)
          setReportState((prev) => ({
            ...prev,
            loading: false,
            incoming: [],
            outgoing: [],
            responses: createEmptyResponses(),
            error: t('notifications_report_error', 'Failed to load report approvals'),
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [
    fetchRequests,
    t,
    workflows?.reportApproval?.incoming?.pending?.count,
    workflows?.reportApproval?.outgoing?.pending?.count,
    workflows?.reportApproval?.outgoing?.accepted?.count,
    workflows?.reportApproval?.outgoing?.declined?.count,
  ]);

  useEffect(() => {
    let cancelled = false;
    const incomingPending = workflows?.changeRequests?.incoming?.pending?.count || 0;
    const outgoingPending = workflows?.changeRequests?.outgoing?.pending?.count || 0;
    const outgoingAccepted = workflows?.changeRequests?.outgoing?.accepted?.count || 0;
    const outgoingDeclined = workflows?.changeRequests?.outgoing?.declined?.count || 0;
    const totalCount =
      incomingPending + outgoingPending + outgoingAccepted + outgoingDeclined;

    if (totalCount === 0) {
      setChangeState({
        incoming: [],
        outgoing: [],
        responses: createEmptyResponses(),
        loading: false,
        error: '',
      });
      return () => {
        cancelled = true;
      };
    }

    setChangeState((prev) => ({
      ...prev,
      loading: true,
      error: '',
      responses: prev.responses || createEmptyResponses(),
    }));
    fetchRequests(['edit', 'delete'], ['pending', 'accepted', 'declined'])
      .then((data) => {
        if (!cancelled)
          setChangeState({
            ...data,
            responses: {
              accepted: data.responses?.accepted || [],
              declined: data.responses?.declined || [],
            },
            loading: false,
            error: '',
          });
      })
      .catch(() => {
        if (!cancelled)
          setChangeState((prev) => ({
            ...prev,
            loading: false,
            incoming: [],
            outgoing: [],
            responses: createEmptyResponses(),
            error: t('notifications_change_error', 'Failed to load change requests'),
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [
    fetchRequests,
    t,
    workflows?.changeRequests?.incoming?.pending?.count,
    workflows?.changeRequests?.outgoing?.pending?.count,
    workflows?.changeRequests?.outgoing?.accepted?.count,
    workflows?.changeRequests?.outgoing?.declined?.count,
  ]);

  useEffect(() => {
    if (typeof markWorkflowSeen !== 'function') return;
    markWorkflowSeen('reportApproval', 'outgoing', ['accepted', 'declined']);
    markWorkflowSeen('changeRequests', 'outgoing', ['accepted', 'declined']);
  }, [markWorkflowSeen]);

  const temporaryReviewPending =
    Number(
      temporary?.counts?.review?.pendingCount ?? temporary?.counts?.review?.count,
    ) || 0;
  const temporaryCreatedPending =
    Number(
      temporary?.counts?.created?.pendingCount ?? temporary?.counts?.created?.count,
    ) || 0;
  const temporaryFetchScopeEntries = temporary?.fetchScopeEntries;
  const sortTemporaryEntries = useCallback((entries, scope) => {
    if (!Array.isArray(entries)) return [];
    const getStatus = (entry) => String(entry?.status || '').trim().toLowerCase();
    const compare = (a, b) => {
      const statusA = getStatus(a);
      const statusB = getStatus(b);
      const processedA = scope === 'created' && statusA && statusA !== 'pending';
      const processedB = scope === 'created' && statusB && statusB !== 'pending';
      if (processedA !== processedB) {
        return processedA ? -1 : 1;
      }
      const diff = getTemporaryEntryTimestamp(b) - getTemporaryEntryTimestamp(a);
      if (diff !== 0) return diff;
      return getTemporaryEntryKey(b).localeCompare(getTemporaryEntryKey(a));
    };

    let alreadySorted = true;
    for (let i = 1; i < entries.length; i += 1) {
      if (compare(entries[i - 1], entries[i]) > 0) {
        alreadySorted = false;
        break;
      }
    }
    if (alreadySorted) return entries;
    const list = [...entries];
    list.sort(compare);
    return list;
  }, []);

  const mergeTemporaryEntries = useCallback(
    (previousEntries, nextEntries, scope) => {
      const combined = dedupeTemporaryEntries([...(previousEntries || []), ...(nextEntries || [])]);
      return sortTemporaryEntries(combined, scope);
    },
    [sortTemporaryEntries],
  );

  const mergeTemporaryGroups = useCallback((previousGroups = [], nextGroups = []) => {
    const map = new Map();
    [...previousGroups, ...nextGroups].forEach((group) => {
      if (!group) return;
      const key =
        group.key ||
        `${group.user || 'unknown'}|${group.transactionType || 'unknown'}|${group.dateKey || ''}|${
          group.status || 'pending'
        }`;
      if (!map.has(key)) {
        map.set(key, group);
      }
    });
    return Array.from(map.values());
  }, []);

  const fetchTemporaryPage = useCallback(
    async (scope, { cursor = 0, append = false, status = 'pending', isCancelled } = {}) => {
      if (typeof temporaryFetchScopeEntries !== 'function') return;
      if (isCancelled?.()) return;
      setTemporaryState((prev) => {
        if (isCancelled?.()) return prev;
        return {
          ...prev,
          loading: prev.loading || !append,
          error: '',
          [scope]: { ...(prev[scope] || createEmptyTemporaryScope()), loading: true },
        };
      });
      try {
        const result = await temporaryFetchScopeEntries(scope, {
          limit: TEMPORARY_PAGE_SIZE,
          status,
          cursor,
          grouped: true,
        });
        if (isCancelled?.()) return;
        const rows = Array.isArray(result?.rows)
          ? result.rows
          : Array.isArray(result)
          ? result
          : [];
        const groups = Array.isArray(result?.groups)
          ? result.groups
          : [];
        const hasMore = Boolean(result?.hasMore);
        const nextCursorRaw = result?.nextCursor ?? result?.nextOffset;
        const nextCursor = Number.isFinite(Number(nextCursorRaw))
          ? Number(nextCursorRaw)
          : cursor + TEMPORARY_PAGE_SIZE;
        setTemporaryState((prev) => {
          if (isCancelled?.()) return prev;
          const otherScope = scope === 'review' ? 'created' : 'review';
          const previousScope = prev[scope] || createEmptyTemporaryScope();
          const mergedEntries = mergeTemporaryEntries(
            append ? previousScope.entries : [],
            rows,
            scope,
          );
          const mergedGroups = mergeTemporaryGroups(
            append ? previousScope.groups : [],
            groups,
          );
          const updatedScope = {
            ...previousScope,
            entries: mergedEntries,
            groups: mergedGroups,
            hasMore,
            cursor: hasMore ? nextCursor : mergedEntries.length,
            loading: false,
          };
          const otherScopeLoading = prev[otherScope]?.loading || false;
          return {
            ...prev,
            loading: otherScopeLoading || updatedScope.loading,
            error: '',
            [scope]: updatedScope,
          };
        });
      } catch {
        if (isCancelled?.()) return;
        setTemporaryState((prev) => ({
          ...prev,
          loading: false,
          error: t('notifications_temporary_error', 'Failed to load temporary submissions'),
          [scope]: { ...(prev[scope] || createEmptyTemporaryScope()), loading: false },
        }));
      }
    },
    [mergeTemporaryEntries, mergeTemporaryGroups, t, temporaryFetchScopeEntries],
  );

  useEffect(() => {
    let cancelled = false;
    setTemporaryState((prev) => ({ ...prev, loading: true, error: '' }));
    fetchTemporaryPage('review', {
      cursor: 0,
      append: false,
      status: 'pending',
      isCancelled: () => cancelled,
    });
    fetchTemporaryPage('created', {
      cursor: 0,
      append: false,
      status: 'any',
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [fetchTemporaryPage, temporaryCreatedPending, temporaryReviewPending]);

  const reportPending = useMemo(() => {
    const incomingPending = workflows?.reportApproval?.incoming?.pending?.count || 0;
    const outgoingPending = workflows?.reportApproval?.outgoing?.pending?.count || 0;
    return incomingPending + outgoingPending;
  }, [workflows?.reportApproval]);

  const reportNew = useMemo(() => {
    const incomingNew = workflows?.reportApproval?.incoming?.pending?.newCount || 0;
    const outgoingNew = workflows?.reportApproval?.outgoing?.pending?.newCount || 0;
    return incomingNew + outgoingNew;
  }, [workflows?.reportApproval]);

  const changePending = useMemo(() => {
    const incomingPending = workflows?.changeRequests?.incoming?.pending?.count || 0;
    const outgoingPending = workflows?.changeRequests?.outgoing?.pending?.count || 0;
    return incomingPending + outgoingPending;
  }, [workflows?.changeRequests]);

  const changeNew = useMemo(() => {
    const incomingNew = workflows?.changeRequests?.incoming?.pending?.newCount || 0;
    const outgoingNew = workflows?.changeRequests?.outgoing?.pending?.newCount || 0;
    return incomingNew + outgoingNew;
  }, [workflows?.changeRequests]);

  const temporaryReviewNew = temporary?.counts?.review?.newCount || 0;
  const temporaryCreatedNew = temporary?.counts?.created?.newCount || 0;

  const handleReportMarkRead = useCallback(() => {
    if (typeof markWorkflowSeen === 'function') markWorkflowSeen('report_approval');
  }, [markWorkflowSeen]);

  const handleChangeMarkRead = useCallback(() => {
    if (typeof markWorkflowSeen === 'function') markWorkflowSeen('change_requests');
  }, [markWorkflowSeen]);

  const handleTemporarySeen = useCallback(
    (scope) => {
      temporary?.markScopeSeen?.(scope);
    },
    [temporary?.markScopeSeen],
  );

  const handleLoadMoreTemporary = useCallback(
    (scope) => {
      const status = scope === 'review' ? 'pending' : 'any';
      const cursor = temporaryState?.[scope]?.cursor || 0;
      fetchTemporaryPage(scope, {
        cursor,
        append: true,
        status,
      });
    },
    [fetchTemporaryPage, temporaryState?.created?.cursor, temporaryState?.review?.cursor],
  );

  const openRequest = useCallback(
    (req, tab, statusOverride) => {
      const params = new URLSearchParams();
      params.set('tab', tab);
      const normalizedStatus = statusOverride
        ? String(statusOverride).trim().toLowerCase()
        : 'pending';
      if (normalizedStatus) params.set('status', normalizedStatus);
      if (req?.request_type) params.set('requestType', req.request_type);
      if (req?.table_name) params.set('table_name', req.table_name);
      const createdAt = req?.created_at || req?.createdAt;
      let createdDate = '';
      if (createdAt) {
        const parsed = new Date(createdAt);
        if (!Number.isNaN(parsed.getTime())) {
          createdDate = formatTimestamp(parsed).slice(0, 10);
        } else if (typeof createdAt === 'string') {
          const match = createdAt.match(/^(\d{4}-\d{2}-\d{2})/);
          if (match) {
            createdDate = match[1];
          }
        }
      }
      if (createdDate) {
        params.set('date_from', createdDate);
        params.set('date_to', createdDate);
      }
      params.set('requestId', req?.request_id);
      if (typeof markWorkflowSeen === 'function') {
        const workflowKey =
          req?.request_type === 'report_approval' ? 'report_approval' : 'change_requests';
        const scope = tab === 'incoming' ? 'incoming' : 'outgoing';
        markWorkflowSeen(workflowKey, scope, [normalizedStatus]);
      }
      navigate(`/requests?${params.toString()}`);
    },
    [markWorkflowSeen, navigate],
  );

  const openTemporary = useCallback(
    (scope, entry) => {
      handleTemporarySeen(scope);
      if (!entry) {
        navigate('/forms');
        return;
      }
      const params = new URLSearchParams();
      params.set('temporaryOpen', '1');
      if (scope) params.set('temporaryScope', scope);
      params.set('temporaryKey', String(Date.now()));
      const moduleKey = entry?.moduleKey || entry?.module_key || '';
      let path = '/forms';
      if (moduleKey) {
        params.set('temporaryModule', moduleKey);
        path = `/forms/${moduleKey.replace(/_/g, '-')}`;
      }
      const configName = entry?.configName || entry?.config_name || '';
      const formName = entry?.formName || entry?.form_name || configName;
      if (formName) params.set('temporaryForm', formName);
      if (configName && configName !== formName) {
        params.set('temporaryConfig', configName);
      }
      const tableName = entry?.tableName || entry?.table_name || '';
      if (tableName) params.set('temporaryTable', tableName);
      const idValue =
        entry?.id ?? entry?.temporary_id ?? entry?.temporaryId ?? null;
      if (idValue != null) params.set('temporaryId', String(idValue));
      navigate(`${path}?${params.toString()}`);
    },
    [handleTemporarySeen, navigate],
  );

  const normalizeRequestDate = useCallback(
    (date) => {
      if (!date) {
        return { key: 'unknown', label: t('temporary_date_unknown', 'Unknown'), value: 0 };
      }
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) {
        const str = typeof date === 'string' ? date : '';
        const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) {
          const label = match[1];
          return { key: label, label, value: new Date(label).getTime() || 0 };
        }
        return { key: 'unknown', label: t('temporary_date_unknown', 'Unknown'), value: 0 };
      }
      const label = formatTimestamp(parsed).slice(0, 10);
      return { key: label, label, value: parsed.getTime() };
    },
    [t],
  );

  const normalizeRequestType = (req) =>
    req?.request_type ? req.request_type.replace(/_/g, ' ') : t('request', 'request');

  const getRequester = (req) => req?.emp_name || req?.empid || req?.emp_id || '';

  const getResponder = (req) =>
    req?.response_empid || req?.responseEmpid || req?.response_emp_id || req?.responded_by || '';

  const normalizeRequestStatus = (req, fallback) => {
    const statusRaw = req?.status || req?.response_status || fallback;
    return statusRaw ? String(statusRaw).trim().toLowerCase() : fallback || 'pending';
  };

  const groupRequests = useCallback(
    (entries, { scope }) => {
      if (!Array.isArray(entries) || !entries.length) return [];
      const map = new Map();
      entries.forEach((req) => {
        if (!req) return;
        const type = normalizeRequestType(req);
        const requester = scope === 'response' ? getResponder(req) : getRequester(req);
        const status = scope === 'response' ? normalizeRequestStatus(req, 'pending') : 'pending';
        const dateValue =
          scope === 'response'
            ? req?.responded_at ||
              req?.respondedAt ||
              req?.updated_at ||
              req?.updatedAt ||
              req?.created_at
            : req?.created_at || req?.createdAt;
        const date = normalizeRequestDate(dateValue);
        const table = req?.table_name || '';
        const key = `${type}|${requester}|${date.key}|${status}|${table}`;
        const existing = map.get(key) || {
          type,
          requester,
          status,
          date,
          table,
          entries: [],
          latest: date.value,
        };
        existing.entries.push(req);
        existing.latest = Math.max(existing.latest, date.value);
        map.set(key, existing);
      });
      return Array.from(map.values()).sort((a, b) => b.latest - a.latest);
    },
    [normalizeRequestDate],
  );

  const renderGroupedRequest = (group, tab) => {
    const primary = group.entries[0];
    const summary = primary?.request_reason || primary?.notes || '';
    return (
      <li
        key={`${tab}-${group.type}-${group.requester}-${group.date.key}-${group.status}-${group.table}`}
        style={styles.listItem}
      >
        <div style={styles.listBody}>
          <div style={styles.listTitleRow}>
            <span style={styles.listTitle}>{group.type}</span>
            <span style={styles.groupCountBadge}>
              {t('notifications_group_count', 'Count')}: {group.entries.length}
            </span>
          </div>
          <div style={styles.listMeta}>
            {group.requester && (
              <span>
                {t('notifications_requested_by', 'Requested by')}: {group.requester}
              </span>
            )}
            {group.date?.label && (
              <span>
                {t('notifications_requested_at', 'Created')}: {group.date.label}
              </span>
            )}
            {group.table && (
              <span>
                {t('notifications_table', 'Table')}: {group.table}
              </span>
            )}
          </div>
          <div style={styles.listSummary}>
            {t(
              'notifications_group_summary',
              '{{count}} transactions grouped by user, type, date, and status',
              {
                count: group.entries.length,
              },
            )}
          </div>
          {summary && <div style={styles.listSummary}>{summary}</div>}
        </div>
        <button style={styles.listAction} onClick={() => openRequest(primary, tab, group.status)}>
          <NotificationDots
            colors={colorsForStatus(group.status || 'pending')}
            size="0.4rem"
            gap="0.12rem"
            marginRight="0.35rem"
          />
          {t('notifications_view_request', 'View request')}
        </button>
      </li>
    );
  };

  const getStatusPillStyle = useCallback((status) => {
    const base = {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '9999px',
      padding: '0.1rem 0.5rem',
      fontSize: '0.75rem',
      textTransform: 'capitalize',
    };
    if (status === 'accepted') {
      return { ...base, backgroundColor: '#dcfce7', color: '#166534' };
    }
    if (status === 'declined') {
      return { ...base, backgroundColor: '#fee2e2', color: '#991b1b' };
    }
    return { ...base, backgroundColor: '#e5e7eb', color: '#374151' };
  }, []);

  const renderGroupedResponse = (group) => {
    const primary = group.entries[0];
    const summary = primary?.response_notes || primary?.responseNotes || primary?.request_reason || '';
    return (
      <li
        key={`response-${group.type}-${group.requester}-${group.date.key}-${group.status}-${group.table}`}
        style={styles.listItem}
      >
        <div style={styles.listBody}>
          <div style={styles.listTitleRow}>
            <span style={styles.listTitle}>{group.type}</span>
            {group.status && <span style={getStatusPillStyle(group.status)}>{group.status}</span>}
            <span style={styles.groupCountBadge}>
              {t('notifications_group_count', 'Count')}: {group.entries.length}
            </span>
          </div>
          <div style={styles.listMeta}>
            {group.requester && (
              <span>
                {t('notifications_responder', 'Responder')}: {group.requester}
              </span>
            )}
            {group.date?.label && (
              <span>
                {t('notifications_responded_at', 'Responded')}: {group.date.label}
              </span>
            )}
            {group.table && (
              <span>
                {t('notifications_table', 'Table')}: {group.table}
              </span>
            )}
          </div>
          <div style={styles.listSummary}>
            {t(
              'notifications_group_summary',
              '{{count}} transactions grouped by user, type, date, and status',
              {
                count: group.entries.length,
              },
            )}
          </div>
          {summary && <div style={styles.listSummary}>{summary}</div>}
        </div>
        <button style={styles.listAction} onClick={() => openRequest(primary, 'outgoing', group.status)}>
          <NotificationDots
            colors={colorsForStatus(group.status || 'pending')}
            size="0.4rem"
            gap="0.12rem"
            marginRight="0.35rem"
          />
          {t('notifications_view_request', 'View request')}
        </button>
      </li>
    );
  };

  const combineResponses = useCallback((responses) => {
    if (!responses || typeof responses !== 'object') return [];
    const statuses = ['accepted', 'declined'];
    const seen = new Set();
    const list = [];
    statuses.forEach((status) => {
      const entries = Array.isArray(responses[status]) ? responses[status] : [];
      entries.forEach((entry) => {
        if (!entry) return;
        const normalizedStatus = entry.status
          ? String(entry.status).trim().toLowerCase()
          : status;
        const key = `${entry.request_id || ''}-${normalizedStatus}`;
        if (seen.has(key)) return;
        seen.add(key);
        list.push({ ...entry, status: normalizedStatus });
      });
    });
    list.sort((a, b) => {
      const aTime = new Date(
        a?.responded_at ||
          a?.respondedAt ||
          a?.updated_at ||
          a?.updatedAt ||
          a?.created_at ||
          a?.createdAt ||
          0,
      ).getTime();
      const bTime = new Date(
        b?.responded_at ||
          b?.respondedAt ||
          b?.updated_at ||
          b?.updatedAt ||
          b?.created_at ||
          b?.createdAt ||
          0,
      ).getTime();
      return bTime - aTime;
    });
    return list;
  }, []);

  const reportResponses = useMemo(
    () => combineResponses(reportState.responses),
    [combineResponses, reportState.responses],
  );

  const reportIncomingGroups = useMemo(
    () => groupRequests(reportState.incoming, { scope: 'request' }),
    [groupRequests, reportState.incoming],
  );

  const reportOutgoingGroups = useMemo(
    () => groupRequests(reportState.outgoing, { scope: 'request' }),
    [groupRequests, reportState.outgoing],
  );

  const reportResponseGroups = useMemo(
    () => groupRequests(reportResponses, { scope: 'response' }),
    [groupRequests, reportResponses],
  );

  const changeResponses = useMemo(
    () => combineResponses(changeState.responses),
    [combineResponses, changeState.responses],
  );

  const changeIncomingGroups = useMemo(
    () => groupRequests(changeState.incoming, { scope: 'request' }),
    [groupRequests, changeState.incoming],
  );

  const changeOutgoingGroups = useMemo(
    () => groupRequests(changeState.outgoing, { scope: 'request' }),
    [groupRequests, changeState.outgoing],
  );

  const changeResponseGroups = useMemo(
    () => groupRequests(changeResponses, { scope: 'response' }),
    [groupRequests, changeResponses],
  );

  const normalizeTemporaryStatus = useCallback(
    (entry) => {
      const statusRaw = entry?.status ? String(entry.status).trim().toLowerCase() : '';
      const isPending = statusRaw === 'pending' || statusRaw === '';
      const statusLabel = isPending
        ? t('temporary_pending_status', 'Pending')
        : statusRaw === 'promoted'
        ? t('temporary_promoted_short', 'Promoted')
        : statusRaw === 'rejected'
        ? t('temporary_rejected_short', 'Rejected')
        : entry?.status || '-';
      const statusColor = statusRaw === 'rejected'
        ? '#b91c1c'
        : statusRaw === 'promoted'
        ? '#15803d'
        : '#1f2937';
      return { statusRaw, isPending, statusLabel, statusColor };
    },
    [t],
  );

  const getTemporaryUser = useCallback(
    (entry) =>
      entry?.createdBy ||
      entry?.created_by ||
      entry?.emp_name ||
      entry?.empid ||
      t('notifications_unknown_user', 'Unknown user'),
    [t],
  );

  const getTemporaryTransactionType = useCallback(
    (entry) =>
      entry?.transactionType ||
      entry?.transaction_type ||
      entry?.formLabel ||
      entry?.formName ||
      entry?.tableName ||
      entry?.moduleKey ||
      entry?.module_key ||
      t('notifications_unknown_type', 'Other transaction'),
    [t],
  );

  const getTemporaryDate = useCallback(
    (entry) => {
      const rawDate =
        entry?.createdAt || entry?.created_at || entry?.updatedAt || entry?.updated_at || null;
      if (!rawDate) {
        return { key: 'unknown-date', label: t('notifications_unknown_date', 'Unknown date'), value: 0 };
      }
      const dateObj = new Date(rawDate);
      if (Number.isNaN(dateObj.getTime())) {
        return { key: 'unknown-date', label: t('notifications_unknown_date', 'Unknown date'), value: 0 };
      }
      return {
        key: dateObj.toISOString().slice(0, 10),
        label: formatTimestamp(rawDate),
        value: dateObj.getTime(),
      };
    },
    [t],
  );

  const groupTemporaryEntries = useMemo(() => {
    const cache = new WeakMap();
    const shouldProfile = process.env.NODE_ENV !== 'production';
    return (entries, scope = 'unknown') => {
      if (!Array.isArray(entries)) return [];
      const cached = cache.get(entries);
      if (cached) return cached;
      const label = `groupTemporaryEntries:${scope}:${entries.length}`;
      if (shouldProfile && typeof console?.time === 'function') console.time(label);
      const buckets = [];
      const bucketMap = new Map();
      entries.forEach((entry) => {
        const user = getTemporaryUser(entry);
        const type = getTemporaryTransactionType(entry);
        const dateInfo = getTemporaryDate(entry);
        const { statusRaw, statusLabel, statusColor } = normalizeTemporaryStatus(entry);
        const statusKey = statusRaw || 'pending';
        const groupKey = `${user}|${type}|${dateInfo.key}|${statusKey}`;
        let bucket = bucketMap.get(groupKey);
        if (!bucket) {
          bucket = {
            user,
            transactionType: type,
            dateLabel: dateInfo.label,
            dateKey: dateInfo.key,
            statusLabel,
            statusColor,
            statusKey,
            entries: [],
            latest: dateInfo.value,
          };
          bucketMap.set(groupKey, bucket);
          buckets.push(bucket);
        }
        bucket.entries.push(entry);
        bucket.latest = Math.max(bucket.latest, dateInfo.value);
      });
      buckets.sort((a, b) => b.latest - a.latest);
      cache.set(entries, buckets);
      if (shouldProfile && typeof console?.timeEnd === 'function') console.timeEnd(label);
      return buckets;
    };
  }, [getTemporaryDate, getTemporaryTransactionType, getTemporaryUser, normalizeTemporaryStatus]);

  const groupedTemporary = useMemo(
    () => ({
      review:
        temporaryState.review.groups?.length > 0
          ? temporaryState.review.groups
          : groupTemporaryEntries(temporaryState.review.entries),
      created:
        temporaryState.created.groups?.length > 0
          ? temporaryState.created.groups
          : groupTemporaryEntries(temporaryState.created.entries),
    }),
    [
      groupTemporaryEntries,
      temporaryState.created.entries,
      temporaryState.created.groups,
      temporaryState.review.entries,
      temporaryState.review.groups,
    ],
  );

  const temporaryReviewTotal = temporaryReviewPending;

  const temporaryCreatedTotal = temporaryCreatedPending;

  const notificationTrailColors = useMemo(() => {
    if (notificationColors?.length) return notificationColors;
    const hasNewCounts =
      reportNew > 0 ||
      changeNew > 0 ||
      temporaryReviewNew > 0 ||
      temporaryCreatedNew > 0;
    if (hasNewCounts) return [DEFAULT_NOTIFICATION_COLOR];
    return [];
  }, [
    changeNew,
    notificationColors,
    reportNew,
    temporaryCreatedNew,
    temporaryReviewNew,
  ]);

  const colorsForStatus = useCallback(
    (status) => {
      const key = status ? String(status).trim().toLowerCase() : 'pending';
      return [STATUS_COLORS[key] || DEFAULT_NOTIFICATION_COLOR];
    },
    [],
  );

  const renderTemporaryGroup = (group, scope) => (
    <li
      key={`${scope}-${group.statusKey}-${group.user}-${group.transactionType}-${group.dateKey}`}
      style={styles.listItem}
    >
      <div style={styles.listBody}>
        <div style={styles.listTitleRow}>
          <span style={styles.listTitle}>{group.transactionType}</span>
          <span style={styles.groupCountBadge}>
            {t('notifications_group_count', 'Count')}: {group.count || group.entries.length}
          </span>
        </div>
        <div style={styles.listMeta}>
          {group.user && (
            <span>
              {t('notifications_created_by', 'Created by')}: {group.user}
            </span>
          )}
          {group.dateLabel && (
            <span>
              {t('temporary_date', 'Date')}: {group.dateLabel}
            </span>
          )}
          {group.statusLabel && (
            <span style={{ color: group.statusColor }}>
              {t('status', 'Status')}: {group.statusLabel}
            </span>
          )}
        </div>
        <div style={styles.listSummary}>
          {t('notifications_group_summary', '{{count}} transactions grouped by user, type, date, and status', {
            count: group.entries.length,
          })}
        </div>
      </div>
      <button
        style={styles.listAction}
        onClick={() => openTemporary(scope, group.sampleEntry || group.entries?.[0])}
      >
        <NotificationDots
          colors={colorsForStatus(group.statusKey || group.statusLabel || 'pending')}
          size="0.4rem"
          gap="0.12rem"
          marginRight="0.35rem"
        />
        {t('notifications_open_group_forms', 'Open forms')}
      </button>
    </li>
  );

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>
        {t('notifications', 'Notifications')}{' '}
        <NotificationDots
          colors={notificationTrailColors}
          size="0.55rem"
          gap="0.2rem"
          marginRight={0}
        />
      </h1>

      <section style={styles.section}>
        <header style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>
              {t('notifications_transactions_heading', 'Transaction notifications')}
            </h2>
            <p style={styles.sectionSubtitle}>
              {t('notifications_transactions_summary', '{{count}} total · {{new}} new', {
                count: transactionNotifications.length,
                new: transactionUnreadCount,
              })}
            </p>
          </div>
        </header>
        {transactionNotifications.length === 0 ? (
          <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
        ) : (
          <div style={styles.transactionGroups}>
            {transactionGroups.map((group) => {
              const latest = group.entries[0];
              const groupId = makeGroupId(group.name);
              const isHighlighted =
                highlightTransactionName &&
                group.name.toLowerCase() === highlightTransactionName.toLowerCase();
              return (
                <div
                  key={group.name}
                  id={groupId}
                  style={{
                    ...styles.transactionGroup,
                    ...(isHighlighted ? styles.transactionGroupHighlight : {}),
                  }}
                >
                  <div style={styles.transactionGroupHeader}>
                    <div>
                      <h3 style={styles.transactionGroupTitle}>{group.name}</h3>
                      <p style={styles.transactionGroupMeta}>
                        {t('notifications_group_count', 'Count')}: {group.entries.length}
                        {latest?.created_at && (
                          <span style={styles.transactionGroupTime}>
                            {formatTimestamp(latest.created_at)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <ul style={styles.transactionList}>
                    {group.entries.map((entry) => (
                      <li key={entry.notification_id} style={styles.transactionItem}>
                        <button
                          type="button"
                          style={styles.transactionEntry(entry.is_read)}
                          onClick={() => markTransactionRead(entry.notification_id)}
                        >
                          <div style={styles.transactionEntryHeader}>
                            <span>{entry.message}</span>
                            <span style={styles.transactionEntryTime}>
                              {formatTimestamp(entry.created_at)}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {transactionHasMore && (
          <button
            type="button"
            style={styles.loadMoreButton}
            onClick={loadMoreTransactions}
            disabled={transactionLoading}
          >
            {transactionLoading
              ? t('loading', 'Loading')
              : t('notifications_load_more', 'Load more')}
          </button>
        )}
      </section>

      <section style={styles.section}>
        <header style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>{t('notifications_report_heading', 'Report approvals')}</h2>
            <p style={styles.sectionSubtitle}>
              {t('notifications_report_summary', '{{pending}} pending · {{new}} new', {
                pending: reportPending,
                new: reportNew,
              })}
            </p>
          </div>
          <button
            type="button"
            style={styles.sectionAction}
            onClick={handleReportMarkRead}
            disabled={reportNew === 0}
          >
            {t('notifications_mark_read', 'Mark as read')}
          </button>
        </header>
        {reportState.loading ? (
          <p>{t('loading', 'Loading')}...</p>
        ) : reportState.error ? (
          <p style={styles.errorText}>{reportState.error}</p>
        ) : (
          <div style={styles.columnLayout}>
            <div style={styles.column}>
              <h3 style={styles.columnTitle}>{t('notifications_incoming', 'Incoming')}</h3>
              {reportIncomingGroups.length === 0 ? (
                <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
              ) : (
                <ul style={styles.list}>
                  {reportIncomingGroups.map((group) => renderGroupedRequest(group, 'incoming'))}
                </ul>
              )}
            </div>
            <div style={styles.column}>
              <h3 style={styles.columnTitle}>{t('notifications_outgoing', 'Outgoing')}</h3>
              <div style={styles.subSection}>
                <h4 style={styles.subSectionTitle}>
                  {t('notifications_requests_section', 'Requests')}
                </h4>
                {reportOutgoingGroups.length === 0 ? (
                  <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
                ) : (
                  <ul style={styles.list}>
                    {reportOutgoingGroups.map((group) =>
                      renderGroupedRequest(group, 'outgoing'),
                    )}
                  </ul>
                )}
              </div>
              <div style={styles.subSection}>
                <h4 style={styles.subSectionTitle}>
                  {t('notifications_responses_section', 'Responses')}
                </h4>
                {reportResponseGroups.length === 0 ? (
                  <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
                ) : (
                  <ul style={styles.list}>
                    {reportResponseGroups.map((group) => renderGroupedResponse(group))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section style={styles.section}>
        <header style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>{t('notifications_change_heading', 'Change requests')}</h2>
            <p style={styles.sectionSubtitle}>
              {t('notifications_change_summary', '{{pending}} pending · {{new}} new', {
                pending: changePending,
                new: changeNew,
              })}
            </p>
          </div>
          <button
            type="button"
            style={styles.sectionAction}
            onClick={handleChangeMarkRead}
            disabled={changeNew === 0}
          >
            {t('notifications_mark_read', 'Mark as read')}
          </button>
        </header>
        {changeState.loading ? (
          <p>{t('loading', 'Loading')}...</p>
        ) : changeState.error ? (
          <p style={styles.errorText}>{changeState.error}</p>
        ) : (
          <div style={styles.columnLayout}>
            <div style={styles.column}>
              <h3 style={styles.columnTitle}>{t('notifications_incoming', 'Incoming')}</h3>
              {changeIncomingGroups.length === 0 ? (
                <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
              ) : (
                <ul style={styles.list}>
                  {changeIncomingGroups.map((group) => renderGroupedRequest(group, 'incoming'))}
                </ul>
              )}
            </div>
            <div style={styles.column}>
              <h3 style={styles.columnTitle}>{t('notifications_outgoing', 'Outgoing')}</h3>
              <div style={styles.subSection}>
                <h4 style={styles.subSectionTitle}>
                  {t('notifications_requests_section', 'Requests')}
                </h4>
                {changeOutgoingGroups.length === 0 ? (
                  <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
                ) : (
                  <ul style={styles.list}>
                    {changeOutgoingGroups.map((group) =>
                      renderGroupedRequest(group, 'outgoing'),
                    )}
                  </ul>
                )}
              </div>
              <div style={styles.subSection}>
                <h4 style={styles.subSectionTitle}>
                  {t('notifications_responses_section', 'Responses')}
                </h4>
                {changeResponseGroups.length === 0 ? (
                  <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
                ) : (
                  <ul style={styles.list}>
                    {changeResponseGroups.map((group) => renderGroupedResponse(group))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section style={styles.section}>
        <header style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>{t('notifications_temporary_heading', 'Temporary transactions')}</h2>
            <p style={styles.sectionSubtitle}>
              {t('notifications_temporary_summary', 'Review {{review}} · Drafts {{created}}', {
                review: temporaryReviewTotal,
                created: temporaryCreatedTotal,
              })}
            </p>
          </div>
          <div style={styles.sectionActionsGroup}>
            <button
              type="button"
              style={styles.sectionAction}
              onClick={() => handleTemporarySeen('review')}
              disabled={temporaryReviewNew === 0}
            >
              {t('notifications_review_read', 'Mark review read')}
            </button>
            <button
              type="button"
              style={styles.sectionAction}
              onClick={() => handleTemporarySeen('created')}
              disabled={temporaryCreatedNew === 0}
            >
              {t('notifications_created_read', 'Mark drafts read')}
            </button>
          </div>
        </header>
        {temporaryState.loading ? (
          <p>{t('loading', 'Loading')}...</p>
        ) : temporaryState.error ? (
          <p style={styles.errorText}>{temporaryState.error}</p>
        ) : (
          <div style={styles.columnLayout}>
            <div style={styles.column}>
              <h3 style={styles.columnTitle}>{t('notifications_review_queue', 'Review queue')}</h3>
              {groupedTemporary.review.length === 0 ? (
                <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
              ) : (
                <ul style={styles.list}>
                  {groupedTemporary.review.map((group) => renderTemporaryGroup(group, 'review'))}
                </ul>
              )}
              {temporaryState.review.hasMore && (
                <button
                  type="button"
                  style={styles.listAction}
                  onClick={() => handleLoadMoreTemporary('review')}
                  disabled={temporaryState.review.loading}
                >
                  {temporaryState.review.loading
                    ? t('loading', 'Loading')
                    : t('notifications_load_more', 'Load more')}
                </button>
              )}
              <button
                style={styles.listAction}
                onClick={() =>
                  openTemporary(
                    'review',
                    groupedTemporary.review[0]?.sampleEntry ||
                      groupedTemporary.review[0]?.entries?.[0],
                  )
                }
              >
                <NotificationDots
                  colors={notificationTrailColors}
                  size="0.4rem"
                  gap="0.12rem"
                  marginRight="0.35rem"
                />
                {t('notifications_open_review', 'Open review workspace')}
              </button>
            </div>
            <div style={styles.column}>
              <h3 style={styles.columnTitle}>{t('notifications_my_drafts', 'My drafts')}</h3>
              {groupedTemporary.created.length === 0 ? (
                <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
              ) : (
                <ul style={styles.list}>
                  {groupedTemporary.created.map((group) => renderTemporaryGroup(group, 'created'))}
                </ul>
              )}
              {temporaryState.created.hasMore && (
                <button
                  type="button"
                  style={styles.listAction}
                  onClick={() => handleLoadMoreTemporary('created')}
                  disabled={temporaryState.created.loading}
                >
                  {temporaryState.created.loading
                    ? t('loading', 'Loading')
                    : t('notifications_load_more', 'Load more')}
                </button>
              )}
              <button
                style={styles.listAction}
                onClick={() =>
                  openTemporary(
                    'created',
                    groupedTemporary.created[0]?.sampleEntry ||
                      groupedTemporary.created[0]?.entries?.[0],
                  )
                }
              >
                <NotificationDots
                  colors={notificationTrailColors}
                  size="0.4rem"
                  gap="0.12rem"
                  marginRight="0.35rem"
                />
                {t('notifications_open_drafts', 'Open drafts workspace')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const styles = {
  page: {
    padding: '1.5rem 2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  pageTitle: {
    fontSize: '1.75rem',
    margin: 0,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '0.75rem',
    padding: '1.25rem',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1rem',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1.25rem',
  },
  sectionSubtitle: {
    margin: 0,
    color: '#4b5563',
    fontSize: '0.95rem',
  },
  sectionAction: {
    backgroundColor: '#1f2937',
    color: '#fff',
    border: 'none',
    borderRadius: '9999px',
    padding: '0.4rem 0.9rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  sectionActionsGroup: {
    display: 'flex',
    gap: '0.5rem',
  },
  columnLayout: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  column: {
    flex: '1 1 320px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  columnTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  nestedList: {
    listStyle: 'none',
    margin: '0.5rem 0 0',
    paddingLeft: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  listSummaryNotes: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    backgroundColor: '#f9fafb',
    borderRadius: '0.5rem',
    fontSize: '0.85rem',
    color: '#1f2937',
    whiteSpace: 'pre-wrap',
  },
  listSummaryNotesText: {
    display: 'block',
    marginTop: '0.25rem',
    whiteSpace: 'pre-wrap',
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.75rem',
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    backgroundColor: '#f9fafb',
  },
  listBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  listTitleRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  listTitle: {
    fontWeight: 600,
    textTransform: 'capitalize',
  },
  listMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    color: '#4b5563',
    fontSize: '0.85rem',
  },
  groupCountBadge: {
    backgroundColor: '#e5e7eb',
    color: '#1f2937',
    borderRadius: '9999px',
    padding: '0.15rem 0.65rem',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  listSummary: {
    color: '#1f2937',
    fontSize: '0.9rem',
    whiteSpace: 'pre-line',
  },
  listAction: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    cursor: 'pointer',
    flexShrink: 0,
    fontSize: '0.85rem',
  },
  emptyText: {
    color: '#6b7280',
    fontStyle: 'italic',
  },
  errorText: {
    color: '#dc2626',
  },
  subSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  subSectionTitle: {
    margin: 0,
    fontSize: '0.9rem',
    fontWeight: 600,
  },
  transactionGroups: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  transactionGroup: {
    border: '1px solid #e5e7eb',
    borderRadius: '0.75rem',
    padding: '0.75rem',
    backgroundColor: '#f9fafb',
  },
  transactionGroupHighlight: {
    borderColor: '#2563eb',
    boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)',
  },
  transactionGroupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  transactionGroupTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
  },
  transactionGroupMeta: {
    margin: 0,
    color: '#4b5563',
    fontSize: '0.85rem',
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  transactionGroupTime: {
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  transactionList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  transactionItem: {
    borderRadius: '0.5rem',
    overflow: 'hidden',
  },
  transactionEntry: (isRead) => ({
    width: '100%',
    textAlign: 'left',
    padding: '0.65rem 0.75rem',
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    backgroundColor: isRead ? '#fff' : '#eff6ff',
    cursor: 'pointer',
  }),
  transactionEntryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '0.9rem',
  },
  transactionEntryTime: {
    fontSize: '0.75rem',
    color: '#6b7280',
    whiteSpace: 'nowrap',
  },
  loadMoreButton: {
    marginTop: '0.75rem',
    backgroundColor: '#f3f4f6',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.6rem 1rem',
    cursor: 'pointer',
    fontWeight: 600,
    color: '#1f2937',
  },
};
