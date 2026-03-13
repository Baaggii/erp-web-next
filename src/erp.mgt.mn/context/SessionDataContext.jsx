import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { initSession, resetSessionInitCache } from '../core/initSession.js';

const emptySessionData = {
  user: null,
  companyModules: [],
  modules: [],
  userSettings: {},
  loaded: false,
};

const SessionDataContext = createContext({
  sessionData: emptySessionData,
  initializeSession: async () => emptySessionData,
  clearSessionData: () => {},
});

export function SessionDataProvider({ children }) {
  const [sessionData, setSessionData] = useState(emptySessionData);

  const initializeSession = useCallback(async (options = {}) => {
    const { force = false } = options;
    if (!force && sessionData.loaded) {
      return sessionData;
    }
    const next = await initSession({ force });
    setSessionData(next);
    return next;
  }, [sessionData]);

  const clearSessionData = useCallback(() => {
    resetSessionInitCache();
    setSessionData(emptySessionData);
  }, []);

  const value = useMemo(
    () => ({
      sessionData,
      initializeSession,
      clearSessionData,
    }),
    [sessionData, initializeSession, clearSessionData],
  );

  return <SessionDataContext.Provider value={value}>{children}</SessionDataContext.Provider>;
}

export function useSessionData() {
  return useContext(SessionDataContext);
}
