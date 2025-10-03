// src/erp.mgt.mn/pages/Requests.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { diff } from 'jsondiffpatch';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { debugLog } from '../utils/debug.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import { translateToMn } from '../utils/translateToMn.js';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import { useSearchParams } from 'react-router-dom';
import DateRangePicker from '../components/DateRangePicker.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

function ch(n) {
  return Math.round(n * 8);
}

const MAX_WIDTH = ch(40);

const REQUEST_TYPE_LABELS = {
  changes: 'All change requests',
  edit: 'Edit Request',
  delete: 'Delete Request',
  report_approval: 'Report Approval',
  temporary_insert: 'Temporary Transaction',
};

const STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
};

const VIEW_CONFIG = {
  changes: {
    key: 'changes',
    label: 'Change Requests',
    defaultRequestType: 'changes',
    requestTypeOptions: ['changes', 'edit', 'delete'],
    showRequesterFilter: true,
    showTableFilter: true,
    lockRequestType: false,
    defaultPerPage: 5,
    renderMode: 'diff',
  },
  report_approval: {
    key: 'report_approval',
    label: 'Report Approvals',
    defaultRequestType: 'report_approval',
    requestTypeOptions: ['report_approval'],
    showRequesterFilter: true,
    showTableFilter: false,
    lockRequestType: true,
    defaultPerPage: 5,
    renderMode: 'report',
  },
  temporary_insert: {
    key: 'temporary_insert',
    label: 'Temporary Transactions',
    defaultRequestType: 'temporary_insert',
    requestTypeOptions: ['temporary_insert'],
    showRequesterFilter: true,
    showTableFilter: true,
    lockRequestType: true,
    defaultPerPage: 5,
    renderMode: 'temporary',
  },
};

function getRequestTypeOptions(config) {
  return config.requestTypeOptions.map((value) => ({
    value,
    label: REQUEST_TYPE_LABELS[value] || value,
  }));
}

function createViewState(config, { today, initialStatus }) {
  const safeToday = today || formatTimestamp(new Date()).slice(0, 10);
  const status = initialStatus ?? 'pending';
  return {
    filters: {
      requestedEmpid: '',
      tableName: '',
      status,
      dateFrom: safeToday,
      dateTo: safeToday,
      requestType: config.defaultRequestType,
      dateField: 'created',
    },
    perPage: config.defaultPerPage ?? 5,
    incoming: {
      data: [],
      loading: false,
      error: null,
      page: 1,
      total: 0,
      reloadKey: 0,
    },
    outgoing: {
      data: [],
      loading: false,
      error: null,
      page: 1,
      total: 0,
      reloadKey: 0,
    },
  };
}

function renderValue(val) {
  const style = { whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
  if (typeof val === 'object' && val !== null) {
    return (
      <pre style={{ ...style, margin: 0 }}>
        {JSON.stringify(val, null, 2)}
      </pre>
    );
  }
  if (
    typeof val === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)
  ) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      val = formatTimestamp(d);
    }
  }
  return <span style={style}>{String(val ?? '')}</span>;
}

function normalizeEmpId(id) {
  return String(id ?? '')
    .trim()
    .toLowerCase()
    .replace(/^0+/, '');
}

