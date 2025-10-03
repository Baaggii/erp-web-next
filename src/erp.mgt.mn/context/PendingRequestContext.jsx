import { createContext, useContext } from 'react';

export const REQUEST_CATEGORY_CONFIG = [
  { key: 'changes', label: 'Change Requests', requestType: 'changes' },
  {
    key: 'report_approval',
    label: 'Report Approvals',
    requestType: 'report_approval',
  },
  {
    key: 'temporary_insert',
    label: 'Temporary Transactions',
    requestType: 'temporary_insert',
  },
];

function createDefaultStatuses() {
  return {
    pending: { count: 0, hasNew: false, newCount: 0 },
    accepted: { count: 0, hasNew: false, newCount: 0 },
    declined: { count: 0, hasNew: false, newCount: 0 },
  };
}

const defaultCategories = REQUEST_CATEGORY_CONFIG.reduce((acc, config) => {
  acc[config.key] = {
    key: config.key,
    label: config.label,
    requestType: config.requestType,
    incoming: createDefaultStatuses(),
    outgoing: createDefaultStatuses(),
    hasNew: false,
    markSeen: () => {},
  };
  return acc;
}, {});

export const PendingRequestContext = createContext({
  categories: defaultCategories,
  order: REQUEST_CATEGORY_CONFIG.map((c) => c.key),
  hasNew: false,
  incoming: createDefaultStatuses(),
  outgoing: createDefaultStatuses(),
  markSeen: () => {},
});

export function usePendingRequests() {
  return useContext(PendingRequestContext);
}

