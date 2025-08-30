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
  userSettings: {},
  updateUserSettings: () => {},
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
  const [userSettings, setUserSettings] = useState(() => {
    try {
      const stored = localStorage.getItem('erp_user_settings');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

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
        if (data.senior_empid) {
          trackSetState('AuthContext.setSession');
          setSession((s) => ({ ...(s || {}), senior_empid: data.senior_empid }));
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
      senior_empid: session?.senior_empid,
    };
    if (company || branch || department || position || session?.senior_empid) {
      localStorage.setItem('erp_session_ids', JSON.stringify(data));
    } else {
      localStorage.removeItem('erp_session_ids');
    }
  }, [company, branch, department, position, session?.senior_empid]);

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
          try {
            const resSettings = await fetch(`${API_BASE}/user/settings`, {
              credentials: 'include',
              skipErrorToast: true,
            });
            if (resSettings.ok) {
              const s = await resSettings.json();
              trackSetState('AuthContext.setUserSettings');
              setUserSettings(s);
              try {
                localStorage.setItem('erp_user_settings', JSON.stringify(s));
              } catch {}
            } else {
              const stored = localStorage.getItem('erp_user_settings');
              trackSetState('AuthContext.setUserSettings');
              setUserSettings(stored ? JSON.parse(stored) : {});
            }
          } catch {
            const stored = localStorage.getItem('erp_user_settings');
            trackSetState('AuthContext.setUserSettings');
            setUserSettings(stored ? JSON.parse(stored) : {});
          }
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
          trackSetState('AuthContext.setUserSettings');
          setUserSettings({});
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
          trackSetState('AuthContext.setUserSettings');
          setUserSettings({});
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
      trackSetState('AuthContext.setUserSettings');
      setUserSettings({});
      try {
        localStorage.removeItem('erp_user_settings');
      } catch {}
    }
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const saveUserSettings = async (next) => {
    try {
      localStorage.setItem('erp_user_settings', JSON.stringify(next));
    } catch {}
    try {
      await fetch(`${API_BASE}/user/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
        skipErrorToast: true,
      });
    } catch (err) {
      console.warn('Failed to save user settings', err);
    }
  };

  const updateUserSettings = (updates) => {
    setUserSettings((prev) => {
      const next = { ...(prev || {}), ...updates };
      saveUserSettings(next);
      return next;
    });
  };

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
      userSettings,
      updateUserSettings,
    }),
    [
      user,
      session,
      company,
      branch,
      department,
      position,
      permissions,
      userSettings,
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
