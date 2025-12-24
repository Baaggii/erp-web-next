// src/erp.mgt.mn/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext, useMemo } from 'react';
import { debugLog, trackSetState } from '../utils/debug.js';
import { API_BASE } from '../utils/apiBase.js';
import normalizeEmploymentSession from '../utils/normalizeEmploymentSession.js';
import {
  deriveWorkplacePositionsFromAssignments,
  resolveWorkplacePositionMap,
} from '../utils/workplaceResolver.js';

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
  workplace: null,
  setWorkplace: () => {},
  workplacePositionMap: {},
  setWorkplacePositionMap: () => {},
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
  const [workplace, setWorkplace] = useState(null);
  const [workplacePositionMap, setWorkplacePositionMap] = useState({});
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
        trackSetState('AuthContext.setWorkplace');
        setWorkplace(data.workplace ?? null);
        const sessionUpdates = {};
        if (data.senior_empid) {
          sessionUpdates.senior_empid = data.senior_empid;
        }
        if (data.senior_plan_empid) {
          sessionUpdates.senior_plan_empid = data.senior_plan_empid;
        }
        if (data.workplace) {
          sessionUpdates.workplace_id = data.workplace;
        }
        if (data.workplace_session_id) {
          sessionUpdates.workplace_session_id = data.workplace_session_id;
        }
        if (Array.isArray(data.workplace_session_ids)) {
          sessionUpdates.workplace_session_ids = data.workplace_session_ids;
        }
        if (Object.keys(sessionUpdates).length) {
          trackSetState('AuthContext.setSession');
          setSession((s) =>
            normalizeEmploymentSession({ ...(s || {}), ...sessionUpdates }),
          );
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
      workplace,
      senior_empid: session?.senior_empid,
      senior_plan_empid: session?.senior_plan_empid,
    };
    if (session?.workplace_session_id != null) {
      data.workplace_session_id = session.workplace_session_id;
    }
    if (Array.isArray(session?.workplace_session_ids) && session.workplace_session_ids.length) {
      data.workplace_session_ids = session.workplace_session_ids;
    }
    if (
      company ||
      branch ||
      department ||
      position ||
      workplace ||
      session?.senior_empid ||
      session?.senior_plan_empid ||
      session?.workplace_session_id ||
      (Array.isArray(session?.workplace_session_ids) &&
        session.workplace_session_ids.length)
    ) {
      localStorage.setItem('erp_session_ids', JSON.stringify(data));
    } else {
      localStorage.removeItem('erp_session_ids');
    }
  }, [
    company,
    branch,
    department,
    position,
    workplace,
    session?.senior_empid,
    session?.senior_plan_empid,
  ]);

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
          const normalizedSession = normalizeEmploymentSession(data.session);
          const nextUser = normalizedSession
            ? { ...data, session: normalizedSession }
            : data;
          trackSetState('AuthContext.setUser');
          setUser(nextUser);
          trackSetState('AuthContext.setSession');
          setSession(normalizedSession);
          trackSetState('AuthContext.setCompany');
          setCompany(data.company ?? normalizedSession?.company_id ?? null);
          trackSetState('AuthContext.setBranch');
          setBranch(data.branch ?? normalizedSession?.branch_id ?? null);
          trackSetState('AuthContext.setDepartment');
          setDepartment(
            data.department ?? normalizedSession?.department_id ?? null,
          );
          trackSetState('AuthContext.setPosition');
          setPosition(
            data.position ??
              normalizedSession?.position_id ??
              normalizedSession?.employment_position_id ??
              null,
          );
          trackSetState('AuthContext.setWorkplace');
          setWorkplace(data.workplace ?? normalizedSession?.workplace_id ?? null);
          trackSetState('AuthContext.setPermissions');
          setPermissions(data.permissions || null);
          const derivedWorkplaceMap = deriveWorkplacePositionsFromAssignments(normalizedSession);
          const resolvedWorkplaceMap =
            (normalizedSession?.workplace_position_map &&
              Object.keys(normalizedSession.workplace_position_map).length > 0
              ? normalizedSession.workplace_position_map
              : null) || derivedWorkplaceMap;
          trackSetState('AuthContext.setWorkplacePositionMap');
          setWorkplacePositionMap(resolvedWorkplaceMap);
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
          trackSetState('AuthContext.setWorkplace');
          setWorkplace(null);
          trackSetState('AuthContext.setPermissions');
          setPermissions(null);
          trackSetState('AuthContext.setWorkplacePositionMap');
          setWorkplacePositionMap({});
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
        trackSetState('AuthContext.setWorkplace');
        setWorkplace(null);
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
      let lang;
      try {
        const stored = localStorage.getItem('erp_user_settings');
        lang = stored ? JSON.parse(stored).lang : undefined;
      } catch {}
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
        trackSetState('AuthContext.setWorkplace');
        setWorkplace(null);
        trackSetState('AuthContext.setPermissions');
        setPermissions(null);
        trackSetState('AuthContext.setWorkplacePositionMap');
        setWorkplacePositionMap({});
        trackSetState('AuthContext.setUserSettings');
        setUserSettings(lang ? { lang } : {});
      try {
        if (lang) {
          localStorage.setItem('erp_user_settings', JSON.stringify({ lang }));
        } else {
          localStorage.removeItem('erp_user_settings');
        }
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
      workplace,
      setWorkplace,
      permissions,
      setPermissions,
      workplacePositionMap,
      setWorkplacePositionMap,
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
      workplace,
      permissions,
      workplacePositionMap,
      userSettings,
    ],
  );

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function loadWorkplacePositions() {
      if (!session) {
        if (isMounted) {
          trackSetState('AuthContext.setWorkplacePositionMap');
          setWorkplacePositionMap({});
        }
        return;
      }

      const derived = deriveWorkplacePositionsFromAssignments(session);
      const sessionMap =
        session?.workplace_position_map &&
        Object.keys(session.workplace_position_map).length > 0
          ? session.workplace_position_map
          : null;
      const nextMap = sessionMap || derived;
      if (isMounted) {
        trackSetState('AuthContext.setWorkplacePositionMap');
        setWorkplacePositionMap(nextMap);
      }

      if (sessionMap && Object.keys(sessionMap).length > 0) {
        return;
      }

      try {
        const resolved = await resolveWorkplacePositionMap({
          session,
          signal: controller.signal,
        });
        if (!isMounted || controller.signal.aborted) return;
        trackSetState('AuthContext.setWorkplacePositionMap');
        setWorkplacePositionMap(resolved);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('Failed to resolve workplace positions', err);
      }
    }

    loadWorkplacePositions();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [
    session?.company_id,
    session?.companyId,
    session?.workplace_assignments,
    session?.workplace_id,
    session?.workplaceId,
    session?.workplace_position_map,
  ]);

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
