import { createContext, useContext } from 'react';

export const PendingRequestContext = createContext({
  count: 0,
  hasNew: false,
  markSeen: () => {},
  outgoing: {
    counts: { pending: 0, accepted: 0, declined: 0 },
    hasNew: false,
    markSeen: () => {},
  },
});

export function usePendingRequests() {
  return useContext(PendingRequestContext);
}

