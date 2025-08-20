// src/erp.mgt.mn/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext, useMemo } from 'react';
import { debugLog, trackSetState } from '../utils/debug.js';
import { API_BASE } from '../utils/apiBase.js';

// Create the AuthContext
export const AuthContext = createContext({
  user: null,
  setUser: () => {},
  session: null,
  setSession: () => {},
  company: null,
  setCompany: () => {},
  branch: null,
  setBranch: () => {},
  department: null,
  setDepartment: () => {},
  position: null,
  setPosition: () => {},
  permissions: null,
  setPermissions: () => {},
});

export default function AuthContextProvider({ children }) {
  // `user` starts as `undefined` so we can distinguish the initial loading
  // state from an unauthenticated user (`null`).
  const [user, setUser] = useState(undefined);
  const [session, setSession] = useState(null);
  const [company, setCompany] = useState(null);
  const [branch, setBranch] = useState(null);
  const [department, setDepartment] = useState(null);
  const [position, setPosition] = useState(null);
  const [permissions, setPermissions] = useState(null);

  // Persist employment IDs across reloads
  useEffect(() => {
    debugLog('AuthContext: load stored ids');
    const stored = localStorage.getItem('erp_session_ids');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        trackSetState('AuthContext.setCompany');
        setCompany(data.company ?? null);
        trackSetState('AuthContext.setBranch');
        setBranch(data.branch ?? null);
        trackSetState('AuthContext.setDepartment');
        setDepartment(data.department ?? null);
        trackSetState('AuthContext.setPosition');
        setPosition(data.position ?? null);
        if (data.employment_senior_empid) {
          trackSetState('AuthContext.setSession');
          setSession((s) => ({ ...(s || {}), employment_senior_empid: data.employment_senior_empid }));
        }
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    debugLog('AuthContext: persist ids');
    const data = {
      company,
      branch,
      department,
      position,
      employment_senior_empid: session?.employment_senior_empid,
    };
    if (company || branch || department || position || session?.employment_senior_empid) {
      localStorage.setItem('erp_session_ids', JSON.stringify(data));
    } else {
      localStorage.removeItem('erp_session_ids');
    }
  }, [company, branch, department, position, session?.employment_senior_empid]);

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
          setUser(data);
          trackSetState('AuthContext.setSession');
          setSession(data.session || null);
          trackSetState('AuthContext.setCompany');
          setCompany(data.company ?? data.session?.company_id ?? null);
          trackSetState('AuthContext.setBranch');
          setBranch(data.branch ?? data.session?.branch_id ?? null);
          trackSetState('AuthContext.setDepartment');
          setDepartment(data.department ?? data.session?.department_id ?? null);
          trackSetState('AuthContext.setPosition');
          setPosition(data.position ?? data.session?.position_id ?? null);
          trackSetState('AuthContext.setPermissions');
          setPermissions(data.permissions || null);
        } else {
          // Not logged in or token expired
          trackSetState('AuthContext.setUser');
          setUser(null);
          trackSetState('AuthContext.setSession');
          setSession(null);
          trackSetState('AuthContext.setCompany');
          setCompany(null);
          trackSetState('AuthContext.setBranch');
          setBranch(null);
          trackSetState('AuthContext.setDepartment');
          setDepartment(null);
          trackSetState('AuthContext.setPosition');
          setPosition(null);
          trackSetState('AuthContext.setPermissions');
          setPermissions(null);
        }
      } catch (err) {
        console.error('Unable to fetch profile:', err);
        trackSetState('AuthContext.setUser');
        setUser(null);
        trackSetState('AuthContext.setSession');
        setSession(null);
        trackSetState('AuthContext.setCompany');
        setCompany(null);
        trackSetState('AuthContext.setBranch');
        setBranch(null);
        trackSetState('AuthContext.setDepartment');
        setDepartment(null);
        trackSetState('AuthContext.setPosition');
        setPosition(null);
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
      trackSetState('AuthContext.setSession');
      setSession(null);
      trackSetState('AuthContext.setCompany');
      setCompany(null);
      trackSetState('AuthContext.setBranch');
      setBranch(null);
      trackSetState('AuthContext.setDepartment');
      setDepartment(null);
      trackSetState('AuthContext.setPosition');
      setPosition(null);
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
      session,
      setSession,
      company,
      setCompany,
      branch,
      setBranch,
      department,
      setDepartment,
      position,
      setPosition,
      permissions,
      setPermissions,
    }),
    [
      user,
      session,
      company,
      branch,
      department,
      position,
      permissions,
    ],
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
