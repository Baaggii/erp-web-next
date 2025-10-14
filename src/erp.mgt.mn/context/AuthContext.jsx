// src/erp.mgt.mn/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext, useMemo, useRef } from 'react';
import { debugLog, trackSetState } from '../utils/debug.js';
import { API_BASE } from '../utils/apiBase.js';
import { getTenantKeyList } from '../utils/tenantKeys.js';

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
  const departmentNameCache = useRef(new Map());

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
        const sessionUpdates = {};
        if (data.senior_empid) {
          sessionUpdates.senior_empid = data.senior_empid;
        }
        if (data.senior_plan_empid) {
          sessionUpdates.senior_plan_empid = data.senior_plan_empid;
        }
        if (Object.keys(sessionUpdates).length) {
          trackSetState('AuthContext.setSession');
          setSession((s) => ({ ...(s || {}), ...sessionUpdates }));
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
      senior_plan_empid: session?.senior_plan_empid,
    };
    if (
      company ||
      branch ||
      department ||
      position ||
      session?.senior_empid ||
      session?.senior_plan_empid
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
      trackSetState('AuthContext.setPermissions');
      setPermissions(null);
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

  useEffect(() => {
    if (
      department === undefined ||
      department === null ||
      department === '' ||
      session?.department_name
    ) {
      return;
    }
    const normalized = String(department);
    if (normalized.trim() === '') return;
    const cache = departmentNameCache.current;
    if (cache.has(normalized)) {
      const cached = cache.get(normalized);
      if (cached) {
        trackSetState('AuthContext.setSession');
        setSession((prev) => (prev ? { ...prev, department_name: cached } : prev));
      }
      return;
    }
    let canceled = false;
    const resolveKey = (row, target) => {
      if (!row || !target) return undefined;
      const lower = String(target).toLowerCase();
      const match = Object.keys(row).find((k) => k.toLowerCase() === lower);
      return match ? row[match] : undefined;
    };
    async function fetchEmploymentDepartmentRelation() {
      let relation = null;
      try {
        const res = await fetch('/api/tables/tbl_employment/relations', {
          credentials: 'include',
        });
        if (res.ok) {
          const list = await res.json().catch(() => []);
          if (Array.isArray(list)) {
            const entry = list.find(
              (item) =>
                item?.COLUMN_NAME &&
                item.COLUMN_NAME.toLowerCase() === 'employment_department_id',
            );
            if (
              entry?.REFERENCED_TABLE_NAME &&
              entry?.REFERENCED_COLUMN_NAME
            ) {
              relation = {
                table: entry.REFERENCED_TABLE_NAME,
                column: entry.REFERENCED_COLUMN_NAME,
              };
            }
          }
        }
      } catch {
        relation = relation || null;
      }
      try {
        const res = await fetch('/api/tables/tbl_employment/relations/custom', {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.relations && typeof data.relations === 'object') {
            const key = Object.keys(data.relations).find(
              (k) => typeof k === 'string' && k.toLowerCase() === 'employment_department_id',
            );
            if (key) {
              const value = data.relations[key];
              const list = Array.isArray(value) ? value : value ? [value] : [];
              const chosen = list.find(
                (item) => item && item.table && item.column,
              );
              if (chosen) {
                relation = {
                  table: chosen.table,
                  column: chosen.column,
                  idField:
                    typeof chosen.idField === 'string'
                      ? chosen.idField
                      : typeof chosen.id_field === 'string'
                      ? chosen.id_field
                      : relation?.idField,
                  displayFields: Array.isArray(chosen.displayFields)
                    ? chosen.displayFields
                    : Array.isArray(chosen.display_fields)
                    ? chosen.display_fields
                    : relation?.displayFields || [],
                };
              }
            }
          }
        }
      } catch {
        /* ignore */
      }
      return relation;
    }
    async function fetchDepartmentLabel(relation) {
      if (!relation?.table || !relation.column) return null;
      let cfg = null;
      try {
        const res = await fetch(
          `/api/display_fields?table=${encodeURIComponent(relation.table)}`,
          { credentials: 'include' },
        );
        if (res.ok) {
          cfg = await res.json().catch(() => null);
        }
      } catch {
        cfg = cfg || null;
      }
      const overrideDisplay = Array.isArray(relation.displayFields)
        ? relation.displayFields.filter((f) => typeof f === 'string')
        : [];
      const displayFields =
        overrideDisplay.length > 0
          ? overrideDisplay
          : Array.isArray(cfg?.displayFields)
          ? cfg.displayFields
          : [];
      const idField =
        (typeof relation.idField === 'string' && relation.idField) ||
        (cfg?.idField || relation.column);
      let tenantInfo = null;
      try {
        const res = await fetch(
          `/api/tenant_tables/${encodeURIComponent(relation.table)}`,
          { credentials: 'include' },
        );
        if (res.ok) {
          tenantInfo = await res.json().catch(() => null);
        }
      } catch {
        tenantInfo = tenantInfo || null;
      }
      const isShared = tenantInfo?.isShared ?? tenantInfo?.is_shared ?? false;
      const tenantKeys = getTenantKeyList(tenantInfo);
      const params = new URLSearchParams({ page: 1, perPage: 1 });
      if (idField) params.set(idField, normalized);
      if (!isShared) {
        if (tenantKeys.includes('company_id') && company != null) {
          params.set('company_id', company);
        }
        if (tenantKeys.includes('branch_id') && branch != null) {
          params.set('branch_id', branch);
        }
        if (tenantKeys.includes('department_id') && department != null) {
          params.set('department_id', department);
        }
      }
      let row = null;
      try {
        const res = await fetch(
          `/api/tables/${encodeURIComponent(relation.table)}?${params.toString()}`,
          { credentials: 'include' },
        );
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const rows = Array.isArray(data.rows) ? data.rows : [];
          row = rows.find((r) => {
            const value = resolveKey(r, idField);
            return value !== undefined && String(value) === normalized;
          });
          if (!row && rows.length > 0) {
            row = rows[0];
          }
        }
      } catch {
        row = row || null;
      }
      if (!row || typeof row !== 'object') return null;
      const parts = [];
      const idValue = resolveKey(row, idField);
      if (idValue !== undefined && idValue !== null && idValue !== '') {
        parts.push(idValue);
      }
      displayFields.forEach((field) => {
        const val = resolveKey(row, field);
        if (val !== undefined && val !== null && val !== '') {
          parts.push(val);
        }
      });
      if (parts.length === 0) {
        const fallback = Object.values(row).find(
          (v) => v !== undefined && v !== null && v !== '',
        );
        if (fallback !== undefined) parts.push(fallback);
      }
      return parts
        .map((part) => (typeof part === 'string' ? part : String(part)))
        .join(' - ');
    }
    async function loadDepartmentLabel() {
      const relation = await fetchEmploymentDepartmentRelation();
      if (canceled || !relation) {
        cache.set(normalized, null);
        return;
      }
      const label = await fetchDepartmentLabel(relation);
      cache.set(normalized, label || null);
      if (canceled || !label) return;
      trackSetState('AuthContext.setSession');
      setSession((prev) => (prev ? { ...prev, department_name: label } : prev));
    }
    loadDepartmentLabel();
    return () => {
      canceled = true;
    };
  }, [department, session?.department_name, company, branch]);

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
