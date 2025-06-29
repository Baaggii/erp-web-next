import React, { createContext, useContext, useState, useMemo } from 'react';
import { trackSetState } from '../utils/debug.js';

const TxnSessionContext = createContext();

export function TxnSessionProvider({ children }) {
  const [sessions, setSessions] = useState({});

  const getSession = (key) => {
    if (!sessions[key]) {
      trackSetState('TxnSessionProvider.setSessions');
      setSessions((s) => ({ ...s, [key]: {} }));
      return {};
    }
    return sessions[key];
  };

  const setSession = (key, state) => {
    trackSetState('TxnSessionProvider.setSessions');
    setSessions((s) => ({ ...s, [key]: { ...s[key], ...state } }));
  };

  const clearSession = (key) => {
    trackSetState('TxnSessionProvider.setSessions');
    setSessions((s) => {
      const copy = { ...s };
      delete copy[key];
      return copy;
    });
  };

  const value = useMemo(
    () => ({ getSession, setSession, clearSession }),
    [getSession, setSession, clearSession]
  );

  return (
    <TxnSessionContext.Provider value={value}>
      {children}
    </TxnSessionContext.Provider>
  );
}

export function useTxnSession(key) {
  const { getSession, setSession } = useContext(TxnSessionContext);
  const session = getSession(key);
  const update = (state) => setSession(key, state);
  return [session, update];
}

export default TxnSessionContext;