export default function RequestsPage() {
  const { user, session } = useAuth();
  const { categories, order } = usePendingRequests();

  const seniorEmpId =
    session && user?.empid && !(Number(session.senior_empid) > 0)
      ? user.empid
      : null;

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const initialStatus = searchParams.get('status');
  const initialViewParam = searchParams.get('view');

  const [activeTab, setActiveTab] = useState(
    initialTab === 'incoming' ? 'incoming' : 'outgoing',
  );

  const availableViewKeys = useMemo(
    () => order.filter((key) => categories?.[key] && VIEW_CONFIG[key]),
    [order, categories],
  );

  const defaultViewKey = useMemo(() => {
    if (initialViewParam && availableViewKeys.includes(initialViewParam)) {
      return initialViewParam;
    }
    if (availableViewKeys.length) return availableViewKeys[0];
    return 'changes';
  }, [initialViewParam, availableViewKeys]);

  const [activeView, setActiveView] = useState(defaultViewKey);

  const todayStr = useMemo(
    () => formatTimestamp(new Date()).slice(0, 10),
    [],
  );

  const [viewState, setViewState] = useState(() => {
    const initial = {};
    Object.values(VIEW_CONFIG).forEach((config) => {
      initial[config.key] = createViewState(config, {
        today: todayStr,
        initialStatus: initialStatus || 'pending',
      });
    });
    return initial;
  });

  useEffect(() => {
    if (
      availableViewKeys.length &&
      !availableViewKeys.includes(activeView)
    ) {
      setActiveView(availableViewKeys[0]);
    }
  }, [availableViewKeys, activeView]);

  useEffect(() => {
    if (!viewState[activeView] && VIEW_CONFIG[activeView]) {
      setViewState((prev) => ({
        ...prev,
        [activeView]: createViewState(VIEW_CONFIG[activeView], {
          today: todayStr,
          initialStatus: initialStatus || 'pending',
        }),
      }));
    }
  }, [activeView, initialStatus, todayStr, viewState]);

  const updateFilters = useCallback((viewKey, changes) => {
    setViewState((prev) => {
      const current = prev[viewKey];
      if (!current) return prev;
      const nextFilters =
        typeof changes === 'function'
          ? changes(current.filters)
          : { ...current.filters, ...changes };
      let changed = false;
      for (const key of Object.keys(nextFilters)) {
        if (nextFilters[key] !== current.filters[key]) {
          changed = true;
          break;
        }
      }
      if (!changed) return prev;
      return {
        ...prev,
        [viewKey]: {
          ...current,
          filters: nextFilters,
          incoming: { ...current.incoming, page: 1 },
          outgoing: { ...current.outgoing, page: 1 },
        },
      };
    });
  }, []);

  const updatePerPage = useCallback((viewKey, value) => {
    setViewState((prev) => {
      const current = prev[viewKey];
      if (!current) return prev;
      if (current.perPage === value) return prev;
      return {
        ...prev,
        [viewKey]: {
          ...current,
          perPage: value,
          incoming: { ...current.incoming, page: 1 },
          outgoing: { ...current.outgoing, page: 1 },
        },
      };
    });
  }, []);

  const triggerReload = useCallback((viewKey, direction) => {
    setViewState((prev) => {
      const current = prev[viewKey];
      if (!current) return prev;
      return {
        ...prev,
        [viewKey]: {
          ...current,
          [direction]: {
            ...current[direction],
            reloadKey: current[direction].reloadKey + 1,
          },
        },
      };
    });
  }, []);

  const setPageFor = useCallback((viewKey, direction, page) => {
    setViewState((prev) => {
      const current = prev[viewKey];
      if (!current) return prev;
      if (current[direction].page === page) return prev;
      return {
        ...prev,
        [viewKey]: {
          ...current,
          [direction]: {
            ...current[direction],
            page,
          },
        },
      };
    });
  }, []);

  const configCache = useRef({});

  const activeViewConfig = VIEW_CONFIG[activeView] || VIEW_CONFIG.changes;
  const activeViewState = viewState[activeView] || createViewState(activeViewConfig, {
    today: todayStr,
    initialStatus: initialStatus || 'pending',
  });
  const activeFilters = activeViewState.filters;
  const currentStatus = activeFilters.status || 'pending';
  const { requestedEmpid, tableName, requestType, dateFrom, dateTo, dateField } =
    activeFilters;
  const perPage = activeViewState.perPage;
  const incomingState = activeViewState.incoming;
  const outgoingState = activeViewState.outgoing;
  const incomingRequests = incomingState.data;
  const outgoingRequests = outgoingState.data;
  const requests =
    activeTab === 'incoming' ? incomingRequests : outgoingRequests;
  const loading =
    activeTab === 'incoming' ? incomingState.loading : outgoingState.loading;
  const error = activeTab === 'incoming' ? incomingState.error : outgoingState.error;
  const currentPage =
    activeTab === 'incoming' ? incomingState.page : outgoingState.page;
  const total = activeTab === 'incoming' ? incomingState.total : outgoingState.total;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const requesterOptions = useMemo(() => {
    const set = new Set();
    incomingRequests.forEach((r) => set.add(String(r.emp_id).trim()));
    return Array.from(set);
  }, [incomingRequests]);

  const tableOptions = useMemo(() => {
    const set = new Set();
    requests.forEach((r) => set.add(r.table_name));
    return Array.from(set);
  }, [requests]);

  const allFields = useMemo(() => {
    const set = new Set();
    requests.forEach((r) => {
      if (Array.isArray(r.fields)) {
        r.fields.forEach((f) => set.add(f.name));
      }
    });
    return Array.from(set);
  }, [requests]);

  const headerMap = useHeaderMappings(allFields);
  const requestTypeOptions = useMemo(
    () => getRequestTypeOptions(activeViewConfig),
    [activeViewConfig],
  );

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeTab) {
      setActiveTab(tab === 'incoming' ? 'incoming' : 'outgoing');
    }
    const spView = searchParams.get('view');
    const nextView =
      spView && availableViewKeys.includes(spView) ? spView : activeView;
    if (spView && spView !== activeView && availableViewKeys.includes(spView)) {
      setActiveView(spView);
    }
    const spStatus = searchParams.get('status');
    if (spStatus && spStatus !== (viewState[nextView]?.filters.status ?? '')) {
      updateFilters(nextView, { status: spStatus });
    }
  }, [
    searchParams,
    activeTab,
    activeView,
    availableViewKeys,
    updateFilters,
    viewState,
  ]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('tab', activeTab);
    if (currentStatus) params.set('status', currentStatus);
    params.set('view', activeView);
    setSearchParams(params, { replace: true });
  }, [activeTab, currentStatus, activeView, setSearchParams]);
  async function enrichRequests(data) {
    const changeRequests = data.filter(
      (req) => req.request_type === 'edit' || req.request_type === 'delete',
    );
    const tables = Array.from(new Set(changeRequests.map((r) => r.table_name)));
    await Promise.all(
      tables
        .filter((t) => !configCache.current[t])
        .map(async (t) => {
          try {
            const res = await fetch(`${API_BASE}/display_fields?table=${t}`, {
              credentials: 'include',
            });
            configCache.current[t] = res.ok
              ? await res.json()
              : { displayFields: [] };
          } catch {
            configCache.current[t] = { displayFields: [] };
          }
        }),
    );

    return data.map((req) => {
      const base = {
        ...req,
        original: req.original || null,
        notes: '',
        response_status: null,
        error: null,
      };
      if (req.request_type === 'edit' || req.request_type === 'delete') {
        const cfg = configCache.current[req.table_name] || { displayFields: [] };
        const visible = cfg.displayFields?.length
          ? cfg.displayFields
          : Array.from(
              new Set([
                ...Object.keys(base.original || {}),
                ...Object.keys(req.proposed_data || {}),
              ]),
            );

        const fields = visible
          .map((name) => {
            const before = base.original ? base.original[name] : undefined;
            const after = req.proposed_data ? req.proposed_data[name] : undefined;
            const isComplex =
              (before && typeof before === 'object') ||
              (after && typeof after === 'object');
            let changed = false;
            if (isComplex) {
              changed = !!diff(before, after);
            } else {
              changed = JSON.stringify(before) !== JSON.stringify(after);
            }
            return { name, before, after, changed, isComplex };
          })
          .filter((f) => {
            const emptyBefore =
              f.before === undefined || f.before === null || f.before === '';
            const emptyAfter =
              f.after === undefined || f.after === null || f.after === '';
            return !(emptyBefore && emptyAfter);
          });

        return {
          ...base,
          fields,
        };
      }

      if (req.request_type === 'report_approval') {
        const proposed =
          req.proposed_data && typeof req.proposed_data === 'object'
            ? req.proposed_data
            : {};
        const transactions = Array.isArray(proposed.transactions)
          ? proposed.transactions
              .map((tx) => {
                if (!tx || typeof tx !== 'object') return null;
                const table = tx.table || tx.tableName || tx.table_name;
                const recordId =
                  tx.recordId ?? tx.record_id ?? tx.id ?? tx.transactionId;
                if (!table || recordId === undefined || recordId === null) {
                  return null;
                }
                return { table, recordId: String(recordId) };
              })
              .filter(Boolean)
          : [];
        const parameters =
          proposed.parameters && typeof proposed.parameters === 'object'
            ? proposed.parameters
            : {};
        return {
          ...base,
          reportInfo: {
            procedure: proposed.procedure || '',
            parameters,
            transactions,
          },
        };
      }

      if (req.request_type === 'temporary_insert') {
        const proposed =
          req.proposed_data && typeof req.proposed_data === 'object'
            ? req.proposed_data
            : {};
        const entries = Object.entries(proposed)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return {
          ...base,
          insertFields: entries,
        };
      }

      return base;
    });
  }

  useEffect(() => {
    if (activeTab !== 'incoming') return;
    if (!dateFrom || !dateTo) return;
    const viewKey = activeView;
    const counts = categories?.[viewKey];
    counts?.markSeen?.();
    if (!seniorEmpId) {
      setViewState((prev) => {
        const current = prev[viewKey];
        if (!current) return prev;
        return {
          ...prev,
          [viewKey]: {
            ...current,
            incoming: {
              ...current.incoming,
              loading: false,
              error: null,
              data: [],
              total: 0,
            },
          },
        };
      });
      return;
    }
    debugLog('Loading incoming requests', { view: viewKey });
    setViewState((prev) => {
      const current = prev[viewKey];
      if (!current) return prev;
      return {
        ...prev,
        [viewKey]: {
          ...current,
          incoming: { ...current.incoming, loading: true, error: null },
        },
      };
    });
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams({
          senior_empid: String(seniorEmpId),
          page: String(incomingState.page),
          per_page: String(perPage),
        });
        if (currentStatus) params.append('status', currentStatus);
        if (requestedEmpid) params.append('requested_empid', requestedEmpid);
        if (tableName) params.append('table_name', tableName);
        if (requestType) params.append('request_type', requestType);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        if (dateField) params.append('date_field', dateField);
        const res = await fetch(
          `${API_BASE}/pending_request?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load requests');
        const data = await res.json();
        const enriched = await enrichRequests(data.rows || []);
        if (cancelled) return;
        setViewState((prev) => {
          const current = prev[viewKey];
          if (!current) return prev;
          return {
            ...prev,
            [viewKey]: {
              ...current,
              incoming: {
                ...current.incoming,
                loading: false,
                data: enriched,
                total: data.total || 0,
                error: null,
              },
            },
          };
        });
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setViewState((prev) => {
          const current = prev[viewKey];
          if (!current) return prev;
          return {
            ...prev,
            [viewKey]: {
              ...current,
              incoming: {
                ...current.incoming,
                loading: false,
                error: 'Failed to load requests',
              },
            },
          };
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    activeView,
    categories,
    seniorEmpId,
    currentStatus,
    requestedEmpid,
    tableName,
    requestType,
    dateFrom,
    dateTo,
    dateField,
    incomingState.page,
    incomingState.reloadKey,
    perPage,
  ]);

  useEffect(() => {
    if (activeTab !== 'outgoing') return;
    if (!dateFrom || !dateTo) return;
    const viewKey = activeView;
    const counts = categories?.[viewKey];
    counts?.markSeen?.();
    setViewState((prev) => {
      const current = prev[viewKey];
      if (!current) return prev;
      return {
        ...prev,
        [viewKey]: {
          ...current,
          outgoing: { ...current.outgoing, loading: true, error: null },
        },
      };
    });
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams({
          page: String(outgoingState.page),
          per_page: String(perPage),
        });
        if (currentStatus) params.append('status', currentStatus);
        if (tableName) params.append('table_name', tableName);
        if (requestType) params.append('request_type', requestType);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        if (dateField) params.append('date_field', dateField);
        const res = await fetch(
          `${API_BASE}/pending_request/outgoing?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('Failed to load requests');
        const data = await res.json();
        const enriched = await enrichRequests(data.rows || []);
        if (cancelled) return;
        setViewState((prev) => {
          const current = prev[viewKey];
          if (!current) return prev;
          return {
            ...prev,
            [viewKey]: {
              ...current,
              outgoing: {
                ...current.outgoing,
                loading: false,
                data: enriched,
                total: data.total || 0,
                error: null,
              },
            },
          };
        });
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setViewState((prev) => {
          const current = prev[viewKey];
          if (!current) return prev;
          return {
            ...prev,
            [viewKey]: {
              ...current,
              outgoing: {
                ...current.outgoing,
                loading: false,
                error: 'Failed to load requests',
              },
            },
          };
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    activeView,
    categories,
    currentStatus,
    tableName,
    requestType,
    dateFrom,
    dateTo,
    dateField,
    outgoingState.page,
    outgoingState.reloadKey,
    perPage,
  ]);

  const updateNotes = useCallback(
    (id, value) => {
      setViewState((prev) => {
        const current = prev[activeView];
        if (!current) return prev;
        const updated = current.incoming.data.map((r) =>
          r.request_id === id ? { ...r, notes: value, error: null } : r,
        );
        return {
          ...prev,
          [activeView]: {
            ...current,
            incoming: { ...current.incoming, data: updated },
          },
        };
      });
    },
    [activeView],
  );

  const respond = useCallback(
    async (id, respStatus) => {
      const reqItem = incomingRequests.find((r) => r.request_id === id);
      if (!reqItem?.notes?.trim()) {
        setViewState((prev) => {
          const current = prev[activeView];
          if (!current) return prev;
          const updated = current.incoming.data.map((r) =>
            r.request_id === id
              ? { ...r, error: 'Response notes required' }
              : r,
          );
          return {
            ...prev,
            [activeView]: {
              ...current,
              incoming: { ...current.incoming, data: updated },
            },
          };
        });
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/pending_request/${id}/respond`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            status: respStatus,
            response_notes: reqItem.notes,
            response_empid: user.empid,
            senior_empid: reqItem?.senior_empid || user.empid,
          }),
        });
        if (!res.ok) {
          if (res.status === 403) throw new Error('Forbidden');
          throw new Error('Failed to respond');
        }
        setViewState((prev) => {
          const current = prev[activeView];
          if (!current) return prev;
          const updated = current.incoming.data.map((r) =>
            r.request_id === id
              ? {
                  ...r,
                  response_status: respStatus,
                  status: respStatus,
                  error: null,
                }
              : r,
          );
          return {
            ...prev,
            [activeView]: {
              ...current,
              incoming: { ...current.incoming, data: updated },
            },
          };
        });
      } catch (err) {
        setViewState((prev) => {
          const current = prev[activeView];
          if (!current) return prev;
          const updated = current.incoming.data.map((r) =>
            r.request_id === id ? { ...r, error: err.message } : r,
          );
          return {
            ...prev,
            [activeView]: {
              ...current,
              incoming: { ...current.incoming, data: updated },
            },
          };
        });
      }
    },
    [activeView, incomingRequests, user?.empid],
  );
  const statusOrder = ['pending', 'accepted', 'declined'];

  const getViewCounts = useCallback(
    (viewKey) => {
      const category = categories?.[viewKey];
      if (!category) return null;
      return activeTab === 'incoming' ? category.incoming : category.outgoing;
    },
    [activeTab, categories],
  );

  const directionCounts = getViewCounts(activeView) || {};
  const directionKey = activeTab === 'incoming' ? 'incoming' : 'outgoing';

  const newPillStyle = {
    background: '#dc2626',
    color: '#fff',
    borderRadius: '999px',
    padding: '0 0.4rem',
    fontSize: '0.7rem',
    marginLeft: '0.4rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const statusChipStyle = {
    background: '#eff6ff',
    borderRadius: '999px',
    padding: '0.25rem 0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    border: '1px solid #bfdbfe',
    fontSize: '0.85rem',
  };

  const formatDateValue = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return formatTimestamp(date);
  };

  const renderChangeDetails = (req) => {
    const fields = Array.isArray(req.fields) ? req.fields : [];
    if (!fields.length) {
      return <p style={{ margin: 0 }}>No field changes detected.</p>;
    }
    const columns = fields.map((f) => f.name);
    const fieldMap = {};
    fields.forEach((f) => {
      fieldMap[f.name] = f;
    });
    const columnAlign = {};
    columns.forEach((name) => {
      const field = fieldMap[name];
      const sample =
        field.before !== undefined && field.before !== null
          ? field.before
          : field.after;
      columnAlign[name] = typeof sample === 'number' ? 'right' : 'left';
    });

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th
                style={{
                  border: '1px solid #d1d5db',
                  padding: '0.35rem',
                  whiteSpace: 'nowrap',
                }}
              />
              {columns.map((name) => (
                <th
                  key={name}
                  style={{
                    border: '1px solid #d1d5db',
                    padding: '0.35rem',
                    textAlign: columnAlign[name],
                    whiteSpace: 'nowrap',
                  }}
                >
                  {headerMap[name] || translateToMn(name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th
                style={{
                  border: '1px solid #d1d5db',
                  padding: '0.35rem',
                  textAlign: 'left',
                  verticalAlign: 'top',
                  whiteSpace: 'nowrap',
                }}
              >
                Original
              </th>
              {columns.map((name) => {
                const field = fieldMap[name];
                return (
                  <td
                    key={name}
                    style={{
                      border: '1px solid #d1d5db',
                      padding: '0.35rem',
                      backgroundColor: field.changed ? '#fee2e2' : undefined,
                      textAlign: columnAlign[name],
                      verticalAlign: 'top',
                    }}
                  >
                    {renderValue(field.before)}
                  </td>
                );
              })}
            </tr>
            {req.request_type !== 'delete' && (
              <tr>
                <th
                  style={{
                    border: '1px solid #d1d5db',
                    padding: '0.35rem',
                    textAlign: 'left',
                    verticalAlign: 'top',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Proposed
                </th>
                {columns.map((name) => {
                  const field = fieldMap[name];
                  return (
                    <td
                      key={name}
                      style={{
                        border: '1px solid #d1d5db',
                        padding: '0.35rem',
                        backgroundColor: field.changed ? '#dcfce7' : undefined,
                        textAlign: columnAlign[name],
                        verticalAlign: 'top',
                      }}
                    >
                      {renderValue(field.after)}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderReportApprovalDetails = (req) => {
    const info = req.reportInfo || {};
    const parameters = Object.entries(info.parameters || {});
    const transactions = Array.isArray(info.transactions)
      ? info.transactions
      : [];

    return (
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div>
          <strong>Procedure:</strong>{' '}
          <code>{info.procedure || 'N/A'}</code>
        </div>
        <div>
          <strong>Parameters</strong>
          {parameters.length ? (
            <div style={{ overflowX: 'auto', marginTop: '0.35rem' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '250px' }}>
                <tbody>
                  {parameters.map(([name, value]) => (
                    <tr key={name}>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '0.35rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#f1f5f9',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {name}
                      </th>
                      <td
                        style={{
                          padding: '0.35rem',
                          border: '1px solid #d1d5db',
                        }}
                      >
                        {renderValue(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ margin: '0.35rem 0 0' }}>No parameters provided.</p>
          )}
        </div>
        <div>
          <strong>Transactions</strong>
          {transactions.length ? (
            <ul style={{ margin: '0.35rem 0 0 1.25rem' }}>
              {transactions.map((tx, idx) => (
                <li key={`${tx.table}-${tx.recordId}-${idx}`}>
                  <code>{tx.table}</code>
                  {tx.recordId ? ` #${tx.recordId}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '0.35rem 0 0' }}>No linked transactions.</p>
          )}
        </div>
      </div>
    );
  };

  const renderTemporaryInsertDetails = (req) => {
    const fields = Array.isArray(req.insertFields) ? req.insertFields : [];
    if (!fields.length) {
      return <p style={{ margin: 0 }}>No temporary values supplied.</p>;
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '240px' }}>
          <tbody>
            {fields.map(({ name, value }) => (
              <tr key={name}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.35rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#f1f5f9',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                </th>
                <td
                  style={{
                    padding: '0.35rem',
                    border: '1px solid #d1d5db',
                    verticalAlign: 'top',
                  }}
                >
                  {renderValue(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRequestDetails = (req) => {
    if (req.request_type === 'report_approval') {
      return renderReportApprovalDetails(req);
    }
    if (req.request_type === 'temporary_insert') {
      return renderTemporaryInsertDetails(req);
    }
    return renderChangeDetails(req);
  };

  const renderStatusSummary = () => (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        marginBottom: '1rem',
      }}
    >
      {statusOrder.map((status) => {
        const entry = directionCounts?.[status] || {
          count: 0,
          hasNew: false,
          newCount: 0,
        };
        return (
          <span key={status} style={statusChipStyle}>
            <span style={{ fontWeight: 600 }}>
              {STATUS_LABELS[status] || status}:
            </span>
            <span>{entry.count}</span>
            {entry.hasNew && entry.newCount > 0 ? (
              <span style={newPillStyle}>+{entry.newCount}</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );

  if (!user?.empid) {
    return <p>Login required</p>;
  }

  return (
    <div style={{ padding: '0 0.5rem 2rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Requests</h2>
      <div
        style={{
          marginBottom: '0.75rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        {availableViewKeys.map((key) => {
          const cfg = VIEW_CONFIG[key] || VIEW_CONFIG.changes;
          const counts = getViewCounts(key) || {};
          const pendingEntry = counts.pending || { count: 0, newCount: 0, hasNew: false };
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveView(key)}
              style={{
                borderRadius: '999px',
                border: activeView === key ? '2px solid #2563eb' : '1px solid #cbd5f5',
                padding: '0.4rem 0.9rem',
                background: activeView === key ? '#eff6ff' : '#fff',
                cursor: 'pointer',
                fontWeight: activeView === key ? 600 : 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>{cfg.label}</span>
              <span style={{ color: '#4b5563', fontSize: '0.85rem' }}>
                {pendingEntry.count} pending
              </span>
              {pendingEntry.hasNew && pendingEntry.newCount > 0 ? (
                <span style={newPillStyle}>+{pendingEntry.newCount}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        style={{
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('incoming')}
            style={{
              border: 'none',
              background: 'none',
              padding: '0.25rem 0.5rem',
              borderBottom:
                activeTab === 'incoming' ? '2px solid #2563eb' : '2px solid transparent',
              fontWeight: activeTab === 'incoming' ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            Incoming
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('outgoing')}
            style={{
              border: 'none',
              background: 'none',
              padding: '0.25rem 0.5rem',
              borderBottom:
                activeTab === 'outgoing' ? '2px solid #2563eb' : '2px solid transparent',
              fontWeight: activeTab === 'outgoing' ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            Outgoing
          </button>
        </div>
        <button
          type="button"
          onClick={() => triggerReload(activeView, directionKey)}
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: '0.375rem',
            border: '1px solid #cbd5f5',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>
      {renderStatusSummary()}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          triggerReload(activeView, directionKey);
        }}
        style={{
          marginBottom: '1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
        }}
      >
        {activeTab === 'incoming' && activeViewConfig.showRequesterFilter && (
          <label style={{ fontSize: '0.9rem' }}>
            Requester:
            <select
              value={requestedEmpid}
              onChange={(e) =>
                updateFilters(activeView, { requestedEmpid: e.target.value })
              }
              style={{ marginLeft: '0.35rem' }}
            >
              <option value="">Any</option>
              {requesterOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        )}
        {activeViewConfig.showTableFilter && (
          <label style={{ fontSize: '0.9rem' }}>
            Transaction Type:
            <select
              value={tableName}
              onChange={(e) =>
                updateFilters(activeView, { tableName: e.target.value })
              }
              style={{ marginLeft: '0.35rem' }}
            >
              <option value="">Any</option>
              {tableOptions.map((tbl) => (
                <option key={tbl} value={tbl}>
                  {tbl}
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={{ fontSize: '0.9rem' }}>
          Request Type:
          <select
            value={requestType}
            onChange={(e) =>
              updateFilters(activeView, { requestType: e.target.value })
            }
            style={{ marginLeft: '0.35rem' }}
            disabled={
              activeViewConfig.lockRequestType && requestTypeOptions.length === 1
            }
          >
            {requestTypeOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.9rem' }}>
          Status:
          <select
            value={activeFilters.status}
            onChange={(e) =>
              updateFilters(activeView, { status: e.target.value })
            }
            style={{ marginLeft: '0.35rem' }}
          >
            <option value="">Any</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
          </select>
        </label>
        <label style={{ fontSize: '0.9rem' }}>
          Date Field:
          <select
            value={dateField}
            onChange={(e) =>
              updateFilters(activeView, { dateField: e.target.value })
            }
            style={{ marginLeft: '0.35rem' }}
          >
            <option value="created">Created</option>
            <option value="responded">Responded</option>
          </select>
        </label>
        <label style={{ fontSize: '0.9rem' }}>
          Date:
          <DateRangePicker
            start={dateFrom}
            end={dateTo}
            onChange={({ start, end }) =>
              updateFilters(activeView, { dateFrom: start, dateTo: end })
            }
            style={{ marginLeft: '0.35rem' }}
          />
        </label>
        <button
          type="submit"
          style={{
            padding: '0.35rem 0.85rem',
            borderRadius: '0.375rem',
            border: '1px solid #2563eb',
            background: '#2563eb',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
      </form>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {requests.map((req) => {
        const userEmp = String(user.empid).trim();
        const requestStatus = req.status || req.response_status;
        const requestStatusLower = requestStatus
          ? String(requestStatus).trim().toLowerCase()
          : undefined;
        const isRequester = String(req.emp_id).trim() === userEmp;

        const seniorStr = String(req.senior_empid ?? '').trim();
        const seniorNorm = seniorStr.toLowerCase();
        const assignedSenior =
          seniorStr && !['0', 'null', 'undefined'].includes(seniorNorm)
            ? seniorStr
            : null;

        const isPending =
          !requestStatusLower || requestStatusLower === 'pending';
        const canRespond =
          !isRequester &&
          isPending &&
          (!assignedSenior || assignedSenior === userEmp);

        const createdAt = formatDateValue(req.created_at);
        const resolvedAt = formatDateValue(req.response_date || req.updated_at);
        const requestTypeLabel =
          REQUEST_TYPE_LABELS[req.request_type] || req.request_type;

        return (
          <div
            key={req.request_id}
            style={{
              border: '1px solid #e5e7eb',
              marginBottom: '1.25rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
              background:
                requestStatus === 'accepted'
                  ? '#f0fdf4'
                  : requestStatus === 'declined'
                  ? '#fef2f2'
                  : '#fff',
              padding: '1rem 1.25rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                  Request #{req.request_id}
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>
                  {requestTypeLabel}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.9rem' }}>
                <div>
                  <strong>Status:</strong>{' '}
                  {requestStatus ? requestStatus.toUpperCase() : 'PENDING'}
                </div>
                {createdAt && (
                  <div>
                    <strong>Submitted:</strong> {createdAt}
                  </div>
                )}
                {resolvedAt && !isPending && (
                  <div>
                    <strong>Updated:</strong> {resolvedAt}
                  </div>
                )}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.9rem',
              }}
            >
              <div>
                <strong>Requester:</strong> {req.emp_id}
              </div>
              <div>
                <strong>Assigned Senior:</strong>{' '}
                {assignedSenior || 'Unassigned'}
              </div>
              {req.table_name && (
                <div>
                  <strong>Table:</strong> {req.table_name}
                </div>
              )}
              {req.record_id !== undefined && req.record_id !== null && (
                <div>
                  <strong>Record:</strong> {req.record_id}
                </div>
              )}
            </div>
            <div style={{ marginBottom: '1rem' }}>{renderRequestDetails(req)}</div>
            {!isPending ? (
              <p style={{ margin: '0.5rem 0 0', fontWeight: 500 }}>
                Request {requestStatus}
              </p>
            ) : canRespond ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <textarea
                  placeholder="Response Notes"
                  value={req.notes}
                  onChange={(e) => updateNotes(req.request_id, e.target.value)}
                  style={{ width: '100%', minHeight: '4.5rem', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => respond(req.request_id, 'accepted')}
                    disabled={!req.notes?.trim()}
                    style={{
                      padding: '0.4rem 0.9rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #16a34a',
                      background: '#16a34a',
                      color: '#fff',
                      cursor: req.notes?.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => respond(req.request_id, 'declined')}
                    disabled={!req.notes?.trim()}
                    style={{
                      padding: '0.4rem 0.9rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #dc2626',
                      background: '#dc2626',
                      color: '#fff',
                      cursor: req.notes?.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ) : isRequester ? (
              <p style={{ margin: 0 }}>Awaiting senior response…</p>
            ) : null}
            {req.error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{req.error}</p>}
          </div>
        );
      })}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginTop: '1.25rem',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          Rows per page:
          <input
            type="number"
            value={perPage}
            onChange={(e) => {
              const val = Math.max(1, Number(e.target.value) || 1);
              updatePerPage(activeView, val);
            }}
            min="1"
            style={{ marginLeft: '0.35rem', width: '4rem' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={() => setPageFor(activeView, directionKey, 1)}
            disabled={currentPage === 1 || loading}
          >
            {'<<'}
          </button>
          <button
            type="button"
            onClick={() =>
              setPageFor(activeView, directionKey, Math.max(1, currentPage - 1))
            }
            disabled={currentPage === 1 || loading}
          >
            {'<'}
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            Page
            <input
              type="number"
              value={currentPage}
              onChange={(e) => {
                let val = Number(e.target.value) || 1;
                if (val < 1) val = 1;
                if (val > totalPages) val = totalPages;
                setPageFor(activeView, directionKey, val);
              }}
              style={{ width: '3rem', textAlign: 'center' }}
              min="1"
              max={totalPages}
            />
            {`of ${totalPages}`}
          </span>
          <button
            type="button"
            onClick={() =>
              setPageFor(activeView, directionKey, Math.min(totalPages, currentPage + 1))
            }
            disabled={currentPage >= totalPages || loading}
          >
            {'>'}
          </button>
          <button
            type="button"
            onClick={() => setPageFor(activeView, directionKey, totalPages)}
            disabled={currentPage >= totalPages || loading}
          >
            {'>>'}
          </button>
        </div>
      </div>
      {!loading && requests.length === 0 && <p>No pending requests.</p>}
    </div>
  );
}
            style={{ marginLeft: '0.35rem' }}
            disabled={
              activeViewConfig.lockRequestType && requestTypeOptions.length === 1
            }
          >
            {requestTypeOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.9rem' }}>
          Status:
          <select
            value={activeFilters.status}
            onChange={(e) =>
              updateFilters(activeView, { status: e.target.value })
            }
            style={{ marginLeft: '0.35rem' }}
          >
            <option value="">Any</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
          </select>
        </label>
        <label style={{ fontSize: '0.9rem' }}>
          Date Field:
          <select
            value={dateField}
            onChange={(e) =>
              updateFilters(activeView, { dateField: e.target.value })
            }
            style={{ marginLeft: '0.35rem' }}
          >
            <option value="created">Created</option>
            <option value="responded">Responded</option>
          </select>
        </label>
        <label style={{ fontSize: '0.9rem' }}>
          Date:
          <DateRangePicker
            start={dateFrom}
            end={dateTo}
            onChange={({ start, end }) =>
              updateFilters(activeView, { dateFrom: start, dateTo: end })
            }
            style={{ marginLeft: '0.35rem' }}
          />
        </label>
        <button
          type="submit"
          style={{
            padding: '0.35rem 0.85rem',
            borderRadius: '0.375rem',
            border: '1px solid #2563eb',
            background: '#2563eb',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
      </form>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {requests.map((req) => {
        const userEmp = String(user.empid).trim();
        const requestStatus = req.status || req.response_status;
        const requestStatusLower = requestStatus
          ? String(requestStatus).trim().toLowerCase()
          : undefined;
        const isRequester = String(req.emp_id).trim() === userEmp;

        const seniorStr = String(req.senior_empid ?? '').trim();
        const seniorNorm = seniorStr.toLowerCase();
        const assignedSenior =
          seniorStr && !['0', 'null', 'undefined'].includes(seniorNorm)
            ? seniorStr
            : null;

        const isPending =
          !requestStatusLower || requestStatusLower === 'pending';
        const canRespond =
          !isRequester &&
          isPending &&
          (!assignedSenior || assignedSenior === userEmp);

        const createdAt = formatDateValue(req.created_at);
        const resolvedAt = formatDateValue(req.response_date || req.updated_at);
        const requestTypeLabel =
          REQUEST_TYPE_LABELS[req.request_type] || req.request_type;

        return (
          <div
            key={req.request_id}
            style={{
              border: '1px solid #e5e7eb',
              marginBottom: '1.25rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
              background:
                requestStatus === 'accepted'
                  ? '#f0fdf4'
                  : requestStatus === 'declined'
                  ? '#fef2f2'
                  : '#fff',
              padding: '1rem 1.25rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                  Request #{req.request_id}
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>
                  {requestTypeLabel}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.9rem' }}>
                <div>
                  <strong>Status:</strong>{' '}
                  {requestStatus ? requestStatus.toUpperCase() : 'PENDING'}
                </div>
                {createdAt && (
                  <div>
                    <strong>Submitted:</strong> {createdAt}
                  </div>
                )}
                {resolvedAt && !isPending && (
                  <div>
                    <strong>Updated:</strong> {resolvedAt}
                  </div>
                )}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.9rem',
              }}
            >
              <div>
                <strong>Requester:</strong> {req.emp_id}
              </div>
              <div>
                <strong>Assigned Senior:</strong>{' '}
                {assignedSenior || 'Unassigned'}
              </div>
              {req.table_name && (
                <div>
                  <strong>Table:</strong> {req.table_name}
                </div>
              )}
              {req.record_id !== undefined && req.record_id !== null && (
                <div>
                  <strong>Record:</strong> {req.record_id}
                </div>
              )}
            </div>
            <div style={{ marginBottom: '1rem' }}>{renderRequestDetails(req)}</div>
            {!isPending ? (
              <p style={{ margin: '0.5rem 0 0', fontWeight: 500 }}>
                Request {requestStatus}
              </p>
            ) : canRespond ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <textarea
                  placeholder="Response Notes"
                  value={req.notes}
                  onChange={(e) => updateNotes(req.request_id, e.target.value)}
                  style={{ width: '100%', minHeight: '4.5rem', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => respond(req.request_id, 'accepted')}
                    disabled={!req.notes?.trim()}
                    style={{
                      padding: '0.4rem 0.9rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #16a34a',
                      background: '#16a34a',
                      color: '#fff',
                      cursor: req.notes?.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => respond(req.request_id, 'declined')}
                    disabled={!req.notes?.trim()}
                    style={{
                      padding: '0.4rem 0.9rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #dc2626',
                      background: '#dc2626',
                      color: '#fff',
                      cursor: req.notes?.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ) : isRequester ? (
              <p style={{ margin: 0 }}>Awaiting senior response…</p>
            ) : null}
            {req.error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{req.error}</p>}
          </div>
        );
      })}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginTop: '1.25rem',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          Rows per page:
          <input
            type="number"
            value={perPage}
            onChange={(e) => {
              const val = Math.max(1, Number(e.target.value) || 1);
              updatePerPage(activeView, val);
            }}
            min="1"
            style={{ marginLeft: '0.35rem', width: '4rem' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={() => setPageFor(activeView, directionKey, 1)}
            disabled={currentPage === 1 || loading}
          >
            {'<<'}
          </button>
          <button
            type="button"
            onClick={() =>
              setPageFor(activeView, directionKey, Math.max(1, currentPage - 1))
            }
            disabled={currentPage === 1 || loading}
          >
            {'<'}
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            Page
            <input
              type="number"
              value={currentPage}
              onChange={(e) => {
                let val = Number(e.target.value) || 1;
                if (val < 1) val = 1;
                if (val > totalPages) val = totalPages;
                setPageFor(activeView, directionKey, val);
              }}
              style={{ width: '3rem', textAlign: 'center' }}
              min="1"
              max={totalPages}
            />
            {`of ${totalPages}`}
          </span>
          <button
            type="button"
            onClick={() =>
              setPageFor(activeView, directionKey, Math.min(totalPages, currentPage + 1))
            }
            disabled={currentPage >= totalPages || loading}
          >
            {'>'}
          </button>
          <button
            type="button"
            onClick={() => setPageFor(activeView, directionKey, totalPages)}
            disabled={currentPage >= totalPages || loading}
          >
            {'>>'}
          </button>
        </div>
      </div>
      {!loading && requests.length === 0 && <p>No pending requests.</p>}
    </div>
  );
}

