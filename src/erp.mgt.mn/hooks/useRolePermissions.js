import { useContext, useEffect, useState } from 'react';
import { debugLog } from '../utils/debug.js';
import { AuthContext } from '../context/AuthContext.jsx';

// Cache permissions by role so switching users does not refetch unnecessarily
const cache = {};

// Simple event emitter for permission refresh events
const emitter = new EventTarget();

export function refreshRolePermissions(userLevel, companyId) {
  const key = `${userLevel}-${companyId || ''}`;
  if (userLevel) delete cache[key];
  emitter.dispatchEvent(new Event('refresh'));
}

export function useRolePermissions() {
  const { user, company } = useContext(AuthContext);
  const [perms, setPerms] = useState(null);

  async function fetchPerms(roleId, companyId) {
    try {
      const params = [`roleId=${roleId}`];
      if (companyId) params.push(`companyId=${companyId}`);
      const res = await fetch(`/api/role_permissions?${params.join('&')}`, {
        credentials: 'include',
      });
      const rows = res.ok ? await res.json() : [];
      const map = {};
      rows.forEach((r) => {
        map[r.module_key] = !!r.allowed;
      });
      const key = `${roleId}-${companyId || ''}`;
      cache[key] = map;
      setPerms(map);
    } catch (err) {
      console.error('Failed to load permissions', err);
      setPerms({});
    }
  }

  useEffect(() => {
    debugLog('useRolePermissions effect: load perms');
    if (!user) {
      setPerms(null);
      return;
    }
    const roleId = company?.user_level || user?.user_level;
    const companyId = company?.company_id;

    const key = `${roleId}-${companyId || ''}`;

    if (cache[key]) {
      setPerms(cache[key]);
    } else {
      fetchPerms(roleId, companyId);
    }
  }, [user, company]);

  // Listen for refresh events
  useEffect(() => {
    debugLog('useRolePermissions effect: refresh listener');
    if (!user) return;
    const roleId = company?.user_level || user?.user_level;
    const companyId = company?.company_id;
    const handler = () => fetchPerms(roleId, companyId);
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [user, company]);

  return perms;
}
