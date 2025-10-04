import { createContext, useContext } from 'react';

const defaultStatus = { count: 0, hasNew: false, newCount: 0 };
const defaultWorkflow = {
  incoming: {
    pending: defaultStatus,
    accepted: defaultStatus,
    declined: defaultStatus,
  },
  outgoing: {
    pending: defaultStatus,
    accepted: defaultStatus,
    declined: defaultStatus,
  },
  hasNew: false,
  markSeen: () => {},
  markIncoming: () => {},
  markOutgoing: () => {},
};
const defaultTemporaryCounts = {
  created: { count: 0, hasNew: false, newCount: 0 },
  review: { count: 0, hasNew: false, newCount: 0 },
};

export const PendingRequestContext = createContext({
  incoming: {
    pending: defaultStatus,
    accepted: defaultStatus,
    declined: defaultStatus,
  },
  outgoing: {
    pending: defaultStatus,
    accepted: defaultStatus,
    declined: defaultStatus,
  },
  hasNew: false,
  markSeen: () => {},
  markIncoming: () => {},
  markOutgoing: () => {},
  markWorkflowSeen: () => {},
  workflows: {
    reportApproval: defaultWorkflow,
    changeRequests: defaultWorkflow,
  },
  temporary: {
    counts: defaultTemporaryCounts,
    hasNew: false,
    markScopeSeen: () => {},
    markAllSeen: () => {},
    fetchScopeEntries: () => Promise.resolve([]),
  },
  anyHasNew: false,
});

export function usePendingRequests() {
  return useContext(PendingRequestContext);
}

