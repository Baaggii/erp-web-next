import { useEffect, useState, useCallback, useMemo } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const STATUSES = ['pending', 'accepted', 'declined'];
const KNOWN_REQUEST_TYPES = [
  'edit',
  'delete',
  'report_approval',
  'temporary_insert',
];
const REQUEST_TYPE_ALIASES = {
  changes: ['edit', 'delete'],
};

function createInitial() {
  return {
    pending: { count: 0, hasNew: false, newCount: 0 },
    accepted: { count: 0, hasNew: false, newCount: 0 },
    declined: { count: 0, hasNew: false, newCount: 0 },
  };
}

function extractRequestTypeTokens(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => extractRequestTypeTokens(v));
  }
  const str = String(value);
  return str
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveRequestType(value) {
  const tokens = extractRequestTypeTokens(value);
  if (!tokens.length) {
    return { key: 'all', query: '', types: [] };
  }
  const collected = [];
  tokens.forEach((token) => {
    const lower = token.toLowerCase();
    if (REQUEST_TYPE_ALIASES[lower]) {
      REQUEST_TYPE_ALIASES[lower].forEach((alias) => collected.push(alias));
      return;
    }
    if (KNOWN_REQUEST_TYPES.includes(lower)) {
      collected.push(lower);
    }
  });
  if (!collected.length) {
    return { key: 'all', query: '', types: [] };
  }
  const unique = Array.from(new Set(collected));
  const lastToken = tokens[tokens.length - 1]?.toLowerCase();
  if (lastToken && REQUEST_TYPE_ALIASES[lastToken]) {
    return { key: lastToken, query: lastToken, types: unique };
  }
  if (tokens.length === 1 && KNOWN_REQUEST_TYPES.includes(tokens[0].toLowerCase())) {
    const type = tokens[0].toLowerCase();
    return { key: type, query: type, types: unique };
  }
  const key = unique.slice().sort().join('+');
  const query = unique.join(',');
  return { key, query, types: unique };
}

