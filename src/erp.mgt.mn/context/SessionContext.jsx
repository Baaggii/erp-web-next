import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { initSession } from '../core/initSession.js';

const defaultSessionState = {
  user: null,
  modules: [],
  companyModules: [],
  settings: {},
  generalConfig: {},
  initialized: false,
};

export const SessionContext = createContext({
  ...defaultSessionState,
  setSession: () => {},
  initializeSession: async () => defaultSessionState,
  resetSession: () => {},
});

export function SessionProvider({ children }) {
  const [sessionState, setSessionState] = useState(defaultSessionState);

  const initializeSession = useCallback(async (companyId) => {
    const session = await initSession(companyId);
    setSessionState(session);
    return session;
  }, []);

  const resetSession = useCallback(() => {
    setSessionState(defaultSessionState);
  }, []);

  const value = useMemo(
    () => ({
      ...sessionState,
      setSession: setSessionState,
      initializeSession,
      resetSession,
    }),
    [sessionState, initializeSession, resetSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
