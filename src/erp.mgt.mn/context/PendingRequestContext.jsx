import { createContext, useContext } from 'react';

const defaultStatus = { count: 0, hasNew: false };

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
});

export function usePendingRequests() {
  return useContext(PendingRequestContext);
}