export default function useRequestNotificationCounts(
  seniorEmpId,
  filters,
  empid,
  requestType,
) {
  const [incoming, setIncoming] = useState(createInitial);
  const [outgoing, setOutgoing] = useState(createInitial);
  const cfg = useGeneralConfig();
  const pollingEnabled = !!cfg?.general?.requestPollingEnabled;
  const intervalSeconds =
    Number(cfg?.general?.requestPollingIntervalSeconds) ||
    DEFAULT_POLL_INTERVAL_SECONDS;

  const memoFilters = useMemo(() => filters || {}, [filters]);
  const filterRequestType = memoFilters?.request_type;
  const combinedRequestTypeSource = useMemo(() => {
    const sources = [];
    if (requestType !== undefined && requestType !== null && requestType !== '') {
      sources.push(requestType);
    }
    if (
      filterRequestType !== undefined &&
      filterRequestType !== null &&
      filterRequestType !== ''
    ) {
      sources.push(filterRequestType);
    }
    if (!sources.length) return '';
    if (sources.length === 1) return sources[0];
    return sources;
  }, [requestType, filterRequestType]);

  const resolvedRequestType = useMemo(
    () => resolveRequestType(combinedRequestTypeSource),
    [combinedRequestTypeSource],
  );

  const requestTypeKey = resolvedRequestType.key || 'all';
  const requestTypeQuery = resolvedRequestType.query;
  const requestTypeMatcherKey = useMemo(
    () =>
      resolvedRequestType.types.length
        ? resolvedRequestType.types.slice().sort().join('|')
        : '',
    [resolvedRequestType.types],
  );

  const requestTypeSet = useMemo(() => {
    if (!requestTypeMatcherKey) return new Set();
    return new Set(resolvedRequestType.types.map((t) => t.toLowerCase()));
  }, [requestTypeMatcherKey, resolvedRequestType.types]);

  const matchesRequestType = useCallback(
    (type) => {
      if (!requestTypeSet.size) return true;
      if (!type) return false;
      return requestTypeSet.has(String(type).trim().toLowerCase());
    },
    [requestTypeSet],
  );

  const sanitizedFilters = useMemo(() => {
    const base = memoFilters || {};
    const cleaned = {};
    Object.entries(base).forEach(([key, value]) => {
      if (key === 'request_type') return;
      cleaned[key] = value;
    });
    return cleaned;
  }, [memoFilters]);

  const storageKey = useCallback(
    (type, status) => `${empid}-${requestTypeKey}-${type}-${status}-seen`,
    [empid, requestTypeKey],
  );

  const markSeen = useCallback(() => {
    setIncoming((prev) => {
      const next = { ...prev };
      STATUSES.forEach((s) => {
        localStorage.setItem(storageKey('incoming', s), String(prev[s].count));
        next[s] = { ...prev[s], hasNew: false, newCount: 0 };
      });
      return next;
    });
    setOutgoing((prev) => {
      const next = { ...prev };
      STATUSES.forEach((s) => {
        localStorage.setItem(storageKey('outgoing', s), String(prev[s].count));
        next[s] = { ...prev[s], hasNew: false, newCount: 0 };
      });
      return next;
    });
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      const newIncoming = createInitial();
      const newOutgoing = createInitial();

      await Promise.all(
        STATUSES.map(async (status) => {
          // Incoming requests (for seniors)
          if (seniorEmpId) {
            try {
              const params = new URLSearchParams({
                status,
                senior_empid: String(seniorEmpId),
              });
              Object.entries(sanitizedFilters).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') {
                  params.append(k, v);
                }
              });
              if (requestTypeQuery) {
                params.append('request_type', requestTypeQuery);
              }
              const res = await fetch(
                `/api/pending_request?${params.toString()}`,
                { credentials: 'include', skipLoader: true },
              );
              let c = 0;
              if (res.ok) {
                const data = await res.json().catch(() => 0);
                if (typeof data === 'number') c = data;
                else if (Array.isArray(data)) c = data.length;
                else c = Number(data?.count ?? data?.total) || 0;
              }
              const seenKey = storageKey('incoming', status);
              if (c === 0) {
                localStorage.setItem(seenKey, '0');
                newIncoming[status] = { count: 0, hasNew: false, newCount: 0 };
              } else {
                const storedSeen = localStorage.getItem(seenKey);
                const seen = storedSeen === null ? c : Number(storedSeen);
                if (storedSeen === null) {
                  localStorage.setItem(seenKey, String(c));
                }
                const delta = Math.max(0, c - seen);
                newIncoming[status] = {
                  count: c,
                  hasNew: delta > 0,
                  newCount: delta,
                };
              }
            } catch {
              newIncoming[status] = { count: 0, hasNew: false, newCount: 0 };
            }
          } else {
            newIncoming[status] = { count: 0, hasNew: false, newCount: 0 };
          }

          // Outgoing requests (always for current user)
          try {
            const params = new URLSearchParams({ status });
            Object.entries(sanitizedFilters).forEach(([k, v]) => {
              if (v !== undefined && v !== null && v !== '') {
                params.append(k, v);
              }
            });
            if (requestTypeQuery) {
              params.append('request_type', requestTypeQuery);
            }
            const res = await fetch(
              `/api/pending_request/outgoing?${params.toString()}`,
              { credentials: 'include', skipLoader: true },
            );
            let c = 0;
            if (res.ok) {
              const data = await res.json().catch(() => 0);
              if (typeof data === 'number') c = data;
              else if (Array.isArray(data)) c = data.length;
              else c = Number(data?.count ?? data?.total) || 0;
            }
            const seenKey = storageKey('outgoing', status);
            if (status === 'pending') {
              // Requesters shouldn't get "new" badges for their own submissions
              localStorage.setItem(seenKey, String(c));
              newOutgoing[status] = { count: c, hasNew: false, newCount: 0 };
            } else if (c === 0) {
              localStorage.setItem(seenKey, '0');
              newOutgoing[status] = { count: 0, hasNew: false, newCount: 0 };
            } else {
              const storedSeen = localStorage.getItem(seenKey);
              const seen = storedSeen === null ? c : Number(storedSeen);
              if (storedSeen === null) {
                localStorage.setItem(seenKey, String(c));
              }
              const delta = Math.max(0, c - seen);
              newOutgoing[status] = {
                count: c,
                hasNew: delta > 0,
                newCount: delta,
              };
            }
          } catch {
            newOutgoing[status] = { count: 0, hasNew: false, newCount: 0 };
          }
        }),
      );

      if (!cancelled) {
        setIncoming(newIncoming);
        setOutgoing(newOutgoing);
      }
    }

    fetchCounts();
    let timer;

    function startPolling() {
      if (!timer) timer = setInterval(fetchCounts, intervalSeconds * 1000);
    }

    function stopPolling() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    let socket;
    let handleNewRequest;
    let handleRequestResolved;
    try {
      socket = connectSocket();
      handleNewRequest = (payload = {}) => {
        if (matchesRequestType(payload.requestType)) {
          fetchCounts();
        }
      };
      handleRequestResolved = (payload = {}) => {
        if (matchesRequestType(payload.requestType)) {
          fetchCounts();
        }
      };
      socket.on('newRequest', handleNewRequest);
      socket.on('requestResolved', handleRequestResolved);
      if (pollingEnabled) {
        socket.on('connect_error', startPolling);
        socket.on('disconnect', startPolling);
        socket.on('connect', stopPolling);
      }
    } catch {
      if (pollingEnabled) startPolling();
    }

    return () => {
      cancelled = true;
      if (socket) {
        if (handleNewRequest) socket.off('newRequest', handleNewRequest);
        if (handleRequestResolved)
          socket.off('requestResolved', handleRequestResolved);
        if (pollingEnabled) {
          socket.off('connect_error', startPolling);
          socket.off('disconnect', startPolling);
          socket.off('connect', stopPolling);
        }
        disconnectSocket();
      }
      stopPolling();
    };
  }, [
    seniorEmpId,
    sanitizedFilters,
    pollingEnabled,
    intervalSeconds,
    storageKey,
    requestTypeQuery,
    matchesRequestType,
  ]);

  const hasNew =
    STATUSES.some((s) => incoming[s].hasNew) ||
    ['accepted', 'declined'].some((s) => outgoing[s].hasNew);

  return { incoming, outgoing, hasNew, markSeen };
}

