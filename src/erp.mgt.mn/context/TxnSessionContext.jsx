import React, { createContext, useContext, useState, useMemo } from 'react';
import { trackSetState } from '../utils/debug.js';

const TxnSessionContext = createContext();

export function TxnSessionProvider({ children }) {
  const [sessions, setSessions] = useState({});

  const getSession = (key) => {
    // Simply return the stored session or an empty object. Avoid triggering a
    // state update during render which previously caused update loops when a
    // new session key was accessed for the first time.
    return sessions[key] || {};
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
