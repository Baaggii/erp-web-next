import React, { createContext, useContext, useState } from 'react';

const TxnSessionContext = createContext();

export function TxnSessionProvider({ children }) {
  const [sessions, setSessions] = useState({});

  const getSession = (key) => {
    if (!sessions[key]) {
      setSessions((s) => ({ ...s, [key]: {} }));
      return {};
    }
    return sessions[key];
  };

  const setSession = (key, state) => {
    setSessions((s) => ({ ...s, [key]: { ...s[key], ...state } }));
  };

  const clearSession = (key) => {
    setSessions((s) => {
      const copy = { ...s };
      delete copy[key];
      return copy;
    });
  };

  return (
    <TxnSessionContext.Provider value={{ getSession, setSession, clearSession }}>
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
