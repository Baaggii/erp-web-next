import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import LangContext from '../context/I18nContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

const SECTION_LIMIT = 5;

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

export default function NotificationsPage() {
  const { workflows, markWorkflowSeen, temporary } = usePendingRequests();
  const { user, session } = useAuth();
  const { t } = useContext(LangContext);
  const navigate = useNavigate();
  const [reportState, setReportState] = useState({
    incoming: [],
    outgoing: [],
    loading: true,
    error: '',
  });
  const [changeState, setChangeState] = useState({
    incoming: [],
    outgoing: [],
    loading: true,
    error: '',
  });
  const [temporaryState, setTemporaryState] = useState({
    loading: true,
    error: '',
    review: [],
    created: [],
  });

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

  const fetchRequests = useCallback(
    async (types) => {
      const incomingLists = [];
      const outgoingLists = [];
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
              status: 'pending',
              request_type: type,
              per_page: String(SECTION_LIMIT),
              page: '1',
            });
            const res = await fetch(`/api/pending_request/outgoing?${params.toString()}`, {
              credentials: 'include',
              skipLoader: true,
            });
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              const rows = Array.isArray(data?.rows) ? data.rows : [];
              outgoingLists.push(
                rows.map((row) => ({ ...row, request_type: row.request_type || type })),
              );
            }
          } catch {
            // ignore
          }
        }),
      );

      const incoming = dedupeRequests(incomingLists.flat()).slice(0, SECTION_LIMIT);
      const outgoing = dedupeRequests(outgoingLists.flat()).slice(0, SECTION_LIMIT);
      return { incoming, outgoing };
    },
    [supervisorIds],
  );

  useEffect(() => {
    let cancelled = false;
    setReportState((prev) => ({ ...prev, loading: true, error: '' }));
    fetchRequests(['report_approval'])
      .then((data) => {
        if (!cancelled) setReportState({ ...data, loading: false, error: '' });
      })
      .catch(() => {
        if (!cancelled)
          setReportState((prev) => ({
            ...prev,
            loading: false,
            incoming: [],
            outgoing: [],
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
  ]);

  useEffect(() => {
    let cancelled = false;
    setChangeState((prev) => ({ ...prev, loading: true, error: '' }));
    fetchRequests(['edit', 'delete'])
      .then((data) => {
        if (!cancelled) setChangeState({ ...data, loading: false, error: '' });
      })
      .catch(() => {
        if (!cancelled)
          setChangeState((prev) => ({
            ...prev,
            loading: false,
            incoming: [],
            outgoing: [],
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
  ]);

  const temporaryReviewCount = Number(temporary?.counts?.review?.count) || 0;
  const temporaryCreatedCount = Number(temporary?.counts?.created?.count) || 0;
  const temporaryFetchScopeEntries = temporary?.fetchScopeEntries;

  useEffect(() => {
    if (typeof temporaryFetchScopeEntries !== 'function') return undefined;
    let cancelled = false;
    setTemporaryState((prev) => ({ ...prev, loading: true, error: '' }));
    const reviewPromise = temporaryFetchScopeEntries('review', SECTION_LIMIT);
    const createdPromise = temporaryFetchScopeEntries('created', SECTION_LIMIT);
    Promise.all([reviewPromise, createdPromise])
      .then(([review, created]) => {
        if (!cancelled) {
          setTemporaryState({
            loading: false,
            error: '',
            review: Array.isArray(review) ? review : [],
            created: Array.isArray(created) ? created : [],
          });
        }
      })
      .catch(() => {
        if (!cancelled)
          setTemporaryState({
            loading: false,
            error: t('notifications_temporary_error', 'Failed to load temporary submissions'),
            review: [],
            created: [],
          });
      });
    return () => {
      cancelled = true;
    };
  }, [
    t,
    temporaryReviewCount,
    temporaryCreatedCount,
    temporaryFetchScopeEntries,
  ]);

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

  const openRequest = useCallback(
    (req, tab) => {
      const params = new URLSearchParams();
      params.set('tab', tab);
      params.set('status', 'pending');
      if (req?.request_type) params.set('requestType', req.request_type);
      if (req?.table_name) params.set('table_name', req.table_name);
      params.set('requestId', req?.request_id);
      navigate(`/requests?${params.toString()}`);
    },
    [navigate],
  );

  const openTemporary = useCallback(
    (scope) => {
      handleTemporarySeen(scope);
      navigate('/forms');
    },
    [handleTemporarySeen, navigate],
  );

  const renderRequestItem = (req, tab) => {
    const created = req?.created_at || req?.createdAt;
    const requester = req?.emp_name || req?.empid || req?.emp_id;
    const summary = req?.request_reason || req?.notes || '';
    return (
      <li key={req.request_id} style={styles.listItem}>
        <div style={styles.listBody}>
          <div style={styles.listTitle}>
            {req.request_type ? req.request_type.replace(/_/g, ' ') : 'request'}
          </div>
          <div style={styles.listMeta}>
            {requester && (
              <span>
                {t('notifications_requested_by', 'Requested by')}: {requester}
              </span>
            )}
            {created && (
              <span>
                {t('notifications_requested_at', 'Created')}: {formatTimestamp(created)}
              </span>
            )}
            {req.table_name && (
              <span>
                {t('notifications_table', 'Table')}: {req.table_name}
              </span>
            )}
          </div>
          {summary && <div style={styles.listSummary}>{summary}</div>}
        </div>
        <button style={styles.listAction} onClick={() => openRequest(req, tab)}>
          {t('notifications_view_request', 'View request')}
        </button>
      </li>
    );
  };

  const renderTemporaryItem = (entry, scope) => (
    <li key={`${scope}-${entry.id}`} style={styles.listItem}>
      <div style={styles.listBody}>
        <div style={styles.listTitle}>{entry.formName || entry.tableName || entry.id}</div>
        <div style={styles.listMeta}>
          {entry.createdBy && (
            <span>
              {t('notifications_created_by', 'Created by')}: {entry.createdBy}
            </span>
          )}
          {entry.createdAt && (
            <span>
              {t('notifications_created_at', 'Created')}: {formatTimestamp(entry.createdAt)}
            </span>
          )}
          {entry.status && (
            <span>
              {t('status', 'Status')}: {entry.status}
            </span>
          )}
        </div>
      </div>
      <button style={styles.listAction} onClick={() => openTemporary(scope)}>
        {t('notifications_open_form', 'Open forms')}
      </button>
    </li>
  );

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>{t('notifications', 'Notifications')}</h1>

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
              {reportState.incoming.length === 0 ? (
                <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
              ) : (
                <ul style={styles.list}>
                  {reportState.incoming.map((req) => renderRequestItem(req, 'incoming'))}
                </ul>
              )}
            </div>
            <div style={styles.column}>
              <h3 style={styles.columnTitle}>{t('notifications_outgoing', 'Outgoing')}</h3>
              {reportState.outgoing.length === 0 ? (
                <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
              ) : (
                <ul style={styles.list}>
                  {reportState.outgoing.map((req) => renderRequestItem(req, 'outgoing'))}
                </ul>
              )}
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
              {changeState.incoming.length === 0 ? (
                <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
              ) : (
                <ul style={styles.list}>
                  {changeState.incoming.map((req) => renderRequestItem(req, 'incoming'))}
                </ul>
              )}
            </div>
            <div style={styles.column}>
              <h3 style={styles.columnTitle}>{t('notifications_outgoing', 'Outgoing')}</h3>
              {changeState.outgoing.length === 0 ? (
                <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
              ) : (
                <ul style={styles.list}>
                  {changeState.outgoing.map((req) => renderRequestItem(req, 'outgoing'))}
                </ul>
              )}
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
                review: temporary?.counts?.review?.count || 0,
                created: temporary?.counts?.created?.count || 0,
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
              {temporaryState.review.length === 0 ? (
                <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
              ) : (
                <ul style={styles.list}>
                  {temporaryState.review.map((entry) => renderTemporaryItem(entry, 'review'))}
                </ul>
              )}
              <button style={styles.listAction} onClick={() => openTemporary('review')}>
                {t('notifications_open_review', 'Open review workspace')}
              </button>
            </div>
            <div style={styles.column}>
              <h3 style={styles.columnTitle}>{t('notifications_my_drafts', 'My drafts')}</h3>
              {temporaryState.created.length === 0 ? (
                <p style={styles.emptyText}>{t('notifications_none', 'No notifications')}</p>
              ) : (
                <ul style={styles.list}>
                  {temporaryState.created.map((entry) => renderTemporaryItem(entry, 'created'))}
                </ul>
              )}
              <button style={styles.listAction} onClick={() => openTemporary('created')}>
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
};
