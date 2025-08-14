// src/erp.mgt.mn/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext, useMemo } from 'react';
import { debugLog, trackSetState } from '../utils/debug.js';
import { API_BASE } from '../utils/apiBase.js';

// Create the AuthContext
export const AuthContext = createContext({
  user: null,
  setUser: () => {},
  company: null,
  setCompany: () => {},
  session: null,
  setSession: () => {},
  permissions: null,
  setPermissions: () => {},
});

export default function AuthContextProvider({ children }) {
  // `user` starts as `undefined` so we can distinguish the initial loading
  // state from an unauthenticated user (`null`).
  const [user, setUser] = useState(undefined);
  const [company, setCompany] = useState(null);
  const [permissions, setPermissions] = useState(null);

  // Persist selected company across reloads
  useEffect(() => {
    debugLog('AuthContext: load stored company');
    const stored = localStorage.getItem('erp_selected_company');
    if (stored) {
      try {
        trackSetState('AuthContext.setCompany');
        setCompany(JSON.parse(stored));
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    debugLog('AuthContext: persist company');
    if (company) {
      localStorage.setItem('erp_selected_company', JSON.stringify(company));
    } else {
      localStorage.removeItem('erp_selected_company');
    }
  }, [company]);

  // On mount, attempt to load the current profile (if a cookie is present)
  useEffect(() => {
    debugLog('AuthContext: load profile');
    async function loadProfile() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          trackSetState('AuthContext.setUser');
          setUser(data.user);
          trackSetState('AuthContext.setCompany');
          setCompany(data.session || null);
          trackSetState('AuthContext.setPermissions');
          setPermissions(data.permissions || null);
        } else {
          // Not logged in or token expired
          trackSetState('AuthContext.setUser');
          setUser(null);
          trackSetState('AuthContext.setCompany');
          setCompany(null);
          trackSetState('AuthContext.setPermissions');
          setPermissions(null);
        }
      } catch (err) {
        console.error('Unable to fetch profile:', err);
        trackSetState('AuthContext.setUser');
        setUser(null);
        trackSetState('AuthContext.setCompany');
        setCompany(null);
        trackSetState('AuthContext.setPermissions');
        setPermissions(null);
      }
    }

    loadProfile();
  }, []);

  useEffect(() => {
    function handleLogout() {
      trackSetState('AuthContext.setUser');
      setUser(null);
      trackSetState('AuthContext.setCompany');
      setCompany(null);
      trackSetState('AuthContext.setPermissions');
      setPermissions(null);
    }
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      company,
      setCompany,
      session: company,
      setSession: setCompany,
      permissions,
      setPermissions,
    }),
    [user, company, permissions],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}


// Custom hook for consuming auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthContextProvider');
  }
  return context;
}
